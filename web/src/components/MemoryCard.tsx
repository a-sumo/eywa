import { useState } from "react";
import type { Memory } from "../lib/supabase";

function agentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleString();
}

function badgeClass(type: string): string {
  switch (type) {
    case "user":
      return "badge-user";
    case "assistant":
      return "badge-assistant";
    case "tool_call":
    case "tool_result":
      return "badge-tool";
    case "resource":
      return "badge-resource";
    default:
      return "";
  }
}

interface MemoryCardProps {
  memory: Memory;
  onPull?: (memory: Memory) => void;
  compact?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}

export function MemoryCard({
  memory,
  onPull,
  compact,
  draggable: isDraggable,
  onDragStart,
}: MemoryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const content = memory.content || "";
  const truncateLen = compact ? 120 : 300;
  const isLong = content.length > truncateLen;

  return (
    <div
      className={`memory-card ${expanded ? "memory-card-expanded" : ""} ${compact ? "memory-card-compact" : ""} ${isDraggable ? "memory-card-draggable" : ""}`}
      onClick={() => {
        if (compact && onPull) {
          onPull(memory);
        } else if (!compact) {
          setExpanded(!expanded);
        }
      }}
      draggable={isDraggable}
      onDragStart={(e) => {
        if (onDragStart) {
          onDragStart(e);
        } else if (isDraggable) {
          e.dataTransfer.setData(
            "application/neuralmesh-memory",
            JSON.stringify({ id: memory.id })
          );
          e.dataTransfer.effectAllowed = "copy";
        }
      }}
    >
      {isDraggable && <span className="drag-handle">&#8801;</span>}
      <div className="memory-card-body">
        <div className="memory-header">
          <span
            className="agent-tag"
            style={{ color: agentColor(memory.agent) }}
          >
            {memory.agent}
          </span>
          <span className={`badge ${badgeClass(memory.message_type)}`}>
            {memory.message_type}
          </span>
          {!compact && (
            <span className="memory-time">{formatTime(memory.ts)}</span>
          )}
          {compact && onPull && (
            <span className="memory-time" style={{ cursor: "pointer" }}>+</span>
          )}
        </div>
        <div className="memory-content">
          <pre>
            {expanded || !isLong
              ? content
              : content.slice(0, truncateLen) + "..."}
          </pre>
        </div>
        {!compact &&
          memory.metadata &&
          Object.keys(memory.metadata).length > 0 && (
            <div className="memory-metadata">
              {"file_id" in memory.metadata && memory.metadata.file_id ? (
                <span className="file-tag">
                  {String(memory.metadata.path)}
                </span>
              ) : null}
              {"event" in memory.metadata && memory.metadata.event ? (
                <span className="event-tag">
                  {String(memory.metadata.event)}
                </span>
              ) : null}
            </div>
          )}
        {expanded && onPull && (
          <div className="memory-actions">
            <button
              className="pull-btn"
              onClick={(e) => {
                e.stopPropagation();
                onPull(memory);
              }}
            >
              Pull into session
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
