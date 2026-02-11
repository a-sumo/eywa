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
import { registerTelemetryTools, storeHostTelemetry } from "./tools/telemetry.js";
import { registerApprovalTools } from "./tools/approval.js";
import { rateLimit, checkMemoryCap } from "./lib/ratelimit.js";

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

    // Clone demo room endpoint
    if (url.pathname === "/clone-demo") {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      }
      if (request.method === "POST") {
        try {
          return await handleCloneDemo(request, env);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return Response.json({ error: message }, {
            status: 500,
            headers: { "Access-Control-Allow-Origin": "*" },
          });
        }
      }
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

  // Scheduled cleanup: delete demo COPIES older than 24 hours.
  // The source /demo room is NEVER touched.
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const db = new SupabaseClient(env.SUPABASE_URL, env.SUPABASE_KEY);
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Only target demo copies (slug starts with "demo-"), never the source "demo" room
    const oldRooms = await db.select<RoomRow>("rooms", {
      select: "id,slug",
      is_demo: "eq.true",
      created_at: `lt.${cutoff}`,
      slug: "like.demo-*",
      limit: "50",
    });

    for (const room of oldRooms) {
      await db.delete("memories", { room_id: `eq.${room.id}` });
      await db.delete("links", { room_id: `eq.${room.id}` });
      await db.delete("messages", { room_id: `eq.${room.id}` });
      await db.delete("rooms", { id: `eq.${room.id}` });
    }

    if (oldRooms.length > 0) {
      console.log(`Cleaned up ${oldRooms.length} expired demo copies`);
    }
  },
} satisfies ExportedHandler<Env>;

function buildDemoMemories(roomId: string): Array<Record<string, unknown>> {
  const now = Date.now();
  const sessionId = "demo-seed-" + now;
  const agents = [
    "alice/bright-oak", "bob/swift-wolf", "carol/calm-reed",
    "dave/keen-owl", "eve/rosy-dawn",
  ];
  const memories: Array<Record<string, unknown>> = [];

  // Agent session starts
  agents.forEach((agent, i) => {
    memories.push({
      room_id: roomId, session_id: sessionId, agent,
      message_type: "resource",
      content: "SESSION START: " + [
        "Implementing user authentication with OAuth2",
        "Refactoring database queries for performance",
        "Building React dashboard components",
        "Writing integration tests for API endpoints",
        "Setting up CI/CD pipeline with GitHub Actions",
      ][i],
      metadata: { event: "session_start", task: [
        "Implementing user authentication with OAuth2",
        "Refactoring database queries for performance",
        "Building React dashboard components",
        "Writing integration tests for API endpoints",
        "Setting up CI/CD pipeline with GitHub Actions",
      ][i] },
      ts: new Date(now - (30 - i * 2) * 60000).toISOString(),
    });
  });

  // Activity logs with operation metadata
  const activities = [
    { agent: agents[0], content: "Added JWT token validation middleware", system: "api", action: "create", scope: "auth middleware", outcome: "success" },
    { agent: agents[0], content: "Created login and register endpoints", system: "api", action: "create", scope: "auth routes", outcome: "success" },
    { agent: agents[1], content: "Indexed users table on email column", system: "database", action: "write", scope: "users table", outcome: "success" },
    { agent: agents[1], content: "Rewrote N+1 query in orders endpoint", system: "database", action: "write", scope: "orders query", outcome: "success" },
    { agent: agents[2], content: "Built AgentCard component with progress bars", system: "editor", action: "create", scope: "dashboard UI", outcome: "success" },
    { agent: agents[2], content: "Added realtime subscription for live updates", system: "browser", action: "create", scope: "realtime hook", outcome: "success" },
    { agent: agents[3], content: "Auth endpoint tests passing (12/12)", system: "terminal", action: "test", scope: "auth tests", outcome: "success" },
    { agent: agents[3], content: "Found race condition in session refresh", system: "terminal", action: "debug", scope: "session refresh", outcome: "blocked" },
    { agent: agents[4], content: "GitHub Actions workflow created", system: "ci", action: "create", scope: "CI pipeline", outcome: "success" },
    { agent: agents[4], content: "Deployed staging environment", system: "deploy", action: "deploy", scope: "staging", outcome: "success" },
    { agent: agents[0], content: "Pushed auth branch, ready for review", system: "git", action: "write", scope: "auth branch", outcome: "success" },
    { agent: agents[2], content: "Dashboard renders agent cards with live data", system: "browser", action: "test", scope: "dashboard", outcome: "success" },
  ];
  activities.forEach((a, i) => {
    memories.push({
      room_id: roomId, session_id: sessionId, agent: a.agent,
      message_type: "assistant", content: a.content,
      metadata: { system: a.system, action: a.action, scope: a.scope, outcome: a.outcome },
      ts: new Date(now - (25 - i * 2) * 60000).toISOString(),
    });
  });

  // Injections
  memories.push({
    room_id: roomId, session_id: sessionId, agent: agents[3],
    message_type: "injection",
    content: "[INJECT -> all] (race condition found): Found a race condition in session refresh. If you touch auth tokens, check the mutex in sessionStore.ts before modifying.",
    metadata: { event: "context_injection", target: "all", label: "race condition found", priority: "high" },
    ts: new Date(now - 8 * 60000).toISOString(),
  });
  memories.push({
    room_id: roomId, session_id: sessionId, agent: agents[4],
    message_type: "injection",
    content: "[INJECT -> all] (staging deployed): Staging is live at staging.example.com. All branches merged to main are auto-deployed.",
    metadata: { event: "context_injection", target: "all", label: "staging deployed", priority: "normal" },
    ts: new Date(now - 5 * 60000).toISOString(),
  });

  // Knowledge entries
  memories.push({
    room_id: roomId, session_id: sessionId, agent: agents[0],
    message_type: "knowledge",
    content: "Auth tokens use RS256 signing. Public key is at /api/.well-known/jwks.json. Tokens expire after 1 hour, refresh tokens after 7 days.",
    metadata: { event: "knowledge", title: "Auth token architecture", tags: ["auth", "api", "convention"] },
    ts: new Date(now - 15 * 60000).toISOString(),
  });
  memories.push({
    room_id: roomId, session_id: sessionId, agent: agents[1],
    message_type: "knowledge",
    content: "Database uses connection pooling (max 20). Never use raw SQL in route handlers. Always go through the query builder in lib/db.ts.",
    metadata: { event: "knowledge", title: "Database access patterns", tags: ["database", "convention", "gotcha"] },
    ts: new Date(now - 12 * 60000).toISOString(),
  });

  // Destination
  memories.push({
    room_id: roomId, session_id: sessionId, agent: "system",
    message_type: "knowledge",
    content: "Ship v1.0: authenticated dashboard with live agent monitoring, deployed to production.",
    metadata: {
      event: "destination",
      destination: "Ship v1.0: authenticated dashboard with live agent monitoring, deployed to production.",
      milestones: [
        "User authentication (OAuth2 + JWT)",
        "Database schema and query layer",
        "React dashboard with live updates",
        "Integration test suite",
        "CI/CD pipeline",
        "Production deployment",
      ],
      progress: {
        "User authentication (OAuth2 + JWT)": true,
        "Database schema and query layer": true,
        "React dashboard with live updates": true,
        "Integration test suite": false,
        "CI/CD pipeline": true,
        "Production deployment": false,
      },
    },
    ts: new Date(now - 20 * 60000).toISOString(),
  });

  // Progress reports
  agents.forEach((agent, i) => {
    memories.push({
      room_id: roomId, session_id: sessionId, agent,
      message_type: "resource",
      content: "PROGRESS [" + [85, 90, 75, 60, 95][i] + "% " + ["working", "working", "working", "blocked", "deploying"][i] + "]: " + [
        "User authentication", "Database optimization", "Dashboard components", "Integration tests", "CI/CD pipeline",
      ][i],
      metadata: {
        event: "progress",
        task: ["User authentication", "Database optimization", "Dashboard components", "Integration tests", "CI/CD pipeline"][i],
        percent: [85, 90, 75, 60, 95][i],
        status: ["working", "working", "working", "blocked", "deploying"][i],
      },
      ts: new Date(now - (4 - i) * 60000).toISOString(),
    });
  });

  // Pending approval requests (agents waiting for human sign-off)
  memories.push({
    room_id: roomId, session_id: sessionId, agent: agents[4],
    message_type: "approval_request",
    content: "APPROVAL REQUEST: Deploy to production (v1.0-rc1)",
    metadata: {
      event: "approval_request",
      status: "pending",
      action_description: "Deploy to production (v1.0-rc1). All CI checks pass, staging is green.",
      scope: "production environment, DNS, CDN cache invalidation",
      risk_level: "high",
      context: "This is the first production deployment. Staging has been stable for 2 hours.",
      requested_at: new Date(now - 2 * 60000).toISOString(),
    },
    ts: new Date(now - 2 * 60000).toISOString(),
  });

  memories.push({
    room_id: roomId, session_id: sessionId, agent: agents[1],
    message_type: "approval_request",
    content: "APPROVAL REQUEST: Drop and recreate orders index",
    metadata: {
      event: "approval_request",
      status: "pending",
      action_description: "Drop and recreate the composite index on orders(user_id, created_at). Requires brief lock on the orders table.",
      scope: "orders table, database",
      risk_level: "medium",
      context: "Current index is suboptimal. New index reduces query time from 450ms to 12ms. Brief table lock expected (< 5 seconds).",
      requested_at: new Date(now - 6 * 60000).toISOString(),
    },
    ts: new Date(now - 6 * 60000).toISOString(),
  });

  return memories;
}

async function handleCloneDemo(request: Request, env: Env): Promise<Response> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limit: 5 demo rooms per IP per hour
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
  const rl = rateLimit(`clone-demo:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) {
    return Response.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: { ...corsHeaders, "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const body = await request.json() as { slug?: string };
  const newSlug = body.slug;

  if (!newSlug) {
    return Response.json({ error: "slug is required" }, { status: 400, headers: corsHeaders });
  }

  const db = new SupabaseClient(env.SUPABASE_URL, env.SUPABASE_KEY);

  // Create new room
  const newRooms = await db.insert<RoomRow>("rooms", {
    slug: newSlug,
    name: "Demo Room",
    created_by: "demo",
    is_demo: true,
  });
  const newRoom = newRooms[0];

  // Seed with demo data (no dependency on a source room existing)
  const seeds = buildDemoMemories(newRoom.id);
  const batchSize = 50;
  for (let i = 0; i < seeds.length; i += batchSize) {
    await db.insertMany("memories", seeds.slice(i, i + batchSize));
  }

  return Response.json({
    id: newRoom.id,
    slug: newSlug,
    seeded: seeds.length,
  }, { headers: corsHeaders });
}

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
  // Rate limit MCP connections: 20 per minute per IP
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
  const rl = rateLimit(`mcp:${ip}`, 20, 60 * 1000);
  if (!rl.allowed) {
    return Response.json(
      { error: "Rate limit exceeded. Too many connections." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

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
    select: "id,name,slug,is_demo",
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
  const isDemo = room.is_demo === true;
  // Demo rooms: 500 memories on top of the ~272 base clone = 772 total cap
  const DEMO_MEMORY_CAP = 800;
  // Read-only tools that never insert memories (exempt from cap)
  const READ_ONLY_TOOLS = new Set([
    "eywa_context", "eywa_status", "eywa_recall", "eywa_pull", "eywa_sync",
    "eywa_search", "eywa_summary", "eywa_agents", "eywa_inbox",
    "eywa_knowledge", "eywa_history", "eywa_bookmarks", "eywa_timelines",
    "eywa_compare", "eywa_fetch", "eywa_get_file", "eywa_links",
    "eywa_query_network", "eywa_route", "eywa_recover",
  ]);
  const SKIP_INBOX = new Set(["eywa_inject", "eywa_inbox"]);
  const origTool = server.tool.bind(server) as Function;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).tool = function (...args: any[]) {
    const toolName = typeof args[0] === "string" ? args[0] : "";
    const handlerIdx = args.length - 1;
    const originalHandler = args[handlerIdx];

    if (typeof originalHandler === "function") {
      args[handlerIdx] = async function (...handlerArgs: any[]) {
        // Memory cap for demo rooms: block write tools when over limit
        if (isDemo && !READ_ONLY_TOOLS.has(toolName)) {
          try {
            const { allowed, current } = await checkMemoryCap(db, ctx.roomId, DEMO_MEMORY_CAP);
            if (!allowed) {
              return {
                content: [{ type: "text" as const, text: `Demo room memory limit reached (${current}/${DEMO_MEMORY_CAP}). Create your own room at eywa-ai.dev to continue.` }],
              };
            }
          } catch {
            // Don't block on cap check failure
          }
        }

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
  registerTelemetryTools(server, db, ctx);
  registerApprovalTools(server, db, ctx);

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
    heartbeatPhase: string | null; tokenPercent: number | null;
  }>();
  for (const row of agentRows) {
    if (row.agent === ctx.agent) continue;
    const meta = (row.metadata ?? {}) as Record<string, string>;
    if (agents.has(row.agent)) {
      const a = agents.get(row.agent)!;
      if (meta.system) a.systems.add(meta.system);
      if (meta.system || meta.action) {
        a.ops.push({ action: meta.action, outcome: meta.outcome });
      }
      // Capture heartbeat if we haven't yet (first = most recent due to desc order)
      if (!a.heartbeatPhase && meta.event === "heartbeat") {
        a.heartbeatPhase = meta.phase || null;
        a.tokenPercent = Number(meta.token_percent) || null;
      }
      a.firstTs = row.ts;
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
    const heartbeatPhase = event === "heartbeat" ? (meta.phase || null) : null;
    const tokenPercent = event === "heartbeat" ? (Number(meta.token_percent) || null) : null;
    agents.set(row.agent, { status, task, systems, ops, firstTs: row.ts, lastTs: row.ts, heartbeatPhase, tokenPercent });
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
      const silenceMin = Math.floor((Date.now() - new Date(info.lastTs).getTime()) / 60000);
      const silenceTag = info.status === "active" && silenceMin >= 10 ? ` SILENT:${silenceMin}m` : "";
      const hbTag = info.heartbeatPhase ? ` [${info.heartbeatPhase}${info.tokenPercent ? ` ${info.tokenPercent}%ctx` : ""}]` : "";
      lines.push(`  ${name} [${info.status}]${kappaStr}${silenceTag}${hbTag} ${info.task}${sysStr}`);
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
