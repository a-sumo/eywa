import { useRoom } from "../hooks/useRoom";
import { FlowBackground } from "./FlowBackground";

// SVG Icons
const IconThreads = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="15" y2="18" />
    <circle cx="19" cy="18" r="2" fill="currentColor" stroke="none" />
  </svg>
);

const IconLink = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const IconInject = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14" />
    <path d="M19 12l-7 7-7-7" />
  </svg>
);

const IconBrain = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a4 4 0 0 1 4 4c0 1.1-.4 2.1-1.1 2.9l.1.1a4 4 0 0 1 1 7.4V18a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-1.6a4 4 0 0 1 1-7.4l.1-.1A4 4 0 0 1 8 6a4 4 0 0 1 4-4z" />
    <path d="M12 8v4" />
    <path d="M10 14h4" />
  </svg>
);

const IconCode = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

const IconChat = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const IconArrowRight = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

const IconGitHub = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
);

const IconDiscord = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);

export function Landing() {
  const { createRoom, creating, error } = useRoom();

  return (
    <div className="landing-dark">
      <FlowBackground />

      {/* Header */}
      <header className="landing-header">
        <div className="landing-header-inner">
          <a href="/" className="landing-logo">Eywa</a>
          <nav className="landing-nav">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="https://discord.gg/c7V2Ze58" target="_blank" rel="noopener noreferrer">Contact</a>
          </nav>
          <div className="landing-header-actions">
            <a href="/r/demo" className="landing-nav-link">Try Demo</a>
            <button
              className="btn-landing-primary"
              onClick={() => createRoom()}
              disabled={creating}
            >
              {creating ? "Creating..." : "Get Started"}
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="landing-hero-dark">
        <div className="landing-hero-content">
          <h1 className="landing-hero-title">
            The coordination layer for<br />
            <span className="landing-hero-gradient">human + AI teams</span>
          </h1>
          <p className="landing-hero-subtitle">
            When everyone runs AI coding agents, context gets siloed.
            Decisions diverge. Work gets duplicated.
            Eywa gives your team shared visibility and control.
          </p>
          <div className="landing-hero-actions">
            <a href="/r/demo" className="btn-landing-primary btn-large">
              Try the Demo
              <IconArrowRight />
            </a>
            <button
              className="btn-landing-secondary"
              onClick={() => createRoom()}
              disabled={creating}
            >
              Create Your Room
            </button>
          </div>
          {error && <p className="landing-error">{error}</p>}
        </div>
      </section>

      {/* Screenshot */}
      <section className="landing-screenshot-section">
        <div className="landing-screenshot-wrapper">
          <img
            src="/slides/thread-tree.png"
            alt="Eywa dashboard showing AI agent sessions"
            className="landing-screenshot-img"
          />
        </div>
        <p className="landing-screenshot-caption">
          Real-time view of your team's AI sessions
        </p>
      </section>

      {/* Fade to solid background */}
      <div className="landing-fade-overlay" />

      {/* Problem */}
      <section className="landing-section" id="problem">
        <h2 className="landing-section-title">The problem with AI teams today</h2>
        <div className="landing-cards-grid">
          <div className="landing-card">
            <div className="landing-card-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 4v16h16" />
                <path d="M4 14l4-4 4 4 8-8" />
              </svg>
            </div>
            <h3>Duplicated Work</h3>
            <p>
              Your agent spent 40 minutes evaluating auth libraries. Meanwhile,
              another developer's agent runs the exact same analysis. Nobody knows.
            </p>
          </div>
          <div className="landing-card">
            <div className="landing-card-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6 3v18" />
                <path d="M18 3v18" />
                <path d="M6 12h12" />
                <path d="M6 6l6 6-6 6" />
                <path d="M18 6l-6 6 6 6" />
              </svg>
            </div>
            <h3>Silent Divergence</h3>
            <p>
              One agent switches to a new database schema. Another keeps building on
              the old one. You won't find out until the PR conflicts.
            </p>
          </div>
          <div className="landing-card">
            <div className="landing-card-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <h3>Lost Context</h3>
            <p>
              "What date format should the API use?" You get a quick answer.
              You don't get the 10-minute investigation that led to it.
            </p>
          </div>
        </div>
      </section>

      {/* Solution */}
      <section className="landing-section landing-section-alt">
        <h2 className="landing-section-title">How Eywa works</h2>
        <div className="landing-steps">
          <div className="landing-step">
            <div className="landing-step-number">1</div>
            <div className="landing-step-content">
              <h3>Connect your agents</h3>
              <p>One command adds Eywa to Claude Code, Cursor, or Gemini CLI. All activity streams to a shared room.</p>
              <code className="landing-code">claude mcp add remix "https://remix-mcp..."</code>
            </div>
          </div>
          <div className="landing-step">
            <div className="landing-step-number">2</div>
            <div className="landing-step-content">
              <h3>See everything</h3>
              <p>Watch your team's AI sessions in real-time. Filter by agent, status, or type. Click any thread to see full context.</p>
            </div>
          </div>
          <div className="landing-step">
            <div className="landing-step-number">3</div>
            <div className="landing-step-content">
              <h3>Share context</h3>
              <p>Inject context to any agent mid-session. Pull in another session's reasoning. Eywa threads together to resolve conflicts.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="landing-section" id="features">
        <h2 className="landing-section-title">Everything you need</h2>
        <div className="landing-features-grid">
          <div className="landing-feature">
            <div className="landing-feature-icon"><IconThreads /></div>
            <h3>Thread Tree</h3>
            <p>Live view of all agent sessions across your team, filterable by status and type</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon"><IconLink /></div>
            <h3>Cross-Session Links</h3>
            <p>Connect decisions and context across agent boundaries with reference, inject, or fork links</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon"><IconInject /></div>
            <h3>Context Injection</h3>
            <p>Push context to any agent mid-session. They see it on their next tool call.</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon"><IconBrain /></div>
            <h3>Knowledge Base</h3>
            <p>Persistent team memory that survives across sessions. Architecture decisions, conventions, gotchas.</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon"><IconCode /></div>
            <h3>VS Code Extension</h3>
            <p>Full team awareness without leaving your editor. Activity feed, inject shortcuts, CodeLens integration.</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon"><IconChat /></div>
            <h3>Discord Integration</h3>
            <p>Observe and interact with your agent swarm from Discord. 12 slash commands for full control.</p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="landing-section landing-section-alt" id="pricing">
        <h2 className="landing-section-title">Simple pricing</h2>
        <div className="landing-pricing-grid">
          <div className="landing-pricing-card">
            <h3>Free</h3>
            <div className="landing-pricing-price">$0</div>
            <ul className="landing-pricing-features">
              <li>Up to 3 agents</li>
              <li>1 room</li>
              <li>7-day history</li>
              <li>Community support</li>
            </ul>
            <a href="/r/demo" className="btn-landing-secondary" style={{ width: "100%" }}>
              Try Demo
            </a>
          </div>
          <div className="landing-pricing-card landing-pricing-featured">
            <div className="landing-pricing-badge">Popular</div>
            <h3>Team</h3>
            <div className="landing-pricing-price">$29<span>/month</span></div>
            <ul className="landing-pricing-features">
              <li>Unlimited agents</li>
              <li>Unlimited rooms</li>
              <li>90-day history</li>
              <li>Priority support</li>
              <li>VS Code extension</li>
              <li>Discord bot</li>
            </ul>
            <button className="btn-landing-primary" style={{ width: "100%" }} onClick={() => createRoom()}>
              Get Started
            </button>
          </div>
          <div className="landing-pricing-card">
            <h3>Enterprise</h3>
            <div className="landing-pricing-price">Custom</div>
            <ul className="landing-pricing-features">
              <li>Everything in Team</li>
              <li>Self-hosted option</li>
              <li>SSO / SAML</li>
              <li>Audit logs</li>
              <li>Dedicated support</li>
            </ul>
            <a href="https://discord.gg/c7V2Ze58" className="btn-landing-secondary" style={{ width: "100%" }} target="_blank" rel="noopener noreferrer">
              Contact Sales
            </a>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="landing-cta-section">
        <h2>Stop re-doing work your teammate's AI already figured out.</h2>
        <p>Join teams using Eywa to coordinate their AI agents.</p>
        <div className="landing-hero-actions">
          <a href="/r/demo" className="btn-landing-primary btn-large">
            Try the Demo
            <IconArrowRight />
          </a>
          <a href="https://discord.gg/c7V2Ze58" className="btn-landing-secondary" target="_blank" rel="noopener noreferrer">
            Join Discord
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer-dark">
        <div className="landing-footer-inner">
          <div className="landing-footer-brand">
            <span className="landing-logo">Eywa</span>
            <p>The coordination layer for human + AI teams</p>
          </div>
          <div className="landing-footer-links">
            <div className="landing-footer-col">
              <h4>Product</h4>
              <a href="#features">Features</a>
              <a href="#pricing">Pricing</a>
              <a href="/r/demo">Demo</a>
              <a href="/slides">Slides</a>
            </div>
            <div className="landing-footer-col">
              <h4>Resources</h4>
              <a href="https://github.com/a-sumo/remix" target="_blank" rel="noopener noreferrer">Documentation</a>
              <a href="https://github.com/a-sumo/remix" target="_blank" rel="noopener noreferrer">GitHub</a>
              <a href="https://discord.gg/c7V2Ze58" target="_blank" rel="noopener noreferrer">Discord</a>
            </div>
            <div className="landing-footer-col">
              <h4>Company</h4>
              <a href="https://discord.gg/c7V2Ze58" target="_blank" rel="noopener noreferrer">Contact</a>
              <a href="https://discord.gg/c7V2Ze58" target="_blank" rel="noopener noreferrer">Support</a>
            </div>
          </div>
          <div className="landing-footer-social">
            <a href="https://github.com/a-sumo/remix" target="_blank" rel="noopener noreferrer" title="GitHub">
              <IconGitHub />
            </a>
            <a href="https://discord.gg/c7V2Ze58" target="_blank" rel="noopener noreferrer" title="Discord">
              <IconDiscord />
            </a>
          </div>
        </div>
        <div className="landing-footer-bottom">
          <p>© 2026 Eywa. Built for hackathons and dev teams.</p>
        </div>
      </footer>
    </div>
  );
}
