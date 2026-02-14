import { type ReactNode } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useFoldContext } from "../context/FoldContext";
import { AgentList } from "./AgentList";
import { DemoBanner } from "./DemoBanner";

interface FoldLayoutProps {
  children: ReactNode;
}

export function FoldLayout({ children }: FoldLayoutProps) {
  const { t } = useTranslation("fold");
  const { t: tc } = useTranslation("common");
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const { fold, loading, error } = useFoldContext();

  const basePath = `/rooms/${slug}`;
  const isTabActive = (path: string) => {
    if (path === basePath) return location.pathname === basePath;
    return location.pathname.startsWith(path);
  };

  if (loading) {
    return (
      <div className="app">
        <div className="loading-screen">{t("fold.loading")}</div>
      </div>
    );
  }

  if (error || !fold) {
    return (
      <div className="app">
        <div className="error-screen">
          <h2>{t("fold.notFound")}</h2>
          <p>{t("fold.notFoundDesc", { slug })}</p>
          <Link to="/" className="btn-primary">{t("fold.goHome")}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <DemoBanner />
      <div className="app-body">
        <aside className="sidebar">
          <AgentList />
        </aside>
        <main className="main">
          {children}
        </main>
      </div>
      <nav className="mobile-tabs">
        <Link to={basePath} className={isTabActive(basePath) ? "active" : ""}>{tc("nav.hub")}</Link>
        <Link to={`${basePath}/ops`} className={isTabActive(`${basePath}/ops`) ? "active" : ""}>{tc("nav.ops")}</Link>
        <Link to={`${basePath}/seeds`} className={isTabActive(`${basePath}/seeds`) ? "active" : ""}>{tc("nav.seeds")}</Link>
        <Link to={`${basePath}/knowledge`} className={isTabActive(`${basePath}/knowledge`) ? "active" : ""}>{tc("nav.knowledge")}</Link>
        <Link to={`${basePath}/graph`} className={isTabActive(`${basePath}/graph`) ? "active" : ""}>{tc("nav.graph")}</Link>
        <Link to={`${basePath}/map`} className={isTabActive(`${basePath}/map`) ? "active" : ""}>{tc("nav.map")}</Link>
        <Link to={`${basePath}/voices`} className={isTabActive(`${basePath}/voices`) ? "active" : ""}>{tc("nav.voices")}</Link>
      </nav>
    </div>
  );
}
