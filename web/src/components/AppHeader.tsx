import { Link, useLocation } from "react-router-dom";
import EywaLogo from "./EywaLogo";
import { useFold } from "../hooks/useFold";

const GitHubIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
);

export function AppHeader() {
  const location = useLocation();
  const { createDemoFold, creating, error } = useFold();

  const isDocs = location.pathname.startsWith("/docs");
  const isRoom = location.pathname.startsWith("/f/");

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
          <Link to="/folds" className={location.pathname === "/folds" ? "active" : ""}>Folds</Link>
          <Link to="/docs" className={isDocs ? "active" : ""}>Docs</Link>
          {isRoom && slug && (
            <Link to={`/f/${slug}`} className="global-header-room">/{slug}</Link>
          )}
        </nav>

        <div className="global-header-actions">
          {!isRoom && (
            <>
              <button
                className="global-header-link"
                onClick={() => createDemoFold()}
                disabled={creating}
              >
                {creating ? "Creating..." : "Try Demo"}
              </button>
              {error && <span style={{ color: "var(--error)", fontSize: "0.75rem" }}>{error}</span>}
              <Link to="/docs" className="global-header-cta">
                Get Started
              </Link>
            </>
          )}
          <a
            href="https://github.com/a-sumo/eywa"
            target="_blank"
            rel="noopener noreferrer"
            className="global-header-github"
            title="GitHub"
          >
            <GitHubIcon />
          </a>
        </div>
      </div>
    </header>
  );
}
