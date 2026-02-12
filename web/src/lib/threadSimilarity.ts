import type { Memory } from "./supabase";

/**
 * Tokenize content into a set of normalized words.
 */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

/**
 * Compute Jaccard similarity between two sets: |A ∩ B| / |A ∪ B|
 * Returns a value between 0 (completely different) and 1 (identical).
 */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

export interface ThreadSummary {
  agent: string;
  sessionId: string;
  tokens: Set<string>;
  memoryCount: number;
}

/**
 * Build a token summary for a thread's memories.
 */
export function summarizeThread(memories: Memory[]): ThreadSummary {
  const allText = memories.map((m) => m.content || "").join(" ");
  return {
    agent: memories[0]?.agent || "",
    sessionId: memories[0]?.session_id || "",
    tokens: tokenize(allText),
    memoryCount: memories.length,
  };
}

/**
 * Compute similarity between two threads.
 * Returns 0..1 where 1 = identical topics, 0 = completely different.
 */
export function threadSimilarity(a: ThreadSummary, b: ThreadSummary): number {
  return jaccard(a.tokens, b.tokens);
}

/**
 * Compute divergence (inverse of similarity).
 * Returns 0..1 where 0 = identical, 1 = fully diverged.
 */
export function threadDivergence(a: ThreadSummary, b: ThreadSummary): number {
  return 1 - threadSimilarity(a, b);
}

export type DivergenceLevel = "low" | "medium" | "high";

/**
 * Classify divergence into low/medium/high.
 * - low: < 40% divergence (threads are still aligned)
 * - medium: 40-70% divergence (starting to drift)
 * - high: > 70% divergence (significantly diverged)
 */
export function divergenceLevel(divergence: number): DivergenceLevel {
  if (divergence < 0.4) return "low";
  if (divergence < 0.7) return "medium";
  return "high";
}

/**
 * Given all memories in a fold, group by thread and compute pairwise
 * divergence between all threads of different agents.
 * Returns pairs that exceed the threshold, sorted by divergence descending.
 */
export function findDivergentThreads(
  memories: Memory[],
  threshold = 0.5
): Array<{
  threadA: ThreadSummary;
  threadB: ThreadSummary;
  divergence: number;
  level: DivergenceLevel;
}> {
  // Group memories by agent::session_id
  const threadMap = new Map<string, Memory[]>();
  for (const m of memories) {
    const key = `${m.agent}::${m.session_id}`;
    const list = threadMap.get(key) || [];
    list.push(m);
    threadMap.set(key, list);
  }

  const summaries = Array.from(threadMap.values()).map(summarizeThread);
  const results: Array<{
    threadA: ThreadSummary;
    threadB: ThreadSummary;
    divergence: number;
    level: DivergenceLevel;
  }> = [];

  // Compute pairwise divergence between different agents
  for (let i = 0; i < summaries.length; i++) {
    for (let j = i + 1; j < summaries.length; j++) {
      // Only compare threads from different agents
      if (summaries[i].agent === summaries[j].agent) continue;

      const div = threadDivergence(summaries[i], summaries[j]);
      if (div >= threshold) {
        results.push({
          threadA: summaries[i],
          threadB: summaries[j],
          divergence: div,
          level: divergenceLevel(div),
        });
      }
    }
  }

  return results.sort((a, b) => b.divergence - a.divergence);
}
