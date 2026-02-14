import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";

// Agent simulation data - each agent cycles through phases and tasks
const AGENTS = [
  {
    name: "sarah/bright-fern",
    phases: [
      { phase: "working", task: "Implementing SAML provider integration", systems: ["filesystem", "git"] },
      { phase: "working", task: "Writing SAML token validation logic", systems: ["filesystem", "ci"] },
      { phase: "testing", task: "Running SAML integration test suite", systems: ["ci", "filesystem"] },
      { phase: "deploying", task: "Deploying auth service to staging", systems: ["deploy", "api"] },
    ],
  },
  {
    name: "alex/quiet-moss",
    phases: [
      { phase: "testing", task: "Auth middleware unit tests", systems: ["ci", "filesystem"] },
      { phase: "working", task: "Adding rate limiting to auth endpoints", systems: ["filesystem", "api"] },
      { phase: "working", task: "Wiring up session token refresh", systems: ["filesystem", "git"] },
      { phase: "testing", task: "Testing session token expiry edge cases", systems: ["ci", "filesystem"] },
    ],
  },
  {
    name: "mike/iron-tide",
    phases: [
      { phase: "deploying", task: "Session token refresh endpoint", systems: ["deploy", "api"] },
      { phase: "working", task: "Adding OAuth callback handler", systems: ["filesystem", "git"] },
      { phase: "working", task: "Writing token rotation logic", systems: ["filesystem", "api"] },
      { phase: "testing", task: "OAuth flow end-to-end tests", systems: ["ci", "deploy"] },
    ],
  },
];

// Activity stream events that cycle
const ACTIVITIES = [
  { agent: "sarah/bright-fern", text: "wrote src/auth/saml-provider.ts", color: "var(--aurora-green)" },
  { agent: "alex/quiet-moss", text: "tests passed (14/14)", color: "var(--aurora-cyan)" },
  { agent: "mike/iron-tide", text: "deployed to staging", color: "var(--aurora-purple)" },
  { agent: "sarah/bright-fern", text: "injected SSO config to alex/quiet-moss", color: "var(--aurora-pink)" },
  { agent: "alex/quiet-moss", text: "wrote src/middleware/rate-limit.ts", color: "var(--aurora-green)" },
  { agent: "mike/iron-tide", text: "committed abc1234: add OAuth callback", color: "var(--aurora-cyan)" },
  { agent: "sarah/bright-fern", text: "tests passed (8/8)", color: "var(--aurora-green)" },
  { agent: "alex/quiet-moss", text: "knowledge: rate limit uses sliding window", color: "var(--aurora-purple)" },
  { agent: "mike/iron-tide", text: "wrote src/auth/token-rotation.ts", color: "var(--aurora-green)" },
  { agent: "sarah/bright-fern", text: "deployed auth service to staging", color: "var(--aurora-purple)" },
  { agent: "alex/quiet-moss", text: "injected session schema to mike/iron-tide", color: "var(--aurora-pink)" },
  { agent: "mike/iron-tide", text: "tests passed (22/22)", color: "var(--aurora-cyan)" },
];

const PHASE_META: Record<string, { label: string; cssClass: string; statusClass: string }> = {
  working: { label: "working", cssClass: "", statusClass: "landing-proof-status-active" },
  testing: { label: "testing", cssClass: "landing-proof-phase-test", statusClass: "landing-proof-status-testing" },
  deploying: { label: "deploying", cssClass: "landing-proof-phase-deploy", statusClass: "landing-proof-status-deploy" },
};

const SYSTEM_TAGS: Record<string, string> = {
  filesystem: "landing-proof-tag-fs",
  git: "landing-proof-tag-git",
  ci: "landing-proof-tag-ci",
  deploy: "landing-proof-tag-deploy",
  api: "landing-proof-tag-api",
};

const MILESTONES = [
  "OAuth provider integration",
  "JWT token service",
  "Session management",
  "SAML SSO support",
  "End-to-end auth tests",
];

function formatTimeAgo(seconds: number): string {
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

/**
 * Animated dashboard mockup for the landing page proof section.
 * Cycles through agent phases, advancing progress bars, and a live activity stream
 * to show visitors what Eywa looks like when agents are actively coordinating.
 */
export function DashboardMockup() {
  const { t } = useTranslation("landing");

  // Agent phase indices (which phase each agent is currently showing)
  const [agentPhases, setAgentPhases] = useState([0, 0, 0]);
  // Agent progress percentages
  const [agentProgress, setAgentProgress] = useState([42, 67, 88]);
  // Which milestones are complete
  const [milestoneDone, setMilestoneDone] = useState([true, true, false, false, false]);
  // Activity stream: indices into ACTIVITIES, newest first
  const [activityIndices, setActivityIndices] = useState([0, 1, 2, 3]);
  // Which activity item is entering (for slide-in animation)
  const [enteringIdx, setEnteringIdx] = useState<number | null>(null);
  // Cumulative time counter for "ago" display
  const tickRef = useRef(0);

  // Progress advancement: smooth increase every 800ms
  useEffect(() => {
    const interval = setInterval(() => {
      setAgentProgress((prev) => {
        return prev.map((p, i) => {
          // Add 1-3% per tick, wrapping around when reaching 100
          const increment = [1.2, 0.8, 1.5][i];
          const next = p + increment;
          return next > 100 ? 15 + Math.random() * 10 : next;
        });
      });
    }, 800);
    return () => clearInterval(interval);
  }, []);

  // Phase cycling: every 5 seconds, advance one agent to next phase
  useEffect(() => {
    const interval = setInterval(() => {
      setAgentPhases((prev) => {
        const next = [...prev];
        // Pick the agent that's been in its current phase the longest
        const agentToAdvance = tickRef.current % 3;
        next[agentToAdvance] = (next[agentToAdvance] + 1) % AGENTS[agentToAdvance].phases.length;
        return next;
      });
      tickRef.current++;
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Activity stream: new item slides in every 3 seconds
  const activityCounter = useRef(4);
  useEffect(() => {
    const interval = setInterval(() => {
      const newIdx = activityCounter.current % ACTIVITIES.length;
      setEnteringIdx(newIdx);
      setActivityIndices((prev) => {
        return [newIdx, prev[0], prev[1], prev[2]];
      });
      activityCounter.current++;

      // Clear entering state after animation completes
      setTimeout(() => setEnteringIdx(null), 400);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Milestone completion: check off one every 8 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setMilestoneDone((prev) => {
        const nextFalse = prev.indexOf(false);
        if (nextFalse === -1) {
          // All done, reset after a pause
          return [true, true, false, false, false];
        }
        const next = [...prev];
        next[nextFalse] = true;
        return next;
      });
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const milestoneDoneCount = milestoneDone.filter(Boolean).length;
  const progressPct = Math.round((milestoneDoneCount / MILESTONES.length) * 100);

  // Memoize active time formatter
  const getActiveTime = useCallback((agentIdx: number) => {
    const base = [12, 8, 3][agentIdx];
    const extra = Math.floor(tickRef.current * 0.5);
    return `${base + extra}m active`;
  }, []);

  return (
    <section className="landing-section landing-proof-section">
      <h2 className="landing-section-title">{t("proof.title")}</h2>
      <p className="landing-proof-subtitle">{t("proof.subtitle")}</p>
      <div className="landing-proof-mockup">
        {/* Window chrome */}
        <div className="landing-proof-chrome">
          <div className="landing-proof-dots">
            <span /><span /><span />
          </div>
          <div className="landing-proof-url">eywa-ai.dev/f/acme-eng</div>
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
          <div className="landing-proof-dest-milestones">
            {MILESTONES.map((m, i) => (
              <span
                key={m}
                className={`landing-proof-milestone ${milestoneDone[i] ? "landing-proof-milestone-done" : ""}`}
              >
                {milestoneDone[i] && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
                {m}
              </span>
            ))}
          </div>
          <div className="landing-proof-dest-progress">
            <div className="landing-proof-dest-bar">
              <div
                className="landing-proof-dest-fill-animated"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span>{t("proof.milestones", { done: milestoneDoneCount, total: MILESTONES.length })}</span>
          </div>
        </div>

        {/* Agent cards grid */}
        <div className="landing-proof-agents">
          {AGENTS.map((agent, i) => {
            const phaseData = agent.phases[agentPhases[i]];
            const meta = PHASE_META[phaseData.phase];
            const progress = Math.min(100, Math.round(agentProgress[i]));
            const fillClass = phaseData.phase === "testing"
              ? "landing-proof-fill-green"
              : phaseData.phase === "deploying"
              ? "landing-proof-fill-purple"
              : "";

            return (
              <div className="landing-proof-agent" key={agent.name}>
                <div className="landing-proof-agent-header">
                  <span className={`landing-proof-status ${meta.statusClass}`} />
                  <span className="landing-proof-agent-name">{agent.name}</span>
                  <span className={`landing-proof-agent-phase ${meta.cssClass}`}>
                    {meta.label}
                  </span>
                </div>
                <div className="landing-proof-agent-task landing-proof-task-cycle">
                  {phaseData.task}
                </div>
                <div className="landing-proof-agent-progress-bar">
                  <div
                    className={`landing-proof-agent-fill ${fillClass}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="landing-proof-agent-meta">
                  {phaseData.systems.map((sys) => (
                    <span className={`landing-proof-tag ${SYSTEM_TAGS[sys] || ""}`} key={sys}>
                      {sys}
                    </span>
                  ))}
                  <span className="landing-proof-agent-time">{getActiveTime(i)}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Activity stream */}
        <div className="landing-proof-stream">
          <div className="landing-proof-stream-header">{t("proof.activity")}</div>
          <div className="landing-proof-stream-items">
            {activityIndices.map((actIdx, pos) => {
              const act = ACTIVITIES[actIdx];
              const isEntering = pos === 0 && enteringIdx === actIdx;
              const timeAgo = pos === 0 ? "now" : formatTimeAgo(pos * 12);
              return (
                <div
                  className={`landing-proof-stream-item ${isEntering ? "landing-proof-stream-enter" : ""}`}
                  key={`${actIdx}-${pos}`}
                >
                  <span className="landing-proof-stream-dot" style={{ background: act.color }} />
                  <span className="landing-proof-stream-agent">{act.agent}</span>
                  <span className="landing-proof-stream-text">{act.text}</span>
                  <span className="landing-proof-stream-time">{timeAgo}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
