-- Migration 003: Git-like Timeline Features
-- Adds parent_id for commit chains and refs table for branches/bookmarks

-- Add parent_id to memories for commit chain (Git DAG)
ALTER TABLE memories ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES memories(id);

-- Index for efficient parent chain traversal
CREATE INDEX IF NOT EXISTS idx_memories_parent ON memories(parent_id);

-- Refs table for branches, bookmarks, and HEAD pointers
-- Like Git refs: heads/agent/session, branches/agent/name, bookmarks/name
CREATE TABLE IF NOT EXISTS refs (
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  commit_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  ts TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (room_id, name)
);

-- Index for finding refs by commit
CREATE INDEX IF NOT EXISTS idx_refs_commit ON refs(commit_id);

-- Index for pattern matching on ref names (e.g., "like.bookmarks/%")
CREATE INDEX IF NOT EXISTS idx_refs_name ON refs(room_id, name text_pattern_ops);

-- RLS policies for refs
ALTER TABLE refs ENABLE ROW LEVEL SECURITY;

-- Anyone can read refs in a room
CREATE POLICY "refs_select" ON refs
  FOR SELECT USING (true);

-- Anyone can insert refs (agents create branches/bookmarks)
CREATE POLICY "refs_insert" ON refs
  FOR INSERT WITH CHECK (true);

-- Anyone can update refs (moving branch pointers)
CREATE POLICY "refs_update" ON refs
  FOR UPDATE USING (true);

-- Anyone can delete refs (deleting branches)
CREATE POLICY "refs_delete" ON refs
  FOR DELETE USING (true);

-- Add real-time for refs table
ALTER PUBLICATION supabase_realtime ADD TABLE refs;

-- Comments for documentation
COMMENT ON COLUMN memories.parent_id IS 'Git-like parent pointer forming a commit DAG';
COMMENT ON TABLE refs IS 'Git-like refs: branches (heads/), bookmarks, named pointers to commits';
COMMENT ON COLUMN refs.name IS 'Ref path: heads/agent/session, branches/agent/name, bookmarks/name';
COMMENT ON COLUMN refs.commit_id IS 'Points to a memory (commit) in the DAG';
