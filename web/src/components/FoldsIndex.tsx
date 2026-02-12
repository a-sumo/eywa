import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase, type Fold } from "../lib/supabase";

interface FoldStats {
  fold: Fold;
  agentCount: number;
  activeAgentCount: number;
  memoryCount: number;
  lastActivity: string | null;
  destination: string | null;
  milestonesDone: number;
  milestonesTotal: number;
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function FoldsIndex() {
  const [folds, setFolds] = useState<FoldStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFolds = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: foldList, error: foldErr } = await supabase
      .from("folds")
      .select("*")
      .order("created_at", { ascending: false });

    if (foldErr || !foldList) {
      setError("Failed to load folds");
      setLoading(false);
      return;
    }

    // For each fold, fetch stats in parallel. Use try-catch per fold so one
    // failing query doesn't crash the entire page.
    const statsPromises = foldList.map(async (fold: Fold): Promise<FoldStats> => {
      try {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

        const [agentsRes, activeRes, countRes, lastRes, destRes] = await Promise.all([
          supabase
            .from("memories")
            .select("agent")
            .eq("fold_id", fold.id)
            .gte("ts", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .limit(500),
          supabase
            .from("memories")
            .select("agent")
            .eq("fold_id", fold.id)
            .gte("ts", fiveMinAgo)
            .limit(200),
          supabase
            .from("memories")
            .select("id", { count: "exact", head: true })
            .eq("fold_id", fold.id),
          supabase
            .from("memories")
            .select("ts")
            .eq("fold_id", fold.id)
            .order("ts", { ascending: false })
            .limit(1),
          supabase
            .from("memories")
            .select("metadata")
            .eq("fold_id", fold.id)
            .eq("message_type", "knowledge")
            .order("ts", { ascending: false })
            .limit(50),
        ]);

        const uniqueAgents = new Set((agentsRes.data || []).map((r: { agent: string }) => r.agent));
        const activeAgents = new Set((activeRes.data || []).map((r: { agent: string }) => r.agent));

        let destination: string | null = null;
        let milestonesDone = 0;
        let milestonesTotal = 0;
        for (const m of destRes.data || []) {
          const meta = (m.metadata ?? {}) as Record<string, unknown>;
          if (meta.event === "destination") {
            destination = (meta.destination as string) || null;
            const milestones = (meta.milestones as string[]) || [];
            const progress = (meta.progress as Record<string, boolean>) || {};
            milestonesTotal = milestones.length;
            milestonesDone = milestones.filter((ms) => progress[ms]).length;
            break;
          }
        }

        return {
          fold,
          agentCount: uniqueAgents.size,
          activeAgentCount: activeAgents.size,
          memoryCount: countRes.count || 0,
          lastActivity: lastRes.data?.[0]?.ts || null,
          destination,
          milestonesDone,
          milestonesTotal,
        };
      } catch {
        // Return safe defaults so the fold still shows up
        return {
          fold,
          agentCount: 0,
          activeAgentCount: 0,
          memoryCount: 0,
          lastActivity: null,
          destination: null,
          milestonesDone: 0,
          milestonesTotal: 0,
        };
      }
    });

    const stats = await Promise.all(statsPromises);
    // Sort: folds with active agents first, then by last activity
    stats.sort((a, b) => {
      if (a.activeAgentCount !== b.activeAgentCount) return b.activeAgentCount - a.activeAgentCount;
      const aTime = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
      const bTime = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
      return bTime - aTime;
    });

    setFolds(stats);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFolds();
    // Refresh every 30s
    const interval = setInterval(fetchFolds, 30000);
    return () => clearInterval(interval);
  }, [fetchFolds]);

  if (loading) {
    return (
      <div className="rooms-index">
        <div className="rooms-index-header">
          <h1>Folds</h1>
        </div>
        <div className="rooms-index-loading">Loading folds...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rooms-index">
        <div className="rooms-index-header">
          <h1>Folds</h1>
        </div>
        <div className="rooms-index-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="rooms-index">
      <div className="rooms-index-header">
        <h1>Folds</h1>
        <span className="rooms-index-count">{folds.length} fold{folds.length !== 1 ? "s" : ""}</span>
      </div>

      {folds.length === 0 ? (
        <div className="rooms-index-empty">
          <p>No folds yet. Create one from the landing page or via the CLI.</p>
          <Link to="/" className="rooms-index-cta">Go to Landing</Link>
        </div>
      ) : (
        <div className="rooms-index-grid">
          {folds.map((fs) => (
            <Link
              key={fs.fold.id}
              to={`/f/${fs.fold.slug}`}
              className={`rooms-index-card ${fs.activeAgentCount > 0 ? "rooms-index-card-active" : ""}`}
            >
              <div className="rooms-index-card-top">
                <div className="rooms-index-card-name">
                  {fs.fold.name}
                  {fs.activeAgentCount > 0 && (
                    <span className="rooms-index-live-dot" />
                  )}
                </div>
                <span className="rooms-index-card-slug">/{fs.fold.slug}</span>
              </div>

              {fs.destination && (
                <div className="rooms-index-card-destination">
                  <span className="rooms-index-card-dest-label">Destination</span>
                  <span className="rooms-index-card-dest-text">
                    {fs.destination.length > 80
                      ? fs.destination.slice(0, 80) + "..."
                      : fs.destination}
                  </span>
                  {fs.milestonesTotal > 0 && (
                    <div className="rooms-index-card-progress">
                      <div
                        className="rooms-index-card-progress-bar"
                        style={{ width: `${(fs.milestonesDone / fs.milestonesTotal) * 100}%` }}
                      />
                      <span className="rooms-index-card-progress-label">
                        {fs.milestonesDone}/{fs.milestonesTotal} milestones
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="rooms-index-card-stats">
                <div className="rooms-index-stat">
                  <span className="rooms-index-stat-value">
                    {fs.activeAgentCount > 0 ? (
                      <>{fs.activeAgentCount} <span className="rooms-index-stat-active">active</span></>
                    ) : (
                      fs.agentCount
                    )}
                  </span>
                  <span className="rooms-index-stat-label">
                    {fs.activeAgentCount > 0 ? `of ${fs.agentCount} agents` : "agents (24h)"}
                  </span>
                </div>
                <div className="rooms-index-stat">
                  <span className="rooms-index-stat-value">{fs.memoryCount.toLocaleString()}</span>
                  <span className="rooms-index-stat-label">memories</span>
                </div>
                <div className="rooms-index-stat">
                  <span className="rooms-index-stat-value">
                    {fs.lastActivity ? timeAgo(fs.lastActivity) : "no activity"}
                  </span>
                  <span className="rooms-index-stat-label">last seen</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
