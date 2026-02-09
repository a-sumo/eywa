import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { SupabaseClient } from "./lib/supabase.js";
import { InboxTracker } from "./lib/inbox.js";
import type { Env, EywaContext, MemoryRow, RoomRow } from "./lib/types.js";
import { registerSessionTools } from "./tools/session.js";
import { registerMemoryTools } from "./tools/memory.js";
import { registerContextTools } from "./tools/context.js";
import { registerCollaborationTools } from "./tools/collaboration.js";
import { registerInjectTools } from "./tools/inject.js";
import { registerKnowledgeTools } from "./tools/knowledge.js";
import { registerLinkTools } from "./tools/link.js";
import { registerTimelineTools } from "./tools/timeline.js";
import { registerNetworkTools } from "./tools/network.js";
import { registerRecoveryTools } from "./tools/recovery.js";

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

  // Log agent connection — deduplicate within 5 minutes
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const recentConnections = await db.select("memories", {
    select: "id",
    room_id: `eq.${ctx.roomId}`,
    agent: `eq.${ctx.agent}`,
    "metadata->>event": "eq.agent_connected",
    ts: `gte.${fiveMinAgo}`,
    limit: "1",
  });

  if (recentConnections.length === 0) {
    await db.insert("memories", {
      room_id: ctx.roomId,
      agent: ctx.agent,
      session_id: ctx.sessionId,
      message_type: "resource",
      content: `Agent ${ctx.agent} connected to room ${ctx.roomName}`,
      token_count: 0,
      metadata: { event: "agent_connected", room_slug: ctx.roomSlug, user: ctx.user, ...(baton ? { baton_from: baton } : {}) },
    });
  }

  // Build instructions string with room context + baton (delivered at MCP init, no tool call needed)
  let instructions: string;
  try {
    instructions = await buildInstructions(db, ctx, baton);
  } catch {
    instructions = `You are ${ctx.agent} in room /${ctx.roomSlug} (${ctx.roomName}).\nUser: ${ctx.user} | Session: ${ctx.sessionId}\n\nCall eywa_start to get room context.`;
  }

  // Create MCP server and register all tools
  const server = new McpServer({ name: "eywa", version: "1.0.0" }, { instructions });

  // Wrap server.tool to piggyback pending injections on every tool response.
  // This ensures agents see injections without explicitly calling eywa_inbox.
  const inbox = new InboxTracker();
  const SKIP_INBOX = new Set(["eywa_inject", "eywa_inbox"]);
  const origTool = server.tool.bind(server) as Function;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).tool = function (...args: any[]) {
    const toolName = typeof args[0] === "string" ? args[0] : "";
    const handlerIdx = args.length - 1;
    const originalHandler = args[handlerIdx];

    if (typeof originalHandler === "function" && !SKIP_INBOX.has(toolName)) {
      args[handlerIdx] = async function (...handlerArgs: any[]) {
        const result = await originalHandler(...handlerArgs);
        try {
          const pending = await inbox.check(db, ctx);
          if (pending && result.content && Array.isArray(result.content)) {
            result.content.push({ type: "text" as const, text: pending });
          }
        } catch {
          // Never break tool responses due to inbox check failure
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
    // Pending injections
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
  ];

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

  const results = await Promise.all(queries);
  const [agentRows, recentRows, injectionRows, knowledgeRows, distressRows, checkpointRows] = results;
  const batonRows = baton ? results[6] : [];

  // Build agent status map
  const agents = new Map<string, { status: string; task: string; systems: Set<string> }>();
  for (const row of agentRows) {
    if (row.agent === ctx.agent) continue;
    if (agents.has(row.agent)) {
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
    agents.set(row.agent, { status, task, systems });
  }

  // Compose instructions
  const lines: string[] = [
    `You are ${ctx.agent} in room /${ctx.roomSlug} (${ctx.roomName}).`,
    `User: ${ctx.user} | Session: ${ctx.sessionId}`,
  ];

  // Agents
  if (agents.size > 0) {
    lines.push(`\nAgents (${agents.size}):`);
    for (const [name, info] of agents) {
      const sysStr = info.systems.size > 0 ? ` {${Array.from(info.systems).join(", ")}}` : "";
      lines.push(`  ${name} [${info.status}] ${info.task}${sysStr}`);
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
