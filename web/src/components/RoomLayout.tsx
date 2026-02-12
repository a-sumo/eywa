import { type ReactNode } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import { useRoomContext } from "../context/RoomContext";
import { AgentList } from "./AgentList";

interface RoomLayoutProps {
  children: ReactNode;
}

export function RoomLayout({ children }: RoomLayoutProps) {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const { room, loading, error } = useRoomContext();

  const basePath = `/r/${slug}`;
  const isTabActive = (path: string) => {
    if (path === basePath) return location.pathname === basePath;
    return location.pathname.startsWith(path);
  };

  if (loading) {
    return (
      <div className="app">
        <div className="loading-screen">Loading room...</div>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="app">
        <div className="error-screen">
          <h2>Room not found</h2>
          <p>The room "{slug}" doesn't exist.</p>
          <Link to="/" className="btn-primary">Go Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="app-body">
        <aside className="sidebar">
          <AgentList />
        </aside>
        <main className="main">
          {children}
        </main>
      </div>
      <nav className="mobile-tabs">
        <Link to={basePath} className={isTabActive(basePath) ? "active" : ""}>Hub</Link>
        <Link to={`${basePath}/ops`} className={isTabActive(`${basePath}/ops`) ? "active" : ""}>Ops</Link>
        <Link to={`${basePath}/seeds`} className={isTabActive(`${basePath}/seeds`) ? "active" : ""}>Seeds</Link>
        <Link to={`${basePath}/knowledge`} className={isTabActive(`${basePath}/knowledge`) ? "active" : ""}>Knowledge</Link>
        <Link to={`${basePath}/graph`} className={isTabActive(`${basePath}/graph`) ? "active" : ""}>Graph</Link>
        <Link to={`${basePath}/map`} className={isTabActive(`${basePath}/map`) ? "active" : ""}>Map</Link>
        <Link to={`${basePath}/voices`} className={isTabActive(`${basePath}/voices`) ? "active" : ""}>Voices</Link>
      </nav>
    </div>
  );
}
