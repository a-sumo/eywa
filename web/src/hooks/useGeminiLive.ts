/**
 * useGeminiLive.ts - Bidirectional voice interface to Gemini Live.
 *
 * Connects via WebSocket for real-time audio streaming. Supports tool calls
 * so Gemini can ACT on the room (inject messages, set destinations, etc.),
 * not just read from it.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "../lib/supabase";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
const MODEL = "models/gemini-2.0-flash-live-001";

export type VoiceEvent =
  | { type: "status"; text: string }
  | { type: "user_speech"; text: string }
  | { type: "response"; text: string; final: boolean }
  | { type: "tool_call"; name: string; result: string }
  | { type: "error"; text: string };

export interface UseGeminiLiveOptions {
  roomId: string | null;
  roomSlug: string;
  voice?: string;
  onEvent?: (event: VoiceEvent) => void;
}

export function useGeminiLive({ roomId, roomSlug, voice = "Kore", onEvent }: UseGeminiLiveOptions) {
  const [connected, setConnected] = useState(false);
  const [listening, setListening] = useState(false);
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
    if (!GEMINI_API_KEY || !roomId) {
      emit({ type: "error", text: "Missing API key or room" });
      return;
    }

    emit({ type: "status", text: "Fetching room context..." });

    // Fetch room context for system prompt
    let roomContext = "";
    let destinationText = "";

    try {
      const [memRes, destRes] = await Promise.all([
        supabase
          .from("memories")
          .select("agent, content, metadata, message_type, ts")
          .eq("room_id", roomId)
          .order("ts", { ascending: false })
          .limit(30),
        supabase
          .from("memories")
          .select("content, metadata")
          .eq("room_id", roomId)
          .eq("message_type", "knowledge")
          .eq("metadata->>event", "destination")
          .order("ts", { ascending: false })
          .limit(1),
      ]);

      if (memRes.data?.length) {
        roomContext = memRes.data
          .map((m: any) => {
            const meta = m.metadata || {};
            const sys = meta.system ? `[${meta.system}]` : "";
            const outcome = meta.outcome ? `(${meta.outcome})` : "";
            return `${m.agent} ${sys} ${outcome}: ${(m.content || "").slice(0, 200)}`;
          })
          .join("\n");
      }

      if (destRes.data?.length) {
        const meta = destRes.data[0].metadata || {};
        const milestones = (meta.milestones || []) as string[];
        const progress = (meta.progress || {}) as Record<string, boolean>;
        const done = milestones.filter((m: string) => progress[m]).length;
        destinationText = `${meta.destination || ""} (${done}/${milestones.length} milestones done)`;
      }
    } catch (err) {
      console.warn("[GeminiLive] Failed to fetch room context:", err);
    }

    emit({ type: "status", text: "Connecting to Gemini Live..." });

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      let instructions = "You are Eywa, a voice assistant that controls an AI agent swarm. ";
      instructions += "The user may be on the go (walking, driving, buying groceries). ";
      instructions += "Keep responses concise, 1-3 sentences. Be direct. No filler.\n\n";

      if (destinationText) {
        instructions += `DESTINATION (team goal): ${destinationText}\n\n`;
      }
      if (roomContext) {
        instructions += `RECENT AGENT ACTIVITY:\n${roomContext}\n\n`;
      }

      instructions += "You can ACT on the room, not just observe it. ";
      instructions += "Use inject_message to broadcast instructions to all agents. ";
      instructions += "Use set_destination to change the team's goal or mark milestones done. ";
      instructions += "Use send_message to send chat messages to the room. ";
      instructions += "When the user gives a command like 'tell the agents to...' or 'switch focus to...', USE the tools. Don't just describe what you'd do.";

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
            parts: [{ text: instructions }],
          },
          tools: [
            {
              function_declarations: [
                {
                  name: "inject_message",
                  description:
                    "Send a message to the room that ALL agents will see on their next check. Use this when the user wants to give instructions, steer agents, change direction, or broadcast information.",
                  parameters: {
                    type: "object",
                    properties: {
                      message: { type: "string", description: "The instruction or message to inject" },
                      priority: { type: "string", description: "Priority: normal, high, or urgent" },
                    },
                    required: ["message"],
                  },
                },
                {
                  name: "set_destination",
                  description:
                    "Set or update the team's destination (goal). Can also mark milestones as done.",
                  parameters: {
                    type: "object",
                    properties: {
                      destination: { type: "string", description: "The new destination/goal text" },
                      milestones: {
                        type: "array",
                        items: { type: "string" },
                        description: "List of milestone names",
                      },
                      mark_done: {
                        type: "array",
                        items: { type: "string" },
                        description: "Milestones to mark as completed",
                      },
                    },
                  },
                },
                {
                  name: "send_message",
                  description:
                    "Send a chat message to the room's message board. Use for human-facing communication.",
                  parameters: {
                    type: "object",
                    properties: {
                      message: { type: "string", description: "The message to send" },
                      channel: { type: "string", description: "Channel: general or notifications" },
                    },
                    required: ["message"],
                  },
                },
                {
                  name: "read_status",
                  description:
                    "Fetch current agent activity status. Use when the user asks what agents are doing.",
                  parameters: {
                    type: "object",
                    properties: {},
                  },
                },
              ],
            },
          ],
          contextWindowCompression: {
            triggerTokens: 20000,
            slidingWindow: { targetTokens: 16000 },
          },
          output_audio_transcription: {},
        },
      };

      ws.send(JSON.stringify(setup));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      // Setup complete: start mic
      if (msg.setupComplete) {
        setConnected(true);
        emit({ type: "status", text: "Connected. Speak to interact." });
        startMic(ws);
        return;
      }

      // Audio playback
      if (msg?.serverContent?.modelTurn?.parts) {
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
        emit({ type: "response", text: msg.serverContent.outputTranscription.text, final: false });
      }

      // Input transcription (what user said)
      if (msg?.serverContent?.inputTranscription?.text) {
        emit({ type: "user_speech", text: msg.serverContent.inputTranscription.text });
      }

      // Turn complete
      if (msg?.serverContent?.turnComplete) {
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
      emit({ type: "status", text: `Disconnected${event.reason ? `: ${event.reason}` : ""}` });
      cleanupAudio();
    };
  }, [roomId, roomSlug, voice, emit]);

  // --- Mic input via AudioWorklet ---

  const startMic = useCallback(async (ws: WebSocket) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      micStreamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = ctx;

      // Use ScriptProcessor as fallback (AudioWorklet needs a separate file)
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const pcm = e.inputBuffer.getChannelData(0);
        const int16 = float32ToInt16(pcm);
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
      emit({ type: "status", text: "Listening..." });
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

  // --- Tool call handlers ---

  const handleToolCalls = useCallback(
    async (ws: WebSocket, functionCalls: any[]) => {
      const responses: any[] = [];

      for (const fc of functionCalls) {
        let result = "";

        try {
          switch (fc.name) {
            case "inject_message":
              result = await handleInject(fc.args.message, fc.args.priority || "normal");
              break;
            case "set_destination":
              result = await handleSetDestination(fc.args);
              break;
            case "send_message":
              result = await handleSendMessage(fc.args.message, fc.args.channel || "general");
              break;
            case "read_status":
              result = await handleReadStatus();
              break;
            default:
              result = `Unknown tool: ${fc.name}`;
          }
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
    [roomId, roomSlug, emit]
  );

  const handleInject = useCallback(
    async (message: string, priority: string): Promise<string> => {
      if (!roomId) return "No room connected";

      const { error } = await supabase.from("memories").insert({
        room_id: roomId,
        session_id: `voices-${Date.now()}`,
        agent: "voices/live",
        message_type: "injection",
        content: `[INJECT -> all] (voice command): ${message}`,
        metadata: {
          event: "injection",
          target: "all",
          label: "voice command",
          priority,
          source: "eywa-voices",
        },
      });

      return error ? `Failed to inject: ${error.message}` : "Message injected. All agents will see it.";
    },
    [roomId]
  );

  const handleSetDestination = useCallback(
    async (args: any): Promise<string> => {
      if (!roomId) return "No room connected";

      // Fetch current destination to merge
      const { data: existing } = await supabase
        .from("memories")
        .select("metadata")
        .eq("room_id", roomId)
        .eq("message_type", "knowledge")
        .eq("metadata->>event", "destination")
        .order("ts", { ascending: false })
        .limit(1);

      const prev = existing?.[0]?.metadata || {};
      const milestones = args.milestones || (prev as any).milestones || [];
      const progress = { ...((prev as any).progress || {}) };

      if (args.mark_done) {
        for (const m of args.mark_done) {
          progress[m] = true;
        }
      }

      const { error } = await supabase.from("memories").insert({
        room_id: roomId,
        session_id: `voices-${Date.now()}`,
        agent: "voices/live",
        message_type: "knowledge",
        content: args.destination || (prev as any).destination || "",
        metadata: {
          event: "destination",
          destination: args.destination || (prev as any).destination || "",
          milestones,
          progress,
          set_by: "voices/live",
          last_updated_by: "voices/live",
        },
      });

      return error ? `Failed: ${error.message}` : "Destination updated.";
    },
    [roomId]
  );

  const handleSendMessage = useCallback(
    async (message: string, channel: string): Promise<string> => {
      if (!roomId) return "No room connected";

      const { error } = await supabase.from("messages").insert({
        room_id: roomId,
        sender: "voices/live",
        channel,
        content: message,
        metadata: { source: "eywa-voices" },
      });

      return error ? `Failed: ${error.message}` : "Message sent.";
    },
    [roomId]
  );

  const handleReadStatus = useCallback(async (): Promise<string> => {
    if (!roomId) return "No room connected";

    const { data, error } = await supabase
      .from("memories")
      .select("agent, ts, content, metadata")
      .eq("room_id", roomId)
      .order("ts", { ascending: false })
      .limit(50);

    if (error) return `Error: ${error.message}`;
    if (!data?.length) return "No agent activity.";

    const byAgent = new Map<string, { lastTs: string; content: string }>();
    for (const row of data) {
      if (!byAgent.has(row.agent)) {
        byAgent.set(row.agent, { lastTs: row.ts, content: (row.content || "").slice(0, 150) });
      }
    }

    const now = Date.now();
    return Array.from(byAgent.entries())
      .map(([agent, info]) => {
        const mins = Math.floor((now - new Date(info.lastTs).getTime()) / 60000);
        const status = mins < 5 ? "ACTIVE" : "idle";
        return `[${status}] ${agent} (${mins}m ago): ${info.content}`;
      })
      .join("\n");
  }, [roomId]);

  // --- Disconnect ---

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    cleanupAudio();
    setConnected(false);
    setListening(false);
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

  return { connected, listening, connect, disconnect };
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
