import { useRoom } from "../hooks/useRoom";
import { FlowBackground } from "./FlowBackground";
import EywaLogo from "./EywaLogo";

// Animated SVG Icons - aurora colored, heartbeat-synced animations
const IconThreads = () => (
  <svg className="anim-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
    <path className="anim-stream s1" d="M4 8c6-3 18 3 24 0" strokeWidth="2.5" strokeLinecap="round"/>
    <path className="anim-stream s2" d="M4 16c6-3 18 3 24 0" strokeWidth="2.5" strokeLinecap="round"/>
    <path className="anim-stream s3" d="M4 24c4-2 12 2 18 0" strokeWidth="2.5" strokeLinecap="round"/>
    <circle className="anim-node" cx="26" cy="24" r="3"/>
  </svg>
);

const IconLink = () => (
  <svg className="anim-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
    <path className="anim-arc a1" d="M13.5 18.5a6.5 6.5 0 0 0 9.2.6l3.5-3.5a6.5 6.5 0 0 0-9.2-9.2l-2 2" strokeWidth="2.5" strokeLinecap="round"/>
    <path className="anim-arc a2" d="M18.5 13.5a6.5 6.5 0 0 0-9.2-.6l-3.5 3.5a6.5 6.5 0 0 0 9.2 9.2l2-2" strokeWidth="2.5" strokeLinecap="round"/>
  </svg>
);

const IconInject = () => (
  <svg className="anim-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
    <line className="anim-drop-shaft" x1="16" y1="4" x2="16" y2="22" strokeWidth="2.5" strokeLinecap="round"/>
    <polyline className="anim-drop-head" points="10,18 16,24 22,18" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    <circle className="anim-ripple" cx="16" cy="28" r="2" strokeWidth="1.5"/>
  </svg>
);

const IconBrain = () => (
  <svg className="anim-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
    <line className="anim-synapse sy1" x1="16" y1="9" x2="9" y2="14" strokeWidth="2"/>
    <line className="anim-synapse sy2" x1="16" y1="9" x2="23" y2="14" strokeWidth="2"/>
    <line className="anim-synapse sy3" x1="9" y1="19" x2="16" y2="24" strokeWidth="2"/>
    <line className="anim-synapse sy4" x1="23" y1="19" x2="16" y2="24" strokeWidth="2"/>
    <circle className="anim-neuron n1" cx="16" cy="6" r="3" strokeWidth="2"/>
    <circle className="anim-neuron n2" cx="7" cy="16" r="3" strokeWidth="2"/>
    <circle className="anim-neuron n3" cx="25" cy="16" r="3" strokeWidth="2"/>
    <circle className="anim-neuron n4" cx="16" cy="26" r="3" strokeWidth="2"/>
  </svg>
);

const IconCode = () => (
  <svg className="anim-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
    <polyline className="anim-bracket bl" points="13,6 5,16 13,26" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    <polyline className="anim-bracket br" points="19,6 27,16 19,26" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    <line className="anim-cursor-line" x1="16" y1="10" x2="16" y2="22" strokeWidth="2.5" strokeLinecap="round"/>
  </svg>
);

const IconChat = () => (
  <svg className="anim-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
    <path className="anim-bubble" d="M27 20.5a2.5 2.5 0 0 1-2.5 2.5H9.5L5 27.5V7.5A2.5 2.5 0 0 1 7.5 5h17A2.5 2.5 0 0 1 27 7.5z" strokeWidth="2.5" strokeLinejoin="round"/>
    <circle className="anim-typing d1" cx="11" cy="14" r="1.8"/>
    <circle className="anim-typing d2" cx="16" cy="14" r="1.8"/>
    <circle className="anim-typing d3" cx="21" cy="14" r="1.8"/>
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
          <a href="/" className="landing-logo">
            <EywaLogo size={36} />
            <span>Eywa</span>
          </a>
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
            When everyone runs AI coding agents, context gets{" "}
            <span className="pain-word pain-siloed">siloed</span>.{" "}
            Decisions <span className="pain-word pain-diverge">diverge</span>.{" "}
            Work gets <span className="pain-word pain-duplicated">duplicated</span>.
          </p>
          <p className="landing-hero-solution">
            Eywa connects every human-AI partnership on your team, so the whole is greater than the sum of its parts.
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

      {/* MCP Compatibility */}
      <section className="landing-section landing-compatibility-section">
        <div className="landing-compatibility-badge">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          MCP Native
        </div>
        <h2 className="landing-section-title">Works with every AI coding agent</h2>
        <p className="landing-compatibility-subtitle">
          Eywa uses the <strong>Model Context Protocol</strong> - the open standard for AI tool integration.
          One setup. Every agent. Including local and self-hosted.
        </p>

        <div className="landing-agents-grid">
          <div className="landing-agent-card landing-agent-featured">
            <div className="landing-agent-logo">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <span className="landing-agent-name">Claude Code</span>
            <span className="landing-agent-tag">CLI</span>
          </div>

          <div className="landing-agent-card">
            <div className="landing-agent-logo">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="3"/>
                <path d="M8 12h8M12 8v8"/>
              </svg>
            </div>
            <span className="landing-agent-name">Cursor</span>
            <span className="landing-agent-tag">IDE</span>
          </div>

          <div className="landing-agent-card">
            <div className="landing-agent-logo">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
              </svg>
            </div>
            <span className="landing-agent-name">Windsurf</span>
            <span className="landing-agent-tag">IDE</span>
          </div>

          <div className="landing-agent-card">
            <div className="landing-agent-logo">
              <img src="/gemini.svg" alt="Gemini" width="32" height="32" />
            </div>
            <span className="landing-agent-name">Gemini CLI</span>
            <span className="landing-agent-tag">CLI</span>
          </div>

          <div className="landing-agent-card">
            <div className="landing-agent-logo">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                <circle cx="12" cy="12" r="10"/>
                <circle cx="12" cy="12" r="4" fill="var(--bg-base)"/>
              </svg>
            </div>
            <span className="landing-agent-name">Codex</span>
            <span className="landing-agent-tag">CLI</span>
          </div>

          <div className="landing-agent-card">
            <div className="landing-agent-logo">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 17l6-6-6-6M12 19h8"/>
              </svg>
            </div>
            <span className="landing-agent-name">Cline</span>
            <span className="landing-agent-tag">VS Code</span>
          </div>

          <div className="landing-agent-card">
            <div className="landing-agent-logo">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 3a2.5 2.5 0 110 5 2.5 2.5 0 010-5zm0 14c-2.5 0-4.71-1.28-6-3.22.03-2 4-3.08 6-3.08 2 0 5.97 1.08 6 3.08A7.46 7.46 0 0112 19z"/>
              </svg>
            </div>
            <span className="landing-agent-name">Roo Code</span>
            <span className="landing-agent-tag">VS Code</span>
          </div>

          <div className="landing-agent-card">
            <div className="landing-agent-logo">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/>
              </svg>
            </div>
            <span className="landing-agent-name">Aider</span>
            <span className="landing-agent-tag">CLI</span>
          </div>

          <div className="landing-agent-card landing-agent-more">
            <div className="landing-agent-logo">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="1"/>
                <circle cx="19" cy="12" r="1"/>
                <circle cx="5" cy="12" r="1"/>
              </svg>
            </div>
            <span className="landing-agent-name">Any MCP Agent</span>
            <span className="landing-agent-tag">Open Standard</span>
          </div>
        </div>

        <div className="landing-compatibility-highlight">
          <div className="landing-highlight-item">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--aurora-green)" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <div>
              <strong>Local-first privacy</strong>
              <span>Your code never leaves your machine. Eywa syncs metadata only.</span>
            </div>
          </div>
          <div className="landing-highlight-item">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--aurora-cyan)" strokeWidth="2">
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
              <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/>
            </svg>
            <div>
              <strong>Zero config</strong>
              <span>Add one MCP server. That's it. Works with your existing setup.</span>
            </div>
          </div>
          <div className="landing-highlight-item">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--aurora-purple)" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
            </svg>
            <div>
              <strong>Team-wide visibility</strong>
              <span>See what every agent is doing, regardless of which tool runs it.</span>
            </div>
          </div>
        </div>
      </section>

      {/* Powered by Gemini */}
      <section className="landing-section landing-gemini-section">
        <div className="landing-gemini-content">
          <a
            href="https://gemini.google/us/about"
            target="_blank"
            rel="noopener noreferrer"
            className="landing-gemini-logo"
          >
            <img src="/gemini.svg" alt="Gemini" className="gemini-logo-img" />
            <span className="gemini-logo-text">Gemini</span>
          </a>
          <h2 className="landing-gemini-title">Orchestration powered by Gemini</h2>
          <p className="landing-gemini-description">
            Eywa's communication engine is built on <strong>Google Gemini</strong>.
            When you use Eywa to combine context from multiple agent threads,
            Gemini synthesizes the information, resolves conflicts, and generates coherent responses
            that understand the full picture of your team's work.
          </p>
          <div className="landing-gemini-features">
            <div className="landing-gemini-feature">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
              <span>Multi-context synthesis</span>
            </div>
            <div className="landing-gemini-feature">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <span>Real-time reasoning</span>
            </div>
            <div className="landing-gemini-feature">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>Conversational interface</span>
            </div>
          </div>
          <a
            href="https://gemini.google/us/about"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-landing-secondary landing-gemini-cta"
          >
            Learn more about Gemini
            <IconArrowRight />
          </a>
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
              <li>Up to 5 team members</li>
              <li>Unlimited workspaces</li>
              <li>7-day history</li>
              <li>VS Code + Discord integrations</li>
              <li>All agent types supported</li>
            </ul>
            <a href="/r/demo" className="btn-landing-secondary" style={{ width: "100%" }}>
              Get Started Free
            </a>
          </div>
          <div className="landing-pricing-card landing-pricing-featured">
            <div className="landing-pricing-badge">For Teams</div>
            <h3>Pro</h3>
            <div className="landing-pricing-price">$5<span>/seat/month</span></div>
            <ul className="landing-pricing-features">
              <li>Unlimited team members</li>
              <li>90-day history</li>
              <li>Team knowledge base</li>
              <li>Timeline rewind + forking</li>
              <li>Priority support</li>
            </ul>
            <button className="btn-landing-primary" style={{ width: "100%" }} onClick={() => createRoom()}>
              Start Pro Trial
            </button>
          </div>
          <div className="landing-pricing-card">
            <h3>Enterprise</h3>
            <div className="landing-pricing-price">Custom</div>
            <ul className="landing-pricing-features">
              <li>Everything in Pro</li>
              <li>Self-hosted deployment</li>
              <li>SSO / SAML</li>
              <li>Audit logs + compliance</li>
              <li>Dedicated success manager</li>
            </ul>
            <a href="https://discord.gg/c7V2Ze58" className="btn-landing-secondary" style={{ width: "100%" }} target="_blank" rel="noopener noreferrer">
              Contact Sales
            </a>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="landing-cta-section">
        <h2>Accelerate your team's collective intelligence.</h2>
        <p>When humans and AI work together, coordination becomes the multiplier. Eywa connects every human-AI partnership on your team.</p>
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
          <a
            href="https://gemini.google/us/about"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-gemini-link"
          >
            Orchestration powered by Gemini
          </a>
        </div>
      </footer>
    </div>
  );
}
