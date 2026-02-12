/**
 * voiceTools.ts - Unified tool surface for the voice interface.
 *
 * Imports all tools from geminiTools.ts (read + write including inject,
 * approvals, etc.) and adds 2 voice-specific write tools (set_destination,
 * send_message) that don't have equivalents in the text steering agent.
 */

import {
  TOOL_DECLARATIONS as GEMINI_TOOL_DECLARATIONS,
  executeTool,
  type GeminiFunctionCall,
  type GeminiFunctionResponse,
} from "./geminiTools";
import { supabase } from "./supabase";

// ---------------------------------------------------------------------------
// Voice-specific write tool declarations
// ---------------------------------------------------------------------------

const VOICE_WRITE_DECLARATIONS = [
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
      "Send a chat message to the fold's message board. Use for human-facing communication.",
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
  ...GEMINI_TOOL_DECLARATIONS,
  ...VOICE_WRITE_DECLARATIONS,
];

/** Wrapped for the Gemini Live WebSocket setup message format. */
export function getVoiceToolsPayload() {
  return [{ function_declarations: ALL_VOICE_TOOL_DECLARATIONS }];
}

// ---------------------------------------------------------------------------
// Voice-specific write tool handlers
// ---------------------------------------------------------------------------

const VOICE_WRITE_NAMES = new Set(["set_destination", "send_message"]);

async function handleSetDestination(
  foldId: string,
  args: Record<string, unknown>
): Promise<string> {
  // Fetch current destination to merge
  const { data: existing } = await supabase
    .from("memories")
    .select("metadata")
    .eq("room_id", foldId)
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
    room_id: foldId,
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
  foldId: string,
  message: string,
  channel: string
): Promise<string> {
  const { error } = await supabase.from("messages").insert({
    room_id: foldId,
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
 * Execute any voice tool call. Handles voice-specific write tools locally,
 * delegates everything else (reads + gemini writes) to geminiTools.executeTool.
 */
export async function executeVoiceTool(
  foldId: string,
  call: GeminiFunctionCall
): Promise<GeminiFunctionResponse> {
  // Voice-specific write tools handled here
  if (VOICE_WRITE_NAMES.has(call.name)) {
    let result: string;
    try {
      switch (call.name) {
        case "set_destination":
          result = await handleSetDestination(foldId, call.args);
          break;
        case "send_message":
          result = await handleSendMessage(
            foldId,
            call.args.message as string,
            (call.args.channel as string) || "general"
          );
          break;
        default:
          result = `Unknown voice tool: ${call.name}`;
      }
    } catch (err) {
      result = `Error executing ${call.name}: ${err instanceof Error ? err.message : String(err)}`;
    }
    return { name: call.name, response: { result } };
  }

  // Everything else (reads + gemini writes like inject_to_agent, approvals)
  return executeTool(foldId, call);
}
