/**
 * EywaGeminiLive.ts
 *
 * Voice interface for Eywa on Spectacles. Connects Gemini Live (bidirectional
 * audio) to the Eywa room so the user can talk to Gemini about agent activity,
 * inject messages, and steer the swarm using voice.
 *
 * On init, fetches recent room context from Supabase (memories + destination)
 * and passes it to Gemini as system instructions. Transcriptions and responses
 * are relayed to the web dashboard via the Supabase Realtime broadcast channel.
 *
 * Tools available to Gemini:
 *   - inject_message: write a message visible to all agents in the room
 *   - read_status: fetch current agent activity
 */

import { Gemini } from "RemoteServiceGateway.lspkg/HostedExternal/GoogleGenAI";
import { GeminiTypes } from "RemoteServiceGateway.lspkg/HostedExternal/GoogleGenAITypes";
import { AudioProcessor } from "RemoteServiceGateway.lspkg/Helpers/AudioProcessor";
import { DynamicAudioOutput } from "RemoteServiceGateway.lspkg/Helpers/DynamicAudioOutput";
import { MicrophoneRecorder } from "RemoteServiceGateway.lspkg/Helpers/MicrophoneRecorder";
import { RealtimeTextureReceiver } from './RealtimeTextureReceiver';
import { SnapCloudRequirements } from './SnapCloudRequirements';

@component
export class EywaGeminiLive extends BaseScriptComponent {

  @ui.separator
  @ui.label("Eywa voice interface: talk to Gemini about your agent swarm")
  @ui.separator

  @ui.group_start("Setup")
  @input
  private websocketRequirementsObj: SceneObject;
  @input private dynamicAudioOutput: DynamicAudioOutput;
  @input private microphoneRecorder: MicrophoneRecorder;
  @input @allowUndefined private textDisplay: Text;
  @input private realtimeReceiver: RealtimeTextureReceiver;
  @input private snapCloudRequirements: SnapCloudRequirements;
  @ui.group_end

  @ui.separator
  @ui.group_start("Voice")
  @input
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Puck", "Puck"),
      new ComboBoxItem("Kore", "Kore"),
      new ComboBoxItem("Aoede", "Aoede"),
      new ComboBoxItem("Zephyr", "Zephyr"),
    ])
  )
  private voice: string = "Kore";
  @ui.group_end

  @ui.separator
  @ui.group_start("Room")
  @input
  @hint("Room slug to fetch context from (e.g. 'demo')")
  private roomSlug: string = "demo";
  @ui.group_end

  private audioProcessor: AudioProcessor = new AudioProcessor();
  private internetModule: InternetModule = require('LensStudio:InternetModule');
  private roomContext: string = "";
  private destinationText: string = "";

  onAwake() {
    this.websocketRequirementsObj.enabled = true;
    this.createEvent("OnStartEvent").bind(() => {
      this.initialize();
    });
  }

  private async initialize() {
    this.dynamicAudioOutput.initialize(24000);
    this.microphoneRecorder.setSampleRate(16000);

    // Fetch room context before starting Gemini session
    await this.fetchRoomContext();
    this.createGeminiLiveSession();
  }

  /**
   * Fetch recent memories and destination from Supabase to give Gemini context.
   */
  private async fetchRoomContext() {
    if (!this.snapCloudRequirements || !this.snapCloudRequirements.isConfigured()) {
      print("[EywaGeminiLive] No Supabase config, starting without room context");
      return;
    }

    const restUrl = this.snapCloudRequirements.getRestApiUrl();
    const headers = this.snapCloudRequirements.getSupabaseHeaders();

    try {
      // Fetch room ID from slug
      const roomRes = await this.internetModule.fetch(
        restUrl + "rooms?slug=eq." + this.roomSlug + "&select=id&limit=1",
        { method: "GET", headers: headers }
      );
      const rooms = JSON.parse(roomRes.body);
      if (!rooms || rooms.length === 0) {
        print("[EywaGeminiLive] Room not found: " + this.roomSlug);
        return;
      }
      const roomId = rooms[0].id;

      // Fetch recent memories (last 30) and destination in parallel
      const memoriesUrl = restUrl + "memories?room_id=eq." + roomId
        + "&order=ts.desc&limit=30&select=agent,content,metadata,message_type,ts";
      const destUrl = restUrl + "memories?room_id=eq." + roomId
        + "&message_type=eq.knowledge&metadata->>event=eq.destination"
        + "&order=ts.desc&limit=1&select=content,metadata";

      const [memRes, destRes] = await Promise.all([
        this.internetModule.fetch(memoriesUrl, { method: "GET", headers: headers }),
        this.internetModule.fetch(destUrl, { method: "GET", headers: headers }),
      ]);

      const memories = JSON.parse(memRes.body);
      const destinations = JSON.parse(destRes.body);

      // Build context string
      if (memories && memories.length > 0) {
        this.roomContext = memories.map((m: any) => {
          const meta = m.metadata || {};
          const sys = meta.system ? "[" + meta.system + "]" : "";
          const outcome = meta.outcome ? "(" + meta.outcome + ")" : "";
          const agent = m.agent || "unknown";
          const content = (m.content || "").substring(0, 200);
          return agent + " " + sys + " " + outcome + ": " + content;
        }).join("\n");
      }

      if (destinations && destinations.length > 0) {
        const meta = destinations[0].metadata || {};
        this.destinationText = (meta.destination || "") as string;
        const milestones = (meta.milestones || []) as string[];
        const progress = (meta.progress || {}) as Record<string, boolean>;
        const done = milestones.filter((m: string) => progress[m]).length;
        this.destinationText += " (" + done + "/" + milestones.length + " milestones done)";
      }

      print("[EywaGeminiLive] Room context loaded: " + memories.length + " memories, destination: " + (this.destinationText ? "yes" : "none"));
    } catch (err) {
      print("[EywaGeminiLive] Failed to fetch room context: " + err);
    }
  }

  private createGeminiLiveSession() {
    const GeminiLive = Gemini.liveConnect();

    GeminiLive.onOpen.add(() => {
      print("[EywaGeminiLive] Connection opened");
      this.updateText("Connected. Speak to interact.");

      // Build system instructions with room context
      let instructions = "You are Eywa, a voice assistant for navigating an AI agent swarm. ";
      instructions += "The user is wearing Snap Spectacles AR glasses and talking to you. ";
      instructions += "Keep responses concise (1-3 sentences). Be direct. No filler words.\n\n";

      if (this.destinationText) {
        instructions += "DESTINATION (the team's goal): " + this.destinationText + "\n\n";
      }

      if (this.roomContext) {
        instructions += "RECENT AGENT ACTIVITY:\n" + this.roomContext + "\n\n";
      }

      instructions += "You can inject messages to the room that all agents will see. ";
      instructions += "Use inject_message when the user wants to steer agents, give instructions, or broadcast information.";

      // Gemini tools for Eywa interaction
      const tools = [
        {
          function_declarations: [
            {
              name: "inject_message",
              description: "Send a message to the room that all agents will see. Use this when the user wants to give instructions, steer agents, or broadcast information.",
              parameters: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    description: "The message to inject into the room",
                  },
                  priority: {
                    type: "string",
                    description: "Priority level: normal, high, or urgent",
                  },
                },
                required: ["message"],
              },
            },
          ],
        },
      ];

      const sessionSetupMessage: GeminiTypes.Live.Setup = {
        setup: {
          model: "models/gemini-2.0-flash-live-preview-04-09",
          generation_config: {
            responseModalities: ["AUDIO"],
            temperature: 0.7,
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: this.voice,
                },
              },
            },
          },
          system_instruction: {
            parts: [{ text: instructions }],
          },
          tools: tools,
          contextWindowCompression: {
            triggerTokens: 20000,
            slidingWindow: { targetTokens: 16000 },
          },
          output_audio_transcription: {},
        },
      };
      GeminiLive.send(sessionSetupMessage);
    });

    let completedTextDisplay = true;
    let currentTranscription = "";

    GeminiLive.onMessage.add((message: any) => {
      // Setup complete: start sending audio
      if (message.setupComplete) {
        print("[EywaGeminiLive] Setup complete, starting mic");

        this.audioProcessor.onAudioChunkReady.add((encodedAudioChunk: string) => {
          GeminiLive.send({
            realtime_input: {
              media_chunks: [{ mime_type: "audio/pcm", data: encodedAudioChunk }],
            },
          } as GeminiTypes.Live.RealtimeInput);
        });

        this.microphoneRecorder.onAudioFrame.add((audioFrame: Float32Array) => {
          this.audioProcessor.processFrame(audioFrame);
        });

        this.microphoneRecorder.startRecording();
        this.updateText("Listening...");
      }

      // Audio response: play it back
      if (message?.serverContent) {
        if (
          message?.serverContent?.modelTurn?.parts?.[0]?.inlineData?.mimeType?.startsWith("audio/pcm")
        ) {
          const b64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
          const audio = Base64.decode(b64Audio);
          this.dynamicAudioOutput.addAudioFrame(audio);
        }

        // Output transcription (what Gemini said, as text)
        else if (message?.serverContent?.outputTranscription?.text) {
          const text = message.serverContent.outputTranscription.text;
          if (completedTextDisplay) {
            currentTranscription = text;
          } else {
            currentTranscription += text;
          }
          completedTextDisplay = false;
          this.updateText(currentTranscription);
        }

        // Text response (if audio output is off)
        else if (message?.serverContent?.modelTurn?.parts?.[0]?.text) {
          const text = message.serverContent.modelTurn.parts[0].text;
          if (completedTextDisplay) {
            currentTranscription = text;
          } else {
            currentTranscription += text;
          }
          completedTextDisplay = false;
          this.updateText(currentTranscription);
        }

        // Turn complete: relay full response to web
        else if (message?.serverContent?.turnComplete) {
          completedTextDisplay = true;
          if (currentTranscription) {
            this.relayToWeb("voice_response", {
              text: currentTranscription,
              timestamp: Date.now(),
            });
            currentTranscription = "";
          }
        }
      }

      // Input transcription (what the user said)
      if (message?.serverContent?.inputTranscription?.text) {
        const userText = message.serverContent.inputTranscription.text;
        this.relayToWeb("voice_input", {
          text: userText,
          timestamp: Date.now(),
        });
      }

      // Tool calls
      if (message.toolCall) {
        message.toolCall.functionCalls.forEach((fc: any) => {
          print("[EywaGeminiLive] Tool call: " + fc.name);

          if (fc.name === "inject_message") {
            this.handleInjectMessage(fc.args.message, fc.args.priority || "normal");

            GeminiLive.send({
              tool_response: {
                function_responses: [
                  {
                    name: fc.name,
                    response: { content: "Message injected to room successfully" },
                  },
                ],
              },
            } as GeminiTypes.Live.ToolResponse);
          }
        });
      }
    });

    GeminiLive.onError.add((event: any) => {
      print("[EywaGeminiLive] Error: " + event);
      this.updateText("Error: " + event);
    });

    GeminiLive.onClose.add((event: any) => {
      print("[EywaGeminiLive] Connection closed: " + event.reason);
      this.updateText("Disconnected");
    });
  }

  /**
   * Inject a message into the Eywa room via Supabase REST API.
   * This writes directly to the memories table so all agents see it.
   */
  private async handleInjectMessage(message: string, priority: string) {
    if (!this.snapCloudRequirements || !this.snapCloudRequirements.isConfigured()) {
      print("[EywaGeminiLive] Cannot inject: no Supabase config");
      return;
    }

    const restUrl = this.snapCloudRequirements.getRestApiUrl();
    const headers = this.snapCloudRequirements.getSupabaseHeaders();

    try {
      // Get room ID
      const roomRes = await this.internetModule.fetch(
        restUrl + "rooms?slug=eq." + this.roomSlug + "&select=id&limit=1",
        { method: "GET", headers: headers }
      );
      const rooms = JSON.parse(roomRes.body);
      if (!rooms || rooms.length === 0) return;

      const roomId = rooms[0].id;

      // Write injection to memories table
      const body = JSON.stringify({
        room_id: roomId,
        session_id: "spectacles-voice-" + Date.now(),
        agent: "spectacles/voice",
        message_type: "injection",
        content: "[INJECT -> all] (voice command): " + message,
        metadata: {
          event: "injection",
          target: "all",
          label: "voice command",
          priority: priority,
          source: "spectacles-gemini-live",
        },
      });

      await this.internetModule.fetch(restUrl + "memories", {
        method: "POST",
        headers: headers,
        body: body,
      });

      print("[EywaGeminiLive] Injected: " + message);

      // Also relay to web so it shows immediately
      this.relayToWeb("voice_inject", {
        message: message,
        priority: priority,
        timestamp: Date.now(),
      });
    } catch (err) {
      print("[EywaGeminiLive] Inject failed: " + err);
    }
  }

  /**
   * Send an event to the web dashboard via the broadcast channel.
   */
  private relayToWeb(event: string, payload: any) {
    if (!this.realtimeReceiver) return;
    this.realtimeReceiver.sendEvent(event, payload);
  }

  private updateText(text: string) {
    if (this.textDisplay) {
      this.textDisplay.text = text;
    }
  }
}
