import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { SupabaseClient } from "./lib/supabase.js";
import { InboxTracker } from "./lib/inbox.js";
import { ContextPressureMonitor } from "./lib/pressure.js";
import type { Env, EywaContext, MemoryRow, GlobalInsightRow, FoldRow } from "./lib/types.js";
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
import { registerTaskTools } from "./tools/task.js";
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
        docs: "Connect via MCP at /mcp?fold=<slug>&agent=<name>",
      });
    }

    // Clone demo fold endpoint
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
  // The source /demo fold is NEVER touched.
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const db = new SupabaseClient(env.SUPABASE_URL, env.SUPABASE_KEY);
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Only target demo copies (slug starts with "demo-"), never the source "demo" fold
    const oldFolds = await db.select<FoldRow>("rooms", {
      select: "id,slug",
      is_demo: "eq.true",
      created_at: `lt.${cutoff}`,
      slug: "like.demo-*",
      limit: "50",
    });

    for (const fold of oldFolds) {
      await db.delete("memories", { room_id: `eq.${fold.id}` });
      await db.delete("links", { room_id: `eq.${fold.id}` });
      await db.delete("messages", { room_id: `eq.${fold.id}` });
      await db.delete("rooms", { id: `eq.${fold.id}` });
    }

    if (oldFolds.length > 0) {
      console.log(`Cleaned up ${oldFolds.length} expired demo copies`);
    }
  },
} satisfies ExportedHandler<Env>;

function buildDemoMemories(foldId: string): Array<Record<string, unknown>> {
  const now = Date.now();
  const min = 60000;
  const agents = [
    { name: "alice/bright-oak", session: `session_alice_${now}`, task: "Implementing user authentication with OAuth2" },
    { name: "bob/swift-wolf", session: `session_bob_${now}`, task: "Refactoring database queries for performance" },
    { name: "carol/calm-reed", session: `session_carol_${now}`, task: "Building React dashboard components" },
    { name: "dave/keen-owl", session: `session_dave_${now}`, task: "Writing integration tests for API endpoints" },
    { name: "eve/rosy-dawn", session: `session_eve_${now}`, task: "Setting up CI/CD pipeline with GitHub Actions" },
  ];
  const memories: Array<Record<string, unknown>> = [];
  const m = (data: Record<string, unknown>) => { memories.push({ room_id: foldId, ...data }); };

  // Destination (set 2 hours ago)
  m({
    session_id: agents[0].session, agent: "system",
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
        "CI/CD pipeline and deployment",
      ],
      progress: {
        "User authentication (OAuth2 + JWT)": true,
        "Database schema and query layer": true,
        "React dashboard with live updates": false,
        "Integration test suite": false,
        "CI/CD pipeline and deployment": false,
      },
    },
    ts: new Date(now - 120 * min).toISOString(),
  });

  // Agent session starts (staggered over last 90 minutes)
  agents.forEach((a, i) => {
    m({
      session_id: a.session, agent: a.name,
      message_type: "resource",
      content: "SESSION START: " + a.task,
      metadata: { event: "session_start", task: a.task },
      ts: new Date(now - (90 - i * 10) * min).toISOString(),
    });
  });

  // Work claims (each agent claims their scope)
  const claimData = [
    { scope: "Auth middleware and routes", files: ["src/auth/middleware.ts", "src/auth/routes.ts", "src/auth/jwt.ts"] },
    { scope: "Database query optimization", files: ["src/db/queries.ts", "src/db/indexes.sql", "src/models/orders.ts"] },
    { scope: "Dashboard UI components", files: ["src/components/AgentCard.tsx", "src/components/Dashboard.tsx", "src/hooks/useRealtime.ts"] },
    { scope: "API integration tests", files: ["tests/auth.test.ts", "tests/orders.test.ts", "tests/api.test.ts"] },
    { scope: "CI/CD pipeline and deploy", files: [".github/workflows/ci.yml", ".github/workflows/deploy.yml", "Dockerfile"] },
  ];
  agents.forEach((a, i) => {
    m({
      session_id: a.session, agent: a.name,
      message_type: "resource",
      content: `CLAIM: ${claimData[i].scope} [${claimData[i].files.join(", ")}]`,
      metadata: { event: "claim", scope: claimData[i].scope, files: claimData[i].files },
      ts: new Date(now - (88 - i * 10) * min).toISOString(),
    });
  });

  // Task entries (visible in task queue)
  const taskDescs = [
    "Implement OAuth2 login flow with JWT tokens, refresh token rotation, and session management. Add middleware for protected routes.",
    "Profile and optimize the slowest database queries. Add indexes, rewrite N+1 patterns, implement connection pooling.",
    "Build the main dashboard view with agent cards showing progress, status, and real-time updates via Supabase Realtime.",
    "Write comprehensive integration tests for all API endpoints. Target 90% coverage on auth and orders modules.",
    "Set up GitHub Actions CI pipeline with lint, type check, test, and deploy stages. Configure staging and production environments.",
  ];
  agents.forEach((a, i) => {
    m({
      session_id: a.session, agent: a.name,
      message_type: "resource",
      content: `TASK: ${a.task}`,
      metadata: {
        event: "task",
        title: a.task,
        description: taskDescs[i],
        status: i === 3 ? "blocked" : i === 0 || i === 1 ? "in_progress" : "claimed",
        priority: i === 0 ? "urgent" : "high",
        milestone: [
          "User authentication (OAuth2 + JWT)",
          "Database schema and query layer",
          "React dashboard with live updates",
          "Integration test suite",
          "CI/CD pipeline and deployment",
        ][i],
        assigned_to: a.name,
      },
      ts: new Date(now - (85 - i * 10) * min).toISOString(),
    });
  });

  // Detailed activity logs spread over the session
  const activities = [
    // Alice - auth work (last 80 min)
    { agent: 0, content: "Read existing auth module. Found no token validation. Starting from scratch.", system: "filesystem", action: "read", scope: "src/auth/", outcome: "success", ago: 80 },
    { agent: 0, content: "Created JWT token validation middleware with RS256 signing", system: "filesystem", action: "create", scope: "src/auth/middleware.ts", outcome: "success", ago: 65 },
    { agent: 0, content: "Created login and register endpoints with rate limiting", system: "filesystem", action: "create", scope: "src/auth/routes.ts", outcome: "success", ago: 50 },
    { agent: 0, content: "Added refresh token rotation. Old tokens invalidated on use.", system: "filesystem", action: "write", scope: "src/auth/jwt.ts", outcome: "success", ago: 35 },
    { agent: 0, content: "Type check passed (0 errors)", system: "ci", action: "test", scope: "auth module", outcome: "success", ago: 30 },
    { agent: 0, content: "Committed abc1234: Add JWT auth with refresh token rotation. Pushed to main.", system: "git", action: "write", scope: "main branch", outcome: "success", ago: 28 },

    // Bob - database work (last 70 min)
    { agent: 1, content: "Profiled top 10 slowest queries. orders endpoint is 450ms avg.", system: "database", action: "read", scope: "query profiler", outcome: "success", ago: 68 },
    { agent: 1, content: "Added composite index on orders(user_id, created_at)", system: "database", action: "write", scope: "orders table", outcome: "success", ago: 55 },
    { agent: 1, content: "Rewrote N+1 query in orders endpoint. Now uses single JOIN.", system: "database", action: "write", scope: "src/db/queries.ts", outcome: "success", ago: 40 },
    { agent: 1, content: "Query time dropped from 450ms to 12ms after index + rewrite", system: "database", action: "test", scope: "orders endpoint", outcome: "success", ago: 35 },
    { agent: 1, content: "Committed def5678: Optimize orders query with index and JOIN rewrite. Pushed to main.", system: "git", action: "write", scope: "main branch", outcome: "success", ago: 33 },

    // Carol - dashboard work (last 60 min)
    { agent: 2, content: "Read existing component structure. No dashboard view exists yet.", system: "filesystem", action: "read", scope: "src/components/", outcome: "success", ago: 58 },
    { agent: 2, content: "Built AgentCard component with progress bars and status pills", system: "filesystem", action: "create", scope: "src/components/AgentCard.tsx", outcome: "success", ago: 42 },
    { agent: 2, content: "Added Supabase Realtime subscription for live agent updates", system: "filesystem", action: "create", scope: "src/hooks/useRealtime.ts", outcome: "success", ago: 30 },
    { agent: 2, content: "Dashboard renders agent cards with live data. Verified in browser.", system: "browser", action: "test", scope: "dashboard UI", outcome: "success", ago: 20 },

    // Dave - test work (last 50 min)
    { agent: 3, content: "Auth endpoint tests passing (12/12)", system: "ci", action: "test", scope: "tests/auth.test.ts", outcome: "success", ago: 45 },
    { agent: 3, content: "Orders endpoint tests passing (8/8)", system: "ci", action: "test", scope: "tests/orders.test.ts", outcome: "success", ago: 35 },
    { agent: 3, content: "Found race condition in session refresh: two concurrent requests can both read the same refresh token before either invalidates it", system: "ci", action: "debug", scope: "session refresh", outcome: "blocked", ago: 22 },

    // Eve - CI/CD work (last 40 min)
    { agent: 4, content: "Created GitHub Actions workflow with lint, type check, test stages", system: "ci", action: "create", scope: ".github/workflows/ci.yml", outcome: "success", ago: 38 },
    { agent: 4, content: "Added Docker build stage and staging deploy", system: "ci", action: "create", scope: ".github/workflows/deploy.yml", outcome: "success", ago: 25 },
    { agent: 4, content: "Deployed to staging environment. All checks green.", system: "deploy", action: "deploy", scope: "staging", outcome: "success", ago: 15 },
    { agent: 4, content: "Committed ghi9012: Add CI/CD pipeline with staging deploy. Pushed to main.", system: "git", action: "write", scope: "main branch", outcome: "success", ago: 13 },
  ];
  activities.forEach((a) => {
    m({
      session_id: agents[a.agent].session, agent: agents[a.agent].name,
      message_type: "assistant", content: a.content,
      metadata: { system: a.system, action: a.action, scope: a.scope, outcome: a.outcome },
      ts: new Date(now - a.ago * min).toISOString(),
    });
  });

  // Injections (cross-agent communication)
  m({
    session_id: agents[3].session, agent: agents[3].name,
    message_type: "injection",
    content: "[INJECT -> all] (race condition found): Found a race condition in session refresh. If you touch auth tokens, check the mutex in sessionStore.ts before modifying. Two concurrent requests can both read the same refresh token before either invalidates it.",
    metadata: { event: "context_injection", target: "all", label: "race condition found", priority: "high" },
    ts: new Date(now - 20 * min).toISOString(),
  });
  m({
    session_id: agents[0].session, agent: agents[0].name,
    message_type: "injection",
    content: "[INJECT -> dave/keen-owl]: I added a mutex wrapper in sessionStore.ts. Try using acquireTokenLock() before reading the refresh token. Should fix the race condition.",
    metadata: { event: "context_injection", target: agents[3].name, label: "mutex fix for race condition", priority: "high" },
    ts: new Date(now - 18 * min).toISOString(),
  });
  m({
    session_id: agents[4].session, agent: agents[4].name,
    message_type: "injection",
    content: "[INJECT -> all] (staging deployed): Staging is live at staging.example.com. All branches merged to main are auto-deployed. CI pipeline runs lint + type check + tests before deploy.",
    metadata: { event: "context_injection", target: "all", label: "staging deployed", priority: "normal" },
    ts: new Date(now - 12 * min).toISOString(),
  });

  // Knowledge entries
  m({
    session_id: agents[0].session, agent: agents[0].name,
    message_type: "knowledge",
    content: "Auth tokens use RS256 signing. Public key is at /api/.well-known/jwks.json. Tokens expire after 1 hour, refresh tokens after 7 days. Always use acquireTokenLock() before modifying refresh tokens to prevent race conditions.",
    metadata: { event: "knowledge", title: "Auth token architecture", tags: ["auth", "api", "convention"] },
    ts: new Date(now - 25 * min).toISOString(),
  });
  m({
    session_id: agents[1].session, agent: agents[1].name,
    message_type: "knowledge",
    content: "Database uses connection pooling (max 20). Never use raw SQL in route handlers. Always go through the query builder in lib/db.ts. The orders table has a composite index on (user_id, created_at) for fast lookups.",
    metadata: { event: "knowledge", title: "Database access patterns", tags: ["database", "convention", "gotcha"] },
    ts: new Date(now - 32 * min).toISOString(),
  });
  m({
    session_id: agents[2].session, agent: agents[2].name,
    message_type: "knowledge",
    content: "Dashboard components use Supabase Realtime for live updates. Subscribe to the memories table filtered by room_id. The useRealtime hook handles reconnection and cleanup automatically.",
    metadata: { event: "knowledge", title: "Realtime subscription pattern", tags: ["frontend", "convention", "realtime"] },
    ts: new Date(now - 18 * min).toISOString(),
  });

  // Updated destination with more progress (milestones completing)
  m({
    session_id: agents[0].session, agent: "system",
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
        "CI/CD pipeline and deployment",
      ],
      progress: {
        "User authentication (OAuth2 + JWT)": true,
        "Database schema and query layer": true,
        "React dashboard with live updates": true,
        "Integration test suite": false,
        "CI/CD pipeline and deployment": false,
      },
      notes: "3/5 milestones complete. Auth and DB shipped. Dashboard rendering with live data. Tests blocked on race condition. CI pipeline ready, waiting for test suite before production deploy.",
    },
    ts: new Date(now - 5 * min).toISOString(),
  });

  // Progress reports (recent, one per agent)
  const progressData = [
    { percent: 92, status: "working", detail: "Auth shipped. Adding password reset flow." },
    { percent: 88, status: "working", detail: "Indexes applied. Profiling remaining queries." },
    { percent: 75, status: "working", detail: "Agent cards done. Building destination banner." },
    { percent: 55, status: "blocked", detail: "Blocked on race condition in session refresh." },
    { percent: 95, status: "deploying", detail: "CI green. Waiting for approval to deploy prod." },
  ];
  agents.forEach((a, i) => {
    m({
      session_id: a.session, agent: a.name,
      message_type: "resource",
      content: `PROGRESS [${progressData[i].percent}% ${progressData[i].status}]: ${a.task}`,
      metadata: {
        event: "progress",
        task: a.task,
        percent: progressData[i].percent,
        status: progressData[i].status,
        detail: progressData[i].detail,
      },
      ts: new Date(now - (5 - i) * min).toISOString(),
    });
  });

  // Telemetry (heartbeats showing agent phases and context usage)
  agents.forEach((a, i) => {
    m({
      session_id: a.session, agent: a.name,
      message_type: "telemetry",
      content: `HEARTBEAT: ${["working", "working", "working", "blocked", "deploying"][i]}`,
      metadata: {
        event: "heartbeat",
        phase: ["working", "working", "working", "blocked", "deploying"][i],
        tokens_used: [45000, 38000, 52000, 28000, 41000][i],
        tokens_limit: 200000,
        detail: progressData[i].detail,
        subagents: [0, 1, 0, 0, 2][i],
      },
      ts: new Date(now - (3 - i * 0.5) * min).toISOString(),
    });
  });

  // Pending approval requests
  m({
    session_id: agents[4].session, agent: agents[4].name,
    message_type: "approval_request",
    content: "APPROVAL REQUEST: Deploy to production (v1.0-rc1)",
    metadata: {
      event: "approval_request",
      status: "pending",
      action_description: "Deploy to production (v1.0-rc1). All CI checks pass, staging is green.",
      scope: "production environment, DNS, CDN cache invalidation",
      risk_level: "high",
      context: "This is the first production deployment. Staging has been stable for 2 hours. Waiting for test suite to clear the race condition before deploying.",
      requested_at: new Date(now - 8 * min).toISOString(),
    },
    ts: new Date(now - 8 * min).toISOString(),
  });
  m({
    session_id: agents[1].session, agent: agents[1].name,
    message_type: "approval_request",
    content: "APPROVAL REQUEST: Drop and recreate orders index",
    metadata: {
      event: "approval_request",
      status: "pending",
      action_description: "Drop and recreate the composite index on orders(user_id, created_at). Requires brief lock on the orders table.",
      scope: "orders table, database",
      risk_level: "medium",
      context: "Current index is suboptimal for the new query pattern. New index reduces query time from 450ms to 12ms. Brief table lock expected (< 5 seconds).",
      requested_at: new Date(now - 10 * min).toISOString(),
    },
    ts: new Date(now - 10 * min).toISOString(),
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

  // Rate limit: 5 demo folds per IP per hour
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

  // Create new fold
  const newFolds = await db.insert<FoldRow>("rooms", {
    slug: newSlug,
    name: "Demo Fold",
    created_by: "demo",
    is_demo: true,
    secret: "public",
  });
  const newFold = newFolds[0];

  // Seed with demo data (no dependency on a source fold existing)
  const seeds = buildDemoMemories(newFold.id);
  const batchSize = 50;
  for (let i = 0; i < seeds.length; i += batchSize) {
    await db.insertMany("memories", seeds.slice(i, i + batchSize));
  }

  return Response.json({
    id: newFold.id,
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

  const foldSlug = url.searchParams.get("fold");
  const baseAgent = url.searchParams.get("agent");
  const baton = url.searchParams.get("baton"); // optional: agent name to load context from
  const secret = url.searchParams.get("secret") || request.headers.get("x-eywa-secret") || "";

  if (!foldSlug || !baseAgent) {
    return Response.json(
      { error: "Missing required query params: ?fold=<slug>&agent=<name>" },
      { status: 400 },
    );
  }

  // Validate fold slug: alphanumeric, hyphens, underscores, 1-64 chars
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(foldSlug)) {
    return Response.json(
      { error: "Invalid fold slug. Use only letters, numbers, hyphens, underscores (max 64 chars)." },
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

  // Resolve fold slug → fold row
  const folds = await db.select<FoldRow>("rooms", {
    select: "id,name,slug,is_demo,secret",
    slug: `eq.${foldSlug}`,
    limit: "1",
  });

  if (!folds.length) {
    return Response.json(
      { error: `Fold not found: ${foldSlug}. Create one at eywa-ai.dev first.` },
      { status: 404 },
    );
  }

  const fold = folds[0];

  // Secret validation: non-public folds require a matching secret
  if (fold.secret !== "public" && fold.secret !== secret) {
    return Response.json(
      { error: "Invalid or missing secret for this fold." },
      { status: 403 },
    );
  }

  const sessionId = `session_${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15)}_${crypto.randomUUID()}`;

  const ctx: EywaContext = {
    foldId: fold.id,
    foldSlug: fold.slug,
    foldName: fold.name,
    agent,
    user: baseAgent,
    sessionId,
  };

  // Connection is tracked implicitly via eywa_start (session_start event).
  // No need to log "connected to fold" - it's noise that drowns out real work.

  // Build instructions string with fold context + baton (delivered at MCP init, no tool call needed)
  let instructions: string;
  try {
    instructions = await buildInstructions(db, ctx, baton);
  } catch (err) {
    console.error("buildInstructions failed:", err instanceof Error ? err.message : String(err));
    instructions = `You are ${ctx.agent} in fold /${ctx.foldSlug} (${ctx.foldName}).\nUser: ${ctx.user} | Session: ${ctx.sessionId}\n\nCall eywa_start to get fold context.`;
  }

  // Create MCP server and register all tools
  const server = new McpServer({ name: "eywa", version: "1.0.0" }, { instructions });

  // Wrap server.tool to piggyback pending injections and context pressure
  // warnings on every tool response. Agents see both without explicit polling.
  const inbox = new InboxTracker();
  const pressure = new ContextPressureMonitor();
  const isDemo = fold.is_demo === true;
  // Demo folds: 500 memories on top of the ~272 base clone = 772 total cap
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
        // Memory cap for demo folds: block write tools when over limit
        if (isDemo && !READ_ONLY_TOOLS.has(toolName)) {
          try {
            const { allowed, current } = await checkMemoryCap(db, ctx.foldId, DEMO_MEMORY_CAP);
            if (!allowed) {
              return {
                content: [{ type: "text" as const, text: `Demo fold memory limit reached (${current}/${DEMO_MEMORY_CAP}). Create your own fold at eywa-ai.dev to continue.` }],
              };
            }
          } catch (err) {
            console.error("Memory cap check failed:", err instanceof Error ? err.message : String(err));
          }
        }

        const result = await originalHandler(...handlerArgs);

        // Context pressure warning (tool-call counter as proxy for token usage)
        try {
          const warning = pressure.tick(toolName);
          if (warning && result.content && Array.isArray(result.content)) {
            result.content.push({ type: "text" as const, text: warning });
          }
        } catch (err) {
          console.error("Pressure check failed:", err instanceof Error ? err.message : String(err));
        }

        // Injection piggyback
        if (!SKIP_INBOX.has(toolName)) {
          try {
            const pending = await inbox.check(db, ctx);
            if (pending && result.content && Array.isArray(result.content)) {
              result.content.push({ type: "text" as const, text: pending });
            }
          } catch (err) {
            console.error("Inbox check failed:", err instanceof Error ? err.message : String(err));
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
  registerTaskTools(server, db, ctx);

  // Delegate to the MCP handler (handles Streamable HTTP + SSE)
  const handler = createMcpHandler(server);
  return handler(request, env, execCtx);
}

/** Build MCP instructions string with fold context + baton. Delivered at connection time, no tool call needed. */
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
      room_id: `eq.${ctx.foldId}`,
      "metadata->>event": "neq.agent_connected",
      order: "ts.desc",
      limit: "200",
    }),
    // Recent activity (skip connection spam)
    db.select<MemoryRow>("memories", {
      select: "agent,message_type,content,metadata,ts",
      room_id: `eq.${ctx.foldId}`,
      "metadata->>event": "neq.agent_connected",
      order: "ts.desc",
      limit: "8",
    }),
    // Pending injections
    db.select<MemoryRow>("memories", {
      select: "id",
      room_id: `eq.${ctx.foldId}`,
      message_type: "eq.injection",
      "metadata->>target_agent": `in.(${ctx.agent},${ctx.user},all)`,
      limit: "50",
    }),
    // Knowledge entries with full content (for proactive surfacing)
    db.select<MemoryRow>("memories", {
      select: "id,agent,content,metadata,ts",
      room_id: `eq.${ctx.foldId}`,
      message_type: "eq.knowledge",
      order: "ts.desc",
      limit: "50",
    }),
    // Distress signals (unresolved, same user)
    db.select<MemoryRow>("memories", {
      select: "id,agent,content,metadata,ts",
      room_id: `eq.${ctx.foldId}`,
      "metadata->>event": "eq.distress",
      "metadata->>resolved": "eq.false",
      "metadata->>user": `eq.${ctx.user}`,
      order: "ts.desc",
      limit: "1",
    }),
    // Recent checkpoints (same user, last 2h)
    db.select<MemoryRow>("memories", {
      select: "id,agent,content,metadata,ts",
      room_id: `eq.${ctx.foldId}`,
      "metadata->>event": "eq.checkpoint",
      "metadata->>user": `eq.${ctx.user}`,
      ts: `gte.${twoHoursAgo}`,
      order: "ts.desc",
      limit: "1",
    }),
    // Current destination
    db.select<MemoryRow>("memories", {
      select: "content,metadata,ts",
      room_id: `eq.${ctx.foldId}`,
      message_type: "eq.knowledge",
      "metadata->>event": "eq.destination",
      order: "ts.desc",
      limit: "1",
    }),
  ];

  // Active claims (uses staleness check, runs in parallel with other queries)
  const activeClaimsPromise = getActiveClaims(db, ctx.foldId, ctx.agent);

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
        room_id: `eq.${ctx.foldId}`,
        agent: `eq.${baton}`,
        order: "ts.desc",
        limit: "20",
      }),
    );
  }

  const [results, insightRows, activeClaims] = await Promise.all([Promise.all(queries), insightsPromise, activeClaimsPromise]);
  const [agentRows, recentRows, injectionRows, knowledgeRows, distressRows, checkpointRows, destRows] = results;
  const batonRows = baton ? results[7] : [];

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
    `You are ${ctx.agent} in fold /${ctx.foldSlug} (${ctx.foldName}).`,
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
    } catch (err) {
      console.error("Relevance matching failed in buildInstructions:", err instanceof Error ? err.message : String(err));
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
            lines.push(`\nNetwork routes (from ${insightRows.length} cross-fold insights):`);
            lines.push("Use eywa_route for detailed recommendations.");
            for (const { ins, score } of scored) {
              const pct = Math.round(score * 100);
              const tags = ins.domain_tags.length ? ` {${ins.domain_tags.join(", ")}}` : "";
              lines.push(`  [${pct}%] ${ins.insight.slice(0, 150)}${tags}`);
            }
          }
        }
      }
    } catch (err) {
      console.error("Route computation failed in buildInstructions:", err instanceof Error ? err.message : String(err));
    }
  }

  // Active claims (work dedup, already filtered for staleness and session end)
  if (activeClaims.length > 0) {
    const claimLines: string[] = [];
    for (const claim of activeClaims) {
      const short = claim.agent.includes("/") ? claim.agent.split("/").pop()! : claim.agent;
      claimLines.push(`  ${short}: ${claim.scope}${claim.files.length > 0 ? ` [${claim.files.join(", ")}]` : ""}`);
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
    lines.push(`\nBaton: no memories found for ${baton} in this fold.`);
  }

  lines.push("\nCall eywa_start to begin logging. Use eywa_log with system/action/outcome fields.");
  return lines.join("\n");
}
