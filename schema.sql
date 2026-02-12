-- Eywa: Multi-agent shared memory schema
-- Run this in your Supabase SQL Editor

-- Folds table for isolated workspaces
CREATE TABLE IF NOT EXISTS folds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_by TEXT,
  is_demo BOOLEAN DEFAULT false,
  secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_folds_slug ON folds(slug);

CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fold_id UUID REFERENCES folds(id),
  parent_id UUID REFERENCES memories(id),
  agent TEXT NOT NULL,
  session_id TEXT,
  message_type TEXT,
  content TEXT,
  token_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  ts TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent);
CREATE INDEX IF NOT EXISTS idx_memories_ts ON memories(ts DESC);
CREATE INDEX IF NOT EXISTS idx_memories_session ON memories(session_id);
CREATE INDEX IF NOT EXISTS idx_memories_fold ON memories(fold_id);

-- Messages table for human-to-human chat
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fold_id UUID REFERENCES folds(id),
  sender TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'general',
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  ts TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel);
CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts DESC);
CREATE INDEX IF NOT EXISTS idx_messages_fold ON messages(fold_id);

-- Links table for connecting memories across sessions
CREATE TABLE IF NOT EXISTS links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fold_id UUID REFERENCES folds(id),
  source_memory_id UUID REFERENCES memories(id) ON DELETE CASCADE,
  target_agent TEXT NOT NULL,
  target_session_id TEXT NOT NULL,
  target_position TEXT NOT NULL DEFAULT 'head',
  link_type TEXT NOT NULL DEFAULT 'reference',
  created_by TEXT NOT NULL,
  label TEXT,
  metadata JSONB DEFAULT '{}',
  ts TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_links_fold ON links(fold_id);
CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_memory_id);
CREATE INDEX IF NOT EXISTS idx_links_target_session ON links(target_session_id);
CREATE INDEX IF NOT EXISTS idx_links_ts ON links(ts DESC);

-- Global Knowledge Hub: cross-fold anonymized insights
CREATE TABLE IF NOT EXISTS global_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insight TEXT NOT NULL,
  domain_tags TEXT[] DEFAULT '{}',
  source_hash TEXT NOT NULL,  -- SHA-256 of fold_id + agent, anonymized
  fold_id UUID REFERENCES folds(id),  -- nullable, for optional tracing
  agent TEXT,                          -- nullable, for optional tracing
  upvotes INTEGER DEFAULT 0,
  ts TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_global_insights_ts ON global_insights(ts DESC);
CREATE INDEX IF NOT EXISTS idx_global_insights_domain ON global_insights USING GIN(domain_tags);
CREATE INDEX IF NOT EXISTS idx_global_insights_source ON global_insights(source_hash);

-- Refs table for branches, bookmarks, and HEAD pointers
CREATE TABLE IF NOT EXISTS refs (
  fold_id UUID NOT NULL REFERENCES folds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  commit_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  ts TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (fold_id, name)
);

CREATE INDEX IF NOT EXISTS idx_refs_commit ON refs(commit_id);
CREATE INDEX IF NOT EXISTS idx_refs_name ON refs(fold_id, name text_pattern_ops);

-- Clone a fold's memories into a new demo fold (bypasses RLS via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION clone_demo_fold(source_slug TEXT, new_slug TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  source_fold_id UUID;
  new_fold_id UUID;
BEGIN
  -- Find source fold
  SELECT id INTO source_fold_id FROM folds WHERE slug = source_slug;
  IF source_fold_id IS NULL THEN
    RAISE EXCEPTION 'Source fold not found: %', source_slug;
  END IF;

  -- Create new fold
  INSERT INTO folds (slug, name, created_by, is_demo, secret)
  VALUES (new_slug, 'Demo Fold', 'demo', true, 'public')
  RETURNING id INTO new_fold_id;

  -- Clone memories (skip parent_id to avoid FK issues)
  INSERT INTO memories (fold_id, agent, session_id, message_type, content, token_count, metadata, ts)
  SELECT new_fold_id, agent, session_id, message_type, content, token_count, metadata, ts
  FROM memories
  WHERE fold_id = source_fold_id
  ORDER BY ts ASC
  LIMIT 500;

  RETURN new_fold_id;
END;
$$;

-- Optional: Row Level Security (if you want user isolation)
-- ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can read all" ON memories FOR SELECT USING (true);
-- CREATE POLICY "Users can insert" ON memories FOR INSERT WITH CHECK (true);
