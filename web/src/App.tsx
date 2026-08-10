import { useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { supabase, type AgentEvent, type Workspace } from "./lib/supabase";

function Home() {
  const [slug, setSlug] = useState("");
  const navigate = useNavigate();

  return (
    <main className="home shell">
      <p className="eyebrow">Swarmline</p>
      <h1>See how your agents coordinate.</h1>
      <p className="lede">
        A shared event line for agent identity, work claims, messages, actions,
        and containment-boundary observations.
      </p>
      <form
        className="workspace-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (slug.trim()) navigate(`/w/${encodeURIComponent(slug.trim())}`);
        }}
      >
        <label htmlFor="workspace">Open a workspace</label>
        <div>
          <input
            id="workspace"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="workspace-slug"
          />
          <button type="submit">Open</button>
        </div>
      </form>
      <section className="principles">
        <article><strong>Claim</strong><span>Prevent agents from modifying the same scope.</span></article>
        <article><strong>Communicate</strong><span>Keep inter-agent messages visible to humans.</span></article>
        <article><strong>Reconstruct</strong><span>Review one append-only operational timeline.</span></article>
      </section>
    </main>
  );
}

interface Claim {
  agent: string;
  sessionId: string;
  scope: string;
  resources: string[];
  ts: string;
}

function getActiveClaims(events: AgentEvent[], now: number): Claim[] {
  const terminal = new Set<string>();
  const claims: Claim[] = [];
  const cutoff = now - 30 * 60 * 1000;

  for (const event of events) {
    if (new Date(event.ts).getTime() < cutoff) continue;
    const kind = String(event.metadata.event ?? "");
    if (!["claim", "release", "session_stop"].includes(kind)) continue;
    if (terminal.has(event.session_id)) continue;
    terminal.add(event.session_id);
    if (kind !== "claim") continue;
    claims.push({
      agent: event.agent,
      sessionId: event.session_id,
      scope: String(event.metadata.scope ?? event.content),
      resources: Array.isArray(event.metadata.resources)
        ? event.metadata.resources.map(String)
        : [],
      ts: event.ts,
    });
  }
  return claims;
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function WorkspaceView() {
  const { slug = "" } = useParams();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [error, setError] = useState("");
  const [clock, setClock] = useState(0);

  useEffect(() => {
    const tick = () => setClock(Date.now());
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function load() {
      const { data: workspaceData, error: workspaceError } = await supabase
        .from("folds")
        .select("id,slug,name")
        .eq("slug", slug)
        .single();

      if (workspaceError || !workspaceData) {
        setError("Workspace not found");
        return;
      }

      const current = workspaceData as Workspace;
      setWorkspace(current);
      const { data, error: eventsError } = await supabase
        .from("memories")
        .select("id,fold_id,agent,session_id,content,metadata,ts")
        .eq("fold_id", current.id)
        .order("ts", { ascending: false })
        .limit(300);

      if (eventsError) {
        setError(eventsError.message);
        return;
      }
      setEvents((data ?? []) as AgentEvent[]);

      channel = supabase
        .channel(`swarmline-${current.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "memories", filter: `fold_id=eq.${current.id}` },
          (payload) => setEvents((existing) => [payload.new as AgentEvent, ...existing].slice(0, 300)),
        )
        .subscribe();
    }

    load();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [slug]);

  const claims = useMemo(() => getActiveClaims(events, clock), [events, clock]);
  const activeAgents = useMemo(() => {
    const cutoff = clock - 10 * 60 * 1000;
    const seen = new Set<string>();
    const active = new Set<string>();
    for (const event of events) {
      if (seen.has(event.agent)) continue;
      seen.add(event.agent);
      const kind = String(event.metadata.event ?? "");
      if (new Date(event.ts).getTime() >= cutoff && kind !== "session_stop") {
        active.add(event.agent);
      }
    }
    return active;
  }, [events, clock]);

  if (error) return <main className="shell state"><p>{error}</p><Link to="/">Go home</Link></main>;
  if (!workspace) return <main className="shell state"><p>Loading workspace...</p></main>;

  return (
    <main className="shell workspace">
      <header className="workspace-header">
        <div><Link to="/" className="brand">Swarmline</Link><h1>{workspace.name}</h1></div>
        <div className="live"><span />Live</div>
      </header>

      <section className="summary-grid">
        <article><strong>{activeAgents.size}</strong><span>agents seen in 10 minutes</span></article>
        <article><strong>{claims.length}</strong><span>active claims</span></article>
        <article><strong>{events.length}</strong><span>recent events</span></article>
      </section>

      <div className="workspace-grid">
        <aside>
          <h2>Active claims</h2>
          {claims.length === 0 ? <p className="muted">No active claims.</p> : claims.map((claim) => (
            <article className="claim" key={claim.sessionId}>
              <strong>{claim.scope}</strong>
              <span>{claim.agent}</span>
              {claim.resources.map((resource) => <code key={resource}>{resource}</code>)}
            </article>
          ))}
        </aside>

        <section className="timeline">
          <h2>Event line</h2>
          {events.length === 0 ? <p className="muted">No events yet.</p> : events.map((event) => {
            const kind = String(event.metadata.event ?? "event");
            const severity = String(event.metadata.severity ?? "");
            return (
              <article className={`event event-${kind} severity-${severity}`} key={event.id}>
                <div className="event-meta">
                  <span className="event-kind">{kind.replaceAll("_", " ")}</span>
                  <span>{event.agent}</span>
                  <time>{timeLabel(event.ts)}</time>
                </div>
                <p>{event.content}</p>
                {typeof event.metadata.resource === "string" && event.metadata.resource && (
                  <code>{event.metadata.resource}</code>
                )}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}

export default function App() {
  return <Routes><Route path="/" element={<Home />} /><Route path="/w/:slug" element={<WorkspaceView />} /></Routes>;
}
