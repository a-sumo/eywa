/** Cloudflare Worker environment bindings */
export interface Env {
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
}

/** Per-request context derived from URL params + room lookup */
export interface RemixContext {
  roomId: string;
  roomSlug: string;
  roomName: string;
  agent: string;
  sessionId: string;
}

/** Row types matching the Supabase schema */

export interface RoomRow {
  id: string;
  slug: string;
  name: string;
  created_by: string | null;
  is_demo: boolean;
  created_at: string;
}

export interface MemoryRow {
  id: string;
  room_id: string | null;
  agent: string;
  session_id: string | null;
  message_type: string | null;
  content: string | null;
  token_count: number;
  metadata: Record<string, unknown>;
  ts: string;
}

export interface MessageRow {
  id: string;
  room_id: string | null;
  sender: string;
  channel: string;
  content: string;
  metadata: Record<string, unknown>;
  ts: string;
}
