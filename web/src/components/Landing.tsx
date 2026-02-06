import { useState } from "react";
import { Link } from "react-router-dom";
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
  const [menuOpen, setMenuOpen] = useState(false);

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
          <button
            className="mobile-menu-btn"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </header>

      {/* Mobile menu overlay */}
      <div className={`mobile-menu${menuOpen ? " open" : ""}`}>
        <button className="mobile-menu-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">
          ×
        </button>
        <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
        <a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
        <a href="https://discord.gg/c7V2Ze58" target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)}>Contact</a>
        <a href="/r/demo" onClick={() => setMenuOpen(false)}>Try Demo</a>
        <button
          onClick={() => { createRoom(); setMenuOpen(false); }}
          disabled={creating}
        >
          {creating ? "Creating..." : "Get Started"}
        </button>
      </div>

      {/* Hero */}
      <section className="landing-hero-dark">
        <div className="landing-hero-content">
          <h1 className="landing-hero-title">
            Shared memory for<br />
            <span className="landing-hero-gradient">AI agent teams</span>
          </h1>
          <p className="landing-hero-subtitle">
            Your agents work in <span className="pain-word pain-siloed">isolation</span>.{" "}
            Decisions <span className="pain-word pain-diverge">diverge</span>.{" "}
            Work gets <span className="pain-word pain-duplicated">duplicated</span>.
          </p>
          <p className="landing-hero-solution">
            Eywa gives every agent on your team a <span className="highlight">shared context layer</span>, so they stop re-doing each other's work.
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
        <h2 className="landing-section-title">Your agents don't talk to each other</h2>
        <div className="landing-cards-grid">
          <div className="landing-card">
            <div className="landing-card-icon">
              <svg className="anim-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path className="anim-dup-line dup-a" d="M5 26L12 16l5 6 10-14" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path className="anim-dup-line dup-b" d="M5 26L12 16l5 6 10-14" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <circle className="anim-dup-dot" cx="27" cy="8" r="2.5"/>
              </svg>
            </div>
            <h3>Duplicated Work</h3>
            <p>
              One agent spent 40 minutes evaluating TTS services. Another developer's agent
              runs the exact same analysis from scratch. Neither knows the other exists.
            </p>
          </div>
          <div className="landing-card">
            <div className="landing-card-icon">
              <svg className="anim-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path className="anim-div-trunk" d="M16 28V16" strokeWidth="2.5" strokeLinecap="round"/>
                <path className="anim-div-left" d="M16 16C14 12 8 8 4 4" strokeWidth="2.5" strokeLinecap="round"/>
                <path className="anim-div-right" d="M16 16C18 12 24 8 28 4" strokeWidth="2.5" strokeLinecap="round"/>
                <circle className="anim-div-dot-l" cx="4" cy="4" r="2.5"/>
                <circle className="anim-div-dot-r" cx="28" cy="4" r="2.5"/>
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
              <svg className="anim-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
                <circle className="anim-clock-ring" cx="16" cy="16" r="13" strokeWidth="2.5"/>
                <path className="anim-clock-hand-m" d="M16 16V6" strokeWidth="2.5" strokeLinecap="round"/>
                <path className="anim-clock-hand-h" d="M16 16l5 4" strokeWidth="2.5" strokeLinecap="round"/>
                <circle className="anim-clock-center" cx="16" cy="16" r="2" fill="var(--aurora-pink)"/>
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
              <code className="landing-code">claude mcp add eywa "https://mcp.eywa-ai.dev..."</code>
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
        <h2 className="landing-section-title">Built for teams running multiple agents</h2>
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
          Open Standard
        </div>
        <h2 className="landing-section-title">Works with your agents</h2>
        <p className="landing-compatibility-subtitle">
          One URL connects any AI coding agent. One line in your config. That's the entire setup.
        </p>

        <div className="landing-agents-grid">
          <Link to="/docs/integrations/gemini-cli" className="landing-agent-card landing-agent-featured">
            <div className="landing-agent-logo">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"/>
              </svg>
            </div>
            <span className="landing-agent-name">Gemini CLI</span>
            <span className="landing-agent-tag">CLI</span>
          </Link>

          <Link to="/docs/integrations/claude-code" className="landing-agent-card">
            <div className="landing-agent-logo">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                <path d="M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-7.258 0h3.767L16.906 20h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.522zm4.132 9.959L8.453 7.687 6.205 13.48H10.7z"/>
              </svg>
            </div>
            <span className="landing-agent-name">Claude Code</span>
            <span className="landing-agent-tag">CLI</span>
          </Link>

          <Link to="/docs/integrations/cursor" className="landing-agent-card">
            <div className="landing-agent-logo">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                <path d="M22.106 5.68L12.5.135a.998.998 0 00-.998 0L1.893 5.68a.84.84 0 00-.419.726v11.186c0 .3.16.577.42.727l9.607 5.547a.999.999 0 00.998 0l9.608-5.547a.84.84 0 00.42-.727V6.407a.84.84 0 00-.42-.726zm-.603 1.176L12.228 22.92c-.063.108-.228.064-.228-.061V12.34a.59.59 0 00-.295-.51l-9.11-5.26c-.107-.062-.063-.228.062-.228h18.55c.264 0 .428.286.296.514z"/>
              </svg>
            </div>
            <span className="landing-agent-name">Cursor</span>
            <span className="landing-agent-tag">IDE</span>
          </Link>

          <Link to="/docs/integrations/windsurf" className="landing-agent-card">
            <div className="landing-agent-logo">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                <path clipRule="evenodd" d="M23.78 5.004h-.228a2.187 2.187 0 00-2.18 2.196v4.912c0 .98-.804 1.775-1.76 1.775a1.818 1.818 0 01-1.472-.773L13.168 5.95a2.197 2.197 0 00-1.81-.95c-1.134 0-2.154.972-2.154 2.173v4.94c0 .98-.797 1.775-1.76 1.775-.57 0-1.136-.289-1.472-.773L.408 5.098C.282 4.918 0 5.007 0 5.228v4.284c0 .216.066.426.188.604l5.475 7.889c.324.466.8.812 1.351.938 1.377.316 2.645-.754 2.645-2.117V11.89c0-.98.787-1.775 1.76-1.775h.002c.586 0 1.135.288 1.472.773l4.972 7.163a2.15 2.15 0 001.81.95c1.158 0 2.151-.973 2.151-2.173v-4.939c0-.98.787-1.775 1.76-1.775h.194c.122 0 .22-.1.22-.222V5.225a.221.221 0 00-.22-.222z"/>
              </svg>
            </div>
            <span className="landing-agent-name">Windsurf</span>
            <span className="landing-agent-tag">IDE</span>
          </Link>

          <Link to="/docs/integrations/codex" className="landing-agent-card">
            <div className="landing-agent-logo">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                <path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z"/>
              </svg>
            </div>
            <span className="landing-agent-name">Codex</span>
            <span className="landing-agent-tag">CLI</span>
          </Link>

          <Link to="/docs/integrations/cline" className="landing-agent-card">
            <div className="landing-agent-logo">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                <path d="M17.035 3.991c2.75 0 4.98 2.24 4.98 5.003v1.667l1.45 2.896a1.01 1.01 0 01-.002.909l-1.448 2.864v1.668c0 2.762-2.23 5.002-4.98 5.002H7.074c-2.751 0-4.98-2.24-4.98-5.002V17.33l-1.48-2.855a1.01 1.01 0 01-.003-.927l1.482-2.887V8.994c0-2.763 2.23-5.003 4.98-5.003h9.962zM8.265 9.6a2.274 2.274 0 00-2.274 2.274v4.042a2.274 2.274 0 004.547 0v-4.042A2.274 2.274 0 008.265 9.6zm7.326 0a2.274 2.274 0 00-2.274 2.274v4.042a2.274 2.274 0 104.548 0v-4.042A2.274 2.274 0 0015.59 9.6z"/>
                <path d="M12.054 5.558a2.779 2.779 0 100-5.558 2.779 2.779 0 000 5.558z"/>
              </svg>
            </div>
            <span className="landing-agent-name">Cline</span>
            <span className="landing-agent-tag">VS Code</span>
          </Link>

          <Link to="/docs/integrations/mistral" className="landing-agent-card">
            <div className="landing-agent-logo">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                <path clipRule="evenodd" d="M3.428 3.4h3.429v3.428h3.429v3.429h-.002 3.431V6.828h3.427V3.4h3.43v13.714H24v3.429H13.714v-3.428h-3.428v-3.429h-3.43v3.428h3.43v3.429H0v-3.429h3.428V3.4zm10.286 13.715h3.428v-3.429h-3.427v3.429z"/>
              </svg>
            </div>
            <span className="landing-agent-name">Mistral</span>
            <span className="landing-agent-tag">API</span>
          </Link>

          <Link to="/docs/integrations/cohere" className="landing-agent-card">
            <div className="landing-agent-logo">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                <path clipRule="evenodd" d="M8.128 14.099c.592 0 1.77-.033 3.398-.703 1.897-.781 5.672-2.2 8.395-3.656 1.905-1.018 2.74-2.366 2.74-4.18A4.56 4.56 0 0018.1 1H7.549A6.55 6.55 0 001 7.55c0 3.617 2.745 6.549 7.128 6.549z"/>
                <path clipRule="evenodd" d="M9.912 18.61a4.387 4.387 0 012.705-4.052l3.323-1.38c3.361-1.394 7.06 1.076 7.06 4.715a5.104 5.104 0 01-5.105 5.104l-3.597-.001a4.386 4.386 0 01-4.386-4.387z"/>
                <path d="M4.776 14.962A3.775 3.775 0 001 18.738v.489a3.776 3.776 0 007.551 0v-.49a3.775 3.775 0 00-3.775-3.775z"/>
              </svg>
            </div>
            <span className="landing-agent-name">Cohere</span>
            <span className="landing-agent-tag">API</span>
          </Link>

          <Link to="/docs" className="landing-agent-card landing-agent-more">
            <div className="landing-agent-logo">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="1"/>
                <circle cx="19" cy="12" r="1"/>
                <circle cx="5" cy="12" r="1"/>
              </svg>
            </div>
            <span className="landing-agent-name">Any MCP Agent</span>
            <span className="landing-agent-tag">Open Standard</span>
          </Link>
        </div>

        <div className="landing-compatibility-highlight">
          <div className="landing-highlight-item">
            <svg className="anim-icon" width="28" height="28" viewBox="0 0 32 32" fill="none">
              <path className="anim-shield-body" d="M16 29s10-5 10-13V7L16 3 6 7v9c0 8 10 13 10 13z" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path className="anim-shield-check" d="M11 16l3.5 3.5L21 12" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div>
              <strong>Local-first privacy</strong>
              <span>Your code never leaves your machine. Eywa syncs metadata only.</span>
            </div>
          </div>
          <div className="landing-highlight-item">
            <svg className="anim-icon" width="28" height="28" viewBox="0 0 32 32" fill="none">
              <path className="anim-cube-back" d="M16 4L4 10v12l12 6 12-6V10L16 4z" strokeWidth="2.5" strokeLinejoin="round"/>
              <path className="anim-cube-mid" d="M4 10l12 6 12-6" strokeWidth="2.5" strokeLinejoin="round"/>
              <path className="anim-cube-vert" d="M16 16v12" strokeWidth="2.5"/>
            </svg>
            <div>
              <strong>Zero config</strong>
              <span>Add one MCP server. That's it. Works with your existing setup.</span>
            </div>
          </div>
          <div className="landing-highlight-item">
            <svg className="anim-icon" width="28" height="28" viewBox="0 0 32 32" fill="none">
              <circle className="anim-team-head1" cx="16" cy="8" r="4" strokeWidth="2.5"/>
              <path className="anim-team-body1" d="M8 26v-2a8 8 0 0116 0v2" strokeWidth="2.5" strokeLinecap="round"/>
              <circle className="anim-team-head2" cx="26" cy="10" r="3" strokeWidth="2"/>
              <path className="anim-team-body2" d="M22 26v-1a5 5 0 015-1" strokeWidth="2" strokeLinecap="round"/>
              <circle className="anim-team-head3" cx="6" cy="10" r="3" strokeWidth="2"/>
              <path className="anim-team-body3" d="M10 26v-1a5 5 0 00-5-1" strokeWidth="2" strokeLinecap="round"/>
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
          <h2 className="landing-gemini-title">Ask questions across all your agents' threads</h2>
          <p className="landing-gemini-description">
            Drag context from multiple agent sessions into the workspace.
            Gemini synthesizes information across threads, resolves conflicts,
            and gives you answers that understand the full picture.
          </p>
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
            <div className="landing-pricing-price">Contact us</div>
            <ul className="landing-pricing-features">
              <li>Everything in Pro</li>
              <li>Custom deployment options</li>
              <li>Priority support</li>
              <li>Custom integrations</li>
              <li>Volume discounts</li>
            </ul>
            <a href="https://discord.gg/c7V2Ze58" className="btn-landing-secondary" style={{ width: "100%" }} target="_blank" rel="noopener noreferrer">
              Contact Us
            </a>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="landing-cta-section">
        <h2>Your agents are powerful. Make them a team.</h2>
        <p>92% of developers use AI coding tools daily. Eywa is the missing layer that lets their agents actually work together.</p>
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
            <div className="landing-logo">
              <EywaLogo size={32} />
              <span>Eywa</span>
            </div>
            <p>Shared memory for AI agent teams</p>
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
              <a href="https://github.com/a-sumo/eywa" target="_blank" rel="noopener noreferrer">Documentation</a>
              <a href="https://github.com/a-sumo/eywa" target="_blank" rel="noopener noreferrer">GitHub</a>
              <a href="https://discord.gg/c7V2Ze58" target="_blank" rel="noopener noreferrer">Discord</a>
            </div>
            <div className="landing-footer-col">
              <h4>Company</h4>
              <a href="https://discord.gg/c7V2Ze58" target="_blank" rel="noopener noreferrer">Contact</a>
              <a href="https://discord.gg/c7V2Ze58" target="_blank" rel="noopener noreferrer">Support</a>
            </div>
          </div>
          <div className="landing-footer-social">
            <a href="https://github.com/a-sumo/eywa" target="_blank" rel="noopener noreferrer" title="GitHub">
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
