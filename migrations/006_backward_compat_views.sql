-- Migration 006: Backward-compatible aliases for frozen deployments
--
-- The hackathon snapshot (060a6dc, Feb 10) queries "rooms" table with room_id columns.
-- After migration 005 renamed rooms→folds and room_id→fold_id, frozen deploys break.
-- This migration adds backward-compat layers so old code keeps working:
--   1. A "rooms" view over the "folds" table
--   2. Generated "room_id" columns on tables that had room_id→fold_id renamed
--
-- Why this matters: frozen deployments are living proof of agent-built infrastructure
-- at successive points in time. Breaking them destroys the historical record.
--
-- Idempotent: safe to re-run.

-- 1. "rooms" view over "folds" table
DROP VIEW IF EXISTS rooms;
CREATE VIEW rooms AS
SELECT id, slug, name, created_by, is_demo, secret, created_at
FROM folds;

-- Allow inserts through the view (old CLIAuth code does .from("rooms").insert(...))
CREATE OR REPLACE RULE rooms_insert AS ON INSERT TO rooms
DO INSTEAD
INSERT INTO folds (slug, name, created_by, is_demo)
VALUES (NEW.slug, NEW.name, NEW.created_by, NEW.is_demo)
RETURNING *;

-- 2. Generated room_id columns that mirror fold_id (reads + realtime filters work)
DO $$ BEGIN
  ALTER TABLE memories ADD COLUMN room_id UUID GENERATED ALWAYS AS (fold_id) STORED;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE messages ADD COLUMN room_id UUID GENERATED ALWAYS AS (fold_id) STORED;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE links ADD COLUMN room_id UUID GENERATED ALWAYS AS (fold_id) STORED;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE global_insights ADD COLUMN room_id UUID GENERATED ALWAYS AS (fold_id) STORED;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Grant RLS access to the rooms view (inherits folds policies via underlying table)
-- PostgREST needs SELECT on the view
GRANT SELECT ON rooms TO anon, authenticated;
