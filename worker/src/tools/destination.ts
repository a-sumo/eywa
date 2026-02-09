import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SupabaseClient } from "../lib/supabase.js";
import type { EywaContext, MemoryRow } from "../lib/types.js";

function estimateTokens(text: string): number {
  return text ? Math.floor(text.length / 4) : 0;
}

async function getLatestMemoryId(
  db: SupabaseClient,
  roomId: string,
  sessionId: string,
): Promise<string | null> {
  const rows = await db.select<MemoryRow>("memories", {
    select: "id",
    room_id: `eq.${roomId}`,
    session_id: `eq.${sessionId}`,
    order: "ts.desc",
    limit: "1",
  });
  return rows.length > 0 ? rows[0].id : null;
}

export function registerDestinationTools(
  server: McpServer,
  db: SupabaseClient,
  ctx: EywaContext,
) {
  server.tool(
    "eywa_destination",
    "Set, update, or view the room's destination (point B). A destination is the target state the team is working toward. Setting a destination helps all agents understand the goal and enables progress tracking.",
    {
      action: z.enum(["set", "update", "get"]).describe("set: define a new destination. update: modify progress/milestones. get: view current destination."),
      destination: z.string().optional().describe("The target state (point B). What does 'done' look like? Required for set."),
      milestones: z.array(z.string()).optional().describe("Key milestones on the route to destination. Each is a checkpoint that can be marked done."),
      progress: z.record(z.boolean()).optional().describe("Map of milestone name to completion status. Use with action=update to mark milestones done."),
      notes: z.string().optional().describe("Free-form notes about current course, blockers, or course corrections."),
    },
    {
      readOnlyHint: false,
      idempotentHint: false,
    },
    async ({ action, destination, milestones, progress, notes }) => {
      if (action === "get") {
        // Fetch current destination
        const rows = await db.select<MemoryRow>("memories", {
          select: "id,content,metadata,ts,agent",
          room_id: `eq.${ctx.roomId}`,
          message_type: "eq.knowledge",
          "metadata->>event": "eq.destination",
          order: "ts.desc",
          limit: "1",
        });

        if (rows.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: "No destination set for this room. Use eywa_destination with action=set to define where the team is headed.",
            }],
          };
        }

        const row = rows[0];
        const meta = (row.metadata ?? {}) as Record<string, unknown>;
        const ms = (meta.milestones as string[]) || [];
        const prog = (meta.progress as Record<string, boolean>) || {};
        const done = ms.filter((m) => prog[m]).length;
        const total = ms.length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;

        const lines: string[] = [
          `Destination: ${meta.destination as string}`,
          `Progress: ${done}/${total} milestones (${pct}%)`,
        ];

        if (ms.length > 0) {
          lines.push("\nMilestones:");
          for (const m of ms) {
            lines.push(`  ${prog[m] ? "[x]" : "[ ]"} ${m}`);
          }
        }

        if (meta.notes) {
          lines.push(`\nNotes: ${meta.notes as string}`);
        }

        lines.push(`\nSet by ${meta.set_by as string} at ${row.ts}`);
        if (meta.last_updated_by) {
          lines.push(`Last updated by ${meta.last_updated_by as string}`);
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      }

      if (action === "set") {
        if (!destination) {
          return {
            content: [{
              type: "text" as const,
              text: "destination is required when action=set. Describe the target state (point B).",
            }],
          };
        }

        // Check if a destination already exists - redirect to update if so
        const existing = await db.select<MemoryRow>("memories", {
          select: "id,metadata",
          room_id: `eq.${ctx.roomId}`,
          message_type: "eq.knowledge",
          "metadata->>event": "eq.destination",
          order: "ts.desc",
          limit: "1",
        });

        if (existing.length > 0) {
          const meta = (existing[0].metadata ?? {}) as Record<string, unknown>;
          const currentMs = (meta.milestones as string[]) || [];
          const currentProg = (meta.progress as Record<string, boolean>) || {};
          const done = currentMs.filter((m) => currentProg[m]).length;
          return {
            content: [{
              type: "text" as const,
              text: `A destination already exists (${done}/${currentMs.length} milestones done). Use action=update to modify it. Creating duplicates breaks progress tracking.`,
            }],
          };
        }

        const parentId = await getLatestMemoryId(db, ctx.roomId, ctx.sessionId);
        const initialProgress: Record<string, boolean> = {};
        if (milestones) {
          for (const m of milestones) {
            initialProgress[m] = false;
          }
        }

        await db.insert("memories", {
          room_id: ctx.roomId,
          agent: ctx.agent,
          session_id: ctx.sessionId,
          parent_id: parentId,
          message_type: "knowledge",
          content: `DESTINATION: ${destination}`,
          token_count: estimateTokens(destination),
          metadata: {
            event: "destination",
            destination,
            milestones: milestones ?? [],
            progress: initialProgress,
            notes: notes ?? null,
            set_by: ctx.agent,
          },
        });

        const msText = milestones?.length
          ? `\nMilestones: ${milestones.join(", ")}`
          : "";

        return {
          content: [{
            type: "text" as const,
            text: `Destination set: ${destination}${msText}`,
          }],
        };
      }

      if (action === "update") {
        // Fetch current destination
        const rows = await db.select<MemoryRow>("memories", {
          select: "id,content,metadata,ts",
          room_id: `eq.${ctx.roomId}`,
          message_type: "eq.knowledge",
          "metadata->>event": "eq.destination",
          order: "ts.desc",
          limit: "1",
        });

        if (rows.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: "No destination set. Use action=set first.",
            }],
          };
        }

        const existing = rows[0];
        const meta = (existing.metadata ?? {}) as Record<string, unknown>;
        const currentMilestones = (meta.milestones as string[]) || [];
        const currentProgress = (meta.progress as Record<string, boolean>) || {};
        const currentNotes = meta.notes as string | null;

        // Merge updates
        const newMilestones = milestones ?? currentMilestones;
        const newProgress = { ...currentProgress, ...(progress ?? {}) };
        const newNotes = notes ?? currentNotes;
        const newDest = destination ?? (meta.destination as string);

        // Create a new memory entry (append-only, preserves history)
        const parentId = await getLatestMemoryId(db, ctx.roomId, ctx.sessionId);
        await db.insert("memories", {
          room_id: ctx.roomId,
          agent: ctx.agent,
          session_id: ctx.sessionId,
          parent_id: parentId,
          message_type: "knowledge",
          content: `DESTINATION: ${newDest}`,
          token_count: estimateTokens(newDest),
          metadata: {
            event: "destination",
            destination: newDest,
            milestones: newMilestones,
            progress: newProgress,
            notes: newNotes,
            set_by: meta.set_by,
            last_updated_by: ctx.agent,
          },
        });

        const done = newMilestones.filter((m) => newProgress[m]).length;
        const total = newMilestones.length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;

        return {
          content: [{
            type: "text" as const,
            text: `Destination updated. Progress: ${done}/${total} (${pct}%).${notes ? `\nNotes: ${notes}` : ""}`,
          }],
        };
      }

      return {
        content: [{ type: "text" as const, text: `Unknown action: ${action}` }],
      };
    },
  );
}
