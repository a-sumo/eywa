import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { slidesData, type Slide } from "./slidesData";
import "./SlidePresentation.css";

// ── Diagram renderers ────────────────────────────────────

function ThreeViewsDiagram() {
  const views = [
    {
      icon: "\ud83d\udcdc",
      title: "Overview",
      color: "var(--color-accent-secondary)",
      bg: "var(--color-fill)",
      border: "var(--color-border)",
      body: (
        <>
          Tree of all active threads.
          <br />
          Who's working on what.
          <br />
          Duration, memory count, status.
          <br />
          <strong className="text-error">Divergence alerts</strong> when threads
          go different directions.
        </>
      ),
    },
    {
      icon: "\ud83d\udcc4",
      title: "Thread View",
      color: "var(--success)",
      bg: "#f0fff4",
      border: "rgba(72, 150, 100, 0.3)",
      body: (
        <>
          Full conversation history.
          <br />
          Each memory is a <strong>draggable card</strong>.
          <br />
          Select specific decisions, code, context.
          <br />
          Drag into a Remix.
        </>
      ),
    },
    {
      icon: "\ud83d\udd00",
      title: "Remix",
      color: "var(--color-accent)",
      bg: "var(--color-card)",
      border: "var(--color-border)",
      body: (
        <>
          3-panel workspace.
          <br />
          Browse memories \u2192 Build context \u2192{" "}
          <strong>Chat with Gemini</strong>.
          <br />
          Git-like history — rewind, fork, branch.
          <br />
          The output becomes a new thread.
        </>
      ),
    },
  ];

  return (
    <div className="dia-cards">
      {views.map((v) => (
        <div
          key={v.title}
          className="dia-card"
          style={{
            background: `linear-gradient(135deg, #fff 0%, ${v.bg} 100%)`,
            borderColor: v.border,
          }}
        >
          <div className="dia-card-icon">{v.icon}</div>
          <div className="dia-card-title" style={{ color: v.color }}>
            {v.title}
          </div>
          <div className="dia-card-body">{v.body}</div>
        </div>
      ))}
    </div>
  );
}

function TheRemixDiagram() {
  return (
    <div className="dia-remix-grid">
      <div className="dia-remix-panel">
        <div className="dia-panel-label">Browse</div>
        <div className="dia-agent-list">
          {[
            { name: "Sarah", color: "var(--color-accent-secondary)", mem: 12, detail: "hand tracking, Unity..." },
            { name: "Marco", color: "var(--success)", mem: 8, detail: "TTS eval, API..." },
            { name: "Priya", color: "var(--warning)", mem: 5, detail: "UI layout, captions..." },
          ].map((a) => (
            <div key={a.name} className="dia-agent-row" style={{ borderLeftColor: a.color }}>
              <strong style={{ color: a.color }}>{a.name}</strong>
              <span className="dia-agent-meta">{a.mem} mem</span>
              <br />
              <span className="dia-agent-detail">{a.detail}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="dia-remix-panel dia-remix-context">
        <div className="dia-panel-label">Context</div>
        <div className="dia-context-placeholder">
          \u2190 Drag memories here
          <br />
          <span className="text-muted">or click + to add</span>
        </div>
        <div className="dia-context-version">v0 — Start</div>
      </div>
      <div className="dia-remix-panel dia-remix-agent">
        <div className="dia-panel-label-row">
          <div className="dia-panel-label" style={{ color: "var(--color-accent-secondary)" }}>
            Gemini Agent
          </div>
          <span className="dia-live-badge">Live</span>
        </div>
        <div className="dia-chat-preview">
          <div className="dia-chat-role">YOU</div>
          <div>How should I integrate the hand tracking with the TTS pipeline?</div>
          <div className="dia-chat-role" style={{ marginTop: 8 }}>GEMINI</div>
          <div style={{ color: "var(--success)" }}>
            Based on Sarah's wrist anchoring and Marco's ElevenLabs choice...
          </div>
        </div>
      </div>
    </div>
  );
}

function DivergenceDiagram() {
  return (
    <div className="dia-divergence">
      <div className="dia-divergence-threads">
        <div className="dia-thread-card">
          <div className="dia-thread-header">
            <span className="dia-dot" style={{ background: "var(--color-accent-secondary)" }} />
            <strong style={{ color: "var(--color-accent-secondary)" }}>Sarah's Thread</strong>
          </div>
          <div className="dia-thread-body">
            Exploring <strong>wrist anchoring</strong> for hand tracking.
            <br />
            MediaPipe \u2192 custom pipeline.
          </div>
        </div>
        <div className="dia-thread-card">
          <div className="dia-thread-header">
            <span className="dia-dot" style={{ background: "var(--warning)" }} />
            <strong style={{ color: "var(--warning)" }}>Priya's Thread</strong>
          </div>
          <div className="dia-thread-body">
            Still using <strong>bounding box</strong> overlay.
            <br />
            CSS absolute positioning.
          </div>
        </div>
      </div>
      <div className="dia-divergence-alert">
        <div className="dia-divergence-track">
          <div className="dia-divergence-fill" style={{ width: "72%" }} />
        </div>
        <span className="dia-divergence-label">72% diverged</span>
      </div>
      <div className="dia-divergence-legend">
        <strong>Jaccard similarity</strong> on thread content tokens.
        <br />
        <span style={{ color: "var(--success)" }}>Low (&lt;40%)</span>
        {" \u00b7 "}
        <span style={{ color: "var(--warning)" }}>Medium (40-70%)</span>
        {" \u00b7 "}
        <span style={{ color: "var(--error)" }}>High (&gt;70%)</span>
        <br />
        Alerts surface on the thread tree before integration conflicts happen.
      </div>
    </div>
  );
}

function ArchitectureDiagram() {
  return (
    <div className="dia-arch">
      <div className="dia-arch-row">
        <div className="dia-arch-col">
          <div className="dia-arch-label">AI Agents</div>
          <div className="dia-arch-stack">
            {["Claude Code", "Gemini CLI", "Cursor / Copilot"].map((a) => (
              <div key={a} className="dia-arch-item dia-arch-agent">{a}</div>
            ))}
          </div>
        </div>
        <div className="dia-arch-arrow">{"\u2192"}<br />MCP<br />{"\u2192"}</div>
        <div className="dia-arch-col">
          <div className="dia-arch-label">Cloudflare Worker</div>
          <div className="dia-arch-box dia-arch-worker">
            <div className="dia-arch-box-title">remix-mcp</div>
            <div className="dia-arch-box-detail">20 MCP tools</div>
            <div className="dia-arch-box-detail">Streamable HTTP + SSE</div>
            <div className="dia-arch-box-detail">Stateless</div>
          </div>
        </div>
        <div className="dia-arch-arrow">{"\u2192"}<br />REST<br />{"\u2192"}</div>
        <div className="dia-arch-col">
          <div className="dia-arch-label dia-arch-label-green">Supabase</div>
          <div className="dia-arch-box dia-arch-db">
            <div className="dia-arch-box-title">PostgreSQL</div>
            <div className="dia-arch-box-detail">rooms</div>
            <div className="dia-arch-box-detail">memories</div>
            <div className="dia-arch-box-detail">messages</div>
            <div className="dia-arch-box-detail">knowledge</div>
            <div className="dia-arch-box-detail" style={{ marginTop: 6 }}>
              Realtime subscriptions
            </div>
          </div>
        </div>
      </div>
      <div className="dia-arch-footer">
        <span>{"\u2191"} Realtime (postgres_changes) {"\u2191"}</span>
        <div className="dia-arch-dashboard">
          <div className="dia-arch-box-title">React Dashboard</div>
          <div className="dia-arch-box-detail">
            Thread Tree {"\u00b7"} Thread View {"\u00b7"} Remix + Gemini {"\u00b7"} 3D / XR
          </div>
        </div>
        <div className="dia-arch-dashboard" style={{ marginTop: 8 }}>
          <div className="dia-arch-box-title">VS Code Extension</div>
          <div className="dia-arch-box-detail">
            Agent Tree {"\u00b7"} Activity Feed {"\u00b7"} Code Inject {"\u00b7"} Knowledge Lens
          </div>
        </div>
      </div>
    </div>
  );
}

function DataFlowDiagram() {
  const steps = [
    {
      num: 1,
      color: "var(--color-accent-secondary)",
      bg: "#f0f4ff",
      border: "var(--color-border)",
      title: "Agent connects",
      code: "?room=demo&agent=alpha",
      detail: "Worker resolves room slug \u2192 room_id, creates session",
    },
    {
      num: 2,
      color: "var(--color-accent-secondary)",
      bg: "#f0f4ff",
      border: "var(--color-border)",
      title: "Agent calls tools",
      code: "remix_log, remix_file, etc.",
      detail: "Each call inserts a row into the memories table via PostgREST",
    },
    {
      num: 3,
      color: "var(--success)",
      bg: "#f0fff4",
      border: "rgba(72,150,100,0.3)",
      title: "Supabase fires postgres_changes",
      detail: "INSERT event on memories table \u2192 pushed to all subscribed clients",
    },
    {
      num: 4,
      color: "var(--warning)",
      bg: "var(--color-card)",
      border: "rgba(180,140,80,0.3)",
      title: "Dashboard updates in real-time",
      detail: "New memory appears in thread tree, thread view, and Remix source panel instantly",
    },
    {
      num: 5,
      color: "var(--error)",
      bg: "rgba(180,80,80,0.05)",
      border: "rgba(180,80,80,0.2)",
      title: "Divergence computed client-side",
      detail: "Jaccard similarity on thread tokens \u2192 alerts when threads from different agents diverge >30%",
    },
    {
      num: 6,
      color: "var(--color-accent)",
      bg: "var(--color-card)",
      border: "var(--color-border)",
      title: "Injections piggyback on tool responses",
      detail: "InboxTracker appends pending injections to every MCP tool result \u2014 no polling needed",
    },
  ];

  return (
    <div className="dia-steps">
      {steps.map((s) => (
        <div key={s.num} className="dia-step" style={{ background: s.bg, borderColor: s.border }}>
          <div className="dia-step-num" style={{ background: s.color }}>{s.num}</div>
          <div className="dia-step-content">
            <strong>{s.title}</strong>
            {s.code && <code className="dia-step-code">{s.code}</code>}
            <div className="dia-step-detail">{s.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MCPBridgeDiagram() {
  const categories = [
    {
      title: "Session Tools",
      color: "var(--color-accent-secondary)",
      bg: "#f0f4ff",
      border: "var(--color-border)",
      tools: ["remix_whoami", "remix_start", "remix_stop", "remix_done"],
    },
    {
      title: "Memory Tools",
      color: "var(--color-accent-secondary)",
      bg: "#f0f4ff",
      border: "var(--color-border)",
      tools: ["remix_log", "remix_file", "remix_get_file", "remix_search"],
    },
    {
      title: "Context Tools",
      color: "var(--success)",
      bg: "#f0fff4",
      border: "rgba(72,150,100,0.3)",
      tools: ["remix_context", "remix_agents", "remix_recall", "remix_pull"],
    },
    {
      title: "Coordination",
      color: "var(--warning)",
      bg: "var(--color-card)",
      border: "rgba(180,140,80,0.3)",
      tools: ["remix_msg", "remix_inject", "remix_inbox", "remix_status"],
    },
    {
      title: "Knowledge",
      color: "var(--error)",
      bg: "rgba(180,80,80,0.05)",
      border: "rgba(180,80,80,0.2)",
      tools: ["remix_learn", "remix_knowledge", "remix_forget", "remix_import"],
    },
  ];

  return (
    <div className="dia-mcp">
      <div className="dia-mcp-config">
        <div className="dia-mcp-config-title">Client Configuration</div>
        <div className="dia-mcp-config-block">
          <div className="text-muted">// Claude Code / Cursor / Windsurf</div>
          <div>
            <span className="text-accent">"url"</span>:{" "}
            <span className="text-success">"https://remix-mcp.workers.dev/mcp?room=demo&agent=alpha"</span>
          </div>
          <div className="text-muted" style={{ marginTop: 8 }}>// Gemini CLI</div>
          <div>
            <span className="text-accent">"httpUrl"</span>:{" "}
            <span className="text-success">"https://remix-mcp.workers.dev/mcp?room=demo&agent=alpha"</span>
          </div>
        </div>
      </div>
      <div className="dia-mcp-grid">
        {categories.map((c) => (
          <div key={c.title} className="dia-mcp-category" style={{ background: c.bg, borderColor: c.border }}>
            <div className="dia-mcp-cat-title" style={{ color: c.color }}>{c.title}</div>
            <div className="dia-mcp-tools">
              {c.tools.map((t) => (
                <div key={t}>{t}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolReferenceDiagram() {
  const tools = [
    { tool: "remix_start", purpose: "Begin a work session", params: "task_description" },
    { tool: "remix_stop", purpose: "End session with summary", params: "summary" },
    { tool: "remix_done", purpose: "Complete session with structured output", params: "summary, status, artifacts" },
    { tool: "remix_log", purpose: "Log a message to shared memory", params: "role, content" },
    { tool: "remix_file", purpose: "Store a file artifact", params: "path, content, description" },
    { tool: "remix_search", purpose: "Search memories by keyword", params: "query, limit" },
    { tool: "remix_context", purpose: "Get recent room context", params: "limit" },
    { tool: "remix_recall", purpose: "Pull specific agent's memories", params: "agent, limit" },
    { tool: "remix_pull", purpose: "Pull another agent's session context", params: "agent, limit" },
    { tool: "remix_sync", purpose: "Sync full session from another agent", params: "agent" },
    { tool: "remix_msg", purpose: "Send team chat message", params: "content, channel" },
    { tool: "remix_inject", purpose: "Push context to another agent", params: "target, content, priority" },
    { tool: "remix_inbox", purpose: "Check for injected context", params: "limit" },
    { tool: "remix_status", purpose: "Room overview + active agents", params: "\u2014" },
    { tool: "remix_learn", purpose: "Store persistent project knowledge", params: "content, title, tags" },
    { tool: "remix_knowledge", purpose: "Retrieve knowledge base", params: "search, tag, limit" },
    { tool: "remix_forget", purpose: "Remove outdated knowledge", params: "knowledge_id" },
    { tool: "remix_import", purpose: "Bulk-import conversation transcript", params: "messages" },
    { tool: "remix_agents", purpose: "List all agents in room", params: "\u2014" },
    { tool: "remix_whoami", purpose: "Check agent identity + session", params: "\u2014" },
  ];

  return (
    <div className="dia-table-wrap">
      <table className="dia-table">
        <thead>
          <tr>
            <th>Tool</th>
            <th>Purpose</th>
            <th>Key Params</th>
          </tr>
        </thead>
        <tbody>
          {tools.map((t) => (
            <tr key={t.tool}>
              <td className="dia-tool-name">{t.tool}</td>
              <td>{t.purpose}</td>
              <td className="text-muted">{t.params}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InjectionPipelineDiagram() {
  const stages = [
    {
      label: "VS Code / Web",
      detail: "Select code or type context",
      color: "var(--color-accent-secondary)",
      bg: "#f0f4ff",
      border: "var(--color-border)",
    },
    {
      label: "remix_inject",
      detail: "Insert into memories table",
      color: "var(--color-accent-secondary)",
      bg: "#f0f4ff",
      border: "var(--color-border)",
    },
    {
      label: "Supabase",
      detail: "memories (type: injection)",
      color: "var(--success)",
      bg: "#f0fff4",
      border: "rgba(72,150,100,0.3)",
    },
    {
      label: "Worker piggyback",
      detail: "InboxTracker.check()",
      color: "var(--warning)",
      bg: "var(--color-card)",
      border: "rgba(180,140,80,0.3)",
    },
    {
      label: "Agent tool response",
      detail: "Auto-appended to every reply",
      color: "var(--error)",
      bg: "rgba(180,80,80,0.05)",
      border: "rgba(180,80,80,0.2)",
    },
  ];

  return (
    <div className="dia-arch">
      <div className="dia-arch-row">
        {stages.map((s, i) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center" }}>
            <div className="dia-arch-col">
              <div className="dia-arch-label" style={{ color: s.color }}>{s.label}</div>
              <div className="dia-arch-box" style={{ background: s.bg, borderColor: s.border, minWidth: 120 }}>
                <div className="dia-arch-box-detail">{s.detail}</div>
              </div>
            </div>
            {i < stages.length - 1 && (
              <div className="dia-arch-arrow">{"\u2192"}</div>
            )}
          </div>
        ))}
      </div>
      <div className="dia-arch-footer" style={{ marginTop: 16 }}>
        <span style={{ color: "var(--warning)", fontWeight: 600 }}>
          Key: agents don't poll — injections piggyback on every MCP tool response
        </span>
      </div>
    </div>
  );
}

const diagrams: Record<string, () => ReactNode> = {
  "three-views": ThreeViewsDiagram,
  "the-remix": TheRemixDiagram,
  divergence: DivergenceDiagram,
  architecture: ArchitectureDiagram,
  "data-flow": DataFlowDiagram,
  "mcp-bridge": MCPBridgeDiagram,
  "tool-reference": ToolReferenceDiagram,
  "injection-pipeline": InjectionPipelineDiagram,
};

// ── Slide renderer ───────────────────────────────────────

function renderSlideBody(slide: Slide, active: boolean) {
  switch (slide.type) {
    case "bullets":
      return (
        <ul className="slide-bullets">
          {slide.items.map((item, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
          ))}
        </ul>
      );

    case "bars": {
      const maxVal = Math.max(...slide.items.map((i) => i.value));
      return (
        <>
          <div className="slide-bars">
            {slide.items.map((item, i) => {
              const pct = Math.min((item.value / maxVal) * 100, 100);
              return (
                <div key={i} className="slide-bar-row">
                  <div className="slide-bar-label">{item.label}</div>
                  <div className="slide-bar-track">
                    <div
                      className="slide-bar-fill"
                      style={{
                        width: active ? `${pct}%` : "0%",
                        background: item.color,
                      }}
                    />
                    <span className="slide-bar-value">{item.display}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {slide.source && <p className="slide-bar-source">{slide.source}</p>}
        </>
      );
    }

    case "diagram": {
      const Renderer = diagrams[slide.diagramKey];
      return Renderer ? (
        <div className="slide-diagram">{Renderer()}</div>
      ) : (
        <p className="text-muted">Unknown diagram: {slide.diagramKey}</p>
      );
    }

    case "bigstat":
      return (
        <>
          <div className="slide-bigstat-grid">
            {slide.stats.map((s, i) => (
              <div key={i} className="slide-bigstat-card">
                <div className="slide-bigstat-value">{s.value}</div>
                <div className="slide-bigstat-label">{s.label}</div>
              </div>
            ))}
          </div>
          {slide.footnote && <p className="slide-bigstat-footnote">{slide.footnote}</p>}
        </>
      );

    case "logogrid":
      return (
        <div className="slide-logo-grid">
          {slide.items.map((item, i) => (
            <div key={i} className="slide-logo-card">
              <div className="slide-logo-name">{item.name}</div>
              <div className="slide-logo-stat">{item.stat}</div>
              <div className="slide-logo-detail">{item.detail}</div>
            </div>
          ))}
        </div>
      );

    case "timeline":
      return (
        <div className="slide-timeline">
          {slide.items.map((item, i) => (
            <div key={i} className="slide-timeline-item">
              <div className="slide-timeline-marker">{item.marker}</div>
              <div className="slide-timeline-content">
                <div className="slide-timeline-title">{item.title}</div>
                <div className="slide-timeline-desc">{item.description}</div>
              </div>
            </div>
          ))}
        </div>
      );

    case "quote":
      return (
        <div className="slide-quote">
          <blockquote>{slide.quote}</blockquote>
          <div className="slide-quote-attr">{"\u2014"} {slide.attribution}</div>
        </div>
      );

    case "image":
      return (
        <div className="slide-image">
          <img src={slide.src} alt={slide.title} />
          {slide.caption && <p className="slide-image-caption">{slide.caption}</p>}
        </div>
      );
  }
}

// ── Section helper ───────────────────────────────────────

function getSection(slideTitle: string): string {
  for (const [section, titles] of Object.entries(slidesData.sections)) {
    if (titles.includes(slideTitle)) return section;
  }
  return "";
}

function buildChapters() {
  const chapters: { name: string; slideIndex: number }[] = [
    { name: "Start", slideIndex: 0 },
  ];
  let idx = 1;
  for (const [name, titles] of Object.entries(slidesData.sections)) {
    chapters.push({ name, slideIndex: idx });
    idx += titles.length;
  }
  return chapters;
}

// ── Main component ───────────────────────────────────────

export function SlidePresentation() {
  const totalSlides = slidesData.slides.length + 2; // title + content + closing
  const [current, setCurrent] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const touchStartX = useRef(0);
  const chapters = buildChapters();

  const goTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, totalSlides - 1));
      if (clamped !== current) {
        setDirection(clamped > current ? "next" : "prev");
        setCurrent(clamped);
      }
    },
    [current, totalSlides]
  );

  const next = useCallback(() => goTo(current + 1), [current, goTo]);
  const prev = useCallback(() => goTo(current - 1), [current, goTo]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        next();
        e.preventDefault();
      }
      if (e.key === "ArrowLeft") {
        prev();
        e.preventDefault();
      }
      if (e.key === "Escape") setMenuOpen(false);
      if (e.key === "Home") {
        goTo(0);
        e.preventDefault();
      }
      if (e.key === "End") {
        goTo(totalSlides - 1);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, goTo, totalSlides]);

  // Touch swipe
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) {
      dx < 0 ? next() : prev();
    }
  };

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = () => setMenuOpen(false);
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [menuOpen]);

  // Render the current slide content
  const renderCurrentSlide = () => {
    if (current === 0) {
      // Title slide
      return (
        <div className="slide slide-title">
          <h1 className="slide-h1">{slidesData.title}</h1>
          <p className="slide-subtitle-main">{slidesData.subtitle}</p>
          <div className="slide-summary">
            {slidesData.summary.map((item, i) => (
              <div key={i} className="slide-summary-item">{item}</div>
            ))}
          </div>
        </div>
      );
    }

    if (current === totalSlides - 1) {
      // Closing slide
      return (
        <div className="slide slide-closing">
          <h1 className="slide-h1">{slidesData.closing.title}</h1>
          <p className="slide-subtitle-main">{slidesData.closing.subtitle}</p>
        </div>
      );
    }

    // Content slide
    const slide = slidesData.slides[current - 1];
    const section = getSection(slide.title);

    return (
      <div className="slide slide-content">
        <h2 className="slide-h2">{slide.title}</h2>
        {slide.subtitle && <p className="slide-subtitle">{slide.subtitle}</p>}
        {renderSlideBody(slide, true)}
        {section && <div className="slide-section-indicator">{section}</div>}
      </div>
    );
  };

  return (
    <div
      className="slides-app"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className={`slides-viewport slides-dir-${direction}`} key={current}>
        {renderCurrentSlide()}
      </div>

      {/* Navigation controls */}
      <div className="slides-nav">
        <button
          className="slides-nav-btn"
          onClick={() => goTo(0)}
          title="Go to start"
        >
          {"\u2302"}
        </button>
        <button
          className="slides-nav-btn"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
          title="Chapters"
        >
          {"\u2630"}
        </button>
      </div>

      {/* Slide counter */}
      <div className="slides-counter">
        {current + 1} / {totalSlides}
      </div>

      {/* Left/right arrows */}
      <button
        className="slides-arrow slides-arrow-left"
        onClick={prev}
        disabled={current === 0}
        aria-label="Previous slide"
      >
        {"\u2039"}
      </button>
      <button
        className="slides-arrow slides-arrow-right"
        onClick={next}
        disabled={current === totalSlides - 1}
        aria-label="Next slide"
      >
        {"\u203a"}
      </button>

      {/* Chapter menu */}
      {menuOpen && (
        <div className="slides-menu" onClick={(e) => e.stopPropagation()}>
          {chapters.map((ch) => (
            <div
              key={ch.name}
              className={`slides-menu-item ${
                current >= ch.slideIndex ? "slides-menu-item-active" : ""
              }`}
              onClick={() => {
                goTo(ch.slideIndex);
                setMenuOpen(false);
              }}
            >
              {ch.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
