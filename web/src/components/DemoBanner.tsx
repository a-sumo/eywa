import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFoldContext } from "../context/FoldContext";
import { supabase } from "../lib/supabase";

export function DemoBanner() {
  const { fold, isDemo } = useFoldContext();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => {
    if (!fold) return false;
    return localStorage.getItem(`demo-banner-dismissed-${fold.id}`) === "1";
  });
  const [creating, setCreating] = useState(false);

  if (!isDemo || dismissed || !fold) return null;

  function handleDismiss() {
    if (fold) {
      localStorage.setItem(`demo-banner-dismissed-${fold.id}`, "1");
    }
    setDismissed(true);
  }

  async function handleCreateFold() {
    setCreating(true);
    const adjectives = ["cosmic", "lunar", "solar", "stellar", "quantum", "neural", "cyber", "astral"];
    const nouns = ["fox", "owl", "wolf", "hawk", "bear", "lynx", "raven", "phoenix"];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const code = Math.random().toString(36).substring(2, 6);
    const slug = `${adj}-${noun}-${code}`;
    const name = `${adj.charAt(0).toUpperCase() + adj.slice(1)} ${noun.charAt(0).toUpperCase() + noun.slice(1)}`;

    const { data, error } = await supabase
      .from("rooms")
      .insert({ slug, name, is_demo: false })
      .select()
      .single();

    setCreating(false);

    if (data && !error) {
      navigate(`/f/${slug}`);
    }
  }

  return (
    <div style={styles.banner}>
      <div style={styles.content}>
        <div style={styles.left}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7 }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span style={styles.text}>
            You're exploring a demo fold with sample data. Create your own fold to connect your agents.
          </span>
        </div>
        <div style={styles.actions}>
          <button
            style={creating ? { ...styles.createBtn, opacity: 0.6 } : styles.createBtn}
            onClick={handleCreateFold}
            disabled={creating}
          >
            {creating ? "Creating..." : "Create Your Fold"}
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
    background: "linear-gradient(135deg, rgba(78, 234, 255, 0.06), rgba(168, 85, 247, 0.06))",
    borderBottom: "1px solid rgba(78, 234, 255, 0.15)",
    padding: "8px 16px",
    zIndex: 10,
    position: "relative",
  },
  content: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    maxWidth: "1200px",
    margin: "0 auto",
  },
  left: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flex: 1,
    minWidth: 0,
  },
  text: {
    fontSize: "13px",
    color: "rgba(255, 255, 255, 0.7)",
    lineHeight: 1.4,
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexShrink: 0,
  },
  createBtn: {
    padding: "5px 14px",
    fontSize: "12px",
    fontWeight: 600,
    border: "1px solid rgba(78, 234, 255, 0.3)",
    borderRadius: "6px",
    background: "rgba(78, 234, 255, 0.1)",
    color: "#4eeaff",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    transition: "background 0.2s, border-color 0.2s",
  },
  dismissBtn: {
    padding: "4px",
    border: "none",
    background: "transparent",
    color: "rgba(255, 255, 255, 0.4)",
    cursor: "pointer",
    borderRadius: "4px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
};
