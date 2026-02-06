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

-- Optional: Row Level Security (if you want user isolation)
-- ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can read all" ON memories FOR SELECT USING (true);
-- CREATE POLICY "Users can insert" ON memories FOR INSERT WITH CHECK (true);
