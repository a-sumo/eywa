/**
 * voiceTools.ts - Unified tool surface for the voice interface.
 *
 * Combines the 7 read tools from geminiTools.ts (agent status, threads,
 * knowledge, pattern detection, distress signals, destination, network)
 * with 3 write tools (inject, destination, message) so the voice has
 * full parity with the text-based steering agent.
 */

import {
  TOOL_DECLARATIONS as READ_TOOL_DECLARATIONS,
  executeTool,
  type GeminiFunctionCall,
  type GeminiFunctionResponse,
} from "./geminiTools";
import { supabase } from "./supabase";

// ---------------------------------------------------------------------------
// Write tool declarations
// ---------------------------------------------------------------------------

const WRITE_TOOL_DECLARATIONS = [
  {
    name: "inject_message",
    description:
      "Send a message to the room that ALL agents will see on their next check. Use this when the user wants to give instructions, steer agents, change direction, or broadcast information.",
    parameters: {
      type: "object" as const,
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
      type: "object" as const,
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
      type: "object" as const,
      properties: {
        message: { type: "string", description: "The message to send" },
        channel: { type: "string", description: "Channel: general or notifications" },
      },
      required: ["message"],
    },
  },
];

// ---------------------------------------------------------------------------
// Combined declarations
// ---------------------------------------------------------------------------

export const ALL_VOICE_TOOL_DECLARATIONS = [
  ...READ_TOOL_DECLARATIONS,
  ...WRITE_TOOL_DECLARATIONS,
];

/** Wrapped for the Gemini Live WebSocket setup message format. */
export function getVoiceToolsPayload() {
  return [{ function_declarations: ALL_VOICE_TOOL_DECLARATIONS }];
}

// ---------------------------------------------------------------------------
// Write tool handlers
// ---------------------------------------------------------------------------

const WRITE_TOOL_NAMES = new Set(["inject_message", "set_destination", "send_message"]);

async function handleInject(
  roomId: string,
  message: string,
  priority: string
): Promise<string> {
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
}

async function handleSetDestination(
  roomId: string,
  args: Record<string, unknown>
): Promise<string> {
  // Fetch current destination to merge
  const { data: existing } = await supabase
    .from("memories")
    .select("metadata")
    .eq("room_id", roomId)
    .eq("message_type", "knowledge")
    .eq("metadata->>event", "destination")
    .order("ts", { ascending: false })
    .limit(1);

  const prev = (existing?.[0]?.metadata || {}) as Record<string, unknown>;
  const milestones = (args.milestones as string[]) || (prev.milestones as string[]) || [];
  const progress = { ...((prev.progress as Record<string, boolean>) || {}) };

  if (args.mark_done) {
    for (const m of args.mark_done as string[]) {
      progress[m] = true;
    }
  }

  const { error } = await supabase.from("memories").insert({
    room_id: roomId,
    session_id: `voices-${Date.now()}`,
    agent: "voices/live",
    message_type: "knowledge",
    content: (args.destination as string) || (prev.destination as string) || "",
    metadata: {
      event: "destination",
      destination: (args.destination as string) || (prev.destination as string) || "",
      milestones,
      progress,
      set_by: "voices/live",
      last_updated_by: "voices/live",
    },
  });

  return error ? `Failed: ${error.message}` : "Destination updated.";
}

async function handleSendMessage(
  roomId: string,
  message: string,
  channel: string
): Promise<string> {
  const { error } = await supabase.from("messages").insert({
    room_id: roomId,
    sender: "voices/live",
    channel,
    content: message,
    metadata: { source: "eywa-voices" },
  });

  return error ? `Failed: ${error.message}` : "Message sent.";
}

// ---------------------------------------------------------------------------
// Unified executor
// ---------------------------------------------------------------------------

/**
 * Execute any voice tool call. Delegates read tools to geminiTools.executeTool
 * and handles write tools locally.
 */
export async function executeVoiceTool(
  roomId: string,
  call: GeminiFunctionCall
): Promise<GeminiFunctionResponse> {
  // Write tools handled here
  if (WRITE_TOOL_NAMES.has(call.name)) {
    let result: string;
    try {
      switch (call.name) {
        case "inject_message":
          result = await handleInject(
            roomId,
            call.args.message as string,
            (call.args.priority as string) || "normal"
          );
          break;
        case "set_destination":
          result = await handleSetDestination(roomId, call.args);
          break;
        case "send_message":
          result = await handleSendMessage(
            roomId,
            call.args.message as string,
            (call.args.channel as string) || "general"
          );
          break;
        default:
          result = `Unknown write tool: ${call.name}`;
      }
    } catch (err) {
      result = `Error executing ${call.name}: ${err instanceof Error ? err.message : String(err)}`;
    }
    return { name: call.name, response: { result } };
  }

  // Read tools delegated to geminiTools
  return executeTool(roomId, call);
}
