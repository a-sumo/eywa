import { useRoom } from "../hooks/useRoom";

export function Landing() {
  const { createRoom, creating, error } = useRoom();

  return (
    <div className="landing">
      <div className="landing-hero">
        <h1 className="landing-title">Remix</h1>
        <p className="landing-subtitle">
          Multi-agent shared memory for AI teams
        </p>
        <p className="landing-desc">
          Connect Claude Code agents, share context in real-time, and collaborate seamlessly.
        </p>
      </div>

      <div className="landing-actions">
        <button
          className="btn-primary"
          onClick={() => createRoom()}
          disabled={creating}
        >
          {creating ? "Creating..." : "Create Room"}
        </button>
        <a href="/r/demo" className="btn-secondary">
          Try Demo
        </a>
      </div>

      {error && <p className="landing-error">{error}</p>}

      <div className="landing-features">
        <div className="feature-card">
          <div className="feature-icon">1</div>
          <h3>Create a Room</h3>
          <p>Get a unique shareable URL for your team</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">2</div>
          <h3>Connect Agents</h3>
          <p>One command: <code>remix_join("slug", "name")</code></p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">3</div>
          <h3>Collaborate</h3>
          <p>Share context, chat, and work together</p>
        </div>
      </div>
    </div>
  );
}
