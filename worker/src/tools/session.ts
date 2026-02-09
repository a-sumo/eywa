import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SupabaseClient } from "../lib/supabase.js";
import type { EywaContext, MemoryRow } from "../lib/types.js";

function estimateTokens(text: string): number {
  return text ? Math.floor(text.length / 4) : 0;
}

/** Get the latest memory ID for this session (for parent chaining) */
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

export function registerSessionTools(
  server: McpServer,
  db: SupabaseClient,
  ctx: EywaContext,
) {
  server.tool(
    "eywa_whoami",
    "Check your agent identity, session, and room.",
    {},
    {
      readOnlyHint: true,
      destructiveHint: false,
    },
    async () => ({
      content: [
        {
          type: "text" as const,
          text: `Agent: ${ctx.agent}\nUser: ${ctx.user}\nSession: ${ctx.sessionId}\nRoom: /${ctx.roomSlug} (${ctx.roomName})`,
        },
      ],
    }),
  );

  server.tool(
    "eywa_start",
    "Start logging this session. Call this when beginning work on a task. Returns a room snapshot so you land with full situational awareness.",
    {
      task_description: z.string().describe("Brief description of what you're working on"),
      continue_from: z.string().optional().describe("Agent name to load context from (baton handoff, e.g. 'armand/quiet-oak')"),
    },
    {
      readOnlyHint: false,
      idempotentHint: false,
    },
    async ({ task_description, continue_from }) => {
      const parentId = await getLatestMemoryId(db, ctx.roomId, ctx.sessionId);
      await db.insert("memories", {
        room_id: ctx.roomId,
        agent: ctx.agent,
        session_id: ctx.sessionId,
        parent_id: parentId,
        message_type: "resource",
        content: `SESSION START: ${task_description}`,
        token_count: estimateTokens(task_description),
        metadata: { event: "session_start", task: task_description, user: ctx.user, ...(continue_from ? { continue_from } : {}) },
      });

      // Auto-context: fetch room snapshot so agent lands aware
      const [agentRows, recentRows, injectionRows, knowledgeRows] = await Promise.all([
        // Active agents
        db.select<MemoryRow>("memories", {
          select: "agent,content,metadata,ts",
          room_id: `eq.${ctx.roomId}`,
          order: "ts.desc",
          limit: "200",
        }),
        // Recent activity
        db.select<MemoryRow>("memories", {
          select: "agent,message_type,content,metadata,ts",
          room_id: `eq.${ctx.roomId}`,
          order: "ts.desc",
          limit: "8",
        }),
        // Pending injections for this agent
        db.select<MemoryRow>("memories", {
          select: "id",
          room_id: `eq.${ctx.roomId}`,
          message_type: "eq.injection",
          "metadata->>target_agent": `in.(${ctx.agent},${ctx.user},all)`,
          limit: "50",
        }),
        // Knowledge count
        db.select<MemoryRow>("memories", {
          select: "id",
          room_id: `eq.${ctx.roomId}`,
          message_type: "eq.knowledge",
          limit: "100",
        }),
      ]);

      // Build agent status summary
      const agents = new Map<string, { status: string; task: string; systems: Set<string>; lastSeen: string }>();
      for (const row of agentRows) {
        if (row.agent === ctx.agent) continue;
        if (agents.has(row.agent)) {
          // Accumulate systems from earlier rows
          const meta = (row.metadata ?? {}) as Record<string, string>;
          if (meta.system) agents.get(row.agent)!.systems.add(meta.system);
          continue;
        }
        const meta = (row.metadata ?? {}) as Record<string, string>;
        const event = meta.event ?? "";
        let status = "idle";
        let task = (row.content ?? "").slice(0, 100);
        if (event === "session_start") { status = "active"; task = meta.task || task; }
        else if (event === "session_end" || event === "session_done") { status = "finished"; task = meta.summary || task; }
        const systems = new Set<string>();
        if (meta.system) systems.add(meta.system);
        agents.set(row.agent, { status, task, systems, lastSeen: row.ts });
      }

      // Build recent activity
      const recentLines: string[] = [];
      for (const m of recentRows) {
        if (m.agent === ctx.agent) continue;
        const meta = (m.metadata ?? {}) as Record<string, string>;
        const opTag = meta.system || meta.action
          ? ` [${[meta.system, meta.action, meta.outcome].filter(Boolean).join(":")}]`
          : "";
        const content = (m.content ?? "").slice(0, 120);
        recentLines.push(`  ${m.agent} ${m.message_type}: ${content}${opTag}`);
      }

      // Compose snapshot
      const lines: string[] = [
        `Logging started for: ${task_description}`,
        `Session: ${ctx.sessionId} in room /${ctx.roomSlug}`,
        "",
        "=== Room Snapshot ===",
      ];

      if (agents.size > 0) {
        lines.push(`\nAgents (${agents.size}):`);
        for (const [name, info] of agents) {
          const sysStr = info.systems.size > 0 ? ` {${Array.from(info.systems).join(", ")}}` : "";
          lines.push(`  ${name} [${info.status}] ${info.task}${sysStr}`);
        }
      } else {
        lines.push("\nNo other agents active.");
      }

      if (recentLines.length > 0) {
        lines.push(`\nRecent activity:`);
        lines.push(...recentLines.slice(0, 5));
      }

      const injectionCount = injectionRows.length;
      const knowledgeCount = knowledgeRows.length;
      if (injectionCount > 0 || knowledgeCount > 0) {
        lines.push("");
        if (injectionCount > 0) lines.push(`Pending injections: ${injectionCount} (call eywa_inbox to read)`);
        if (knowledgeCount > 0) lines.push(`Knowledge entries: ${knowledgeCount} (call eywa_knowledge to browse)`);
      }

      lines.push("\nUse eywa_log with system/action/outcome fields to tag your operations.");

      // Auto-recovery: check for unresolved distress signals or recent checkpoints from same user
      let recoveryBlock = "";
      try {
        const distressRows = await db.select<MemoryRow>("memories", {
          select: "id,agent,content,metadata,ts",
          room_id: `eq.${ctx.roomId}`,
          "metadata->>event": "eq.distress",
          "metadata->>resolved": "eq.false",
          "metadata->>user": `eq.${ctx.user}`,
          order: "ts.desc",
          limit: "1",
        });

        if (distressRows.length > 0) {
          const d = distressRows[0];
          const meta = (d.metadata ?? {}) as Record<string, unknown>;
          // Mark resolved so the next session doesn't pick it up again
          await db.update("memories", { id: `eq.${d.id}` }, {
            metadata: { ...meta, resolved: true, recovered_by: ctx.agent, recovered_at: new Date().toISOString() },
          });
          recoveryBlock = [
            "\n=== RECOVERY: Distress signal detected ===",
            `Previous agent ${d.agent} ran out of context at ${d.ts}.`,
            "Their saved state follows. Continue their work.\n",
            d.content ?? "",
          ].join("\n");
        } else {
          // Check for recent checkpoints (last 2 hours) from same user
          const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
          const checkpointRows = await db.select<MemoryRow>("memories", {
            select: "id,agent,content,metadata,ts",
            room_id: `eq.${ctx.roomId}`,
            "metadata->>event": "eq.checkpoint",
            "metadata->>user": `eq.${ctx.user}`,
            ts: `gte.${twoHoursAgo}`,
            order: "ts.desc",
            limit: "1",
          });

          if (checkpointRows.length > 0) {
            const cp = checkpointRows[0];
            recoveryBlock = [
              "\n=== CHECKPOINT AVAILABLE ===",
              `From ${cp.agent} at ${cp.ts}.`,
              "If you're continuing prior work, here's the last saved state:\n",
              cp.content ?? "",
            ].join("\n");
          }
        }
      } catch {
        // Don't break session start if recovery check fails
      }

      if (recoveryBlock) {
        lines.push(recoveryBlock);
      }

      // Mid-session baton: load another agent's context
      if (continue_from) {
        const batonRows = await db.select<MemoryRow>("memories", {
          select: "message_type,content,metadata,ts",
          room_id: `eq.${ctx.roomId}`,
          agent: `eq.${continue_from}`,
          order: "ts.desc",
          limit: "20",
        });

        if (batonRows.length > 0) {
          lines.push(`\n=== Baton: ${continue_from} (${batonRows.length} items) ===`);
          for (const m of [...batonRows].reverse()) {
            const meta = (m.metadata ?? {}) as Record<string, string>;
            const prefix = meta.event ? `[${meta.event}]` : `[${m.message_type}]`;
            const opParts = [meta.system, meta.action, meta.outcome].filter(Boolean);
            const opTag = opParts.length > 0 ? ` [${opParts.join(":")}]` : "";
            lines.push(`${prefix}: ${(m.content ?? "").slice(0, 300)}${opTag}`);
          }
        } else {
          lines.push(`\nBaton: no memories found for ${continue_from} in this room.`);
        }
      }

      return {
        content: [
          { type: "text" as const, text: lines.join("\n") },
        ],
      };
    },
  );

  server.tool(
    "eywa_stop",
    "Stop logging and save a session summary.",
    { summary: z.string().describe("Summary of what was accomplished") },
    {
      readOnlyHint: false,
      idempotentHint: true,
    },
    async ({ summary }) => {
      const parentId = await getLatestMemoryId(db, ctx.roomId, ctx.sessionId);
      await db.insert("memories", {
        room_id: ctx.roomId,
        agent: ctx.agent,
        session_id: ctx.sessionId,
        parent_id: parentId,
        message_type: "resource",
        content: `SESSION END: ${summary}`,
        token_count: estimateTokens(summary),
        metadata: { event: "session_end", summary, user: ctx.user },
      });
      return {
        content: [{ type: "text" as const, text: "Session ended. Summary logged." }],
      };
    },
  );

  server.tool(
    "eywa_done",
    "Mark session as complete with structured summary, status, artifacts, and next steps. Use this instead of eywa_stop when you want to record what was accomplished.",
    {
      summary: z.string().describe("What was accomplished this session"),
      status: z.enum(["completed", "blocked", "failed", "partial"]).describe("Session outcome"),
      artifacts: z.array(z.string()).optional().describe("Key files or outputs produced"),
      tags: z.array(z.string()).optional().describe("Tags for categorization (e.g. 'bugfix', 'feature', 'refactor')"),
      next_steps: z.string().optional().describe("Suggested follow-up work for the next session"),
    },
    {
      readOnlyHint: false,
      idempotentHint: true,
    },
    async ({ summary, status, artifacts, tags, next_steps }) => {
      const parentId = await getLatestMemoryId(db, ctx.roomId, ctx.sessionId);
      await db.insert("memories", {
        room_id: ctx.roomId,
        agent: ctx.agent,
        session_id: ctx.sessionId,
        parent_id: parentId,
        message_type: "resource",
        content: `SESSION DONE [${status.toUpperCase()}]: ${summary}${next_steps ? `\nNext steps: ${next_steps}` : ""}${artifacts?.length ? `\nArtifacts: ${artifacts.join(", ")}` : ""}`,
        token_count: estimateTokens(summary),
        metadata: {
          event: "session_done",
          status,
          summary,
          artifacts: artifacts ?? [],
          tags: tags ?? [],
          next_steps: next_steps ?? null,
          user: ctx.user,
        },
      });
      return {
        content: [{
          type: "text" as const,
          text: `Session marked as ${status}. Summary logged.${artifacts?.length ? `\nArtifacts: ${artifacts.join(", ")}` : ""}${tags?.length ? `\nTags: ${tags.join(", ")}` : ""}${next_steps ? `\nNext: ${next_steps}` : ""}`,
        }],
      };
    },
  );
}
