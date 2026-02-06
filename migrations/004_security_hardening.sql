-- Eywa: Security hardening
-- Run this in Supabase SQL Editor AFTER:
--   1. Getting your anon key from Settings > API
--   2. Updating web/.env with the anon key
--   3. Deploying the updated web app
--
-- This ensures RLS is enabled and policies are correct.
-- If you already ran 001_rls_policies.sql, this is a no-op safety check.

-- ============================================
-- ENABLE RLS (idempotent)
-- ============================================
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE links ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Verify policies exist (these will error if already created, which is fine)
-- ============================================

-- Rooms: anyone can read + create
DO $$ BEGIN
  CREATE POLICY "rooms_select_all" ON rooms FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "rooms_insert_all" ON rooms FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Memories: anyone can read, only service_role can write
DO $$ BEGIN
  CREATE POLICY "memories_select_all" ON memories FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Messages: anyone can read + write (team chat)
DO $$ BEGIN
  CREATE POLICY "messages_select_all" ON messages FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "messages_insert_all" ON messages FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Links: anyone can read + create, delete restricted to service_role
-- Drop the overly permissive delete policy if it exists
DROP POLICY IF EXISTS "links_delete_own" ON links;

DO $$ BEGIN
  CREATE POLICY "links_select_all" ON links FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "links_insert_all" ON links FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- No DELETE policy for anon = only service_role can delete links
