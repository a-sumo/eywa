import { useParams, useNavigate } from "react-router-dom";
import { useRealtimeMemories } from "../hooks/useRealtimeMemories";
import { useRoomContext } from "../context/RoomContext";
import { MemoryCard } from "./MemoryCard";

function agentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 60%)`;
}

function formatDuration(ms: number): string {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hours}h ${remainMins}m`;
}

export function ThreadView() {
  const { slug, agent, sessionId } = useParams<{
    slug: string;
    agent: string;
    sessionId: string;
  }>();
  const { room } = useRoomContext();
  const navigate = useNavigate();
  const { memories, loading } = useRealtimeMemories(room?.id ?? null, 500);

  const threadMemories = memories
    .filter((m) => m.agent === agent && m.session_id === sessionId)
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  const firstTs = threadMemories[0]
    ? new Date(threadMemories[0].ts).getTime()
    : 0;
  const lastTs = threadMemories[threadMemories.length - 1]
    ? new Date(threadMemories[threadMemories.length - 1].ts).getTime()
    : 0;
  const duration = lastTs - firstTs;

  const startEvent = threadMemories.find(
    (m) => (m.metadata as Record<string, unknown>)?.event === "session_start"
  );
  const task = startEvent
    ? String((startEvent.metadata as Record<string, unknown>)?.task || "")
    : "";

  return (
    <div className="thread-view">
      <div className="thread-view-header">
        <button className="back-btn" onClick={() => navigate(`/r/${slug}`)}>
          &larr; Back
        </button>
        <div className="thread-view-info">
          <h2 style={{ color: agentColor(agent || "") }}>{agent}</h2>
          <span className="thread-view-meta">
            {threadMemories.length} memories &middot; {formatDuration(duration)}
          </span>
        </div>
        <button
          className="btn-remix-from-thread"
          onClick={() =>
            navigate(`/r/${slug}/remix/new`, {
              state: { seedThread: { agent, sessionId } },
            })
          }
        >
          Remix this thread
        </button>
      </div>

      {task && <p className="thread-view-task">{task}</p>}

      {loading && <div className="feed-loading">Loading...</div>}

      <div className="feed">
        {threadMemories.map((m) => (
          <MemoryCard
            key={m.id}
            memory={m}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(
                "application/neuralmesh-memory",
                JSON.stringify({ id: m.id })
              );
              e.dataTransfer.effectAllowed = "copy";
            }}
          />
        ))}
        {!loading && threadMemories.length === 0 && (
          <p className="empty">No memories in this thread.</p>
        )}
      </div>
    </div>
  );
}
