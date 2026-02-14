import { useEffect, useRef, useState } from "react";

interface CounterProps {
  end: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
}

function AnimatedCounter({ end, suffix = "", prefix = "", duration = 2000 }: CounterProps) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const animate = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.round(eased * end));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [end, duration]);

  return <span ref={ref}>{prefix}{count}{suffix}</span>;
}

// Simulated weekly stats for a 4-person team running agents
// Agent compute cost: ~$0.50/min for Claude/GPT-4 class models
const COST_PER_HOUR = 30; // blended agent compute cost $/hr

const WITHOUT_EYWA = {
  duplicateRuns: 14,
  wastedHours: 23,
  conflictsMissed: 8,
  contextLost: 31,
};

const WITH_EYWA = {
  duplicateRuns: 0,
  wastedHours: 1.5,
  conflictsCaught: 8,
  contextRecovered: 31,
};

const WEEKLY_SAVINGS = Math.round((WITHOUT_EYWA.wastedHours - WITH_EYWA.wastedHours) * COST_PER_HOUR);
const MONTHLY_SAVINGS = WEEKLY_SAVINGS * 4;

export function ValueProps() {
  return (
    <section className="landing-section landing-roi-section" style={{ paddingBottom: "2rem" }}>
      <div className="landing-roi-badge">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        Weekly team report
      </div>
      <h2 className="landing-section-title" style={{ marginBottom: "0.5rem" }}>
        What a week of agent work looks like
      </h2>
      <p style={{
        textAlign: "center",
        maxWidth: 620,
        margin: "0 auto 2.5rem",
        opacity: 0.5,
        fontSize: "0.95rem",
        lineHeight: 1.6,
      }}>
        A 4-person team, each running AI coding agents. Here's where the compute goes.
      </p>

      <div className="landing-roi-dashboard">
        {/* Without Eywa */}
        <div className="landing-roi-panel landing-roi-without">
          <div className="landing-roi-panel-header">
            <div className="landing-roi-panel-dot landing-roi-dot-red" />
            Without Eywa
          </div>
          <div className="landing-roi-metrics">
            <div className="landing-roi-metric">
              <div className="landing-roi-metric-value landing-roi-bad">
                <AnimatedCounter end={WITHOUT_EYWA.duplicateRuns} />
              </div>
              <div className="landing-roi-metric-label">duplicate agent runs</div>
              <div className="landing-roi-metric-detail">
                Two agents building the same auth middleware, neither knows
              </div>
            </div>
            <div className="landing-roi-metric">
              <div className="landing-roi-metric-value landing-roi-bad">
                <AnimatedCounter end={WITHOUT_EYWA.wastedHours} suffix="h" />
              </div>
              <div className="landing-roi-metric-label">wasted compute</div>
              <div className="landing-roi-metric-detail">
                Agent sessions that produced code someone else already wrote
              </div>
            </div>
            <div className="landing-roi-metric">
              <div className="landing-roi-metric-value landing-roi-bad">
                <AnimatedCounter end={WITHOUT_EYWA.conflictsMissed} />
              </div>
              <div className="landing-roi-metric-label">conflicts found in PR review</div>
              <div className="landing-roi-metric-detail">
                Incompatible changes discovered after both agents shipped
              </div>
            </div>
            <div className="landing-roi-metric">
              <div className="landing-roi-metric-value landing-roi-bad">
                <AnimatedCounter end={WITHOUT_EYWA.contextLost} suffix="%" />
              </div>
              <div className="landing-roi-metric-label">context lost between sessions</div>
              <div className="landing-roi-metric-detail">
                Each new agent session starts cold, re-reads files, re-discovers decisions
              </div>
            </div>
          </div>
          <div className="landing-roi-total landing-roi-total-bad">
            <span className="landing-roi-total-label">Weekly cost</span>
            <span className="landing-roi-total-value">
              $<AnimatedCounter end={WITHOUT_EYWA.wastedHours * COST_PER_HOUR} duration={2500} /><span style={{ fontSize: "0.7em", opacity: 0.6 }}>/week</span>
            </span>
          </div>
        </div>

        {/* Arrow */}
        <div className="landing-roi-arrow">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <path d="M8 16h16M20 10l6 6-6 6" stroke="var(--aurora-cyan)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* With Eywa */}
        <div className="landing-roi-panel landing-roi-with">
          <div className="landing-roi-panel-header">
            <div className="landing-roi-panel-dot landing-roi-dot-green" />
            With Eywa
          </div>
          <div className="landing-roi-metrics">
            <div className="landing-roi-metric">
              <div className="landing-roi-metric-value landing-roi-good">
                <AnimatedCounter end={WITH_EYWA.duplicateRuns} />
              </div>
              <div className="landing-roi-metric-label">duplicate runs</div>
              <div className="landing-roi-metric-detail">
                Agents claim work before starting. Others see the claim and pick something else.
              </div>
            </div>
            <div className="landing-roi-metric">
              <div className="landing-roi-metric-value landing-roi-good">
                <AnimatedCounter end={15} prefix="~" suffix="m" duration={1800} />
              </div>
              <div className="landing-roi-metric-label">to detect conflicts</div>
              <div className="landing-roi-metric-detail">
                Live agent map shows overlapping work in real time, not after the PR is up
              </div>
            </div>
            <div className="landing-roi-metric">
              <div className="landing-roi-metric-value landing-roi-good">
                <AnimatedCounter end={WITH_EYWA.conflictsCaught} suffix="/8" />
              </div>
              <div className="landing-roi-metric-label">conflicts caught pre-commit</div>
              <div className="landing-roi-metric-detail">
                Context injection lets you course-correct agents before they ship
              </div>
            </div>
            <div className="landing-roi-metric">
              <div className="landing-roi-metric-value landing-roi-good">
                <AnimatedCounter end={100} suffix="%" />
              </div>
              <div className="landing-roi-metric-label">context preserved</div>
              <div className="landing-roi-metric-detail">
                Checkpoints, baton passing, and distress signals mean no work is lost
              </div>
            </div>
          </div>
          <div className="landing-roi-total landing-roi-total-good">
            <span className="landing-roi-total-label">Weekly cost</span>
            <span className="landing-roi-total-value">
              $<AnimatedCounter end={Math.round(WITH_EYWA.wastedHours * COST_PER_HOUR)} duration={2500} /><span style={{ fontSize: "0.7em", opacity: 0.6 }}>/week</span>
            </span>
          </div>
        </div>
      </div>

      {/* Bottom line savings banner */}
      <div className="landing-roi-savings">
        <div className="landing-roi-savings-inner">
          <div className="landing-roi-savings-amount">
            $<AnimatedCounter end={MONTHLY_SAVINGS} duration={2800} />
          </div>
          <div className="landing-roi-savings-label">
            saved per month in wasted agent compute
          </div>
          <div className="landing-roi-savings-detail">
            At $30/hr blended compute cost for a 4-person team. Your numbers will vary, but the pattern doesn't.
          </div>
        </div>
      </div>
    </section>
  );
}
