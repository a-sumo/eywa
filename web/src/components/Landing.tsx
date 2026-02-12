import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useFold } from "../hooks/useFold";
import { FlowBackground } from "./FlowBackground";
import EywaLogo from "./EywaLogo";
import { TerminalDemo } from "./TerminalDemo";

function useGitHubStars() {
  const [stars, setStars] = useState<number | null>(null);
  useEffect(() => {
    fetch("https://api.github.com/repos/a-sumo/eywa")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.stargazers_count != null) setStars(data.stargazers_count); })
      .catch(() => {});
  }, []);
  return stars;
}

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

const IconDestination = () => (
  <svg className="anim-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
    <circle className="anim-target-outer" cx="16" cy="14" r="11" strokeWidth="2.5"/>
    <circle className="anim-target-mid" cx="16" cy="14" r="6" strokeWidth="2"/>
    <circle className="anim-target-center" cx="16" cy="14" r="2" strokeWidth="0" fill="var(--aurora-cyan, #4eeaff)"/>
    <line className="anim-flag-pole" x1="16" y1="14" x2="16" y2="29" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const IconTimeline = () => (
  <svg className="anim-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
    <line className="anim-timeline-trunk" x1="8" y1="4" x2="8" y2="28" strokeWidth="2.5" strokeLinecap="round"/>
    <path className="anim-timeline-branch" d="M8 12 C12 12 16 8 20 8" strokeWidth="2.5" strokeLinecap="round"/>
    <path className="anim-timeline-branch2" d="M8 22 C12 22 18 18 24 18" strokeWidth="2.5" strokeLinecap="round"/>
    <circle className="anim-neuron n1" cx="8" cy="12" r="2.5" strokeWidth="2"/>
    <circle className="anim-neuron n2" cx="20" cy="8" r="2.5" strokeWidth="2"/>
    <circle className="anim-neuron n3" cx="8" cy="22" r="2.5" strokeWidth="2"/>
    <circle className="anim-neuron n4" cx="24" cy="18" r="2.5" strokeWidth="2"/>
  </svg>
);

const IconNetwork = () => (
  <svg className="anim-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
    <circle className="anim-neuron n1" cx="16" cy="6" r="3" strokeWidth="2"/>
    <circle className="anim-neuron n2" cx="6" cy="26" r="3" strokeWidth="2"/>
    <circle className="anim-neuron n3" cx="26" cy="26" r="3" strokeWidth="2"/>
    <line className="anim-synapse sy1" x1="16" y1="9" x2="6" y2="23" strokeWidth="2"/>
    <line className="anim-synapse sy2" x1="16" y1="9" x2="26" y2="23" strokeWidth="2"/>
    <line className="anim-synapse sy3" x1="9" y1="26" x2="23" y2="26" strokeWidth="2"/>
    <circle className="anim-target-center" cx="16" cy="18" r="2" strokeWidth="0" fill="var(--aurora-pink, #f472b6)"/>
  </svg>
);

const IconHeartbeat = () => (
  <svg className="anim-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
    <path className="anim-stream s1" d="M3 16h6l3-8 4 16 3-8h10" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    <circle className="anim-node" cx="16" cy="16" r="2"/>
  </svg>
);

const IconSurfaces = () => (
  <svg className="anim-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
    <rect className="anim-cube-back" x="3" y="4" width="14" height="10" rx="2" strokeWidth="2"/>
    <rect className="anim-cube-mid" x="15" y="8" width="14" height="10" rx="2" strokeWidth="2"/>
    <rect className="anim-stream s1" x="6" y="18" width="10" height="10" rx="2" strokeWidth="2"/>
    <rect className="anim-stream s2" x="18" y="20" width="10" height="8" rx="2" strokeWidth="2"/>
  </svg>
);

const IconArrowRight = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

const IconGitHub = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
);

const IconDiscord = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);

export function Landing() {
  const { t } = useTranslation("landing");
  const { t: tc } = useTranslation("common");
  const { createFold, createDemoFold, creating, error } = useFold();
  const stars = useGitHubStars();

  return (
    <div className="landing-dark">
      <FlowBackground />

      {/* Header is now the global AppHeader in App.tsx */}

      {/* Hero */}
      <section className="landing-hero-dark">
        <div className="landing-hero-content">
          <h1 className="landing-hero-title">
            {t("hero.title")}<br />
            <span className="landing-hero-gradient">{t("hero.titleGradient")}</span>
          </h1>
          <p className="landing-hero-subtitle">
            {t("hero.subtitle")}
          </p>
          <div className="landing-hero-actions">
            <button
              className="btn-landing-primary btn-large"
              onClick={() => createDemoFold()}
              disabled={creating}
            >
              {creating ? tc("creating") : t("hero.tryDemo")}
              {!creating && <IconArrowRight />}
            </button>
            <button
              className="btn-landing-secondary"
              onClick={() => createFold()}
              disabled={creating}
            >
              {t("hero.createFold")}
            </button>
          </div>
          {error && (
            <div className="landing-error-banner">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
              <button className="landing-error-retry" onClick={() => createDemoFold()}>
                {tc("tryAgain")}
              </button>
            </div>
          )}

        </div>
      </section>

      {/* Social proof stats strip */}
      <section className="landing-stats-strip">
        <div className="landing-stat">
          <span className="landing-stat-value">{t("stats.openSource")}</span>
          <span className="landing-stat-label">{t("stats.mitLicensed")}</span>
        </div>
        <div className="landing-stat-divider" />
        <div className="landing-stat">
          <span className="landing-stat-value">40+</span>
          <span className="landing-stat-label">{t("stats.mcpTools")}</span>
        </div>
        <div className="landing-stat-divider" />
        <div className="landing-stat">
          <span className="landing-stat-value">9</span>
          <span className="landing-stat-label">{t("stats.agentIntegrations")}</span>
        </div>
        <div className="landing-stat-divider" />
        <div className="landing-stat">
          <span className="landing-stat-value">5</span>
          <span className="landing-stat-label">{t("stats.surfaces")}</span>
        </div>
        {stars != null && (
          <>
            <div className="landing-stat-divider" />
            <div className="landing-stat">
              <span className="landing-stat-value">{stars >= 1000 ? `${(stars / 1000).toFixed(1)}k` : stars}</span>
              <span className="landing-stat-label">{t("stats.githubStars")}</span>
            </div>
          </>
        )}
      </section>

      {/* Fade to solid background */}
      <div className="landing-fade-overlay" />

      {/* Problem */}
      <section className="landing-section" id="problem">
        <h2 className="landing-section-title">{t("problem.title")}</h2>
        <div className="landing-cards-grid">
          <div className="landing-card">
            <div className="landing-card-icon">
              <svg className="anim-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path className="anim-dup-line dup-a" d="M5 26L12 16l5 6 10-14" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path className="anim-dup-line dup-b" d="M5 26L12 16l5 6 10-14" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <circle className="anim-dup-dot" cx="27" cy="8" r="2.5"/>
              </svg>
            </div>
            <h3>{t("problem.duplicated.title")}</h3>
            <p>{t("problem.duplicated.description")}</p>
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
            <h3>{t("problem.divergence.title")}</h3>
            <p>{t("problem.divergence.description")}</p>
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
            <h3>{t("problem.context.title")}</h3>
            <p>{t("problem.context.description")}</p>
          </div>
        </div>
      </section>

      {/* Solution */}
      <section className="landing-section landing-section-alt">
        <h2 className="landing-section-title">{t("solution.title")}</h2>
        <div className="landing-steps">
          <div className="landing-step">
            <div className="landing-step-number">1</div>
            <div className="landing-step-content">
              <h3>{t("solution.step1.title")}</h3>
              <p dangerouslySetInnerHTML={{ __html: t("solution.step1.description") }} />
            </div>
          </div>
          <div className="landing-step">
            <div className="landing-step-number">2</div>
            <div className="landing-step-content">
              <h3>{t("solution.step2.title")}</h3>
              <p>{t("solution.step2.description")}</p>
            </div>
          </div>
          <div className="landing-step">
            <div className="landing-step-number">3</div>
            <div className="landing-step-content">
              <h3>{t("solution.step3.title")}</h3>
              <p>{t("solution.step3.description")}</p>
            </div>
          </div>
        </div>
        <TerminalDemo />
      </section>

      {/* Visual Proof - Animated Dashboard Mockup */}
      <section className="landing-section landing-proof-section">
        <h2 className="landing-section-title">{t("proof.title")}</h2>
        <p className="landing-proof-subtitle">
          {t("proof.subtitle")}
        </p>
        <div className="landing-proof-mockup">
          {/* Window chrome */}
          <div className="landing-proof-chrome">
            <div className="landing-proof-dots">
              <span /><span /><span />
            </div>
            <div className="landing-proof-url">eywa.ai/fold/acme-eng</div>
          </div>

          {/* Destination banner */}
          <div className="landing-proof-destination">
            <div className="landing-proof-dest-label">
              <svg width="14" height="14" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="14" r="11" stroke="currentColor" strokeWidth="2.5"/>
                <circle cx="16" cy="14" r="6" stroke="currentColor" strokeWidth="2"/>
                <circle cx="16" cy="14" r="2" fill="var(--aurora-cyan)"/>
              </svg>
              {t("proof.destination")}
            </div>
            <div className="landing-proof-dest-text">{t("proof.destText")}</div>
            <div className="landing-proof-dest-progress">
              <div className="landing-proof-dest-bar">
                <div className="landing-proof-dest-fill" />
              </div>
              <span>{t("proof.milestones", { done: 3, total: 5 })}</span>
            </div>
          </div>

          {/* Agent cards grid */}
          <div className="landing-proof-agents">
            <div className="landing-proof-agent">
              <div className="landing-proof-agent-header">
                <span className="landing-proof-status landing-proof-status-active" />
                <span className="landing-proof-agent-name">sarah/bright-fern</span>
                <span className="landing-proof-agent-phase">{t("proof.working")}</span>
              </div>
              <div className="landing-proof-agent-task">Implementing SAML provider integration</div>
              <div className="landing-proof-agent-progress-bar">
                <div className="landing-proof-agent-fill" style={{ width: '68%' }} />
              </div>
              <div className="landing-proof-agent-meta">
                <span className="landing-proof-tag landing-proof-tag-fs">filesystem</span>
                <span className="landing-proof-tag landing-proof-tag-git">git</span>
                <span className="landing-proof-agent-time">12m active</span>
              </div>
            </div>

            <div className="landing-proof-agent">
              <div className="landing-proof-agent-header">
                <span className="landing-proof-status landing-proof-status-testing" />
                <span className="landing-proof-agent-name">alex/quiet-moss</span>
                <span className="landing-proof-agent-phase landing-proof-phase-test">{t("proof.testing")}</span>
              </div>
              <div className="landing-proof-agent-task">Auth middleware unit tests</div>
              <div className="landing-proof-agent-progress-bar">
                <div className="landing-proof-agent-fill landing-proof-fill-green" style={{ width: '91%' }} />
              </div>
              <div className="landing-proof-agent-meta">
                <span className="landing-proof-tag landing-proof-tag-ci">ci</span>
                <span className="landing-proof-tag landing-proof-tag-fs">filesystem</span>
                <span className="landing-proof-agent-time">8m active</span>
              </div>
            </div>

            <div className="landing-proof-agent">
              <div className="landing-proof-agent-header">
                <span className="landing-proof-status landing-proof-status-deploy" />
                <span className="landing-proof-agent-name">mike/iron-tide</span>
                <span className="landing-proof-agent-phase landing-proof-phase-deploy">{t("proof.deploying")}</span>
              </div>
              <div className="landing-proof-agent-task">Session token refresh endpoint</div>
              <div className="landing-proof-agent-progress-bar">
                <div className="landing-proof-agent-fill landing-proof-fill-purple" style={{ width: '100%' }} />
              </div>
              <div className="landing-proof-agent-meta">
                <span className="landing-proof-tag landing-proof-tag-deploy">deploy</span>
                <span className="landing-proof-tag landing-proof-tag-api">api</span>
                <span className="landing-proof-agent-time">3m active</span>
              </div>
            </div>
          </div>

          {/* Activity stream */}
          <div className="landing-proof-stream">
            <div className="landing-proof-stream-header">{t("proof.activity")}</div>
            <div className="landing-proof-stream-items">
              <div className="landing-proof-stream-item landing-proof-stream-anim-1">
                <span className="landing-proof-stream-dot" style={{ background: 'var(--aurora-green)' }} />
                <span className="landing-proof-stream-agent">sarah/bright-fern</span>
                <span className="landing-proof-stream-text">wrote src/auth/saml-provider.ts</span>
                <span className="landing-proof-stream-time">now</span>
              </div>
              <div className="landing-proof-stream-item landing-proof-stream-anim-2">
                <span className="landing-proof-stream-dot" style={{ background: 'var(--aurora-cyan)' }} />
                <span className="landing-proof-stream-agent">alex/quiet-moss</span>
                <span className="landing-proof-stream-text">tests passed (14/14)</span>
                <span className="landing-proof-stream-time">12s ago</span>
              </div>
              <div className="landing-proof-stream-item landing-proof-stream-anim-3">
                <span className="landing-proof-stream-dot" style={{ background: 'var(--aurora-purple)' }} />
                <span className="landing-proof-stream-agent">mike/iron-tide</span>
                <span className="landing-proof-stream-text">deployed to staging</span>
                <span className="landing-proof-stream-time">45s ago</span>
              </div>
              <div className="landing-proof-stream-item landing-proof-stream-anim-4">
                <span className="landing-proof-stream-dot" style={{ background: 'var(--aurora-pink)' }} />
                <span className="landing-proof-stream-agent">sarah/bright-fern</span>
                <span className="landing-proof-stream-text">injected SSO config to alex/quiet-moss</span>
                <span className="landing-proof-stream-time">1m ago</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="landing-section" id="features">
        <h2 className="landing-section-title">{t("features.title")}</h2>
        <div className="landing-features-grid">
          <div className="landing-feature">
            <div className="landing-feature-icon"><IconDestination /></div>
            <h3>{t("features.destination.title")}</h3>
            <p>{t("features.destination.description")}</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon"><IconThreads /></div>
            <h3>{t("features.liveMap.title")}</h3>
            <p>{t("features.liveMap.description")}</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon"><IconInject /></div>
            <h3>{t("features.injection.title")}</h3>
            <p>{t("features.injection.description")}</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon"><IconBrain /></div>
            <h3>{t("features.knowledge.title")}</h3>
            <p>{t("features.knowledge.description")}</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon"><IconTimeline /></div>
            <h3>{t("features.timeline.title")}</h3>
            <p>{t("features.timeline.description")}</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon"><IconNetwork /></div>
            <h3>{t("features.network.title")}</h3>
            <p>{t("features.network.description")}</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon"><IconLink /></div>
            <h3>{t("features.recovery.title")}</h3>
            <p>{t("features.recovery.description")}</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon"><IconHeartbeat /></div>
            <h3>{t("features.telemetry.title")}</h3>
            <p>{t("features.telemetry.description")}</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon"><IconCode /></div>
            <h3>{t("features.vscode.title")}</h3>
            <p>{t("features.vscode.description")}</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon"><IconChat /></div>
            <h3>{t("features.discord.title")}</h3>
            <p>{t("features.discord.description")}</p>
          </div>
        </div>
      </section>

      {/* Surfaces */}
      <section className="landing-section landing-section-alt">
        <h2 className="landing-section-title">{t("surfaces.title")}</h2>
        <p style={{ textAlign: "center", maxWidth: 620, margin: "0 auto 2rem", opacity: 0.6, fontSize: "0.95rem", lineHeight: 1.6 }}>
          {t("surfaces.subtitle")}
        </p>
        <div className="landing-surfaces-strip">
          <div className="landing-surface-item">
            <IconSurfaces />
            <span>{t("surfaces.web")}</span>
          </div>
          <div className="landing-surface-item">
            <IconCode />
            <span>{t("surfaces.vscode")}</span>
          </div>
          <div className="landing-surface-item">
            <IconChat />
            <span>{t("surfaces.discord")}</span>
          </div>
          <div className="landing-surface-item">
            <svg className="anim-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
              <polyline className="anim-bracket bl" points="10,22 4,14 10,6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <line className="anim-cursor-line" x1="16" y1="24" x2="26" y2="24" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            <span>{t("surfaces.cli")}</span>
          </div>
          <div className="landing-surface-item">
            <svg className="anim-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path className="anim-stream s1" d="M4 16h6" strokeWidth="2.5" strokeLinecap="round"/>
              <path className="anim-stream s2" d="M22 16h6" strokeWidth="2.5" strokeLinecap="round"/>
              <rect className="anim-cube-back" x="8" y="10" width="16" height="12" rx="3" strokeWidth="2.5"/>
              <circle className="anim-target-center" cx="14" cy="16" r="1.5" fill="var(--aurora-cyan, #4eeaff)"/>
              <circle className="anim-target-center" cx="18" cy="16" r="1.5" fill="var(--aurora-cyan, #4eeaff)"/>
            </svg>
            <span>{t("surfaces.spectacles")}</span>
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
          {t("compatibility.badge")}
        </div>
        <h2 className="landing-section-title">{t("compatibility.title")}</h2>
        <p className="landing-compatibility-subtitle">
          {t("compatibility.subtitle")}
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
            <span className="landing-agent-name">{t("compatibility.anyAgent")}</span>
            <span className="landing-agent-tag">{t("compatibility.badge")}</span>
          </Link>
        </div>

        <div className="landing-compatibility-highlight">
          <div className="landing-highlight-item">
            <svg className="anim-icon" width="28" height="28" viewBox="0 0 32 32" fill="none">
              <path className="anim-shield-body" d="M16 29s10-5 10-13V7L16 3 6 7v9c0 8 10 13 10 13z" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path className="anim-shield-check" d="M11 16l3.5 3.5L21 12" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div>
              <strong>{t("compatibility.privacy.title")}</strong>
              <span>{t("compatibility.privacy.description")}</span>
            </div>
          </div>
          <div className="landing-highlight-item">
            <svg className="anim-icon" width="28" height="28" viewBox="0 0 32 32" fill="none">
              <path className="anim-cube-back" d="M16 4L4 10v12l12 6 12-6V10L16 4z" strokeWidth="2.5" strokeLinejoin="round"/>
              <path className="anim-cube-mid" d="M4 10l12 6 12-6" strokeWidth="2.5" strokeLinejoin="round"/>
              <path className="anim-cube-vert" d="M16 16v12" strokeWidth="2.5"/>
            </svg>
            <div>
              <strong>{t("compatibility.zeroConfig.title")}</strong>
              <span>{t("compatibility.zeroConfig.description")}</span>
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
              <strong>{t("compatibility.teamWide.title")}</strong>
              <span>{t("compatibility.teamWide.description")}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Memory Persistence */}
      <section className="landing-section landing-memory-section">
        <div className="landing-memory-icon">
          <svg className="anim-icon" width="56" height="56" viewBox="0 0 56 56" fill="none">
            <polygon className="anim-crystal-face c1" points="28,4 44,20 28,52 12,20" strokeWidth="2" strokeLinejoin="round"/>
            <polygon className="anim-crystal-face c2" points="28,4 44,20 28,28" strokeWidth="1.5" strokeLinejoin="round"/>
            <polygon className="anim-crystal-face c3" points="28,4 12,20 28,28" strokeWidth="1.5" strokeLinejoin="round"/>
            <line className="anim-crystal-axis" x1="28" y1="4" x2="28" y2="52" strokeWidth="1" strokeDasharray="3 3"/>
            <circle className="anim-crystal-node cn1" cx="28" cy="20" r="2.5" strokeWidth="1.5"/>
            <circle className="anim-crystal-node cn2" cx="28" cy="36" r="2" strokeWidth="1.5"/>
          </svg>
        </div>
        <h2 className="landing-memory-title">{t("memory.title")}</h2>
        <p className="landing-memory-description">
          {t("memory.description")}
        </p>
        <div className="landing-memory-points">
          <div className="landing-memory-point">
            <svg className="anim-icon" width="24" height="24" viewBox="0 0 32 32" fill="none">
              <path className="anim-stream s1" d="M16 4v24" strokeWidth="2.5" strokeLinecap="round"/>
              <circle className="anim-neuron n1" cx="16" cy="8" r="3" strokeWidth="2"/>
              <circle className="anim-neuron n2" cx="16" cy="16" r="3" strokeWidth="2"/>
              <circle className="anim-neuron n3" cx="16" cy="24" r="3" strokeWidth="2"/>
            </svg>
            <div>
              <strong>{t("memory.permanent.title")}</strong>
              <span>{t("memory.permanent.description")}</span>
            </div>
          </div>
          <div className="landing-memory-point">
            <svg className="anim-icon" width="24" height="24" viewBox="0 0 32 32" fill="none">
              <rect className="anim-cube-back" x="6" y="6" width="20" height="20" rx="3" strokeWidth="2"/>
              <line className="anim-synapse sy1" x1="12" y1="6" x2="12" y2="26" strokeWidth="1.5" strokeDasharray="2 2"/>
              <line className="anim-synapse sy2" x1="20" y1="6" x2="20" y2="26" strokeWidth="1.5" strokeDasharray="2 2"/>
              <line className="anim-synapse sy3" x1="6" y1="12" x2="26" y2="12" strokeWidth="1.5" strokeDasharray="2 2"/>
              <line className="anim-synapse sy4" x1="6" y1="20" x2="26" y2="20" strokeWidth="1.5" strokeDasharray="2 2"/>
            </svg>
            <div>
              <strong>{t("memory.structured.title")}</strong>
              <span>{t("memory.structured.description")}</span>
            </div>
          </div>
          <div className="landing-memory-point">
            <svg className="anim-icon" width="24" height="24" viewBox="0 0 32 32" fill="none">
              <path className="anim-shield-body" d="M16 28s9-4.5 9-12V8l-9-4-9 4v8c0 7.5 9 12 9 12z" strokeWidth="2" strokeLinejoin="round"/>
              <path className="anim-shield-check" d="M12 16l3 3 5-5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div>
              <strong>{t("memory.yours.title")}</strong>
              <span>{t("memory.yours.description")}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Trust & Security */}
      <section className="landing-section landing-section-alt landing-trust-section">
        <h2 className="landing-section-title">{t("trust.title")}</h2>
        <p className="landing-trust-subtitle">
          {t("trust.subtitle")}
        </p>

        <div className="landing-trust-grid">
          <div className="landing-trust-card">
            <div className="landing-trust-card-icon">
              <svg className="anim-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
                <rect className="anim-cube-back" x="4" y="4" width="24" height="24" rx="4" strokeWidth="2"/>
                <path className="anim-stream s1" d="M16 4v24" strokeWidth="1.5" strokeDasharray="2 3"/>
                <path className="anim-stream s2" d="M4 16h24" strokeWidth="1.5" strokeDasharray="2 3"/>
                <circle className="anim-neuron n1" cx="10" cy="10" r="2.5" strokeWidth="2"/>
                <circle className="anim-neuron n2" cx="22" cy="10" r="2.5" strokeWidth="2"/>
                <circle className="anim-neuron n3" cx="10" cy="22" r="2.5" strokeWidth="2"/>
                <circle className="anim-neuron n4" cx="22" cy="22" r="2.5" strokeWidth="2"/>
              </svg>
            </div>
            <h3>{t("trust.metadata.title")}</h3>
            <p>{t("trust.metadata.description")}</p>
          </div>

          <div className="landing-trust-card">
            <div className="landing-trust-card-icon">
              <svg className="anim-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
                <polyline className="anim-bracket bl" points="11,6 4,16 11,26" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline className="anim-bracket br" points="21,6 28,16 21,26" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <circle className="anim-target-center" cx="16" cy="16" r="3" strokeWidth="2"/>
              </svg>
            </div>
            <h3>{t("trust.openSource.title")}</h3>
            <p>{t("trust.openSource.description")}</p>
          </div>

          <div className="landing-trust-card">
            <div className="landing-trust-card-icon">
              <svg className="anim-icon" width="32" height="32" viewBox="0 0 32 32" fill="none">
                <rect className="anim-cube-back" x="6" y="10" width="20" height="16" rx="3" strokeWidth="2"/>
                <path className="anim-stream s1" d="M6 16h20" strokeWidth="1.5"/>
                <circle className="anim-neuron n1" cx="16" cy="6" r="4" strokeWidth="2"/>
                <path className="anim-synapse sy1" d="M12 10V8" strokeWidth="2" strokeLinecap="round"/>
                <path className="anim-synapse sy2" d="M20 10V8" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <h3>{t("trust.selfHost.title")}</h3>
            <p>{t("trust.selfHost.description")}</p>
          </div>
        </div>

        <div className="landing-trust-dataflow">
          <div className="landing-trust-flow-label">{t("trust.whatSees")}</div>
          <div className="landing-trust-flow-items">
            <span className="landing-trust-tag trust-yes">{t("trust.tags.taskDescriptions")}</span>
            <span className="landing-trust-tag trust-yes">{t("trust.tags.agentStatus")}</span>
            <span className="landing-trust-tag trust-yes">{t("trust.tags.operationLogs")}</span>
            <span className="landing-trust-tag trust-yes">{t("trust.tags.decisions")}</span>
            <span className="landing-trust-tag trust-yes">{t("trust.tags.progress")}</span>
          </div>
          <div className="landing-trust-flow-label">{t("trust.whatStays")}</div>
          <div className="landing-trust-flow-items">
            <span className="landing-trust-tag trust-no">{t("trust.tags.sourceCode")}</span>
            <span className="landing-trust-tag trust-no">{t("trust.tags.apiKeys")}</span>
            <span className="landing-trust-tag trust-no">{t("trust.tags.envVars")}</span>
            <span className="landing-trust-tag trust-no">{t("trust.tags.fileContents")}</span>
            <span className="landing-trust-tag trust-no">{t("trust.tags.credentials")}</span>
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
          <h2 className="landing-gemini-title">{t("gemini.title")}</h2>
          <p className="landing-gemini-description">
            {t("gemini.description")}
          </p>
        </div>
      </section>

      {/* Quick Start Terminal */}
      <section className="landing-section" id="quickstart">
        <h2 className="landing-section-title">{t("quickstart.title")}</h2>
        <p style={{ textAlign: "center", maxWidth: 560, margin: "0 auto 0", opacity: 0.6, fontSize: "0.95rem", lineHeight: 1.6 }}>
          {t("quickstart.subtitle")}
        </p>
        <TerminalDemo />
        <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
          <Link to="/docs/quickstart" className="btn-landing-secondary" style={{ fontSize: "0.85rem" }}>
            {t("quickstart.readGuide")} <IconArrowRight />
          </Link>
        </div>
      </section>

      {/* Pricing */}
      <section className="landing-section landing-section-alt" id="pricing">
        <h2 className="landing-section-title">{t("pricing.title")}</h2>
        <div className="landing-pricing-grid">
          <div className="landing-pricing-card">
            <h3>{t("pricing.free.title")}</h3>
            <div className="landing-pricing-price">{t("pricing.free.price")}</div>
            <ul className="landing-pricing-features">
              <li>{t("pricing.free.members")}</li>
              <li>{t("pricing.free.workspaces")}</li>
              <li>{t("pricing.free.history")}</li>
              <li>{t("pricing.free.memories")}</li>
              <li>{t("pricing.free.integrations")}</li>
            </ul>
            <button className="btn-landing-secondary" style={{ width: "100%" }} onClick={() => createDemoFold()} disabled={creating}>
              {t("pricing.free.cta")}
            </button>
          </div>
          <div className="landing-pricing-card landing-pricing-featured">
            <div className="landing-pricing-badge">{t("pricing.pro.badge")}</div>
            <h3>{t("pricing.pro.title")}</h3>
            <div className="landing-pricing-price">{t("pricing.pro.price")}</div>
            <ul className="landing-pricing-features">
              <li>{t("pricing.pro.members")}</li>
              <li>{t("pricing.pro.history")}</li>
              <li>{t("pricing.pro.memories")}</li>
              <li>{t("pricing.pro.knowledge")}</li>
              <li>{t("pricing.pro.timeline")}</li>
            </ul>
            <a href="mailto:eywa.ai.team@gmail.com" className="btn-landing-primary" style={{ width: "100%" }}>
              {t("pricing.pro.cta")}
            </a>
          </div>
          <div className="landing-pricing-card">
            <h3>{t("pricing.enterprise.title")}</h3>
            <div className="landing-pricing-price">{t("pricing.enterprise.price")}</div>
            <ul className="landing-pricing-features">
              <li>{t("pricing.enterprise.everything")}</li>
              <li>{t("pricing.enterprise.storage")}</li>
              <li>{t("pricing.enterprise.deployment")}</li>
              <li>{t("pricing.enterprise.integrations")}</li>
              <li>{t("pricing.enterprise.discounts")}</li>
            </ul>
            <a href="mailto:eywa.ai.team@gmail.com" className="btn-landing-secondary" style={{ width: "100%" }}>
              {t("pricing.enterprise.cta")}
            </a>
          </div>
        </div>
      </section>

      {/* Open Source Community */}
      <section className="landing-cta-section">
        <h2>{t("community.title")}</h2>
        <p>{t("community.description")}</p>
        <div className="landing-community-links">
          <a href="https://github.com/a-sumo/eywa" className="btn-community btn-community-github" target="_blank" rel="noopener noreferrer">
            <IconGitHub />
            <span>GitHub{stars != null ? ` (${stars >= 1000 ? `${(stars / 1000).toFixed(1)}k` : stars} stars)` : ""}</span>
          </a>
          <a href="https://discord.gg/TyEUUnNm" className="btn-community btn-community-discord" target="_blank" rel="noopener noreferrer">
            <IconDiscord />
            <span>{t("community.joinDiscord")}</span>
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
            <p>{t("footer.by")} <a href="https://curvilinear.space" target="_blank" rel="noopener noreferrer">Curvilinear</a></p>
          </div>
          <div className="landing-footer-links">
            <div className="landing-footer-col">
              <h4>{t("footer.product")}</h4>
              <a href="#features">{t("footer.features")}</a>
              <a href="#pricing">{t("footer.pricing")}</a>
              <a href="#quickstart">{t("footer.quickStart")}</a>
              <button className="landing-footer-link-btn" onClick={() => createDemoFold()} disabled={creating}>{t("footer.tryDemo")}</button>
            </div>
            <div className="landing-footer-col">
              <h4>{t("footer.resources")}</h4>
              <a href="/docs">{t("footer.documentation")}</a>
              <a href="/llms.txt" target="_blank" rel="noopener noreferrer">{t("footer.llmDocs")}</a>
              <a href="https://github.com/a-sumo/eywa" target="_blank" rel="noopener noreferrer">GitHub</a>
              <a href="https://discord.gg/TyEUUnNm" target="_blank" rel="noopener noreferrer">Discord</a>
            </div>
            <div className="landing-footer-col">
              <h4>{t("footer.company")}</h4>
              <a href="https://curvilinear.space" target="_blank" rel="noopener noreferrer">{t("footer.about")}</a>
              <a href="mailto:eywa.ai.team@gmail.com">{t("footer.contact")}</a>
            </div>
          </div>
          <div className="landing-footer-community">
            <h4>{t("footer.community")}</h4>
            <div className="landing-footer-community-links">
              <a href="https://github.com/a-sumo/eywa" target="_blank" rel="noopener noreferrer" className="footer-community-card">
                <IconGitHub />
                <div>
                  <span className="footer-community-label">GitHub</span>
                  <span className="footer-community-desc">{t("footer.viewSource")}</span>
                </div>
              </a>
              <a href="https://discord.gg/TyEUUnNm" target="_blank" rel="noopener noreferrer" className="footer-community-card">
                <IconDiscord />
                <div>
                  <span className="footer-community-label">Discord</span>
                  <span className="footer-community-desc">{t("footer.joinCommunity")}</span>
                </div>
              </a>
            </div>
          </div>
        </div>
        <div className="landing-footer-bottom">
          <p>© 2026 <a href="https://curvilinear.space" target="_blank" rel="noopener noreferrer">Curvilinear</a></p>
          <a
            href="https://gemini.google/us/about"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-gemini-link"
          >
            {t("footer.poweredBy")}
          </a>
        </div>
      </footer>
    </div>
  );
}
