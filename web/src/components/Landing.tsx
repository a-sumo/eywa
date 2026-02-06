import { useRoom } from "../hooks/useRoom";

export function Landing() {
  const { createRoom, creating, error } = useRoom();

  return (
    <div className="landing">
      {/* Hero */}
      <section className="landing-hero">
        <h1 className="landing-title">Remix</h1>
        <p className="landing-tagline">
          See what your team's AI agents are doing.
        </p>
        <p className="landing-subtitle">
          When everyone's running Claude Code, Cursor, or Gemini, context gets
          siloed. Decisions diverge. Work gets duplicated.
          <br />
          <strong>Remix fixes that.</strong>
        </p>

        <div className="landing-actions">
          <a href="/r/demo" className="btn-primary btn-large">
            Try the Demo
          </a>
          <button
            className="btn-secondary"
            onClick={() => createRoom()}
            disabled={creating}
          >
            {creating ? "Creating..." : "Create Your Room"}
          </button>
        </div>
        {error && <p className="landing-error">{error}</p>}
      </section>

      {/* Screenshot */}
      <section className="landing-screenshot">
        <img
          src="/slides/thread-tree.png"
          alt="Remix thread tree showing multiple AI agent sessions"
          className="landing-screenshot-img"
        />
        <p className="landing-screenshot-caption">
          Live view of your team's AI sessions, filterable by status, agent, and type
        </p>
      </section>

      {/* Problem */}
      <section className="landing-problem">
        <h2>The Problem</h2>
        <div className="problem-grid">
          <div className="problem-card">
            <div className="problem-icon">🔄</div>
            <h3>Duplicated Work</h3>
            <p>
              Your agent spent 40 minutes evaluating APIs. Your teammate's agent
              does it again from scratch.
            </p>
          </div>
          <div className="problem-card">
            <div className="problem-icon">🔀</div>
            <h3>Silent Divergence</h3>
            <p>
              Sarah switched to wrist anchoring. Priya's still designing for
              bounding boxes. They won't find out until integration.
            </p>
          </div>
          <div className="problem-card">
            <div className="problem-icon">❓</div>
            <h3>Lost Context</h3>
            <p>
              "What format should I use?" You get a quick answer. You don't get
              the reasoning your teammate's agent worked out.
            </p>
          </div>
        </div>
      </section>

      {/* Solution */}
      <section className="landing-solution">
        <h2>The Solution</h2>
        <div className="solution-grid">
          <div className="solution-card">
            <div className="solution-number">1</div>
            <h3>Connect Your Agents</h3>
            <p>
              One command adds Remix to Claude Code, Cursor, or Gemini. All
              activity streams to a shared room.
            </p>
            <code className="solution-code">
              claude mcp add remix "https://..."
            </code>
          </div>
          <div className="solution-card">
            <div className="solution-number">2</div>
            <h3>See Everything</h3>
            <p>
              Watch your team's AI sessions in real-time. Filter by agent,
              status, or type. Click to see full context.
            </p>
          </div>
          <div className="solution-card">
            <div className="solution-number">3</div>
            <h3>Share Context</h3>
            <p>
              Inject context to any agent. Pull in another session's reasoning.
              Remix threads together and ask Gemini to integrate.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="landing-features-section">
        <h2>What You Get</h2>
        <div className="features-grid">
          <div className="feature-item">
            <span className="feature-icon-small">📊</span>
            <div>
              <strong>Thread Tree</strong>
              <p>Live view of all agent sessions across your team</p>
            </div>
          </div>
          <div className="feature-item">
            <span className="feature-icon-small">🔗</span>
            <div>
              <strong>Cross-Session Links</strong>
              <p>Connect decisions across agent boundaries</p>
            </div>
          </div>
          <div className="feature-item">
            <span className="feature-icon-small">💉</span>
            <div>
              <strong>Context Injection</strong>
              <p>Push context to any agent mid-session</p>
            </div>
          </div>
          <div className="feature-item">
            <span className="feature-icon-small">🧠</span>
            <div>
              <strong>Knowledge Base</strong>
              <p>Persistent team memory that survives sessions</p>
            </div>
          </div>
          <div className="feature-item">
            <span className="feature-icon-small">🔌</span>
            <div>
              <strong>VS Code Extension</strong>
              <p>Team awareness without leaving your editor</p>
            </div>
          </div>
          <div className="feature-item">
            <span className="feature-icon-small">🤖</span>
            <div>
              <strong>Discord Bot</strong>
              <p>Observe and interact from Discord</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="landing-cta">
        <h2>Stop re-doing work your teammate's AI already figured out.</h2>
        <div className="landing-actions">
          <a href="/r/demo" className="btn-primary btn-large">
            Try the Demo
          </a>
          <a
            href="https://discord.gg/c7V2Ze58"
            className="btn-secondary"
            target="_blank"
            rel="noopener noreferrer"
          >
            Join Discord
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <p>
          Built for hackathons and dev teams using AI coding agents.
          <br />
          <a href="/slides">View slides</a> · <a href="https://github.com/a-sumo/remix" target="_blank" rel="noopener noreferrer">GitHub</a> · <a href="https://discord.gg/c7V2Ze58" target="_blank" rel="noopener noreferrer">Discord</a>
        </p>
      </footer>
    </div>
  );
}
