import { useParams, useNavigate } from "react-router-dom";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useRoomContext } from "../context/RoomContext";
import { MemoryCard } from "./MemoryCard";
import type { Memory } from "../lib/supabase";

export function AgentDetail() {
  const { name, slug } = useParams<{ name: string; slug: string }>();
  const { room } = useRoomContext();
  const navigate = useNavigate();
  const { memories, loading } = useRealtimeMemories(room?.id ?? null, 200);

  // Match by exact agent name or by user prefix (e.g. "armand" matches "armand-a3f2")
  const filtered = memories.filter((m) => {
    if (m.agent === name) return true;
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    if (meta.user === name) return true;
    // Fallback: strip -xxxx suffix and compare
    return m.agent.replace(/-[a-f0-9]{4}$/, "") === name;
  });

  const handlePull = (memory: Memory) => {
    navigator.clipboard.writeText(
      `Use remix_pull("${memory.agent}") to pull this context`
    );
    alert("Copied pull command to clipboard!");
  };

  return (
    <div className="agent-detail">
      <div className="agent-detail-header">
        <button className="back-btn" onClick={() => navigate(`/r/${slug}`)}>
          &larr; Back
        </button>
        <h2>{name}</h2>
      </div>
      {loading && <div className="feed-loading">Loading...</div>}
      <div className="feed">
        {filtered.map((m) => (
          <MemoryCard key={m.id} memory={m} onPull={handlePull} />
        ))}
        {!loading && filtered.length === 0 && (
          <p className="empty">No activity from {name} yet.</p>
        )}
      </div>
    </div>
  );
}
