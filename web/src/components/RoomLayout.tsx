import { type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useRoomContext } from "../context/RoomContext";
import { AgentList } from "./AgentList";

interface RoomLayoutProps {
  children: ReactNode;
}

export function RoomLayout({ children }: RoomLayoutProps) {
  const { slug } = useParams<{ slug: string }>();
  const { room, loading, error } = useRoomContext();

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
        <Link to={`/r/${slug}`}>Hub</Link>
        <Link to={`/r/${slug}/knowledge`}>Knowledge</Link>
        <Link to={`/r/${slug}/graph`}>Graph</Link>
      </nav>
    </div>
  );
}
