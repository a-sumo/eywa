import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SupabaseClient } from "../lib/supabase.js";
import type { EywaContext, MemoryRow } from "../lib/types.js";

// Curvature: how much an agent's work bends toward the destination
const ACTION_WEIGHTS: Record<string, number> = {
  deploy: 5, create: 4, write: 3, test: 3,
  delete: 2, review: 2, debug: 2, configure: 1.5,
  read: 1, monitor: 0.5,
};
const OUTCOME_MULT: Record<string, number> = {
  success: 1.0, in_progress: 0.5, failure: -1.0, blocked: -2.0,
};
const HIGH_IMPACT_ACTIONS = new Set(["deploy", "create", "write", "test", "delete", "review"]);

export function computeCurvature(
  ops: Array<{ action?: string; outcome?: string }>,
  durationMinutes: number,
): number {
  if (ops.length === 0 || durationMinutes <= 0) return 0;
  const mins = Math.max(durationMinutes, 1); // avoid division by tiny numbers

  let weightedSum = 0;
  let failBlockCount = 0;
  let highImpact = 0;

  for (const op of ops) {
    const w = ACTION_WEIGHTS[op.action ?? ""] ?? 0;
    const m = OUTCOME_MULT[op.outcome ?? ""] ?? 0.5;
    weightedSum += w * m;
    if (op.outcome === "failure" || op.outcome === "blocked") failBlockCount++;
    if (HIGH_IMPACT_ACTIONS.has(op.action ?? "")) highImpact++;
  }

  const momentum = weightedSum / mins;
  const drag = failBlockCount / mins;
  const signal = highImpact / Math.max(ops.length, 1);

  return Math.round((momentum - drag) * signal * 100) / 100;
}

export function registerCollaborationTools(
  server: McpServer,
  db: SupabaseClient,
  ctx: EywaContext,
) {
  server.tool(
    "eywa_status",
    "See what all agents are currently working on in this fold, including what systems they're operating on and what actions they're taking.",
    {},
    {
      readOnlyHint: true,
      destructiveHint: false,
    },
    async () => {
      const rows = await db.select<MemoryRow>("memories", {
        select: "agent,content,ts,metadata",
        fold_id: `eq.${ctx.foldId}`,
        order: "ts.desc",
      });

      if (!rows.length) {
        return {
          content: [{ type: "text" as const, text: "No agents active." }],
        };
      }

      const agents = new Map<
        string,
        {
          status: string;
          description: string;
          lastSeen: string;
          firstSeen: string;
          systems: Set<string>;
          actions: Set<string>;
          opCount: number;
          outcomes: { success: number; failure: number; blocked: number };
          ops: Array<{ action?: string; outcome?: string }>;
          heartbeatPhase: string | null;
          tokenPercent: number | null;
        }
      >();

      for (const row of rows) {
        const meta = (row.metadata ?? {}) as Record<string, string>;
        const task = meta.task ?? "";
        const event = meta.event ?? "";
        const summary = meta.summary ?? "";

        if (!agents.has(row.agent)) {
          let status = "idle";
          let description = row.content?.slice(0, 200) ?? "";

          if (event === "session_start") {
            status = "active";
            description = task || description;
          } else if (event === "session_end" || event === "session_done") {
            status = "finished";
            description = summary || description;
          }

          agents.set(row.agent, {
            status,
            description,
            lastSeen: row.ts,
            firstSeen: row.ts,
            systems: new Set(),
            actions: new Set(),
            opCount: 0,
            outcomes: { success: 0, failure: 0, blocked: 0 },
            ops: [],
            heartbeatPhase: event === "heartbeat" ? (meta.phase || null) : null,
            tokenPercent: event === "heartbeat" ? (Number(meta.token_percent) || null) : null,
          });
        }

        const info = agents.get(row.agent)!;
        info.firstSeen = row.ts; // keeps getting overwritten to earliest

        // Capture heartbeat if not yet (first row = most recent)
        if (!info.heartbeatPhase && event === "heartbeat") {
          info.heartbeatPhase = meta.phase || null;
          info.tokenPercent = Number(meta.token_percent) || null;
        }

        // Accumulate operation metadata
        if (meta.system) info.systems.add(meta.system);
        if (meta.action) info.actions.add(meta.action);
        if (meta.system || meta.action) {
          info.opCount++;
          info.ops.push({ action: meta.action, outcome: meta.outcome });
        }
        if (meta.outcome === "success") info.outcomes.success++;
        if (meta.outcome === "failure") info.outcomes.failure++;
        if (meta.outcome === "blocked") info.outcomes.blocked++;
      }

      const lines = ["=== Eywa Agent Status ===\n"];
      for (const [name, info] of agents) {
        const sysStr = info.systems.size > 0 ? `\n    Systems: ${Array.from(info.systems).join(", ")}` : "";
        const actStr = info.actions.size > 0 ? `\n    Actions: ${Array.from(info.actions).join(", ")}` : "";
        const opsStr = info.opCount > 0 ? `\n    Operations: ${info.opCount} total` : "";

        const outcomesParts: string[] = [];
        if (info.outcomes.success > 0) outcomesParts.push(`${info.outcomes.success} ok`);
        if (info.outcomes.failure > 0) outcomesParts.push(`${info.outcomes.failure} failed`);
        if (info.outcomes.blocked > 0) outcomesParts.push(`${info.outcomes.blocked} blocked`);
        const outStr = outcomesParts.length > 0 ? ` (${outcomesParts.join(", ")})` : "";

        // Duration + curvature
        const startMs = new Date(info.firstSeen).getTime();
        const endMs = new Date(info.lastSeen).getTime();
        const durationMs = endMs - startMs;
        const durationMin = durationMs / 60000;
        const durationStr = durationMs > 60000
          ? ` (${Math.round(durationMin)}m)`
          : durationMs > 0 ? ` (${Math.round(durationMs / 1000)}s)` : "";

        const kappa = computeCurvature(info.ops, durationMin);
        const kappaStr = info.ops.length > 0 ? `\n    Curvature: κ=${kappa}` : "";

        // Silence detection
        const silenceMs = Date.now() - new Date(info.lastSeen).getTime();
        const silenceMin = Math.floor(silenceMs / 60000);
        const silenceStr = info.status === "active" && silenceMin >= 10
          ? `\n    ⚠ SILENT ${silenceMin >= 60 ? `${Math.floor(silenceMin / 60)}h ${silenceMin % 60}m` : `${silenceMin}m`}`
          : "";

        // Heartbeat telemetry
        const hbStr = info.heartbeatPhase
          ? `\n    Heartbeat: ${info.heartbeatPhase}${info.tokenPercent ? ` (${info.tokenPercent}% context)` : ""}`
          : "";

        lines.push(
          `  ${name} [${info.status}]${durationStr} - ${info.description}${sysStr}${actStr}${opsStr}${outStr}${kappaStr}${silenceStr}${hbStr}\n    Last seen: ${info.lastSeen}`,
        );
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );

  server.tool(
    "eywa_summary",
    "Get a token-efficient compressed summary of the fold. Per-agent task, systems, and outcomes. Knowledge and injection counts. Designed for agents with limited context windows.",
    {
      hours: z.number().optional().default(24).describe("How many hours back to summarize"),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
    },
    async ({ hours }) => {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      const [memRows, knowledgeRows, injectionRows] = await Promise.all([
        db.select<MemoryRow>("memories", {
          select: "agent,message_type,content,metadata,ts",
          fold_id: `eq.${ctx.foldId}`,
          ts: `gte.${since}`,
          order: "ts.desc",
          limit: "500",
        }),
        db.select<MemoryRow>("memories", {
          select: "id",
          fold_id: `eq.${ctx.foldId}`,
          message_type: "eq.knowledge",
          limit: "100",
        }),
        db.select<MemoryRow>("memories", {
          select: "id,metadata",
          fold_id: `eq.${ctx.foldId}`,
          message_type: "eq.injection",
          ts: `gte.${since}`,
          limit: "100",
        }),
      ]);

      if (!memRows.length) {
        return {
          content: [{ type: "text" as const, text: `No activity in the last ${hours}h.` }],
        };
      }

      // Build per-agent summary
      const agents = new Map<
        string,
        {
          status: string;
          task: string;
          systems: Set<string>;
          actions: Set<string>;
          memCount: number;
          outcomes: { success: number; failure: number };
        }
      >();

      for (const row of memRows) {
        const meta = (row.metadata ?? {}) as Record<string, string>;
        if (!agents.has(row.agent)) {
          const event = meta.event ?? "";
          let status = "idle";
          let task = (row.content ?? "").slice(0, 80);
          if (event === "session_start") { status = "active"; task = meta.task || task; }
          else if (event === "session_end" || event === "session_done") {
            status = meta.status || "finished";
            task = meta.summary || task;
          }
          agents.set(row.agent, {
            status, task,
            systems: new Set(),
            actions: new Set(),
            memCount: 0,
            outcomes: { success: 0, failure: 0 },
          });
        }
        const info = agents.get(row.agent)!;
        info.memCount++;
        if (meta.system) info.systems.add(meta.system);
        if (meta.action) info.actions.add(meta.action);
        if (meta.outcome === "success") info.outcomes.success++;
        if (meta.outcome === "failure") info.outcomes.failure++;
      }

      // Count unread injections for this agent
      const myInjections = injectionRows.filter(r => {
        const meta = (r.metadata ?? {}) as Record<string, string>;
        const target = meta.target_agent;
        return target === ctx.agent || target === ctx.user || target === "all";
      });

      const lines: string[] = [`Fold summary (last ${hours}h):\n`];

      for (const [name, info] of agents) {
        const sys = info.systems.size > 0 ? ` {${Array.from(info.systems).join(",")}}` : "";
        const acts = info.actions.size > 0 ? ` [${Array.from(info.actions).join(",")}]` : "";
        const oc = info.outcomes.failure > 0 ? ` ${info.outcomes.failure} failures` : "";
        lines.push(`${name} [${info.status}] ${info.task}${sys}${acts} (${info.memCount} ops${oc})`);
      }

      lines.push("");
      lines.push(`Knowledge base: ${knowledgeRows.length} entries`);
      lines.push(`Injections (${hours}h): ${injectionRows.length} total, ${myInjections.length} for you`);
      lines.push(`Agents: ${agents.size} | Memories: ${memRows.length}`);

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );

  server.tool(
    "eywa_pull",
    "Pull recent context from another agent's session.",
    {
      agent: z.string().describe("Agent name to pull context from"),
      limit: z.number().optional().default(20).describe("Maximum memories to retrieve"),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
    },
    async ({ agent, limit }) => {
      const rows = await db.select<MemoryRow>("memories", {
        select: "message_type,content,ts,metadata",
        fold_id: `eq.${ctx.foldId}`,
        agent: `eq.${agent}`,
        order: "ts.desc",
        limit: String(limit),
      });

      if (!rows.length) {
        return {
          content: [
            { type: "text" as const, text: `No context found for agent '${agent}'` },
          ],
        };
      }

      const lines = [`=== Context from ${agent} (${rows.length} items) ===\n`];
      for (const m of [...rows].reverse()) {
        const meta = (m.metadata ?? {}) as Record<string, string>;
        let prefix = `[${m.message_type}]`;
        if (meta.event) prefix = `[${meta.event}]`;
        if (meta.path) prefix += ` (${meta.path})`;
        const opParts = [meta.system, meta.action, meta.outcome].filter(Boolean);
        const opTag = opParts.length > 0 ? ` [${opParts.join(":")}]` : "";
        lines.push(`${prefix}: ${m.content ?? ""}${opTag}`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n\n") }],
      };
    },
  );

  server.tool(
    "eywa_sync",
    "Sync another agent's current session history into your context.",
    {
      agent: z.string().describe("Agent name to sync from"),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
    },
    async ({ agent }) => {
      // Find their most recent session
      const sessionRows = await db.select<MemoryRow>("memories", {
        select: "session_id",
        fold_id: `eq.${ctx.foldId}`,
        agent: `eq.${agent}`,
        order: "ts.desc",
        limit: "1",
      });

      if (!sessionRows.length) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No sessions found for agent '${agent}'`,
            },
          ],
        };
      }

      const targetSession = sessionRows[0].session_id;

      const rows = await db.select<MemoryRow>("memories", {
        select: "message_type,content,ts,metadata",
        fold_id: `eq.${ctx.foldId}`,
        agent: `eq.${agent}`,
        session_id: `eq.${targetSession}`,
        order: "ts.asc",
      });

      if (!rows.length) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No messages in ${agent}'s current session`,
            },
          ],
        };
      }

      const lines = [
        `=== Synced session from ${agent} (session: ${targetSession}, ${rows.length} items) ===\n`,
      ];
      for (const m of rows) {
        const meta = (m.metadata ?? {}) as Record<string, string>;
        const label = meta.event || m.message_type || "";
        const opParts = [meta.system, meta.action, meta.outcome].filter(Boolean);
        const opTag = opParts.length > 0 ? ` [${opParts.join(":")}]` : "";
        lines.push(`[${m.ts}] ${label}: ${m.content ?? ""}${opTag}`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n\n") }],
      };
    },
  );

  server.tool(
    "eywa_msg",
    "Send a message to teammates via Eywa.",
    {
      content: z.string().describe("Message text"),
      channel: z.string().optional().default("general").describe("Channel to send to"),
    },
    {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    async ({ content, channel }) => {
      await db.insert("messages", {
        fold_id: ctx.foldId,
        sender: ctx.agent,
        channel,
        content,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Message sent to #${channel} as ${ctx.agent}`,
          },
        ],
      };
    },
  );
}
