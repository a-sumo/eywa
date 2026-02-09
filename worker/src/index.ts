import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { SupabaseClient } from "./lib/supabase.js";
import { InboxTracker } from "./lib/inbox.js";
import { ContextPressureMonitor } from "./lib/pressure.js";
import type { Env, EywaContext, MemoryRow, GlobalInsightRow, RoomRow } from "./lib/types.js";
import { matchKnowledge, matchInsights, milestonesToQuery } from "./lib/relevance.js";
import { registerSessionTools } from "./tools/session.js";
import { registerMemoryTools } from "./tools/memory.js";
import { registerContextTools } from "./tools/context.js";
import { registerCollaborationTools, computeCurvature } from "./tools/collaboration.js";
import { registerInjectTools } from "./tools/inject.js";
import { registerKnowledgeTools } from "./tools/knowledge.js";
import { registerLinkTools } from "./tools/link.js";
import { registerTimelineTools } from "./tools/timeline.js";
import { registerNetworkTools } from "./tools/network.js";
import { registerRecoveryTools } from "./tools/recovery.js";
import { registerDestinationTools } from "./tools/destination.js";
import { registerClaimTools, getActiveClaims } from "./tools/claim.js";

export default {
  async fetch(request: Request, env: Env, execCtx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check / info endpoint
    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json({
        name: "eywa-mcp",
        version: "1.0.0",
        status: "ok",
        docs: "Connect via MCP at /mcp?room=<slug>&agent=<name>",
      });
    }

    // MCP endpoint
    if (url.pathname === "/mcp") {
      try {
        return await handleMcp(request, url, env, execCtx);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.stack || err.message : String(err);
        return Response.json({ error: message }, { status: 500 });
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;

const ADJECTIVES = [
  "swift","quiet","bold","warm","cool","bright","dark","wild","calm","sharp",
  "keen","still","fair","deep","raw","soft","dry","pale","cold","red",
  "blue","gold","gray","jade","iron","amber","coral","misty","dusty","frosty",
  "mossy","rusty","sunny","windy","rainy","snowy","hazy","smoky","rosy","ashy",
];
const NOUNS = [
  "oak","elm","fox","owl","wolf","bear","hawk","crow","dove","wren",
  "pine","sage","fern","moss","reed","lake","brook","ridge","cliff","stone",
  "dusk","dawn","rain","snow","mist","gale","tide","star","moon","spark",
  "thorn","bloom","frost","ember","shore","grove","vale","marsh","peak","drift",
];

function generateName(): string {
  const arr = new Uint32Array(2);
  crypto.getRandomValues(arr);
  return `${ADJECTIVES[arr[0] % ADJECTIVES.length]}-${NOUNS[arr[1] % NOUNS.length]}`;
}

async function handleMcp(
  request: Request,
  url: URL,
  env: Env,
  execCtx: ExecutionContext,
): Promise<Response> {
  const roomSlug = url.searchParams.get("room");
  const baseAgent = url.searchParams.get("agent");
  const baton = url.searchParams.get("baton"); // optional: agent name to load context from

  if (!roomSlug || !baseAgent) {
    return Response.json(
      { error: "Missing required query params: ?room=<slug>&agent=<name>" },
      { status: 400 },
    );
  }

  // Validate room slug: alphanumeric, hyphens, underscores, 1-64 chars
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(roomSlug)) {
    return Response.json(
      { error: "Invalid room slug. Use only letters, numbers, hyphens, underscores (max 64 chars)." },
      { status: 400 },
    );
  }

  // Validate agent name: alphanumeric, hyphens, underscores, dots, 1-64 chars
  if (!/^[a-zA-Z0-9_.\-]{1,64}$/.test(baseAgent)) {
    return Response.json(
      { error: "Invalid agent name. Use only letters, numbers, hyphens, underscores, dots (max 64 chars)." },
      { status: 400 },
    );
  }

  // Each connection gets a unique agent identity: "armand/quiet-oak"
  // The base name groups sessions by user for the UI.
  const agent = `${baseAgent}/${generateName()}`;

  const db = new SupabaseClient(env.SUPABASE_URL, env.SUPABASE_KEY);

  // Resolve room slug → room row
  const rooms = await db.select<RoomRow>("rooms", {
    select: "id,name,slug",
    slug: `eq.${roomSlug}`,
    limit: "1",
  });

  if (!rooms.length) {
    return Response.json(
      { error: `Room not found: ${roomSlug}. Create one at eywa-ai.dev first.` },
      { status: 404 },
    );
  }

  const room = rooms[0];
  const sessionId = `session_${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15)}_${crypto.randomUUID()}`;

  const ctx: EywaContext = {
    roomId: room.id,
    roomSlug: room.slug,
    roomName: room.name,
    agent,
    user: baseAgent,
    sessionId,
  };

  // Connection is tracked implicitly via eywa_start (session_start event).
  // No need to log "connected to room" - it's noise that drowns out real work.

  // Build instructions string with room context + baton (delivered at MCP init, no tool call needed)
  let instructions: string;
  try {
    instructions = await buildInstructions(db, ctx, baton);
  } catch {
    instructions = `You are ${ctx.agent} in room /${ctx.roomSlug} (${ctx.roomName}).\nUser: ${ctx.user} | Session: ${ctx.sessionId}\n\nCall eywa_start to get room context.`;
  }

  // Create MCP server and register all tools
  const server = new McpServer({ name: "eywa", version: "1.0.0" }, { instructions });

  // Wrap server.tool to piggyback pending injections and context pressure
  // warnings on every tool response. Agents see both without explicit polling.
  const inbox = new InboxTracker();
  const pressure = new ContextPressureMonitor();
  const SKIP_INBOX = new Set(["eywa_inject", "eywa_inbox"]);
  const origTool = server.tool.bind(server) as Function;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).tool = function (...args: any[]) {
    const toolName = typeof args[0] === "string" ? args[0] : "";
    const handlerIdx = args.length - 1;
    const originalHandler = args[handlerIdx];

    if (typeof originalHandler === "function") {
      args[handlerIdx] = async function (...handlerArgs: any[]) {
        const result = await originalHandler(...handlerArgs);

        // Context pressure warning (tool-call counter as proxy for token usage)
        try {
          const warning = pressure.tick(toolName);
          if (warning && result.content && Array.isArray(result.content)) {
            result.content.push({ type: "text" as const, text: warning });
          }
        } catch {
          // Never break tool responses due to pressure check failure
        }

        // Injection piggyback
        if (!SKIP_INBOX.has(toolName)) {
          try {
            const pending = await inbox.check(db, ctx);
            if (pending && result.content && Array.isArray(result.content)) {
              result.content.push({ type: "text" as const, text: pending });
            }
          } catch {
            // Never break tool responses due to inbox check failure
          }
        }

        return result;
      };
    }

    return origTool.apply(server, args);
  };

  registerSessionTools(server, db, ctx);
  registerMemoryTools(server, db, ctx);
  registerContextTools(server, db, ctx);
  registerCollaborationTools(server, db, ctx);
  registerInjectTools(server, db, ctx);
  registerKnowledgeTools(server, db, ctx);
  registerLinkTools(server, db, ctx);
  registerTimelineTools(server, db, ctx);
  registerNetworkTools(server, db, ctx);
  registerRecoveryTools(server, db, ctx);
  registerDestinationTools(server, db, ctx);
  registerClaimTools(server, db, ctx);

  // Delegate to the MCP handler (handles Streamable HTTP + SSE)
  const handler = createMcpHandler(server);
  return handler(request, env, execCtx);
}

/** Build MCP instructions string with room context + baton. Delivered at connection time, no tool call needed. */
async function buildInstructions(
  db: SupabaseClient,
  ctx: EywaContext,
  baton: string | null,
): Promise<string> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const queries: Promise<MemoryRow[]>[] = [
    // Active agents (skip connection spam, only real activity)
    db.select<MemoryRow>("memories", {
      select: "agent,content,metadata,ts",
      room_id: `eq.${ctx.roomId}`,
      "metadata->>event": "neq.agent_connected",
      order: "ts.desc",
      limit: "200",
    }),
    // Recent activity (skip connection spam)
    db.select<MemoryRow>("memories", {
      select: "agent,message_type,content,metadata,ts",
      room_id: `eq.${ctx.roomId}`,
      "metadata->>event": "neq.agent_connected",
      order: "ts.desc",
      limit: "8",
    }),
    // Pending injections
    db.select<MemoryRow>("memories", {
      select: "id",
      room_id: `eq.${ctx.roomId}`,
      message_type: "eq.injection",
      "metadata->>target_agent": `in.(${ctx.agent},${ctx.user},all)`,
      limit: "50",
    }),
    // Knowledge entries with full content (for proactive surfacing)
    db.select<MemoryRow>("memories", {
      select: "id,agent,content,metadata,ts",
      room_id: `eq.${ctx.roomId}`,
      message_type: "eq.knowledge",
      order: "ts.desc",
      limit: "50",
    }),
    // Distress signals (unresolved, same user)
    db.select<MemoryRow>("memories", {
      select: "id,agent,content,metadata,ts",
      room_id: `eq.${ctx.roomId}`,
      "metadata->>event": "eq.distress",
      "metadata->>resolved": "eq.false",
      "metadata->>user": `eq.${ctx.user}`,
      order: "ts.desc",
      limit: "1",
    }),
    // Recent checkpoints (same user, last 2h)
    db.select<MemoryRow>("memories", {
      select: "id,agent,content,metadata,ts",
      room_id: `eq.${ctx.roomId}`,
      "metadata->>event": "eq.checkpoint",
      "metadata->>user": `eq.${ctx.user}`,
      ts: `gte.${twoHoursAgo}`,
      order: "ts.desc",
      limit: "1",
    }),
    // Current destination
    db.select<MemoryRow>("memories", {
      select: "content,metadata,ts",
      room_id: `eq.${ctx.roomId}`,
      message_type: "eq.knowledge",
      "metadata->>event": "eq.destination",
      order: "ts.desc",
      limit: "1",
    }),
    // Active claims (for conflict detection)
    db.select<MemoryRow>("memories", {
      select: "agent,metadata,ts,session_id",
      room_id: `eq.${ctx.roomId}`,
      "metadata->>event": "eq.claim",
      ts: `gte.${twoHoursAgo}`,
      order: "ts.desc",
      limit: "50",
    }),
  ];

  // Global insights (separate query, different return type)
  const insightsPromise = db.select<GlobalInsightRow>("global_insights", {
    select: "id,insight,domain_tags,source_hash,upvotes,ts",
    order: "ts.desc",
    limit: "50",
  });

  // Baton: load target agent's recent session
  if (baton) {
    queries.push(
      db.select<MemoryRow>("memories", {
        select: "message_type,content,metadata,ts",
        room_id: `eq.${ctx.roomId}`,
        agent: `eq.${baton}`,
        order: "ts.desc",
        limit: "20",
      }),
    );
  }

  const [results, insightRows] = await Promise.all([Promise.all(queries), insightsPromise]);
  const [agentRows, recentRows, injectionRows, knowledgeRows, distressRows, checkpointRows, destRows, claimRows] = results;
  const batonRows = baton ? results[8] : [];

  // Build agent status map with curvature
  const agents = new Map<string, {
    status: string; task: string; systems: Set<string>;
    ops: Array<{ action?: string; outcome?: string }>; firstTs: string; lastTs: string;
  }>();
  for (const row of agentRows) {
    if (row.agent === ctx.agent) continue;
    const meta = (row.metadata ?? {}) as Record<string, string>;
    if (agents.has(row.agent)) {
      if (meta.system) agents.get(row.agent)!.systems.add(meta.system);
      if (meta.system || meta.action) {
        agents.get(row.agent)!.ops.push({ action: meta.action, outcome: meta.outcome });
      }
      agents.get(row.agent)!.firstTs = row.ts;
      continue;
    }
    const event = meta.event ?? "";
    let status = "idle";
    let task = (row.content ?? "").slice(0, 100);
    if (event === "session_start") { status = "active"; task = meta.task || task; }
    else if (event === "session_end" || event === "session_done") { status = "finished"; task = meta.summary || task; }
    const systems = new Set<string>();
    if (meta.system) systems.add(meta.system);
    const ops: Array<{ action?: string; outcome?: string }> = [];
    if (meta.system || meta.action) ops.push({ action: meta.action, outcome: meta.outcome });
    agents.set(row.agent, { status, task, systems, ops, firstTs: row.ts, lastTs: row.ts });
  }

  // Compose instructions
  const lines: string[] = [
    `You are ${ctx.agent} in room /${ctx.roomSlug} (${ctx.roomName}).`,
    `User: ${ctx.user} | Session: ${ctx.sessionId}`,
  ];

  // Agents with curvature
  if (agents.size > 0) {
    lines.push(`\nAgents (${agents.size}):`);
    for (const [name, info] of agents) {
      const sysStr = info.systems.size > 0 ? ` {${Array.from(info.systems).join(", ")}}` : "";
      const durationMin = (new Date(info.lastTs).getTime() - new Date(info.firstTs).getTime()) / 60000;
      const kappa = computeCurvature(info.ops, durationMin);
      const kappaStr = info.ops.length > 0 ? ` κ=${kappa}` : "";
      lines.push(`  ${name} [${info.status}]${kappaStr} ${info.task}${sysStr}`);
    }
  }

  // Recent activity
  const recentLines: string[] = [];
  for (const m of recentRows) {
    if (m.agent === ctx.agent) continue;
    const meta = (m.metadata ?? {}) as Record<string, string>;
    const opTag = meta.system || meta.action
      ? ` [${[meta.system, meta.action, meta.outcome].filter(Boolean).join(":")}]`
      : "";
    recentLines.push(`  ${m.agent} ${m.message_type}: ${(m.content ?? "").slice(0, 120)}${opTag}`);
  }
  if (recentLines.length > 0) {
    lines.push(`\nRecent:`);
    lines.push(...recentLines.slice(0, 5));
  }

  // Counts
  const ic = injectionRows.length;
  const kc = knowledgeRows.length;
  if (ic > 0 || kc > 0) {
    const parts: string[] = [];
    if (ic > 0) parts.push(`Pending injections: ${ic}`);
    if (kc > 0) parts.push(`Knowledge: ${kc}`);
    lines.push(`\n${parts.join(" | ")}`);
  }

  // Destination
  if (destRows && destRows.length > 0) {
    const dMeta = (destRows[0].metadata ?? {}) as Record<string, unknown>;
    const dest = dMeta.destination as string;
    const ms = (dMeta.milestones as string[]) || [];
    const prog = (dMeta.progress as Record<string, boolean>) || {};
    const done = ms.filter((m) => prog[m]).length;
    const total = ms.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    lines.push(`\nDestination: ${dest}`);
    if (total > 0) {
      lines.push(`Progress: ${done}/${total} (${pct}%)`);
      for (const m of ms) {
        lines.push(`  ${prog[m] ? "[x]" : "[ ]"} ${m}`);
      }
    }
    if (dMeta.notes) lines.push(`Notes: ${dMeta.notes as string}`);

    // Proactive guidance: surface knowledge relevant to remaining milestones
    try {
      const milestoneQuery = milestonesToQuery(ms, prog);
      if (milestoneQuery) {
        const relevantK = matchKnowledge(milestoneQuery, knowledgeRows, 3, 0.2);
        const relevantI = matchInsights(milestoneQuery, insightRows ?? [], 2, 0.2);
        const relevant = [...relevantK, ...relevantI];
        if (relevant.length > 0) {
          lines.push("\nGuidance for remaining milestones:");
          for (const entry of relevant) {
            lines.push(`  [${entry.source}] ${entry.text.slice(0, 200)}`);
          }
        }
      }
    } catch {
      // Don't break instructions if relevance matching fails
    }

    // Network route recommendations for remaining milestones
    try {
      const remaining = ms.filter((m: string) => !prog[m]);
      if (remaining.length > 0 && insightRows && insightRows.length > 0) {
        const routeQuery = remaining.join(" ");
        const keywords = routeQuery.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w: string) => w.length > 2);
        if (keywords.length > 0) {
          // Score insights against remaining milestones
          const scored = (insightRows as GlobalInsightRow[]).map(ins => {
            const text = `${ins.insight} ${ins.domain_tags.join(" ")}`.toLowerCase();
            let hits = 0;
            for (const kw of keywords) { if (text.includes(kw)) hits++; }
            return { ins, score: hits / keywords.length };
          }).filter(s => s.score > 0.15).sort((a, b) => b.score - a.score).slice(0, 3);

          if (scored.length > 0) {
            lines.push(`\nNetwork routes (from ${insightRows.length} cross-room insights):`);
            lines.push("Use eywa_route for detailed recommendations.");
            for (const { ins, score } of scored) {
              const pct = Math.round(score * 100);
              const tags = ins.domain_tags.length ? ` {${ins.domain_tags.join(", ")}}` : "";
              lines.push(`  [${pct}%] ${ins.insight.slice(0, 150)}${tags}`);
            }
          }
        }
      }
    } catch {
      // Don't break instructions if route computation fails
    }
  }

  // Active claims (work dedup)
  if (claimRows && claimRows.length > 0) {
    // Dedupe: latest claim per agent, skip self
    const claimSeen = new Set<string>();
    const claimLines: string[] = [];
    for (const row of claimRows) {
      if (row.agent === ctx.agent) continue;
      if (claimSeen.has(row.agent)) continue;
      claimSeen.add(row.agent);
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const scope = (meta.scope as string) || "";
      const files = (meta.files as string[]) || [];
      const short = row.agent.includes("/") ? row.agent.split("/").pop()! : row.agent;
      claimLines.push(`  ${short}: ${scope}${files.length > 0 ? ` [${files.join(", ")}]` : ""}`);
    }
    if (claimLines.length > 0) {
      lines.push(`\nActive claims (do not duplicate):`);
      lines.push(...claimLines);
    }
  }

  // Recovery (read-only, don't resolve distress here)
  if (distressRows.length > 0) {
    const d = distressRows[0];
    lines.push(`\n=== DISTRESS: ${d.agent} ran out of context at ${d.ts} ===`);
    lines.push(d.content ?? "");
    lines.push("Call eywa_start to claim recovery and continue their work.");
  } else if (checkpointRows.length > 0) {
    const cp = checkpointRows[0];
    lines.push(`\n=== CHECKPOINT from ${cp.agent} at ${cp.ts} ===`);
    lines.push(cp.content ?? "");
  }

  // Baton context
  if (baton && batonRows.length > 0) {
    lines.push(`\n=== Baton: ${baton} (${batonRows.length} items) ===`);
    for (const m of [...batonRows].reverse()) {
      const meta = (m.metadata ?? {}) as Record<string, string>;
      const prefix = meta.event ? `[${meta.event}]` : `[${m.message_type}]`;
      const opParts = [meta.system, meta.action, meta.outcome].filter(Boolean);
      const opTag = opParts.length > 0 ? ` [${opParts.join(":")}]` : "";
      lines.push(`${prefix}: ${(m.content ?? "").slice(0, 200)}${opTag}`);
    }
  } else if (baton) {
    lines.push(`\nBaton: no memories found for ${baton} in this room.`);
  }

  lines.push("\nCall eywa_start to begin logging. Use eywa_log with system/action/outcome fields.");
  return lines.join("\n");
}
