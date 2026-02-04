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
  room_id: string | null;
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
  room_id: string | null;
  sender: string;
  channel: string;
  content: string;
  metadata: Record<string, unknown>;
  ts: string;
}

export interface Room {
  id: string;
  slug: string;
  name: string;
  created_by: string | null;
  is_demo: boolean;
  created_at: string;
}
