import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useRoomContext } from "../context/RoomContext";
import { MemoryCard } from "./MemoryCard";

export function Feed({ agentFilter }: { agentFilter: string | null }) {
  const { room } = useRoomContext();
  const { memories, loading } = useRealtimeMemories(room?.id ?? null, 100);

  const filtered = agentFilter
    ? memories.filter((m) => m.agent === agentFilter)
    : memories;

  if (loading) return <div className="feed-loading">Loading...</div>;

  return (
    <div className="feed">
      {filtered.map((m) => (
        <MemoryCard key={m.id} memory={m} />
      ))}
      {filtered.length === 0 && (
        <p className="empty">No activity{agentFilter ? ` from ${agentFilter}` : ""} yet.</p>
      )}
    </div>
  );
}
