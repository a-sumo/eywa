/** Cloudflare Worker environment bindings */
export interface Env {
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
}

/** Per-request context derived from URL params + fold lookup */
export interface EywaContext {
  foldId: string;
  foldSlug: string;
  foldName: string;
  agent: string;       // unique per connection, e.g. "armand-a3f2"
  user: string;        // base name for grouping, e.g. "armand"
  sessionId: string;
}

/** Row types matching the Supabase schema */

export interface FoldRow {
  id: string;
  slug: string;
  name: string;
  created_by: string | null;
  is_demo: boolean;
  secret: string;
  created_at: string;
}

export interface MemoryRow {
  id: string;
  room_id: string | null;
  agent: string;
  session_id: string | null;
  parent_id: string | null;  // Git: points to previous commit in chain
  message_type: string | null;
  content: string | null;
  token_count: number;
  metadata: Record<string, unknown>;
  ts: string;
}

/** Git-like refs: branches, bookmarks, HEADs */
export interface RefRow {
  room_id: string;
  name: string;           // e.g. "heads/armand/quiet-oak", "bookmarks/auth-decision"
  commit_id: string;      // points to a memory
  created_by: string;
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

export interface GlobalInsightRow {
  id: string;
  insight: string;
  domain_tags: string[];
  source_hash: string;
  room_id: string | null;
  agent: string | null;
  upvotes: number;
  ts: string;
}

export interface LinkRow {
  id: string;
  room_id: string | null;
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
