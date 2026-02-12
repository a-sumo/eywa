import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useFoldContext } from "../context/FoldContext";
import { supabase, type Memory } from "../lib/supabase";
import { GlobalKnowledgeHub } from "./GlobalKnowledgeHub";

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const TAG_COLORS: Record<string, string> = {
  architecture: "var(--aurora-purple)",
  convention: "var(--aurora-blue)",
  gotcha: "var(--aurora-pink)",
  api: "var(--aurora-cyan)",
  pattern: "var(--aurora-green)",
  seeds: "var(--aurora-green)",
  debugging: "var(--aurora-pink)",
  workflow: "var(--aurora-blue)",
  priorities: "var(--aurora-purple)",
};

function tagColor(tag: string): string {
  return TAG_COLORS[tag.toLowerCase()] ?? "var(--text-muted)";
}

export function KnowledgePage() {
  const [tab, setTab] = useState<"fold" | "network">("fold");

  return (
    <div className="knowledge-page">
      <div className="knowledge-page-tabs">
        <button
          className={`knowledge-page-tab ${tab === "fold" ? "active" : ""}`}
          onClick={() => setTab("fold")}
        >
          Fold Knowledge
        </button>
        <button
          className={`knowledge-page-tab ${tab === "network" ? "active" : ""}`}
          onClick={() => setTab("network")}
        >
          Network Insights
        </button>
      </div>
      {tab === "fold" ? <RoomKnowledge /> : <GlobalKnowledgeHub />}
    </div>
  );
}

function RoomKnowledge() {
  const { slug } = useParams<{ slug: string }>();
  const { fold } = useFoldContext();
  const [entries, setEntries] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!fold) return;

    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("memories")
        .select("*")
        .eq("fold_id", fold!.id)
        .eq("message_type", "knowledge")
        .order("ts", { ascending: false })
        .limit(200);
      if (!error && data) setEntries(data as Memory[]);
      setLoading(false);
    }
    load();

    const channel = supabase
      .channel(`room-knowledge-${fold.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "memories",
          filter: `fold_id=eq.${fold.id}`,
        },
        (payload) => {
          const row = payload.new as Memory;
          if (row.message_type === "knowledge") {
            setEntries((prev) => [row, ...prev]);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "memories",
          filter: `fold_id=eq.${fold.id}`,
        },
        (payload) => {
          const oldRow = payload.old as { id?: string };
          if (oldRow.id) {
            setEntries((prev) => prev.filter((e) => e.id !== oldRow.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fold]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    entries.forEach((e) => {
      const meta = e.metadata as Record<string, unknown>;
      const t = (meta.tags as string[]) ?? [];
      t.forEach((tag) => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    if (!filter) return entries;
    const q = filter.toLowerCase();
    return entries.filter((e) => {
      const meta = e.metadata as Record<string, unknown>;
      const tags = (meta.tags as string[]) ?? [];
      const title = (meta.title as string) ?? "";
      return (
        e.content.toLowerCase().includes(q) ||
        title.toLowerCase().includes(q) ||
        tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [entries, filter]);

  async function handleDelete(id: string) {
    setDeleting(id);
    await supabase
      .from("memories")
      .delete()
      .eq("id", id)
      .eq("message_type", "knowledge");
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setDeleting(null);
  }

  return (
    <div className="room-knowledge">
      <div className="room-knowledge-header">
        <h2>Fold Knowledge</h2>
        <span className="knowledge-hub-count">
          {entries.length} entr{entries.length !== 1 ? "ies" : "y"} stored by
          agents
        </span>
      </div>

      <p className="room-knowledge-desc">
        Architecture decisions, conventions, gotchas, and patterns stored by
        agents via <code>eywa_learn</code>. This is the fold's persistent
        memory.
      </p>

      <div className="knowledge-hub-filters">
        <input
          className="eywa-input"
          placeholder="Search knowledge..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ flex: 1 }}
        />
        {allTags.length > 0 && (
          <div className="knowledge-hub-tag-bar">
            {allTags.map((tag) => (
              <button
                key={tag}
                className={`knowledge-hub-tag-pill ${filter === tag ? "active" : ""}`}
                onClick={() => setFilter(filter === tag ? "" : tag)}
                style={{ "--tag-color": tagColor(tag) } as React.CSSProperties}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="knowledge-hub-feed">
        {loading && (
          <div className="knowledge-hub-empty">Loading knowledge...</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="knowledge-hub-empty">
            {filter
              ? "No knowledge entries match your search."
              : "No knowledge stored yet. Agents can use eywa_learn to store architecture decisions, conventions, and patterns."}
          </div>
        )}
        {filtered.map((entry) => (
          <KnowledgeCard
            key={entry.id}
            entry={entry}
            onDelete={handleDelete}
            deleting={deleting === entry.id}
          />
        ))}
      </div>
    </div>
  );
}

function KnowledgeCard({
  entry,
  onDelete,
  deleting,
}: {
  entry: Memory;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const meta = entry.metadata as Record<string, unknown>;
  const tags = (meta.tags as string[]) ?? [];
  const title = (meta.title as string) ?? null;
  const storedBy = (meta.stored_by as string) ?? entry.agent;

  // Strip the [title] prefix from content if present
  const rawContent = entry.content ?? "";
  const content = title
    ? rawContent.replace(new RegExp(`^\\[${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\s*`), "")
    : rawContent;

  const truncateLen = 300;
  const isLong = content.length > truncateLen;

  return (
    <div className={`insight-card ${expanded ? "insight-card-expanded" : ""}`}>
      {title && <div className="knowledge-card-title">{title}</div>}
      <div
        className="insight-card-body"
        onClick={() => {
          if (isLong) setExpanded(!expanded);
        }}
        style={isLong ? { cursor: "pointer" } : undefined}
      >
        {expanded || !isLong ? content : content.slice(0, truncateLen) + "..."}
      </div>
      {isLong && (
        <span className="insight-expand-hint">
          {expanded ? "Show less" : "Show more"}
        </span>
      )}
      <div className="insight-card-meta">
        <div className="insight-card-tags">
          {tags.map((tag) => (
            <span
              key={tag}
              className="insight-tag"
              style={{ color: tagColor(tag) }}
            >
              {tag}
            </span>
          ))}
        </div>
        <span className="knowledge-card-agent">{storedBy}</span>
        <span className="insight-card-time">{timeAgo(entry.ts)}</span>
        <span className="knowledge-card-actions">
          {confirmDelete ? (
            <>
              <button
                className="knowledge-delete-confirm"
                onClick={() => onDelete(entry.id)}
                disabled={deleting}
              >
                {deleting ? "..." : "Yes, delete"}
              </button>
              <button
                className="knowledge-delete-cancel"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              className="knowledge-delete-btn"
              onClick={() => setConfirmDelete(true)}
              title="Delete this knowledge entry"
            >
              &times;
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
