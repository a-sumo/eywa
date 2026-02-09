import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useRoomContext } from "../context/RoomContext";
import { supabase, type GlobalInsight } from "../lib/supabase";

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const DOMAIN_COLORS: Record<string, string> = {
  typescript: "var(--aurora-blue)",
  react: "var(--aurora-cyan)",
  testing: "var(--aurora-green)",
  deployment: "var(--aurora-pink)",
  architecture: "var(--aurora-purple)",
  python: "var(--aurora-green)",
  devops: "var(--aurora-pink)",
  database: "var(--aurora-blue)",
  security: "var(--aurora-pink)",
  performance: "var(--aurora-cyan)",
};

function domainColor(tag: string): string {
  return DOMAIN_COLORS[tag.toLowerCase()] ?? "var(--text-muted)";
}

export function GlobalKnowledgeHub() {
  const { slug } = useParams<{ slug: string }>();
  const { room } = useRoomContext();
  const navigate = useNavigate();
  const [insights, setInsights] = useState<GlobalInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [publishText, setPublishText] = useState("");
  const [publishTags, setPublishTags] = useState("");
  const [publishing, setPublishing] = useState(false);

  // Fetch insights
  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("global_insights")
        .select("*")
        .order("ts", { ascending: false })
        .limit(100);
      if (!error && data) setInsights(data);
      setLoading(false);
    }
    load();

    // Realtime subscription
    const channel = supabase
      .channel("global-insights-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "global_insights" },
        (payload) => {
          const row = payload.new as GlobalInsight;
          setInsights((prev) => [row, ...prev]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Filter by domain tag or search text
  const filtered = useMemo(() => {
    if (!filter) return insights;
    const q = filter.toLowerCase();
    return insights.filter(
      (i) =>
        i.insight.toLowerCase().includes(q) ||
        i.domain_tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [insights, filter]);

  // All unique tags
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    insights.forEach((i) => i.domain_tags.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [insights]);

  // Publish insight from the dashboard
  async function handlePublish() {
    if (!publishText.trim() || !room) return;
    setPublishing(true);

    const tags = publishTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    // Hash source for anonymization
    const encoder = new TextEncoder();
    const data = encoder.encode(`${room.id}:dashboard`);
    const hashBuf = await crypto.subtle.digest("SHA-256", data);
    const hashArr = new Uint8Array(hashBuf);
    const sourceHash = Array.from(hashArr)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    await supabase.from("global_insights").insert({
      insight: publishText.trim(),
      domain_tags: tags,
      source_hash: sourceHash,
      room_id: room.id,
      agent: "dashboard",
    });

    setPublishText("");
    setPublishTags("");
    setPublishing(false);
  }

  return (
    <div className="knowledge-hub">
      <div className="knowledge-hub-header">
        <button className="back-btn" onClick={() => navigate(`/r/${slug}`)}>
          &larr; Back
        </button>
        <h2>Global Knowledge Hub</h2>
        <span className="knowledge-hub-count">
          {insights.length} insight{insights.length !== 1 ? "s" : ""} across the
          network
        </span>
      </div>

      {/* Publish form */}
      <div className="knowledge-hub-publish">
        <textarea
          className="eywa-input knowledge-hub-textarea"
          placeholder="Share an insight with the network..."
          value={publishText}
          onChange={(e) => setPublishText(e.target.value)}
          rows={2}
        />
        <div className="knowledge-hub-publish-row">
          <input
            className="eywa-input knowledge-hub-tags-input"
            placeholder="Tags (comma-separated): react, testing, devops..."
            value={publishTags}
            onChange={(e) => setPublishTags(e.target.value)}
          />
          <button
            className="eywa-btn eywa-btn-primary"
            onClick={handlePublish}
            disabled={publishing || !publishText.trim()}
          >
            {publishing ? "Publishing..." : "Publish"}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="knowledge-hub-filters">
        <input
          className="eywa-input"
          placeholder="Search insights..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ flex: 1 }}
        />
        {allTags.length > 0 && (
          <div className="knowledge-hub-tag-bar">
            {allTags.slice(0, 12).map((tag) => (
              <button
                key={tag}
                className={`knowledge-hub-tag-pill ${
                  filter === tag ? "active" : ""
                }`}
                onClick={() => setFilter(filter === tag ? "" : tag)}
                style={
                  {
                    "--tag-color": domainColor(tag),
                  } as React.CSSProperties
                }
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Feed */}
      <div className="knowledge-hub-feed">
        {loading && (
          <div className="knowledge-hub-empty">Loading network...</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="knowledge-hub-empty">
            {filter
              ? "No insights match your search."
              : "No insights yet. Agents can publish with eywa_publish_insight, or use the form above."}
          </div>
        )}
        {filtered.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </div>
  );
}

function InsightCard({ insight }: { insight: GlobalInsight }) {
  const [expanded, setExpanded] = useState(false);
  const text = insight.insight || "";
  const truncateLen = 200;
  const isLong = text.length > truncateLen;

  return (
    <div
      className={`insight-card ${expanded ? "insight-card-expanded" : ""}`}
      onClick={() => { if (isLong) setExpanded(!expanded); }}
      style={isLong ? { cursor: "pointer" } : undefined}
    >
      <div className="insight-card-body">
        {expanded || !isLong ? text : text.slice(0, truncateLen) + "..."}
      </div>
      {isLong && (
        <span className="insight-expand-hint">
          {expanded ? "Show less" : "Show more"}
        </span>
      )}
      <div className="insight-card-meta">
        <div className="insight-card-tags">
          {insight.domain_tags.map((tag) => (
            <span
              key={tag}
              className="insight-tag"
              style={{ color: domainColor(tag) }}
            >
              {tag}
            </span>
          ))}
        </div>
        <span className="insight-card-source">
          source:{insight.source_hash.slice(0, 8)}
        </span>
        <span className="insight-card-time">{timeAgo(insight.ts)}</span>
      </div>
    </div>
  );
}
