-- Migration 005: Rename rooms → folds, add secret tokens, clean up stale folds
-- Idempotent: safe to re-run if partially applied

-- Rename table (skip if already done)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rooms' AND table_schema = 'public') THEN
    ALTER TABLE rooms RENAME TO folds;
  END IF;
END $$;

-- Rename FK columns (skip if already renamed)
DO $$ BEGIN ALTER TABLE memories RENAME COLUMN room_id TO fold_id; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE messages RENAME COLUMN room_id TO fold_id; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE links RENAME COLUMN room_id TO fold_id; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE global_insights RENAME COLUMN room_id TO fold_id; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE refs RENAME COLUMN room_id TO fold_id; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Add secret token column (skip if already exists)
DO $$ BEGIN
  ALTER TABLE folds ADD COLUMN secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex');
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Demo folds are public (no secret needed)
UPDATE folds SET secret = 'public' WHERE is_demo = true OR slug = 'demo';

-- Replace clone function
DROP FUNCTION IF EXISTS clone_demo_room(TEXT, TEXT);
CREATE OR REPLACE FUNCTION clone_demo_fold(source_slug TEXT, new_slug TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE src_id UUID; new_id UUID;
BEGIN
  SELECT id INTO src_id FROM folds WHERE slug = source_slug;
  IF src_id IS NULL THEN RAISE EXCEPTION 'Source fold not found: %', source_slug; END IF;
  INSERT INTO folds (slug, name, created_by, is_demo, secret)
  VALUES (new_slug, 'Demo Fold', 'demo', true, 'public')
  RETURNING id INTO new_id;
  INSERT INTO memories (fold_id, agent, session_id, message_type, content, token_count, metadata, ts)
  SELECT new_id, agent, session_id, message_type, content, token_count, metadata, ts
  FROM memories WHERE fold_id = src_id ORDER BY ts ASC LIMIT 500;
  RETURN new_id;
END; $$;

-- Cleanup: delete everything except demo and eywa-dev
DELETE FROM memories WHERE fold_id IN (SELECT id FROM folds WHERE slug NOT IN ('demo', 'eywa-dev'));
DELETE FROM messages WHERE fold_id IN (SELECT id FROM folds WHERE slug NOT IN ('demo', 'eywa-dev'));
DELETE FROM links WHERE fold_id IN (SELECT id FROM folds WHERE slug NOT IN ('demo', 'eywa-dev'));
DELETE FROM global_insights WHERE fold_id IN (SELECT id FROM folds WHERE slug NOT IN ('demo', 'eywa-dev'));
DELETE FROM folds WHERE slug NOT IN ('demo', 'eywa-dev');
