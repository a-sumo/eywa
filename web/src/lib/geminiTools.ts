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
      "Analyze recent agent activity to find patterns. Detects: REDUNDANCY (multiple agents doing similar work), DIVERGENCE (agents working on conflicting things), IDLENESS (agents with no recent activity that could be productive). Returns a structured analysis.",
    parameters: {
      type: "object",
      properties: {},
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
    .eq("room_id", roomId)
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
        (e.content?.startsWith("SESSION START:") || e.content?.startsWith("Agent "))
    );
    const task = taskEntry
      ? taskEntry.content.replace("SESSION START: ", "").slice(0, 120)
      : info.entries[0]?.content?.slice(0, 120) || "no content";

    lines.push(`[${status}] ${agent} (${info.sessions.size} sessions, last seen ${ago})`);
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
    .eq("room_id", roomId)
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
    .eq("room_id", roomId)
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
// detect_patterns
// ---------------------------------------------------------------------------

async function handleDetectPatterns(roomId: string): Promise<string> {
  const fiveMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("memories")
    .select("agent, ts, session_id, message_type, content, metadata")
    .eq("room_id", roomId)
    .gte("ts", fiveMinAgo)
    .order("ts", { ascending: false })
    .limit(300);

  if (error) return `Database error: ${error.message}`;
  if (!data || data.length === 0)
    return "No recent activity to analyze (last 30 minutes).";

  const now = Date.now();
  const byAgent = new Map<string, Memory[]>();
  for (const row of data) {
    const arr = byAgent.get(row.agent) ?? [];
    arr.push(row as Memory);
    byAgent.set(row.agent, arr);
  }

  const sections: string[] = [];

  // --- Redundancy detection ---
  // Look for agents working on similar content (simple keyword overlap)
  const redundancies: string[] = [];
  const agentSummaries = new Map<string, string>();
  for (const [agent, mems] of byAgent) {
    const combined = mems
      .map((m) => m.content?.toLowerCase() || "")
      .join(" ")
      .slice(0, 500);
    agentSummaries.set(agent, combined);
  }

  const agents = Array.from(agentSummaries.keys());
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const similarity = computeWordOverlap(
        agentSummaries.get(agents[i])!,
        agentSummaries.get(agents[j])!
      );
      if (similarity > 0.4) {
        redundancies.push(
          `${agents[i]} and ${agents[j]} have ${Math.round(similarity * 100)}% keyword overlap`
        );
      }
    }
  }

  if (redundancies.length > 0) {
    sections.push(`REDUNDANCY:\n${redundancies.map((r) => `  - ${r}`).join("\n")}`);
  }

  // --- Divergence detection ---
  // Look for conflicting operations on the same files/resources
  const fileOps = new Map<string, string[]>();
  for (const [agent, mems] of byAgent) {
    for (const mem of mems) {
      const paths = extractFilePaths(mem.content || "");
      for (const path of paths) {
        const existing = fileOps.get(path) ?? [];
        if (!existing.includes(agent)) existing.push(agent);
        fileOps.set(path, existing);
      }
    }
  }

  const conflicts: string[] = [];
  for (const [path, agentList] of fileOps) {
    if (agentList.length > 1) {
      conflicts.push(`${path} touched by: ${agentList.join(", ")}`);
    }
  }

  if (conflicts.length > 0) {
    sections.push(
      `DIVERGENCE (multiple agents touching same files):\n${conflicts.map((c) => `  - ${c}`).join("\n")}`
    );
  }

  // --- Idleness detection ---
  // Agents in the room with no activity in the last 5 minutes
  const idle: string[] = [];
  for (const [agent, mems] of byAgent) {
    const lastTs = new Date(mems[0].ts).getTime();
    if (now - lastTs > 5 * 60 * 1000) {
      idle.push(`${agent} (last active ${formatTimeAgo(mems[0].ts)})`);
    }
  }

  if (idle.length > 0) {
    sections.push(`IDLE AGENTS:\n${idle.map((i) => `  - ${i}`).join("\n")}`);
  }

  if (sections.length === 0) {
    return `Analyzed ${data.length} recent events across ${byAgent.size} agents. No significant patterns detected (no redundancy, divergence, or idleness).`;
  }

  return `Pattern analysis (${data.length} events, ${byAgent.size} agents, last 30 min):\n\n${sections.join("\n\n")}`;
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

/** Simple word-level Jaccard similarity. */
function computeWordOverlap(a: string, b: string): number {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "shall", "can",
    "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "and",
    "but", "or", "nor", "not", "so", "yet", "both", "either",
    "neither", "each", "every", "all", "any", "few", "more",
    "most", "other", "some", "such", "no", "only", "own",
    "same", "than", "too", "very", "just", "because", "if",
    "that", "this", "it", "its", "i", "we", "you", "he", "she",
    "they", "me", "him", "her", "us", "them", "my", "your",
  ]);

  const wordsA = new Set(
    a.split(/\W+/).filter((w) => w.length > 2 && !stopWords.has(w))
  );
  const wordsB = new Set(
    b.split(/\W+/).filter((w) => w.length > 2 && !stopWords.has(w))
  );

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/** Extract file paths from content (simple heuristic). */
function extractFilePaths(text: string): string[] {
  const matches = text.match(/(?:\/[\w.-]+)+(?:\.[\w]+)?/g);
  if (!matches) return [];
  // Only keep paths that look like source files (have extensions)
  return [...new Set(matches.filter((p) => /\.\w+$/.test(p)))];
}
