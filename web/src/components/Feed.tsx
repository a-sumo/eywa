import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useFoldContext } from "../context/FoldContext";
import { MemoryCard } from "./MemoryCard";

export function Feed({ agentFilter }: { agentFilter: string | null }) {
  const { fold } = useFoldContext();
  const { memories, loading, error } = useRealtimeMemories(fold?.id ?? null, 100);

  const filtered = agentFilter
    ? memories.filter((m) => m.agent === agentFilter)
    : memories;

  if (loading) return <div className="feed-loading">Loading...</div>;
  if (error) return <div className="feed-loading" style={{ color: "var(--error)" }}>Failed to load activity: {error}</div>;

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
