-- Eywa: Multi-agent shared memory schema
-- Run this in your Supabase SQL Editor

-- Rooms table for isolated workspaces
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_by TEXT,
  is_demo BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rooms_slug ON rooms(slug);

CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id),
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
CREATE INDEX IF NOT EXISTS idx_memories_room ON memories(room_id);

-- Messages table for human-to-human chat
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id),
  sender TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'general',
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  ts TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel);
CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts DESC);
CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id);

-- Links table for connecting memories across sessions
CREATE TABLE IF NOT EXISTS links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id),
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

CREATE INDEX IF NOT EXISTS idx_links_room ON links(room_id);
CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_memory_id);
CREATE INDEX IF NOT EXISTS idx_links_target_session ON links(target_session_id);
CREATE INDEX IF NOT EXISTS idx_links_ts ON links(ts DESC);

-- Global Knowledge Hub: cross-room anonymized insights
CREATE TABLE IF NOT EXISTS global_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insight TEXT NOT NULL,
  domain_tags TEXT[] DEFAULT '{}',
  source_hash TEXT NOT NULL,  -- SHA-256 of room_id + agent, anonymized
  room_id UUID REFERENCES rooms(id),  -- nullable, for optional tracing
  agent TEXT,                          -- nullable, for optional tracing
  upvotes INTEGER DEFAULT 0,
  ts TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_global_insights_ts ON global_insights(ts DESC);
CREATE INDEX IF NOT EXISTS idx_global_insights_domain ON global_insights USING GIN(domain_tags);
CREATE INDEX IF NOT EXISTS idx_global_insights_source ON global_insights(source_hash);

-- Clone a room's memories into a new demo room (bypasses RLS via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION clone_demo_room(source_slug TEXT, new_slug TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  source_room_id UUID;
  new_room_id UUID;
BEGIN
  -- Find source room
  SELECT id INTO source_room_id FROM rooms WHERE slug = source_slug;
  IF source_room_id IS NULL THEN
    RAISE EXCEPTION 'Source room not found: %', source_slug;
  END IF;

  -- Create new room
  INSERT INTO rooms (slug, name, created_by, is_demo)
  VALUES (new_slug, 'Demo Room', 'demo', true)
  RETURNING id INTO new_room_id;

  -- Clone memories (skip parent_id to avoid FK issues)
  INSERT INTO memories (room_id, agent, session_id, message_type, content, token_count, metadata, ts)
  SELECT new_room_id, agent, session_id, message_type, content, token_count, metadata, ts
  FROM memories
  WHERE room_id = source_room_id
  ORDER BY ts ASC
  LIMIT 500;

  RETURN new_room_id;
END;
$$;

-- Optional: Row Level Security (if you want user isolation)
-- ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can read all" ON memories FOR SELECT USING (true);
-- CREATE POLICY "Users can insert" ON memories FOR INSERT WITH CHECK (true);
