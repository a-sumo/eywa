import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFoldContext } from "../context/FoldContext";
import { useFold } from "../hooks/useFold";

export function DemoBanner() {
  const { t } = useTranslation("fold");
  const { t: tc } = useTranslation("common");
  const { fold, isDemo } = useFoldContext();
  const { createFold, creating } = useFold();
  const [dismissed, setDismissed] = useState(() => {
    if (!fold) return false;
    return localStorage.getItem(`demo-banner-dismissed-${fold.id}`) === "1";
  });

  if (!isDemo || dismissed || !fold) return null;

  function handleDismiss() {
    if (fold) {
      localStorage.setItem(`demo-banner-dismissed-${fold.id}`, "1");
    }
    setDismissed(true);
  }

  return (
    <div style={styles.banner}>
      <div style={styles.content}>
        <div style={styles.left}>
          <div style={styles.badge}>{t("demo.label")}</div>
          <span style={styles.text}>
            {t("demo.bannerEnhanced")}
          </span>
          <div style={styles.pills}>
            <span style={styles.pill}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                <path d="M12 6v6l4 2" />
              </svg>
              {t("demo.pillPersistent")}
            </span>
            <span style={styles.pill}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              {t("demo.pillMcpUrl")}
            </span>
            <span style={styles.pill}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              {t("demo.pillTeam")}
            </span>
          </div>
        </div>
        <div style={styles.actions}>
          <button
            style={creating ? { ...styles.createBtn, opacity: 0.6 } : styles.createBtn}
            onClick={() => createFold()}
            disabled={creating}
          >
            {creating ? tc("creating") : t("demo.createCta")}
            {!creating && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4 }}>
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            )}
          </button>
          <button style={styles.dismissBtn} onClick={handleDismiss} aria-label="Dismiss">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    background: "linear-gradient(135deg, rgba(100, 23, 236, 0.08) 0%, rgba(231, 43, 118, 0.06) 50%, rgba(21, 209, 255, 0.08) 100%)",
    borderBottom: "1px solid rgba(100, 23, 236, 0.2)",
    padding: "10px 16px",
    zIndex: 10,
    position: "relative" as const,
  },
  content: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    maxWidth: "1200px",
    margin: "0 auto",
  },
  left: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flex: 1,
    minWidth: 0,
    flexWrap: "wrap" as const,
  },
  badge: {
    fontSize: "10px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    color: "#E72B76",
    background: "rgba(231, 43, 118, 0.12)",
    border: "1px solid rgba(231, 43, 118, 0.25)",
    borderRadius: "4px",
    padding: "2px 8px",
    flexShrink: 0,
  },
  text: {
    fontSize: "13px",
    color: "rgba(255, 255, 255, 0.7)",
    lineHeight: 1.4,
  },
  pills: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap" as const,
  },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "11px",
    color: "rgba(255, 255, 255, 0.5)",
    background: "rgba(255, 255, 255, 0.04)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "12px",
    padding: "2px 8px",
    whiteSpace: "nowrap" as const,
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexShrink: 0,
  },
  createBtn: {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 16px",
    fontSize: "12px",
    fontWeight: 600,
    border: "none",
    borderRadius: "6px",
    background: "linear-gradient(135deg, #6417EC 0%, #E72B76 100%)",
    color: "#fff",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    transition: "opacity 0.2s ease-in-out, transform 0.15s ease-in-out",
    boxShadow: "0 2px 8px rgba(100, 23, 236, 0.3)",
  },
  dismissBtn: {
    padding: "4px",
    border: "none",
    background: "transparent",
    color: "rgba(255, 255, 255, 0.35)",
    cursor: "pointer",
    borderRadius: "4px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "color 0.15s ease-in-out",
  },
};
