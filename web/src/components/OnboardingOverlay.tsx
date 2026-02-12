import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ConnectAgent } from "./ConnectAgent";
import { supabase } from "../lib/supabase";

interface OnboardingOverlayProps {
  slug: string;
  foldId: string;
  onDismiss: () => void;
}

function onboardingKey(foldId: string) {
  return `eywa-onboarding-dismissed-${foldId}`;
}

/**
 * Three-step onboarding wizard for empty rooms.
 * Step 1: Connect an AI agent
 * Step 2: Set a destination (what are you working toward?)
 * Step 3: Waiting for first session to appear
 *
 * Persists dismissal to localStorage so users don't see it again on refresh.
 */
export function OnboardingOverlay({ slug, foldId, onDismiss }: OnboardingOverlayProps) {
  const { t } = useTranslation("fold");
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Auto-dismiss if already dismissed for this fold
  useEffect(() => {
    try {
      if (localStorage.getItem(onboardingKey(foldId))) {
        onDismiss();
      }
    } catch {}
  }, [foldId, onDismiss]);

  // Wrap onDismiss to persist
  const handleDismiss = useCallback(() => {
    try { localStorage.setItem(onboardingKey(foldId), "1"); } catch {}
    onDismiss();
  }, [foldId, onDismiss]);

  // Destination state
  const [dest, setDest] = useState("");
  const [milestoneText, setMilestoneText] = useState("");
  const [savingDest, setSavingDest] = useState(false);

  const handleSaveDestination = useCallback(async () => {
    if (!dest.trim() || !foldId) return;
    setSavingDest(true);
    const milestones = milestoneText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const progress: Record<string, boolean> = {};
    for (const m of milestones) {
      progress[m] = false;
    }
    await supabase.from("memories").insert({
      fold_id: foldId,
      agent: "web-user",
      session_id: `web_${Date.now()}`,
      message_type: "knowledge",
      content: `DESTINATION: ${dest.trim()}`,
      token_count: Math.floor(dest.length / 4),
      metadata: {
        event: "destination",
        destination: dest.trim(),
        milestones,
        progress,
        notes: null,
        set_by: "web-user",
        last_updated_by: "web-user",
      },
    });
    setSavingDest(false);
    setStep(3);
  }, [dest, milestoneText, foldId]);

  const handleSkipDestination = useCallback(() => {
    setStep(3);
  }, []);

  return (
    <div className="onboarding-overlay">
      {/* Header */}
      <div className="onboarding-header">
        <h2 className="onboarding-title">{t("onboarding.title")}</h2>
        <button className="onboarding-dismiss" onClick={handleDismiss}>
          {t("onboarding.dismiss")}
        </button>
      </div>

      {/* Progress steps */}
      <div className="onboarding-progress">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`onboarding-step-indicator ${
              s === step ? "onboarding-step-current" : s < step ? "onboarding-step-done" : ""
            }`}
          >
            <div className="onboarding-step-dot">
              {s < step ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                s
              )}
            </div>
            <span className="onboarding-step-label">
              {s === 1 ? "Connect agent" : s === 2 ? "Set destination" : "Start working"}
            </span>
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="onboarding-content">
        {step === 1 && (
          <div className="onboarding-step-content">
            <div className="onboarding-step-intro">
              <h3>{t("onboarding.step1.title")}</h3>
              <p>
                {t("onboarding.step1.description")}
              </p>
            </div>
            <ConnectAgent slug={slug} />
            <div className="onboarding-actions">
              <button
                className="onboarding-btn-primary"
                onClick={() => setStep(2)}
              >
                I've connected my agent
              </button>
              <button
                className="onboarding-btn-ghost"
                onClick={() => setStep(2)}
              >
                I'll do this later
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-step-content">
            <div className="onboarding-step-intro">
              <h3>{t("onboarding.step2.title")}</h3>
              <p>
                {t("onboarding.step2.description")}
              </p>
            </div>
            <div className="onboarding-dest-form">
              <label className="onboarding-field">
                <span className="onboarding-field-label">Destination</span>
                <textarea
                  className="onboarding-textarea"
                  value={dest}
                  onChange={(e) => setDest(e.target.value)}
                  placeholder="What does done look like? e.g. Ship v2 auth with OAuth, JWT tokens, and session management"
                  rows={2}
                />
              </label>
              <label className="onboarding-field">
                <span className="onboarding-field-label">Milestones (optional, one per line)</span>
                <textarea
                  className="onboarding-textarea"
                  value={milestoneText}
                  onChange={(e) => setMilestoneText(e.target.value)}
                  placeholder={"OAuth provider integration\nJWT token service\nSession management\nEnd-to-end tests passing"}
                  rows={4}
                />
              </label>
            </div>
            <div className="onboarding-actions">
              <button
                className="onboarding-btn-primary"
                onClick={handleSaveDestination}
                disabled={!dest.trim() || savingDest}
              >
                {savingDest ? "Saving..." : "Set destination"}
              </button>
              <button
                className="onboarding-btn-ghost"
                onClick={handleSkipDestination}
              >
                Skip for now
              </button>
              <button
                className="onboarding-btn-back"
                onClick={() => setStep(1)}
              >
                Back
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="onboarding-step-content onboarding-step-waiting">
            <div className="onboarding-waiting-icon">
              <svg width="48" height="48" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="12" stroke="var(--aurora-cyan)" strokeWidth="1.5" strokeDasharray="6 4" className="onboarding-waiting-ring" />
                <circle cx="16" cy="16" r="4" fill="var(--aurora-cyan)" opacity="0.3" className="onboarding-waiting-core" />
                <circle cx="16" cy="16" r="2" fill="var(--aurora-cyan)" className="onboarding-waiting-dot" />
              </svg>
            </div>
            <h3>Waiting for your first agent session</h3>
            <p>
              Once your agent calls <code>eywa_start</code>, its session will appear here in real time.
              You'll see every operation, decision, and file change as it happens.
            </p>
            <div className="onboarding-checklist">
              <div className="onboarding-check-item onboarding-check-done">
                <span className="onboarding-check-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                Fold created
              </div>
              <div className={`onboarding-check-item ${step >= 2 ? "onboarding-check-done" : ""}`}>
                <span className="onboarding-check-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                MCP server configured
              </div>
              <div className="onboarding-check-item onboarding-check-waiting">
                <span className="onboarding-check-icon onboarding-check-pending" />
                First agent session
              </div>
            </div>
            <div className="onboarding-actions">
              <button
                className="onboarding-btn-primary"
                onClick={handleDismiss}
              >
                Go to Hub
              </button>
              <button
                className="onboarding-btn-back"
                onClick={() => setStep(2)}
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
