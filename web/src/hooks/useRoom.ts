import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, type Room } from "../lib/supabase";

function generateSlug(): string {
  const adjectives = ["cosmic", "lunar", "solar", "stellar", "quantum", "neural", "cyber", "astral"];
  const nouns = ["fox", "owl", "wolf", "hawk", "bear", "lynx", "raven", "phoenix"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const code = Math.random().toString(36).substring(2, 6);
  return `${adj}-${noun}-${code}`;
}

function generateRoomName(slug: string): string {
  const words = slug.split("-").slice(0, 2);
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// Sample data that makes a demo room look alive immediately.
// Covers multiple agents, systems, outcomes, injections, knowledge, and a destination.
function buildSeedMemories(roomId: string): Array<Record<string, unknown>> {
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
      fold_id: roomId,
      session_id: sessionId,
      agent,
      message_type: "resource",
      content: "SESSION START: " + [
        "Implementing user authentication with OAuth2",
        "Refactoring database queries for performance",
        "Building React dashboard components",
        "Writing integration tests for API endpoints",
        "Setting up CI/CD pipeline with GitHub Actions",
      ][i],
      metadata: { event: "session_start" },
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
      fold_id: roomId,
      session_id: sessionId,
      agent: a.agent,
      message_type: "assistant",
      content: a.content,
      metadata: { system: a.system, action: a.action, scope: a.scope, outcome: a.outcome },
      ts: new Date(now - (25 - i * 2) * 60000).toISOString(),
    });
  });

  // Injections
  memories.push({
    fold_id: roomId,
    session_id: sessionId,
    agent: agents[3],
    message_type: "injection",
    content: "[INJECT -> all] (race condition found): Found a race condition in session refresh. If you touch auth tokens, check the mutex in sessionStore.ts before modifying.",
    metadata: { event: "injection", target: "all", label: "race condition found", priority: "high" },
    ts: new Date(now - 8 * 60000).toISOString(),
  });

  memories.push({
    fold_id: roomId,
    session_id: sessionId,
    agent: agents[4],
    message_type: "injection",
    content: "[INJECT -> all] (staging deployed): Staging is live at staging.example.com. All branches merged to main are auto-deployed.",
    metadata: { event: "injection", target: "all", label: "staging deployed", priority: "normal" },
    ts: new Date(now - 5 * 60000).toISOString(),
  });

  // Knowledge entries
  memories.push({
    fold_id: roomId,
    session_id: sessionId,
    agent: agents[0],
    message_type: "knowledge",
    content: "Auth tokens use RS256 signing. Public key is at /api/.well-known/jwks.json. Tokens expire after 1 hour, refresh tokens after 7 days.",
    metadata: { event: "knowledge", title: "Auth token architecture", tags: ["auth", "api", "convention"] },
    ts: new Date(now - 15 * 60000).toISOString(),
  });

  memories.push({
    fold_id: roomId,
    session_id: sessionId,
    agent: agents[1],
    message_type: "knowledge",
    content: "Database uses connection pooling (max 20). Never use raw SQL in route handlers. Always go through the query builder in lib/db.ts.",
    metadata: { event: "knowledge", title: "Database access patterns", tags: ["database", "convention", "gotcha"] },
    ts: new Date(now - 12 * 60000).toISOString(),
  });

  // Destination
  memories.push({
    fold_id: roomId,
    session_id: sessionId,
    agent: "system",
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
      fold_id: roomId,
      session_id: sessionId,
      agent,
      message_type: "resource",
      content: "PROGRESS [" + [85, 90, 75, 60, 95][i] + "% " + ["working", "working", "working", "blocked", "deploying"][i] + "]: " + [
        "User authentication",
        "Database optimization",
        "Dashboard components",
        "Integration tests",
        "CI/CD pipeline",
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

  return memories;
}

export function useRoom() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createRoom = useCallback(async (createdBy?: string): Promise<Room | null> => {
    setCreating(true);
    setError(null);

    const slug = generateSlug();
    const name = generateRoomName(slug);

    const { data, error: insertError } = await supabase
      .from("folds")
      .insert({
        slug,
        name,
        created_by: createdBy || null,
        is_demo: false,
      })
      .select()
      .single();

    setCreating(false);

    if (insertError || !data) {
      setError("Failed to create room");
      return null;
    }

    navigate(`/r/${slug}`);
    return data;
  }, [navigate]);

  const createDemoRoom = useCallback(async (): Promise<Room | null> => {
    setCreating(true);
    setError(null);

    const slug = "demo-" + Math.random().toString(36).substring(2, 6);

    try {
      const res = await fetch("https://mcp.eywa-ai.dev/clone-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, source_slug: "demo" }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
      }

      const result = await res.json() as { id: string; slug: string; cloned: number };

      // Fetch the full room record for the return value
      const { data } = await supabase
        .from("folds")
        .select("*")
        .eq("id", result.id)
        .single();

      setCreating(false);
      navigate(`/r/${slug}`);
      return data;
    } catch (err) {
      console.warn("Clone demo failed:", err);
      setCreating(false);
      setError("Failed to create demo room");
      return null;
    }
  }, [navigate]);

  const joinRoom = useCallback(async (slug: string): Promise<Room | null> => {
    const { data, error: fetchError } = await supabase
      .from("folds")
      .select("*")
      .eq("slug", slug)
      .single();

    if (fetchError || !data) {
      setError("Room not found");
      return null;
    }

    navigate(`/r/${slug}`);
    return data;
  }, [navigate]);

  const getShareUrl = useCallback((slug: string): string => {
    const base = window.location.origin;
    return `${base}/r/${slug}`;
  }, []);

  return {
    createRoom,
    createDemoRoom,
    joinRoom,
    getShareUrl,
    creating,
    error,
  };
}
