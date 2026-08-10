CREATE TABLE IF NOT EXISTS folds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL CHECK (slug ~ '^[A-Za-z0-9_-]{1,64}$'),
  name TEXT NOT NULL,
  secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fold_id UUID NOT NULL REFERENCES folds(id) ON DELETE CASCADE,
  agent TEXT NOT NULL,
  session_id TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'event',
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memories_fold_ts ON memories(fold_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_memories_session_ts ON memories(session_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_memories_event ON memories((metadata->>'event'));

ALTER TABLE folds ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public workspace metadata is readable"
  ON folds FOR SELECT USING (true);

CREATE POLICY "Public event lines are readable"
  ON memories FOR SELECT USING (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'memories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE memories;
  END IF;
END $$;
