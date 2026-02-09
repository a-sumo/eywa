-- Global Knowledge Hub: cross-room anonymized insights
CREATE TABLE IF NOT EXISTS global_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insight TEXT NOT NULL,
  domain_tags TEXT[] DEFAULT '{}',
  source_hash TEXT NOT NULL,
  room_id UUID REFERENCES rooms(id),
  agent TEXT,
  upvotes INTEGER DEFAULT 0,
  ts TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_global_insights_ts ON global_insights(ts DESC);
CREATE INDEX IF NOT EXISTS idx_global_insights_domain ON global_insights USING GIN(domain_tags);
CREATE INDEX IF NOT EXISTS idx_global_insights_source ON global_insights(source_hash);
