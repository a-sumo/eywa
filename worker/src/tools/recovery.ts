import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SupabaseClient } from "../lib/supabase.js";
import type { EywaContext, MemoryRow } from "../lib/types.js";

function estimateTokens(text: string): number {
  return text ? Math.floor(text.length / 4) : 0;
}

async function getLatestMemoryId(
  db: SupabaseClient,
  foldId: string,
  sessionId: string,
): Promise<string | null> {
  const rows = await db.select<MemoryRow>("memories", {
    select: "id",
    room_id: `eq.${foldId}`,
    session_id: `eq.${sessionId}`,
    order: "ts.desc",
    limit: "1",
  });
  return rows.length > 0 ? rows[0].id : null;
}

export function registerRecoveryTools(
  server: McpServer,
  db: SupabaseClient,
  ctx: EywaContext,
) {
  server.tool(
    "eywa_checkpoint",
    "Save your current working state so another session can pick up if this one dies. Call this periodically during long tasks, and always before context gets full. The checkpoint is tied to your user identity so any new session you start will auto-recover it.",
    {
      task: z.string().describe("What you're working on (1 sentence)"),
      done: z.string().describe("What's already completed"),
      remaining: z.string().describe("What still needs to be done"),
      context: z.string().describe("Key decisions, file paths, gotchas, and anything the next session needs to know"),
      files_changed: z.array(z.string()).optional().describe("File paths modified so far"),
    },
    {
      readOnlyHint: false,
      idempotentHint: true,
    },
    async ({ task, done, remaining, context, files_changed }) => {
      const parentId = await getLatestMemoryId(db, ctx.foldId, ctx.sessionId);
      const checkpointContent = [
        `CHECKPOINT: ${task}`,
        `\nDONE:\n${done}`,
        `\nREMAINING:\n${remaining}`,
        `\nCONTEXT:\n${context}`,
        ...(files_changed?.length ? [`\nFILES CHANGED:\n${files_changed.join("\n")}`] : []),
      ].join("\n");

      await db.insert("memories", {
        room_id: ctx.foldId,
        agent: ctx.agent,
        session_id: ctx.sessionId,
        parent_id: parentId,
        message_type: "resource",
        content: checkpointContent,
        token_count: estimateTokens(checkpointContent),
        metadata: {
          event: "checkpoint",
          task,
          done,
          remaining,
          context,
          files_changed: files_changed ?? [],
          user: ctx.user,
          agent: ctx.agent,
          session_id: ctx.sessionId,
        },
      });

      return {
        content: [{
          type: "text" as const,
          text: `Checkpoint saved. If this session dies, your next session will auto-recover this state.`,
        }],
      };
    },
  );

  server.tool(
    "eywa_distress",
    "Signal that your context window is nearly exhausted and you cannot continue. This saves your state and broadcasts an urgent alert so another agent or a fresh session can pick up your work. Call this BEFORE you hit the wall.",
    {
      task: z.string().describe("What you were working on"),
      done: z.string().describe("What's already completed"),
      remaining: z.string().describe("What still needs to be done"),
      context: z.string().describe("Key decisions, file paths, gotchas, and anything the next session needs"),
      files_changed: z.array(z.string()).optional().describe("File paths modified so far"),
      relay_to: z.string().optional().describe("Specific agent to hand off to, or omit for open broadcast"),
    },
    {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    async ({ task, done, remaining, context, files_changed, relay_to }) => {
      const parentId = await getLatestMemoryId(db, ctx.foldId, ctx.sessionId);

      const distressContent = [
        `DISTRESS: Context exhausted for: ${task}`,
        `Agent: ${ctx.agent}`,
        `\nDONE:\n${done}`,
        `\nREMAINING:\n${remaining}`,
        `\nCONTEXT:\n${context}`,
        ...(files_changed?.length ? [`\nFILES CHANGED:\n${files_changed.join("\n")}`] : []),
      ].join("\n");

      // Store the distress signal
      await db.insert("memories", {
        room_id: ctx.foldId,
        agent: ctx.agent,
        session_id: ctx.sessionId,
        parent_id: parentId,
        message_type: "resource",
        content: distressContent,
        token_count: estimateTokens(distressContent),
        metadata: {
          event: "distress",
          resolved: false,
          task,
          done,
          remaining,
          context,
          files_changed: files_changed ?? [],
          user: ctx.user,
          agent: ctx.agent,
          session_id: ctx.sessionId,
        },
      });

      // Broadcast urgent injection so other agents (or the user) know
      const target = relay_to ?? "all";
      const alertContent = `AGENT DISTRESS: ${ctx.agent} is out of context and cannot continue.\n\nTask: ${task}\n\nRemaining work:\n${remaining}\n\nRecovery context:\n${context}${files_changed?.length ? `\n\nFiles touched: ${files_changed.join(", ")}` : ""}`;

      await db.insert("memories", {
        room_id: ctx.foldId,
        agent: ctx.agent,
        session_id: ctx.sessionId,
        parent_id: parentId,
        message_type: "injection",
        content: `[INJECT -> ${target}] (distress relay): ${alertContent}`,
        token_count: estimateTokens(alertContent),
        metadata: {
          event: "context_injection",
          from_agent: ctx.agent,
          target_agent: target,
          priority: "urgent",
          label: "distress relay",
          distress: true,
        },
      });

      return {
        content: [{
          type: "text" as const,
          text: `Distress signal sent. State saved. ${target === "all" ? "All agents" : target} notified with urgent priority.\nYour next session (or any agent) can pick this up via eywa_start auto-recovery.`,
        }],
      };
    },
  );

  server.tool(
    "eywa_recover",
    "Check for unresolved distress signals or checkpoints from your user. Returns the most recent saved state so you can continue where a previous session left off. Called automatically by eywa_start, but you can also call it manually.",
    {},
    {
      readOnlyHint: true,
      destructiveHint: false,
    },
    async () => {
      // Look for unresolved distress signals from the same user
      const distressRows = await db.select<MemoryRow>("memories", {
        select: "id,agent,content,metadata,ts",
        room_id: `eq.${ctx.foldId}`,
        "metadata->>event": "eq.distress",
        "metadata->>resolved": "eq.false",
        "metadata->>user": `eq.${ctx.user}`,
        order: "ts.desc",
        limit: "1",
      });

      if (distressRows.length > 0) {
        const d = distressRows[0];
        const meta = d.metadata as Record<string, unknown>;

        // Mark it resolved
        await db.update("memories", { id: `eq.${d.id}` }, {
          metadata: { ...meta, resolved: true, recovered_by: ctx.agent, recovered_at: new Date().toISOString() },
        });

        return {
          content: [{
            type: "text" as const,
            text: `=== RECOVERY: Distress signal found ===\nFrom: ${d.agent} at ${d.ts}\n\n${d.content}\n\nThis distress has been marked resolved. You are now the continuation of that work.`,
          }],
        };
      }

      // Fall back to most recent checkpoint from same user
      const checkpointRows = await db.select<MemoryRow>("memories", {
        select: "id,agent,content,metadata,ts",
        room_id: `eq.${ctx.foldId}`,
        "metadata->>event": "eq.checkpoint",
        "metadata->>user": `eq.${ctx.user}`,
        order: "ts.desc",
        limit: "1",
      });

      if (checkpointRows.length > 0) {
        const cp = checkpointRows[0];
        return {
          content: [{
            type: "text" as const,
            text: `=== RECOVERY: Checkpoint found ===\nFrom: ${cp.agent} at ${cp.ts}\n\n${cp.content}\n\nNo distress signal, but this checkpoint is available if you need to continue prior work.`,
          }],
        };
      }

      return {
        content: [{
          type: "text" as const,
          text: "No distress signals or checkpoints found for your user. Starting fresh.",
        }],
      };
    },
  );

  server.tool(
    "eywa_progress",
    "Report progress on your current task. Call this periodically so the dashboard and other agents can see real-time completion. Updates are lightweight and designed for frequent use.",
    {
      task: z.string().describe("What you're working on (1 sentence)"),
      percent: z.number().min(0).max(100).describe("Estimated completion percentage (0-100)"),
      status: z.enum(["working", "blocked", "reviewing", "testing", "deploying"]).optional().describe("Current phase of work"),
      detail: z.string().optional().describe("Brief description of what you're doing right now"),
    },
    {
      readOnlyHint: false,
      idempotentHint: true,
    },
    async ({ task, percent, status, detail }) => {
      const parentId = await getLatestMemoryId(db, ctx.foldId, ctx.sessionId);
      const content = `PROGRESS [${percent}%${status ? ` ${status}` : ""}]: ${task}${detail ? ` - ${detail}` : ""}`;

      await db.insert("memories", {
        room_id: ctx.foldId,
        agent: ctx.agent,
        session_id: ctx.sessionId,
        parent_id: parentId,
        message_type: "resource",
        content,
        token_count: estimateTokens(content),
        metadata: {
          event: "progress",
          task,
          percent,
          status: status ?? "working",
          detail: detail ?? null,
          user: ctx.user,
        },
      });

      return {
        content: [{
          type: "text" as const,
          text: `Progress logged: ${percent}%${status ? ` (${status})` : ""}`,
        }],
      };
    },
  );
}
