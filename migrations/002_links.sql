-- Remix: Links table for connecting memories across sessions
-- Run this in Supabase SQL Editor.
--
-- A link is a directed edge: source memory -> target session at a position.
-- This enables cross-agent references, forks, and explicit context sharing.

CREATE TABLE IF NOT EXISTS links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id),
  source_memory_id UUID REFERENCES memories(id) ON DELETE CASCADE,
  target_agent TEXT NOT NULL,
  target_session_id TEXT NOT NULL,
  target_position TEXT NOT NULL DEFAULT 'head',   -- 'head', 'start', 'after:<memory_id>'
  link_type TEXT NOT NULL DEFAULT 'reference',    -- 'reference', 'inject', 'fork'
  created_by TEXT NOT NULL,
  label TEXT,
  metadata JSONB DEFAULT '{}',
  ts TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_links_room ON links(room_id);
CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_memory_id);
CREATE INDEX IF NOT EXISTS idx_links_target_session ON links(target_session_id);
CREATE INDEX IF NOT EXISTS idx_links_target_agent ON links(target_agent);
CREATE INDEX IF NOT EXISTS idx_links_ts ON links(ts DESC);

-- RLS: same pattern as other tables
ALTER TABLE links ENABLE ROW LEVEL SECURITY;

-- Anyone can read links
CREATE POLICY "links_select_all"
  ON links FOR SELECT
  USING (true);

-- Anyone can create links (web UI + agents via service_role)
CREATE POLICY "links_insert_all"
  ON links FOR INSERT
  WITH CHECK (true);

-- Anyone can delete their own links
CREATE POLICY "links_delete_own"
  ON links FOR DELETE
  USING (true);

-- Enable realtime for links table
ALTER PUBLICATION supabase_realtime ADD TABLE links;
