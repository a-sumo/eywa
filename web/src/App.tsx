import { lazy, Suspense, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FoldProvider } from "./context/FoldContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppHeader } from "./components/AppHeader";
import { NotFound } from "./components/NotFound";

const Landing = lazy(() => import("./components/Landing").then(m => ({ default: m.Landing })));
import "./App.css";

// Lazy-loaded route components (split into separate chunks)
const FoldLayout = lazy(() => import("./components/FoldLayout").then(m => ({ default: m.FoldLayout })));
const ThreadTree = lazy(() => import("./components/ThreadTree").then(m => ({ default: m.ThreadTree })));
const ThreadView = lazy(() => import("./components/ThreadView").then(m => ({ default: m.ThreadView })));
const WorkspaceView = lazy(() => import("./components/WorkspaceView").then(m => ({ default: m.WorkspaceView })));
const AgentDetail = lazy(() => import("./components/AgentDetail").then(m => ({ default: m.AgentDetail })));
const Chat = lazy(() => import("./components/Chat").then(m => ({ default: m.Chat })));
const MiniEywa = lazy(() => import("./components/MiniEywa").then(m => ({ default: m.MiniEywa })));
const MiniEywaEink = lazy(() => import("./components/MiniEywaEink").then(m => ({ default: m.MiniEywaEink })));
const CLIAuth = lazy(() => import("./components/CLIAuth").then(m => ({ default: m.CLIAuth })));
const SessionGraph = lazy(() => import("./components/SessionGraph").then(m => ({ default: m.SessionGraph })));
const SpectaclesView = lazy(() => import("./components/SpectaclesView").then(m => ({ default: m.SpectaclesView })));
const SpectaclesReceiver = lazy(() => import("./components/SpectaclesReceiver").then(m => ({ default: m.SpectaclesReceiver })));
const KnowledgePage = lazy(() => import("./components/KnowledgePage").then(m => ({ default: m.KnowledgePage })));
const NavigatorMap = lazy(() => import("./components/NavigatorMap").then(m => ({ default: m.NavigatorMap })));
const OperationsView = lazy(() => import("./components/OperationsView").then(m => ({ default: m.OperationsView })));
const SeedMonitor = lazy(() => import("./components/SeedMonitor").then(m => ({ default: m.SeedMonitor })));
const FoldsIndex = lazy(() => import("./components/FoldsIndex").then(m => ({ default: m.FoldsIndex })));
const VoicesView = lazy(() => import("./components/VoicesView").then(m => ({ default: m.VoicesView })));
const DocsLayout = lazy(() => import("./components/DocsLayout").then(m => ({ default: m.DocsLayout })));
const DocsOverview = lazy(() => import("./components/DocsLayout").then(m => ({ default: m.DocsOverview })));
const IntegrationGuide = lazy(() => import("./components/IntegrationGuide").then(m => ({ default: m.IntegrationGuide })));
const QuickstartDocs = lazy(() => import("./components/docs/QuickstartDocs").then(m => ({ default: m.QuickstartDocs })));
const CLIDocs = lazy(() => import("./components/docs/CLIDocs").then(m => ({ default: m.CLIDocs })));
const VSCodeDocs = lazy(() => import("./components/docs/VSCodeDocs").then(m => ({ default: m.VSCodeDocs })));
const DiscordDocs = lazy(() => import("./components/docs/DiscordDocs").then(m => ({ default: m.DiscordDocs })));
const SpectaclesDocs = lazy(() => import("./components/docs/SpectaclesDocs").then(m => ({ default: m.SpectaclesDocs })));
const PiDisplayDocs = lazy(() => import("./components/docs/PiDisplayDocs").then(m => ({ default: m.PiDisplayDocs })));
const ArchitectureDocs = lazy(() => import("./components/docs/ArchitectureDocs").then(m => ({ default: m.ArchitectureDocs })));
const SelfHostingDocs = lazy(() => import("./components/docs/SelfHostingDocs").then(m => ({ default: m.SelfHostingDocs })));

function RouteLoader() {
  return <div className="route-loader"><div className="route-loader-spinner" /></div>;
}

function App() {
  const { i18n } = useTranslation();

  useEffect(() => {
    document.documentElement.dir = i18n.dir();
    document.documentElement.lang = i18n.language;
  }, [i18n, i18n.language]);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ScrollToTop />
        <AppHeader />
        <Suspense fallback={<RouteLoader />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/rooms" element={<FoldsIndex />} />
            <Route path="/folds" element={<Navigate to="/rooms" replace />} />
            <Route path="/cli-auth" element={<CLIAuth />} />
            <Route path="/docs" element={<DocsLayout />}>
              <Route index element={<DocsOverview />} />
              <Route path="quickstart" element={<QuickstartDocs />} />
              <Route path="cli" element={<CLIDocs />} />
              <Route path="vscode" element={<VSCodeDocs />} />
              <Route path="discord" element={<DiscordDocs />} />
              <Route path="spectacles" element={<SpectaclesDocs />} />
              <Route path="pi-displays" element={<PiDisplayDocs />} />
              <Route path="architecture" element={<ArchitectureDocs />} />
              <Route path="self-hosting" element={<SelfHostingDocs />} />
              <Route path="integrations/:provider" element={<IntegrationGuide />} />
            </Route>
            <Route path="/rooms/:slug/eink" element={<FoldProvider><MiniEywaEink /></FoldProvider>} />
            <Route path="/rooms/:slug/phone" element={<FoldProvider><MiniEywa /></FoldProvider>} />
            <Route path="/rooms/:slug/spectacles" element={<FoldProvider><SpectaclesView /></FoldProvider>} />
            <Route path="/rooms/:slug/spectacles/rx" element={<FoldProvider><SpectaclesReceiver /></FoldProvider>} />
            <Route path="/rooms/:slug/voices" element={<FoldProvider><VoicesView /></FoldProvider>} />
            <Route path="/rooms/:slug/*" element={<FoldRoutes />} />
            {/* Backward compat: /f/:slug/* and /r/:slug/* → /rooms/:slug/* */}
            <Route path="/f/:slug/*" element={<RoomRedirect />} />
            <Route path="/r/:slug/*" element={<RoomRedirect />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const prevPath = useRef(pathname);

  useEffect(() => {
    if (hash) return; // let browser handle anchor links
    if (prevPath.current !== pathname) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
    prevPath.current = pathname;
  }, [pathname, hash]);

  return null;
}

function RoomRedirect() {
  const { slug, "*": rest } = useParams();
  return <Navigate to={`/rooms/${slug}${rest ? `/${rest}` : ""}`} replace />;
}

function FoldRoutes() {
  return (
    <FoldProvider>
      <Suspense fallback={<RouteLoader />}>
        <FoldLayout>
          <Suspense fallback={<RouteLoader />}>
            <Routes>
              <Route index element={<ThreadTree />} />
              <Route path="ops" element={<OperationsView />} />
              <Route path="seeds" element={<SeedMonitor />} />
              <Route path="thread/:agent/:sessionId" element={<ThreadView />} />
              <Route path="workspace" element={<WorkspaceView />} />
              <Route path="agent/:name" element={<AgentDetail />} />
              <Route path="chat" element={<Chat />} />
              <Route path="graph" element={<SessionGraph />} />
              <Route path="knowledge" element={<KnowledgePage />} />
              <Route path="map" element={<NavigatorMap />} />
            </Routes>
          </Suspense>
        </FoldLayout>
      </Suspense>
    </FoldProvider>
  );
}

export default App;
