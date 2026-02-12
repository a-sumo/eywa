import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SupabaseClient } from "../lib/supabase.js";
import type { EywaContext, MemoryRow } from "../lib/types.js";

/** Extract meaningful words from text for overlap detection. */
function extractWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

/** Jaccard similarity between two word sets. Returns 0-1. */
function wordOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) {
    if (b.has(w)) intersection++;
  }
  const union = new Set([...a, ...b]).size;
  return union > 0 ? intersection / union : 0;
}

/** Check if two file path lists have any overlap. */
function fileOverlap(a: string[], b: string[]): string[] {
  const setB = new Set(b);
  return a.filter((f) => setB.has(f));
}

export interface ActiveClaim {
  agent: string;
  scope: string;
  files: string[];
  ts: string;
}

// Claims from agents with no activity in this many minutes are considered stale
const STALE_CLAIM_MINUTES = 30;

/** Fetch active claims in a fold (< 2h old, no session end after claim, agent not idle). */
export async function getActiveClaims(
  db: SupabaseClient,
  foldId: string,
  excludeAgent?: string,
): Promise<ActiveClaim[]> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const claimRows = await db.select<MemoryRow>("memories", {
    select: "agent,metadata,ts,session_id",
    fold_id: `eq.${foldId}`,
    "metadata->>event": "eq.claim",
    ts: `gte.${twoHoursAgo}`,
    order: "ts.desc",
    limit: "50",
  });

  if (claimRows.length === 0) return [];

  // Check which sessions are still active (no session_end/session_done after the claim)
  const sessionIds = [...new Set(claimRows.map((r) => r.session_id).filter(Boolean))];
  const endRows = sessionIds.length > 0
    ? await db.select<MemoryRow>("memories", {
        select: "session_id,metadata",
        fold_id: `eq.${foldId}`,
        session_id: `in.(${sessionIds.join(",")})`,
        "metadata->>event": `in.(session_end,session_done,unclaim)`,
        order: "ts.desc",
        limit: "100",
      })
    : [];

  // Sessions that have ended or been unclaimed
  const endedSessions = new Set<string>();
  const unclaimedAgents = new Set<string>();
  for (const row of endRows) {
    const meta = (row.metadata ?? {}) as Record<string, string>;
    if (meta.event === "unclaim") {
      unclaimedAgents.add(row.agent ?? "");
    } else if (row.session_id) {
      endedSessions.add(row.session_id);
    }
  }

  // Dedupe: keep latest claim per agent, filter ended/unclaimed
  const seen = new Set<string>();
  const candidates: Array<{ agent: string; scope: string; files: string[]; ts: string }> = [];
  for (const row of claimRows) {
    if (seen.has(row.agent)) continue;
    if (excludeAgent && row.agent === excludeAgent) continue;
    if (row.session_id && endedSessions.has(row.session_id)) continue;
    if (unclaimedAgents.has(row.agent)) continue;
    seen.add(row.agent);

    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    candidates.push({
      agent: row.agent,
      scope: (meta.scope as string) || "",
      files: (meta.files as string[]) || [],
      ts: row.ts,
    });
  }

  if (candidates.length === 0) return candidates;

  // Staleness check: get each claiming agent's most recent activity
  const candidateAgents = candidates.map((c) => c.agent);
  const staleThreshold = new Date(Date.now() - STALE_CLAIM_MINUTES * 60 * 1000).toISOString();

  // Query recent activity for all candidate agents in one batch
  // We get the latest memory per agent and check if it's older than the stale threshold
  const recentRows = await db.select<MemoryRow>("memories", {
    select: "agent,ts",
    fold_id: `eq.${foldId}`,
    agent: `in.(${candidateAgents.join(",")})`,
    ts: `gte.${staleThreshold}`,
    order: "ts.desc",
    limit: String(candidateAgents.length * 2),
  });

  // Agents with at least one memory in the recent window are still active
  const recentlyActiveAgents = new Set(recentRows.map((r) => r.agent));

  // Filter out stale claims (agents with no recent activity)
  return candidates.filter((c) => recentlyActiveAgents.has(c.agent));
}

/** Check a task description against active claims. Returns conflict warnings. */
export function detectConflicts(
  taskDescription: string,
  files: string[],
  activeClaims: ActiveClaim[],
): string[] {
  const warnings: string[] = [];
  const taskWords = extractWords(taskDescription);

  for (const claim of activeClaims) {
    const claimWords = extractWords(claim.scope);
    const overlap = wordOverlap(taskWords, claimWords);
    const sharedFiles = files.length > 0 ? fileOverlap(files, claim.files) : [];

    if (overlap > 0.25 || sharedFiles.length > 0) {
      const short = claim.agent.includes("/") ? claim.agent.split("/").pop()! : claim.agent;
      const reasons: string[] = [];
      if (overlap > 0.25) reasons.push(`scope overlap ${Math.round(overlap * 100)}%`);
      if (sharedFiles.length > 0) reasons.push(`shared files: ${sharedFiles.join(", ")}`);
      warnings.push(`CONFLICT: ${short} is already working on "${claim.scope}" (${reasons.join("; ")}). Coordinate or pick a different task.`);
    }
  }

  return warnings;
}

function estimateTokens(text: string): number {
  return text ? Math.floor(text.length / 4) : 0;
}

export function registerClaimTools(
  server: McpServer,
  db: SupabaseClient,
  ctx: EywaContext,
) {
  server.tool(
    "eywa_claim",
    "Claim a scope of work so other agents know not to duplicate it. Call this before starting any significant task. Returns warnings if another agent already claimed overlapping work.",
    {
      scope: z.string().describe("What you're working on (e.g. 'VS Code attention system', 'Discord bot /network command')"),
      files: z.array(z.string()).optional().describe("File paths you plan to modify (e.g. ['worker/src/tools/session.ts', 'CLAUDE.md'])"),
    },
    {
      readOnlyHint: false,
      idempotentHint: false,
    },
    async ({ scope, files }) => {
      const fileList = files ?? [];

      // Check for conflicts with active claims
      const activeClaims = await getActiveClaims(db, ctx.foldId, ctx.agent);
      const conflicts = detectConflicts(scope, fileList, activeClaims);

      // Scope lock: reject if any requested file already has 2+ active claimants
      if (fileList.length > 0) {
        const fileCounts = new Map<string, string[]>();
        for (const claim of activeClaims) {
          for (const f of claim.files) {
            if (!fileCounts.has(f)) fileCounts.set(f, []);
            fileCounts.get(f)!.push(claim.agent);
          }
        }
        const locked: string[] = [];
        for (const f of fileList) {
          const claimants = fileCounts.get(f) ?? [];
          if (claimants.length >= 2) {
            const names = claimants.map(a => a.includes("/") ? a.split("/").pop()! : a);
            locked.push(`${f} (claimed by ${names.join(", ")})`);
          }
        }
        if (locked.length > 0) {
          return {
            content: [{
              type: "text" as const,
              text: `SCOPE LOCKED: ${locked.length === 1 ? "File" : "Files"} already at max claimants (2):\n${locked.map(l => `  - ${l}`).join("\n")}\n\nPick different files or wait for a claim to release.`,
            }],
          };
        }
      }

      // Store the claim
      await db.insert("memories", {
        fold_id: ctx.foldId,
        agent: ctx.agent,
        session_id: ctx.sessionId,
        message_type: "resource",
        content: `CLAIM: ${scope}${fileList.length > 0 ? ` [${fileList.join(", ")}]` : ""}`,
        token_count: estimateTokens(scope),
        metadata: {
          event: "claim",
          scope,
          files: fileList,
          user: ctx.user,
        },
      });

      const lines: string[] = [`Claimed: ${scope}`];
      if (fileList.length > 0) lines.push(`Files: ${fileList.join(", ")}`);

      if (conflicts.length > 0) {
        lines.push("");
        lines.push("=== CONFLICTS DETECTED ===");
        lines.push(...conflicts);
        lines.push("");
        lines.push("Consider coordinating with these agents or picking different work.");
      } else {
        // Show other active claims for awareness
        if (activeClaims.length > 0) {
          lines.push("");
          lines.push("Other active claims:");
          for (const c of activeClaims) {
            const short = c.agent.includes("/") ? c.agent.split("/").pop()! : c.agent;
            lines.push(`  ${short}: ${c.scope}`);
          }
        }
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );

  server.tool(
    "eywa_unclaim",
    "Release your current work claim. Called automatically by eywa_done and eywa_stop, but you can call it manually if you're switching tasks.",
    {},
    {
      readOnlyHint: false,
      idempotentHint: true,
    },
    async () => {
      await db.insert("memories", {
        fold_id: ctx.foldId,
        agent: ctx.agent,
        session_id: ctx.sessionId,
        message_type: "resource",
        content: "UNCLAIM: Work claim released.",
        token_count: 10,
        metadata: {
          event: "unclaim",
          user: ctx.user,
        },
      });

      return {
        content: [{ type: "text" as const, text: "Work claim released." }],
      };
    },
  );
}
