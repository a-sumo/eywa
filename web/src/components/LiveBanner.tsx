import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useRoomContext } from "../context/RoomContext";
import { useRoom } from "../hooks/useRoom";

export function LiveBanner() {
  const { slug } = useParams<{ slug: string }>();
  const { room } = useRoomContext();
  const { createDemoRoom, creating } = useRoom();
  const [dismissed, setDismissed] = useState(false);

  if ((slug !== "live" && slug !== "eywa-dev") || dismissed || !room) return null;

  return (
    <div style={styles.banner}>
      <div style={styles.content}>
        <div style={styles.left}>
          <span style={styles.dot} />
          <span style={styles.text}>
            <strong>You're watching live autonomous agents.</strong>{" "}
            These agents are writing real code in real time.
          </span>
        </div>
        <div style={styles.actions}>
          <button
            style={creating ? { ...styles.actionBtn, opacity: 0.6 } : styles.actionBtn}
            onClick={() => createDemoRoom()}
            disabled={creating}
          >
            {creating ? "Creating..." : "Try Demo"}
          </button>
          <Link to="/" style={styles.actionBtnSecondary}>
            Create Room
          </Link>
          <button style={styles.dismissBtn} onClick={() => setDismissed(true)} aria-label="Dismiss">
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
    background: "linear-gradient(135deg, rgba(74, 222, 128, 0.08), rgba(78, 234, 255, 0.06))",
    borderBottom: "1px solid rgba(74, 222, 128, 0.2)",
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
    gap: "10px",
    flex: 1,
    minWidth: 0,
  },
  dot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: "#4ade80",
    boxShadow: "0 0 8px rgba(74, 222, 128, 0.6)",
    flexShrink: 0,
    animation: "live-pulse 2s ease-in-out infinite",
  },
  text: {
    fontSize: "13px",
    color: "rgba(255, 255, 255, 0.8)",
    lineHeight: 1.4,
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexShrink: 0,
  },
  actionBtn: {
    padding: "5px 14px",
    fontSize: "12px",
    fontWeight: 600,
    border: "1px solid rgba(74, 222, 128, 0.3)",
    borderRadius: "6px",
    background: "rgba(74, 222, 128, 0.1)",
    color: "#4ade80",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    transition: "background 0.2s, border-color 0.2s",
  },
  actionBtnSecondary: {
    padding: "5px 14px",
    fontSize: "12px",
    fontWeight: 500,
    border: "1px solid rgba(255, 255, 255, 0.15)",
    borderRadius: "6px",
    background: "rgba(255, 255, 255, 0.05)",
    color: "rgba(255, 255, 255, 0.7)",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    textDecoration: "none",
    transition: "background 0.2s",
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
