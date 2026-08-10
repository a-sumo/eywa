import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !key) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}

export const supabase = createClient(url, key);

export interface Workspace {
  id: string;
  slug: string;
  name: string;
}

export interface AgentEvent {
  id: string;
  fold_id: string;
  agent: string;
  session_id: string;
  content: string;
  metadata: Record<string, unknown>;
  ts: string;
}
