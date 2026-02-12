/**
 * useGeminiLive.ts - Bidirectional voice interface to Gemini Live.
 *
 * Connects via WebSocket for real-time audio streaming. Uses the unified
 * voice tool surface (7 read + 3 write tools) so the voice has full
 * parity with the text-based steering agent.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { getVoiceToolsPayload, executeVoiceTool } from "../lib/voiceTools";
import { buildVoiceSystemPrompt } from "../lib/voicePrompt";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
const MODEL = "models/gemini-2.5-flash-native-audio-preview-12-2025";

export type VoiceState = "idle" | "connecting" | "listening" | "speaking";

export type VoiceEvent =
  | { type: "status"; text: string }
  | { type: "user_speech"; text: string }
  | { type: "response"; text: string; final: boolean }
  | { type: "tool_call"; name: string; result: string }
  | { type: "error"; text: string };

export interface UseGeminiLiveOptions {
  foldId: string | null;
  foldSlug: string;
  voice?: string;
  onEvent?: (event: VoiceEvent) => void;
}

export function useGeminiLive({ foldId, foldSlug, voice = "Kore", onEvent }: UseGeminiLiveOptions) {
  const [connected, setConnected] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const micLevelRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const emit = useCallback((event: VoiceEvent) => {
    onEventRef.current?.(event);
  }, []);

  const connect = useCallback(async () => {
    if (!GEMINI_API_KEY || !foldId) {
      emit({ type: "error", text: "Missing API key or fold" });
      return;
    }

    setVoiceState("connecting");
    emit({ type: "status", text: "Fetching fold context..." });

    // Lightweight prefetch: just destination + agent count for system prompt seeding.
    // Gemini will use tools for everything else.
    let destinationText = "";
    let agentCount: number | undefined;

    try {
      const [destRes, agentRes] = await Promise.all([
        supabase
          .from("memories")
          .select("content, metadata")
          .eq("fold_id", foldId)
          .eq("message_type", "knowledge")
          .eq("metadata->>event", "destination")
          .order("ts", { ascending: false })
          .limit(1),
        supabase
          .from("memories")
          .select("agent")
          .eq("fold_id", foldId)
          .order("ts", { ascending: false })
          .limit(200),
      ]);

      if (destRes.data?.length) {
        const meta = destRes.data[0].metadata || {};
        const milestones = ((meta as any).milestones || []) as string[];
        const progress = ((meta as any).progress || {}) as Record<string, boolean>;
        const done = milestones.filter((m: string) => progress[m]).length;
        destinationText = `${(meta as any).destination || ""} (${done}/${milestones.length} milestones done)`;
      }

      if (agentRes.data?.length) {
        agentCount = new Set(agentRes.data.map((r: any) => r.agent)).size;
      }
    } catch (err) {
      console.warn("[GeminiLive] Failed to fetch fold context:", err);
    }

    emit({ type: "status", text: "Connecting to Gemini Live..." });

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      const systemInstruction = buildVoiceSystemPrompt({ destinationText, agentCount });

      const setup = {
        setup: {
          model: MODEL,
          generation_config: {
            response_modalities: ["AUDIO"],
            temperature: 0.7,
            speech_config: {
              voice_config: {
                prebuilt_voice_config: {
                  voice_name: voice,
                },
              },
            },
          },
          system_instruction: {
            parts: [{ text: systemInstruction }],
          },
          tools: getVoiceToolsPayload(),
          contextWindowCompression: {
            triggerTokens: 20000,
            slidingWindow: { targetTokens: 16000 },
          },
          output_audio_transcription: {},
        },
      };

      ws.send(JSON.stringify(setup));
    };

    ws.onmessage = async (event) => {
      let msg: any;
      try {
        const text = typeof event.data === "string"
          ? event.data
          : event.data instanceof Blob
            ? await event.data.text()
            : new TextDecoder().decode(event.data);
        msg = JSON.parse(text);
      } catch {
        return; // skip binary/unparseable frames
      }

      // Setup complete: start mic, then trigger auto-briefing
      if (msg.setupComplete) {
        setConnected(true);
        setVoiceState("listening");
        emit({ type: "status", text: "Connected" });
        startMic(ws);

        // Auto-briefing: send a bootstrap message so Gemini runs its briefing tools
        ws.send(JSON.stringify({
          client_content: {
            turns: [{ role: "user", parts: [{ text: "I just connected. Give me a quick status update." }] }],
            turn_complete: true,
          },
        }));
        return;
      }

      // Audio playback
      if (msg?.serverContent?.modelTurn?.parts) {
        setVoiceState("speaking");
        for (const part of msg.serverContent.modelTurn.parts) {
          if (part.inlineData?.mimeType?.startsWith("audio/pcm")) {
            playAudioChunk(part.inlineData.data);
          }
          if (part.text) {
            emit({ type: "response", text: part.text, final: false });
          }
        }
      }

      // Output transcription
      if (msg?.serverContent?.outputTranscription?.text) {
        setVoiceState("speaking");
        emit({ type: "response", text: msg.serverContent.outputTranscription.text, final: false });
      }

      // Input transcription (what user said)
      if (msg?.serverContent?.inputTranscription?.text) {
        setVoiceState("listening");
        emit({ type: "user_speech", text: msg.serverContent.inputTranscription.text });
      }

      // Turn complete
      if (msg?.serverContent?.turnComplete) {
        setVoiceState("listening");
        emit({ type: "response", text: "", final: true });
      }

      // Tool calls
      if (msg.toolCall) {
        handleToolCalls(ws, msg.toolCall.functionCalls);
      }
    };

    ws.onerror = (err) => {
      console.error("[GeminiLive] WebSocket error:", err);
      emit({ type: "error", text: "Connection error" });
    };

    ws.onclose = (event) => {
      setConnected(false);
      setListening(false);
      setVoiceState("idle");
      emit({ type: "status", text: `Disconnected${event.reason ? `: ${event.reason}` : ""}` });
      cleanupAudio();
    };
  }, [foldId, foldSlug, voice, emit]);

  // --- Mic input via ScriptProcessor ---

  const startMic = useCallback(async (ws: WebSocket) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      micStreamRef.current = stream;

      // Use default sample rate (usually 48kHz) and downsample to 16kHz
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const nativeSR = ctx.sampleRate;

      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const pcm = e.inputBuffer.getChannelData(0);
        // Compute RMS level for UI visualization
        let sum = 0;
        for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
        micLevelRef.current = Math.sqrt(sum / pcm.length);
        const downsampled = downsample(pcm, nativeSR, 16000);
        const int16 = float32ToInt16(downsampled);
        const b64 = arrayBufferToBase64(int16.buffer as ArrayBuffer);
        ws.send(
          JSON.stringify({
            realtime_input: {
              media_chunks: [{ mime_type: "audio/pcm", data: b64 }],
            },
          })
        );
      };

      source.connect(processor);
      processor.connect(ctx.destination);
      workletRef.current = processor as any;
      setListening(true);
    } catch (err) {
      emit({ type: "error", text: `Mic access denied: ${err}` });
    }
  }, [emit]);

  // --- Audio playback ---

  const playAudioChunk = useCallback((b64Data: string) => {
    if (!playbackCtxRef.current) {
      playbackCtxRef.current = new AudioContext({ sampleRate: 24000 });
      nextPlayTimeRef.current = 0;
    }
    const ctx = playbackCtxRef.current;
    const raw = base64ToArrayBuffer(b64Data);
    const int16 = new Int16Array(raw);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startTime = Math.max(now, nextPlayTimeRef.current);
    source.start(startTime);
    nextPlayTimeRef.current = startTime + buffer.duration;
  }, []);

  // --- Tool call handlers (unified via voiceTools) ---

  const handleToolCalls = useCallback(
    async (ws: WebSocket, functionCalls: any[]) => {
      const responses: any[] = [];

      for (const fc of functionCalls) {
        let result = "";

        try {
          const toolResult = await executeVoiceTool(foldId!, {
            name: fc.name,
            args: fc.args || {},
          });
          result = toolResult.response.result;
        } catch (err) {
          result = `Error: ${err}`;
        }

        emit({ type: "tool_call", name: fc.name, result });
        responses.push({
          name: fc.name,
          response: { content: result },
        });
      }

      ws.send(
        JSON.stringify({
          tool_response: { function_responses: responses },
        })
      );
    },
    [foldId, emit]
  );

  // --- Disconnect ---

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    cleanupAudio();
    setConnected(false);
    setListening(false);
    setVoiceState("idle");
    micLevelRef.current = 0;
  }, []);

  const cleanupAudio = useCallback(() => {
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    workletRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      cleanupAudio();
    };
  }, [cleanupAudio]);

  return { connected, listening, voiceState, micLevelRef, connect, disconnect };
}

// --- Audio helpers ---

function downsample(buffer: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return buffer;
  const ratio = fromRate / toRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    result[i] = buffer[Math.round(i * ratio)];
  }
  return result;
}

// --- Encoding helpers ---

function float32ToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}
