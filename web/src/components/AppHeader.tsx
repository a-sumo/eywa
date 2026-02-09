import { Link, useLocation } from "react-router-dom";
import EywaLogo from "./EywaLogo";
import { useRoom } from "../hooks/useRoom";

export function AppHeader() {
  const location = useLocation();
  const { createRoom, createDemoRoom, creating } = useRoom();

  const isDocs = location.pathname.startsWith("/docs");
  const isRoom = location.pathname.startsWith("/r/");

  // Extract slug from /r/:slug/...
  const slug = isRoom ? location.pathname.split("/")[2] : null;

  // Don't show on standalone device views (eink, phone, spectacles)
  const standaloneViews = ["/eink", "/phone", "/spectacles"];
  if (isRoom && standaloneViews.some(v => location.pathname.endsWith(v) || location.pathname.includes("/spectacles/"))) {
    return null;
  }

  return (
    <header className="global-header">
      <div className="global-header-inner">
        <Link to="/" className="global-header-logo">
          <EywaLogo size={28} />
          <span>Eywa</span>
        </Link>

        <nav className="global-header-nav">
          <Link to="/docs" className={isDocs ? "active" : ""}>Docs</Link>
          {isRoom && slug && (
            <Link to={`/r/${slug}`} className="global-header-room">/{slug}</Link>
          )}
        </nav>

        <div className="global-header-actions">
          {!isRoom && (
            <>
              <button
                className="global-header-link"
                onClick={() => createDemoRoom()}
                disabled={creating}
              >
                Try Demo
              </button>
              <button
                className="global-header-cta"
                onClick={() => createRoom()}
                disabled={creating}
              >
                {creating ? "Creating..." : "Get Started"}
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
