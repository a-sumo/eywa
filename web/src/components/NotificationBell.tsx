import { useState, useRef, useEffect } from "react";
import { useFoldContext } from "../context/FoldContext";
import { useNotifications, type Notification } from "../hooks/useNotifications";

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function notificationIcon(type: Notification["type"]): string {
  switch (type) {
    case "session_done": return "\u2713";
    case "injection": return "\u21E8";
    case "connection": return "\u26A1";
    case "knowledge": return "\u2605";
    case "error": return "\u26A0";
  }
}

function notificationClass(type: Notification["type"]): string {
  switch (type) {
    case "session_done": return "notification-session";
    case "injection": return "notification-divergence";
    case "connection": return "notification-connection";
    case "knowledge": return "notification-session";
    case "error": return "notification-divergence";
  }
}

export function NotificationBell() {
  const { fold } = useFoldContext();
  const { notifications, unreadCount, dismiss, markAllRead, clearAll } =
    useNotifications(fold?.id ?? null);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Mark all as read when opening
  const handleToggle = () => {
    if (!open && unreadCount > 0) {
      markAllRead();
    }
    setOpen(!open);
  };

  return (
    <div className="notification-bell-wrapper" ref={wrapperRef}>
      <button className="notification-bell" onClick={handleToggle}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1.5A3.5 3.5 0 0 0 4.5 5v2.947c0 .346-.102.683-.294.97l-.955 1.433A.75.75 0 0 0 3.875 11.5h8.25a.75.75 0 0 0 .624-1.15l-.955-1.433a1.75 1.75 0 0 1-.294-.97V5A3.5 3.5 0 0 0 8 1.5ZM6.5 13a1.5 1.5 0 0 0 3 0h-3Z" />
        </svg>
        {unreadCount > 0 && (
          <span className="notification-badge">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notification-dropdown">
          <div className="notification-dropdown-header">
            <span>Notifications</span>
            <span className="notification-dropdown-count">
              {notifications.length > 0 ? (
                <button
                  onClick={clearAll}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--color-text-muted)",
                    cursor: "pointer",
                    fontSize: "0.7rem",
                  }}
                >
                  Clear all
                </button>
              ) : null}
            </span>
          </div>
          <div className="notification-list">
            {notifications.length === 0 && (
              <div className="notification-empty">No notifications yet</div>
            )}
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`notification-item ${notificationClass(n.type)}`}
              >
                <span className="notification-icon">
                  {notificationIcon(n.type)}
                </span>
                <div className="notification-content">
                  <span className="notification-message">{n.message}</span>
                  <span className="notification-time">{timeAgo(n.ts)}</span>
                </div>
                <button
                  className="notification-dismiss"
                  onClick={() => dismiss(n.id)}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
