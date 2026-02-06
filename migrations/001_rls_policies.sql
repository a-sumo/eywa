-- Eywa: Row Level Security policies
-- Run this in Supabase SQL Editor AFTER switching web to the anon key.
--
-- Policy design:
--   anon role (web dashboard, CLI with anon key):
--     - Can SELECT everything (rooms, memories, messages)
--     - Can INSERT rooms (room creation from landing page)
--     - Can INSERT messages (team chat)
--     - CANNOT insert/update/delete memories (only the worker can)
--
--   service_role (worker, CLI with service key):
--     - Bypasses RLS entirely (full access)

-- ============================================
-- ROOMS
-- ============================================
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

-- Anyone can read rooms
CREATE POLICY "rooms_select_all"
  ON rooms FOR SELECT
  USING (true);

-- Anyone can create rooms
CREATE POLICY "rooms_insert_all"
  ON rooms FOR INSERT
  WITH CHECK (true);

-- ============================================
-- MEMORIES
-- ============================================
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

-- Anyone can read memories (the whole point of the dashboard)
CREATE POLICY "memories_select_all"
  ON memories FOR SELECT
  USING (true);

-- Only service_role can write memories (worker writes, not web client)
-- The anon role will get denied on INSERT/UPDATE/DELETE.
-- service_role bypasses RLS automatically.

-- ============================================
-- MESSAGES
-- ============================================
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Anyone can read messages
CREATE POLICY "messages_select_all"
  ON messages FOR SELECT
  USING (true);

-- Anyone can send messages (team chat from web)
CREATE POLICY "messages_insert_all"
  ON messages FOR INSERT
  WITH CHECK (true);

-- ============================================
-- INDEX for new message types
-- ============================================
CREATE INDEX IF NOT EXISTS idx_memories_message_type ON memories(message_type);
CREATE INDEX IF NOT EXISTS idx_memories_metadata_event ON memories((metadata->>'event'));
