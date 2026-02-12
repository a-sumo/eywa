import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment"
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface Memory {
  id: string;
  fold_id: string | null;
  agent: string;
  session_id: string;
  message_type: string;
  content: string;
  token_count: number;
  metadata: Record<string, unknown>;
  ts: string;
}

export interface Message {
  id: string;
  fold_id: string | null;
  sender: string;
  channel: string;
  content: string;
  metadata: Record<string, unknown>;
  ts: string;
}

export interface Fold {
  id: string;
  slug: string;
  name: string;
  secret: string;
  created_by: string | null;
  is_demo: boolean;
  created_at: string;
}

/** @deprecated Use Fold instead */
export type Room = Fold;

export interface GlobalInsight {
  id: string;
  insight: string;
  domain_tags: string[];
  source_hash: string;
  fold_id: string | null;
  agent: string | null;
  upvotes: number;
  ts: string;
}

export interface Link {
  id: string;
  fold_id: string | null;
  source_memory_id: string;
  target_agent: string;
  target_session_id: string;
  target_position: string;
  link_type: string;
  created_by: string;
  label: string | null;
  metadata: Record<string, unknown>;
  ts: string;
}
