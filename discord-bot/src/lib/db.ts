import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabase: SupabaseClient;

export function initDb(url: string, key: string) {
  supabase = createClient(url, key);
}

export function db() {
  return supabase;
}

// ── Row types matching Supabase schema ──────────────────────────

export interface Memory {
  id: string;
  fold_id: string | null;
  agent: string;
  session_id: string | null;
  message_type: string | null;
  content: string | null;
  token_count: number;
  metadata: Record<string, any>;
  ts: string;
}

export interface Message {
  id: string;
  fold_id: string | null;
  sender: string;
  channel: string;
  content: string;
  metadata: Record<string, any>;
  ts: string;
}

export interface Fold {
  id: string;
  slug: string;
  name: string;
  created_by: string | null;
  is_demo: boolean;
  created_at: string;
}

// ── Helpers ─────────────────────────────────────────────────────

export async function getAgentNames(foldId: string): Promise<string[]> {
  const { data } = await supabase
    .from("memories")
    .select("agent")
    .eq("fold_id", foldId)
    .order("ts", { ascending: false });

  if (!data) return [];
  const seen = new Set<string>();
  return data
    .filter((r) => {
      if (seen.has(r.agent)) return false;
      seen.add(r.agent);
      return true;
    })
    .map((r) => r.agent);
}

export function estimateTokens(text: string): number {
  return text ? Math.floor(text.length / 4) : 0;
}
