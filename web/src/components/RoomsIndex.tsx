import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase, type Room } from "../lib/supabase";

interface RoomStats {
  room: Room;
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

export function RoomsIndex() {
  const [rooms, setRooms] = useState<RoomStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: roomList, error: roomErr } = await supabase
      .from("rooms")
      .select("*")
      .order("created_at", { ascending: false });

    if (roomErr || !roomList) {
      setError("Failed to load rooms");
      setLoading(false);
      return;
    }

    // For each room, fetch stats in parallel
    const statsPromises = roomList.map(async (room: Room): Promise<RoomStats> => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      // Parallel queries: unique agents, active agents, memory count, last memory, destination
      const [agentsRes, activeRes, countRes, lastRes, destRes] = await Promise.all([
        // Unique agents (last 24h)
        supabase
          .from("memories")
          .select("agent")
          .eq("room_id", room.id)
          .gte("ts", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .limit(500),
        // Active agents (last 5min)
        supabase
          .from("memories")
          .select("agent")
          .eq("room_id", room.id)
          .gte("ts", fiveMinAgo)
          .limit(200),
        // Total memory count
        supabase
          .from("memories")
          .select("id", { count: "exact", head: true })
          .eq("room_id", room.id),
        // Last activity
        supabase
          .from("memories")
          .select("ts")
          .eq("room_id", room.id)
          .order("ts", { ascending: false })
          .limit(1),
        // Destination
        supabase
          .from("memories")
          .select("metadata")
          .eq("room_id", room.id)
          .eq("message_type", "knowledge")
          .order("ts", { ascending: false })
          .limit(50),
      ]);

      const uniqueAgents = new Set((agentsRes.data || []).map((r: { agent: string }) => r.agent));
      const activeAgents = new Set((activeRes.data || []).map((r: { agent: string }) => r.agent));

      // Extract destination from knowledge memories
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
        room,
        agentCount: uniqueAgents.size,
        activeAgentCount: activeAgents.size,
        memoryCount: countRes.count || 0,
        lastActivity: lastRes.data?.[0]?.ts || null,
        destination,
        milestonesDone,
        milestonesTotal,
      };
    });

    const stats = await Promise.all(statsPromises);
    // Sort: rooms with active agents first, then by last activity
    stats.sort((a, b) => {
      if (a.activeAgentCount !== b.activeAgentCount) return b.activeAgentCount - a.activeAgentCount;
      const aTime = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
      const bTime = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
      return bTime - aTime;
    });

    setRooms(stats);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRooms();
    // Refresh every 30s
    const interval = setInterval(fetchRooms, 30000);
    return () => clearInterval(interval);
  }, [fetchRooms]);

  if (loading) {
    return (
      <div className="rooms-index">
        <div className="rooms-index-header">
          <h1>Rooms</h1>
        </div>
        <div className="rooms-index-loading">Loading rooms...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rooms-index">
        <div className="rooms-index-header">
          <h1>Rooms</h1>
        </div>
        <div className="rooms-index-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="rooms-index">
      <div className="rooms-index-header">
        <h1>Rooms</h1>
        <span className="rooms-index-count">{rooms.length} room{rooms.length !== 1 ? "s" : ""}</span>
      </div>

      {rooms.length === 0 ? (
        <div className="rooms-index-empty">
          <p>No rooms yet. Create one from the landing page or via the CLI.</p>
          <Link to="/" className="rooms-index-cta">Go to Landing</Link>
        </div>
      ) : (
        <div className="rooms-index-grid">
          {rooms.map((rs) => (
            <Link
              key={rs.room.id}
              to={`/r/${rs.room.slug}`}
              className={`rooms-index-card ${rs.activeAgentCount > 0 ? "rooms-index-card-active" : ""}`}
            >
              <div className="rooms-index-card-top">
                <div className="rooms-index-card-name">
                  {rs.room.name}
                  {rs.activeAgentCount > 0 && (
                    <span className="rooms-index-live-dot" />
                  )}
                </div>
                <span className="rooms-index-card-slug">/{rs.room.slug}</span>
              </div>

              {rs.destination && (
                <div className="rooms-index-card-destination">
                  <span className="rooms-index-card-dest-label">Destination</span>
                  <span className="rooms-index-card-dest-text">
                    {rs.destination.length > 80
                      ? rs.destination.slice(0, 80) + "..."
                      : rs.destination}
                  </span>
                  {rs.milestonesTotal > 0 && (
                    <div className="rooms-index-card-progress">
                      <div
                        className="rooms-index-card-progress-bar"
                        style={{ width: `${(rs.milestonesDone / rs.milestonesTotal) * 100}%` }}
                      />
                      <span className="rooms-index-card-progress-label">
                        {rs.milestonesDone}/{rs.milestonesTotal} milestones
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="rooms-index-card-stats">
                <div className="rooms-index-stat">
                  <span className="rooms-index-stat-value">
                    {rs.activeAgentCount > 0 ? (
                      <>{rs.activeAgentCount} <span className="rooms-index-stat-active">active</span></>
                    ) : (
                      rs.agentCount
                    )}
                  </span>
                  <span className="rooms-index-stat-label">
                    {rs.activeAgentCount > 0 ? `of ${rs.agentCount} agents` : "agents (24h)"}
                  </span>
                </div>
                <div className="rooms-index-stat">
                  <span className="rooms-index-stat-value">{rs.memoryCount.toLocaleString()}</span>
                  <span className="rooms-index-stat-label">memories</span>
                </div>
                <div className="rooms-index-stat">
                  <span className="rooms-index-stat-value">
                    {rs.lastActivity ? timeAgo(rs.lastActivity) : "no activity"}
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
