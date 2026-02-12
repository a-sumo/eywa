/**
 * geminiTools.ts - Tool definitions and handlers for Gemini steering agent.
 *
 * Each tool queries Supabase directly from the browser using the same
 * client as the rest of the dashboard. Results are returned as plain
 * strings that get fed back into the Gemini conversation.
 */

import { supabase, type Memory } from "./supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Gemini function-calling tool declaration (REST API format). */
export interface GeminiToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

/** A function call returned by Gemini. */
export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

/** The result we send back to Gemini after executing a tool. */
export interface GeminiFunctionResponse {
  name: string;
  response: { result: string };
}

// ---------------------------------------------------------------------------
// Tool declarations (sent to Gemini in the request)
// ---------------------------------------------------------------------------

export const TOOL_DECLARATIONS: GeminiToolDeclaration[] = [
  {
    name: "get_agent_status",
    description:
      "Get current status of all agents in the room. Returns each agent's name, whether they are active (activity in last 5 minutes), their latest task/content, session count, and last seen time. Use this to answer questions about what agents are doing.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_thread",
    description:
      "Get the full operation history for a specific agent or session. Returns recent memories in chronological order with timestamps, message types, and content.",
    parameters: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          description:
            "Agent name to query (e.g. 'armand/quiet-oak'). Can be a partial match.",
        },
        limit: {
          type: "number",
          description: "Max number of entries to return. Defaults to 30.",
        },
      },
      required: ["agent"],
    },
  },
  {
    name: "get_knowledge",
    description:
      "Query the project knowledge base. Returns knowledge entries stored by agents, optionally filtered by search text or tag.",
    parameters: {
      type: "object",
      properties: {
        search: {
          type: "string",
          description: "Text to search for in knowledge content.",
        },
        tag: {
          type: "string",
          description: "Filter by tag (e.g. 'architecture', 'convention', 'gotcha').",
        },
      },
    },
  },
  {
    name: "detect_patterns",
    description:
      "Analyze recent agent activity to find patterns. Detects: REDUNDANCY (multiple agents doing similar work), DIVERGENCE (agents working on conflicting things), IDLENESS (agents with no recent activity that could be productive), DISTRESS (agents that ran out of context and need rescue). Returns a structured analysis.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_distress_signals",
    description:
      "Check for agents in distress. Returns unresolved distress signals (agents that ran out of context) and recent checkpoints (agents that saved their state). Use this when asked about stuck agents, recovery, or handoff situations.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_destination",
    description:
      "Get the room's current destination (point B) and progress toward it. Returns the target state, milestones, completion percentage, and notes. Use this to answer questions about where the team is headed and how far along they are.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "query_network",
    description:
      "Search the global knowledge network for insights shared by agents across all workspaces. Use this to find patterns, gotchas, conventions, or discoveries that could help the current room. Returns anonymized insights with domain tags.",
    parameters: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Filter by domain tag (e.g. 'typescript', 'react', 'testing', 'deployment').",
        },
        search: {
          type: "string",
          description: "Search within insight text.",
        },
      },
    },
  },
];

/** Wrapped for the Gemini REST API tools array. */
export function getToolsPayload() {
  return [
    {
      functionDeclarations: TOOL_DECLARATIONS,
    },
  ];
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

/**
 * Execute a tool call and return the result string.
 */
export async function executeTool(
  roomId: string,
  call: GeminiFunctionCall
): Promise<GeminiFunctionResponse> {
  let result: string;
  try {
    switch (call.name) {
      case "get_agent_status":
        result = await handleGetAgentStatus(roomId);
        break;
      case "get_thread":
        result = await handleGetThread(
          roomId,
          call.args.agent as string,
          (call.args.limit as number) || 30
        );
        break;
      case "get_knowledge":
        result = await handleGetKnowledge(
          roomId,
          call.args.search as string | undefined,
          call.args.tag as string | undefined
        );
        break;
      case "detect_patterns":
        result = await handleDetectPatterns(roomId);
        break;
      case "get_distress_signals":
        result = await handleGetDistressSignals(roomId);
        break;
      case "get_destination":
        result = await handleGetDestination(roomId);
        break;
      case "query_network":
        result = await handleQueryNetwork(
          call.args.domain as string | undefined,
          call.args.search as string | undefined,
        );
        break;
      default:
        result = `Unknown tool: ${call.name}`;
    }
  } catch (err) {
    result = `Error executing ${call.name}: ${err instanceof Error ? err.message : String(err)}`;
  }

  return {
    name: call.name,
    response: { result },
  };
}

// ---------------------------------------------------------------------------
// get_agent_status
// ---------------------------------------------------------------------------

async function handleGetAgentStatus(roomId: string): Promise<string> {
  const { data, error } = await supabase
    .from("memories")
    .select("agent, ts, session_id, message_type, content, metadata")
    .eq("fold_id", roomId)
    .order("ts", { ascending: false })
    .limit(500);

  if (error) return `Database error: ${error.message}`;
  if (!data || data.length === 0) return "No agent activity found in this room.";

  // Group by agent
  const byAgent = new Map<
    string,
    {
      lastTs: string;
      sessions: Set<string>;
      entries: Array<{ ts: string; type: string; content: string; metadata: Record<string, unknown> }>;
    }
  >();

  for (const row of data) {
    const existing = byAgent.get(row.agent);
    if (!existing) {
      byAgent.set(row.agent, {
        lastTs: row.ts,
        sessions: new Set([row.session_id]),
        entries: [{ ts: row.ts, type: row.message_type, content: row.content, metadata: row.metadata }],
      });
    } else {
      existing.sessions.add(row.session_id);
      if (existing.entries.length < 5) {
        existing.entries.push({
          ts: row.ts,
          type: row.message_type,
          content: row.content,
          metadata: row.metadata,
        });
      }
    }
  }

  const now = Date.now();
  const lines: string[] = [];

  // Sort: active agents first, then by recency
  const sorted = Array.from(byAgent.entries()).sort((a, b) => {
    const aActive = now - new Date(a[1].lastTs).getTime() < 5 * 60 * 1000;
    const bActive = now - new Date(b[1].lastTs).getTime() < 5 * 60 * 1000;
    if (aActive !== bActive) return aActive ? -1 : 1;
    return new Date(b[1].lastTs).getTime() - new Date(a[1].lastTs).getTime();
  });

  for (const [agent, info] of sorted) {
    const isActive = now - new Date(info.lastTs).getTime() < 5 * 60 * 1000;
    const status = isActive ? "ACTIVE" : "idle";
    const ago = formatTimeAgo(info.lastTs);

    // Extract task description from the first resource/assistant entry
    const taskEntry = info.entries.find(
      (e) =>
        e.type === "resource" &&
        e.content?.startsWith("SESSION START:")
    );
    // Skip agents that only have connection events
    const nonNoiseEntries = info.entries.filter(
      (e) => e.metadata?.event !== "agent_connected"
    );
    if (nonNoiseEntries.length === 0) continue;

    const task = taskEntry
      ? taskEntry.content.replace("SESSION START: ", "").slice(0, 120)
      : nonNoiseEntries[0]?.content?.slice(0, 120) || "no content";

    // Flag distress
    const hasDistress = info.entries.some((e) => e.metadata?.event === "distress" && e.metadata?.resolved !== true);
    const distressTag = hasDistress ? " [DISTRESS]" : "";

    lines.push(`[${status}]${distressTag} ${agent} (${info.sessions.size} sessions, last seen ${ago})`);
    lines.push(`  Task: ${task}`);
  }

  return `${sorted.length} agents in room:\n\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// get_thread
// ---------------------------------------------------------------------------

async function handleGetThread(
  roomId: string,
  agent: string,
  limit: number
): Promise<string> {
  // Support partial agent name matching via ilike
  const { data, error } = await supabase
    .from("memories")
    .select("agent, ts, session_id, message_type, content, metadata")
    .eq("fold_id", roomId)
    .ilike("agent", `%${agent}%`)
    .order("ts", { ascending: true })
    .limit(limit);

  if (error) return `Database error: ${error.message}`;
  if (!data || data.length === 0)
    return `No memories found for agent matching "${agent}".`;

  const lines: string[] = [`Thread for "${agent}" (${data.length} entries):\n`];

  for (const row of data) {
    const time = new Date(row.ts).toLocaleTimeString();
    const content = row.content?.slice(0, 300) || "";
    lines.push(`[${time}] ${row.agent} (${row.message_type}): ${content}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// get_knowledge
// ---------------------------------------------------------------------------

async function handleGetKnowledge(
  roomId: string,
  search?: string,
  tag?: string
): Promise<string> {
  let query = supabase
    .from("memories")
    .select("agent, ts, content, metadata")
    .eq("fold_id", roomId)
    .eq("message_type", "knowledge")
    .order("ts", { ascending: false })
    .limit(30);

  if (search) {
    query = query.ilike("content", `%${search}%`);
  }
  if (tag) {
    // Tags are stored in metadata.tags as an array
    query = query.contains("metadata", { tags: [tag] });
  }

  const { data, error } = await query;

  if (error) return `Database error: ${error.message}`;
  if (!data || data.length === 0) {
    const filters = [search && `search="${search}"`, tag && `tag="${tag}"`]
      .filter(Boolean)
      .join(", ");
    return `No knowledge entries found${filters ? ` matching ${filters}` : ""}.`;
  }

  const lines: string[] = [`${data.length} knowledge entries:\n`];

  for (const row of data) {
    const meta = row.metadata as Record<string, unknown>;
    const title = (meta.title as string) || "";
    const tags = (meta.tags as string[]) || [];
    const tagStr = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
    const ago = formatTimeAgo(row.ts);

    lines.push(`- ${title}${tagStr} (by ${row.agent}, ${ago})`);
    lines.push(`  ${row.content?.slice(0, 200)}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// detect_patterns (LLM-based semantic intent analysis via Gemini)
// ---------------------------------------------------------------------------

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const PATTERN_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash-lite"];

/** Build a compact intent profile for one agent from their recent activity. */
function buildAgentProfile(agent: string, mems: Memory[]): string {
  // Task description from session start
  const startMem = mems.find((m) => {
    const md = (m.metadata ?? {}) as Record<string, unknown>;
    return md.event === "session_start";
  });
  const task = startMem
    ? ((startMem.metadata as Record<string, unknown>)?.task as string || "")
    : (mems[0]?.content ?? "").slice(0, 150);

  // Aggregate operation metadata
  const systems = new Set<string>();
  const actions = new Set<string>();
  const scopes = new Set<string>();
  const outcomes: string[] = [];

  for (const m of mems) {
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    if (meta.system) systems.add(meta.system as string);
    if (meta.action) actions.add(meta.action as string);
    if (meta.scope) scopes.add((meta.scope as string).slice(0, 60));
    if (meta.outcome) outcomes.push(meta.outcome as string);
  }

  // Recent content (last 5 meaningful entries, truncated)
  const snippets = mems
    .filter((m) => m.content && m.content.length > 10)
    .slice(0, 5)
    .map((m) => m.content!.slice(0, 120));

  const lines = [`AGENT: ${agent}`, `TASK: ${task}`];
  if (systems.size > 0) lines.push(`SYSTEMS: ${[...systems].join(", ")}`);
  if (actions.size > 0) lines.push(`ACTIONS: ${[...actions].join(", ")}`);
  if (scopes.size > 0) lines.push(`SCOPES: ${[...scopes].join("; ")}`);
  if (outcomes.length > 0) {
    const ok = outcomes.filter((o) => o === "success").length;
    const fail = outcomes.filter((o) => o === "failure").length;
    const blocked = outcomes.filter((o) => o === "blocked").length;
    lines.push(`OUTCOMES: ${ok} ok, ${fail} fail, ${blocked} blocked`);
  }
  if (snippets.length > 0) lines.push(`RECENT:\n  ${snippets.join("\n  ")}`);

  return lines.join("\n");
}

const PATTERN_PROMPT = `You are analyzing AI agents working in the same room toward a shared destination. Below is each agent's recent activity profile.

Identify ONLY patterns that matter for steering. Classify each as:
- REDUNDANCY: Agents working toward the SAME goal with the SAME approach. Could be merged. Focus on semantic intent, not surface keywords or file names.
- DIVERGENCE: Agents on the SAME scope but pulling in DIFFERENT directions. Their work may conflict.
- ALIGNMENT: Agents whose work COMPLEMENTS each other toward the destination.
- DISTRESS: Agents stuck, failing repeatedly, or blocked.

IMPORTANT:
- Two agents touching the same file is NOT divergence if they're working on different aspects.
- Two agents using different files IS redundancy if they're implementing the same feature.
- Do NOT list idle agents. That's noise. Only flag agents that are stuck or distressed.
- Be concise. One line per finding. No em dashes.
- If nothing notable, say "No significant patterns" in one line.

Respond ONLY with findings. Omit empty sections.`;

/** Call Gemini to semantically analyze agent intent patterns. */
async function analyzeWithGemini(profiles: string[]): Promise<string | null> {
  if (!GEMINI_KEY) return null;

  const userPrompt = `${profiles.length} active agents:\n\n${profiles.map((p, i) => `--- Agent ${i + 1} ---\n${p}`).join("\n\n")}`;

  for (const model of PATTERN_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: PATTERN_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1536 },
        }),
      });
      if (res.status === 429) continue;
      if (!res.ok) continue;
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
    } catch {
      continue;
    }
  }
  return null;
}

async function handleDetectPatterns(roomId: string): Promise<string> {
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("memories")
    .select("agent, ts, session_id, message_type, content, metadata")
    .eq("fold_id", roomId)
    .gte("ts", thirtyMinAgo)
    .order("ts", { ascending: false })
    .limit(300);

  if (error) return `Database error: ${error.message}`;
  if (!data || data.length === 0)
    return "No recent activity to analyze (last 30 minutes).";

  // Group by agent, only keep agents with meaningful activity (>2 events)
  const byAgent = new Map<string, Memory[]>();
  for (const row of data) {
    const arr = byAgent.get(row.agent) ?? [];
    arr.push(row as Memory);
    byAgent.set(row.agent, arr);
  }

  const activeAgents = [...byAgent.entries()].filter(([, mems]) => mems.length > 2);
  if (activeAgents.length === 0) {
    return `${data.length} events from ${byAgent.size} agents, but no agent has enough activity for analysis.`;
  }

  // Build compact profiles
  const profiles = activeAgents.map(([agent, mems]) => buildAgentProfile(agent, mems));

  // Ask Gemini for semantic intent analysis
  const geminiResult = await analyzeWithGemini(profiles);

  if (geminiResult) {
    return `Pattern analysis (${data.length} events, ${activeAgents.length} active agents, LLM-analyzed):\n\n${geminiResult}`;
  }

  // Fallback: just return the profiles so the steering agent can reason about them
  return `Pattern analysis (${data.length} events, ${activeAgents.length} active agents, raw profiles):\n\n${profiles.join("\n\n")}`;
}

// ---------------------------------------------------------------------------
// get_distress_signals
// ---------------------------------------------------------------------------

async function handleGetDistressSignals(roomId: string): Promise<string> {
  // Get distress signals
  const { data: distress, error: dErr } = await supabase
    .from("memories")
    .select("agent, ts, content, metadata")
    .eq("fold_id", roomId)
    .eq("metadata->>event", "distress")
    .order("ts", { ascending: false })
    .limit(10);

  // Get recent checkpoints (last 4 hours)
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const { data: checkpoints, error: cErr } = await supabase
    .from("memories")
    .select("agent, ts, content, metadata")
    .eq("fold_id", roomId)
    .eq("metadata->>event", "checkpoint")
    .gte("ts", fourHoursAgo)
    .order("ts", { ascending: false })
    .limit(10);

  if (dErr) return `Database error: ${dErr.message}`;
  if (cErr) return `Database error: ${cErr.message}`;

  const lines: string[] = [];

  // Unresolved distress signals
  const unresolved = (distress || []).filter(
    (d) => (d.metadata as Record<string, unknown>)?.resolved !== true
  );
  const resolved = (distress || []).filter(
    (d) => (d.metadata as Record<string, unknown>)?.resolved === true
  );

  if (unresolved.length > 0) {
    lines.push(`UNRESOLVED DISTRESS (${unresolved.length}):\n`);
    for (const d of unresolved) {
      const meta = d.metadata as Record<string, unknown>;
      lines.push(`  Agent: ${d.agent} (${formatTimeAgo(d.ts)})`);
      lines.push(`  Task: ${(meta.task as string) || "unknown"}`);
      lines.push(`  Done: ${((meta.done as string) || "").slice(0, 150)}`);
      lines.push(`  Remaining: ${((meta.remaining as string) || "").slice(0, 200)}`);
      const files = (meta.files_changed as string[]) || [];
      if (files.length > 0) lines.push(`  Files: ${files.join(", ")}`);
      lines.push("");
    }
  }

  if (resolved.length > 0) {
    lines.push(`RESOLVED DISTRESS (${resolved.length}):\n`);
    for (const d of resolved) {
      const meta = d.metadata as Record<string, unknown>;
      lines.push(`  ${d.agent}: ${(meta.task as string) || "unknown"} (recovered by ${(meta.recovered_by as string) || "unknown"}, ${formatTimeAgo(d.ts)})`);
    }
    lines.push("");
  }

  if ((checkpoints || []).length > 0) {
    lines.push(`RECENT CHECKPOINTS (${checkpoints!.length}, last 4h):\n`);
    for (const cp of checkpoints!) {
      const meta = cp.metadata as Record<string, unknown>;
      lines.push(`  ${cp.agent}: ${(meta.task as string) || "unknown"} (${formatTimeAgo(cp.ts)})`);
    }
    lines.push("");
  }

  if (lines.length === 0) {
    return "No distress signals or checkpoints found. All agents appear healthy.";
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// get_destination
// ---------------------------------------------------------------------------

async function handleGetDestination(roomId: string): Promise<string> {
  const { data, error } = await supabase
    .from("memories")
    .select("agent, ts, content, metadata")
    .eq("fold_id", roomId)
    .eq("message_type", "knowledge")
    .eq("metadata->>event", "destination")
    .order("ts", { ascending: false })
    .limit(1);

  if (error) return `Database error: ${error.message}`;
  if (!data || data.length === 0)
    return "No destination set for this room. The team has no defined target state (point B).";

  const row = data[0];
  const meta = row.metadata as Record<string, unknown>;
  const dest = (meta.destination as string) || "";
  const milestones = (meta.milestones as string[]) || [];
  const progress = (meta.progress as Record<string, boolean>) || {};
  const notes = meta.notes as string | null;
  const setBy = meta.set_by as string;
  const updatedBy = meta.last_updated_by as string | null;

  const done = milestones.filter((m) => progress[m]).length;
  const total = milestones.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const lines: string[] = [
    `Destination: ${dest}`,
    `Progress: ${done}/${total} milestones (${pct}%)`,
  ];

  if (milestones.length > 0) {
    lines.push("\nMilestones:");
    for (const m of milestones) {
      lines.push(`  ${progress[m] ? "[x]" : "[ ]"} ${m}`);
    }
  }

  if (notes) lines.push(`\nNotes: ${notes}`);
  lines.push(`\nSet by ${setBy} at ${formatTimeAgo(row.ts)}`);
  if (updatedBy) lines.push(`Last updated by ${updatedBy}`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// query_network
// ---------------------------------------------------------------------------

async function handleQueryNetwork(
  domain?: string,
  search?: string,
): Promise<string> {
  let query = supabase
    .from("global_insights")
    .select("id,insight,domain_tags,source_hash,upvotes,ts")
    .order("ts", { ascending: false })
    .limit(20);

  if (search) {
    query = query.ilike("insight", `%${search}%`);
  }

  const { data, error } = await query;

  if (error) return `Global insights table not available: ${error.message}`;
  if (!data || data.length === 0) {
    return domain || search
      ? `No insights found${domain ? ` in domain "${domain}"` : ""}${search ? ` matching "${search}"` : ""}.`
      : "Global network is empty. Agents can publish with eywa_publish_insight.";
  }

  // Client-side domain filter
  const filtered = domain
    ? data.filter((r: any) => r.domain_tags?.includes(domain))
    : data;

  if (!filtered.length) {
    return `No insights found in domain "${domain}".`;
  }

  const lines = [`Global network (${filtered.length} insights):\n`];
  for (const r of filtered) {
    const tags = r.domain_tags?.length ? ` [${r.domain_tags.join(", ")}]` : "";
    const votes = r.upvotes > 0 ? ` (+${r.upvotes})` : "";
    const source = r.source_hash?.slice(0, 8) ?? "?";
    lines.push(`${r.insight.slice(0, 300)}${tags}${votes}\n  source:${source}, ${formatTimeAgo(r.ts)}`);
  }

  return lines.join("\n\n");
}
