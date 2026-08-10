export interface Env {
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
}

export interface SwarmlineContext {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  agent: string;
  user: string;
  sessionId: string;
}

export interface WorkspaceRow {
  id: string;
  slug: string;
  name: string;
  secret: string;
}

export interface EventRow {
  id: string;
  fold_id: string;
  agent: string;
  session_id: string;
  message_type: string;
  content: string;
  metadata: Record<string, unknown>;
  ts: string;
}
