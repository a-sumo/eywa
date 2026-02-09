import type { MemoryRow, GlobalInsightRow } from "./types.js";

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "must", "need", "dare",
  "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
  "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "and", "but", "or", "nor", "not", "so", "yet", "both",
  "either", "neither", "each", "every", "all", "any", "few", "more",
  "most", "other", "some", "such", "no", "only", "own", "same", "than",
  "too", "very", "just", "because", "if", "when", "where", "how", "what",
  "which", "who", "whom", "this", "that", "these", "those", "it", "its",
  "use", "using", "used", "get", "set", "add", "new", "make",
]);

/** Extract significant keywords from a text string */
function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

/** Score how relevant a piece of text is to a set of query keywords. Returns 0-1. */
function score(queryKeywords: string[], targetText: string): number {
  if (queryKeywords.length === 0) return 0;
  const target = targetText.toLowerCase();
  let matches = 0;
  for (const kw of queryKeywords) {
    if (target.includes(kw)) matches++;
  }
  return matches / queryKeywords.length;
}

export interface RelevantEntry {
  text: string;
  source: string;
  score: number;
}

/** Match knowledge entries against a query, return top N relevant ones */
export function matchKnowledge(
  query: string,
  knowledgeRows: MemoryRow[],
  topN = 3,
  threshold = 0.25,
): RelevantEntry[] {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return [];

  const scored: RelevantEntry[] = [];
  for (const row of knowledgeRows) {
    const content = row.content ?? "";
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    // Skip destination entries (they're shown separately)
    if (meta.event === "destination") continue;
    const tags = (meta.tags as string[]) ?? [];
    const title = (meta.title as string) ?? "";
    // Combine content + tags + title for matching
    const searchable = `${title} ${content} ${tags.join(" ")}`;
    const s = score(keywords, searchable);
    if (s >= threshold) {
      scored.push({
        text: content.slice(0, 300),
        source: (meta.stored_by as string) ?? row.agent,
        score: s,
      });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

/** Match global insights against a query, return top N relevant ones */
export function matchInsights(
  query: string,
  insightRows: GlobalInsightRow[],
  topN = 3,
  threshold = 0.25,
): RelevantEntry[] {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return [];

  const scored: RelevantEntry[] = [];
  for (const row of insightRows) {
    const searchable = `${row.insight} ${row.domain_tags.join(" ")}`;
    const s = score(keywords, searchable);
    if (s >= threshold) {
      scored.push({
        text: row.insight.slice(0, 300),
        source: `network:${row.source_hash.slice(0, 8)}`,
        score: s,
      });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

/** Build a combined query string from remaining destination milestones */
export function milestonesToQuery(
  milestones: string[],
  progress: Record<string, boolean>,
): string {
  const remaining = milestones.filter(m => !progress[m]);
  return remaining.join(" ");
}
