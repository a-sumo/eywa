import { useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { RoomProvider } from "./context/RoomContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppHeader } from "./components/AppHeader";
import { Landing } from "./components/Landing";
import { RoomLayout } from "./components/RoomLayout";
import { ThreadTree } from "./components/ThreadTree";
import { ThreadView } from "./components/ThreadView";
import { WorkspaceView } from "./components/WorkspaceView";
import { AgentDetail } from "./components/AgentDetail";
import { Chat } from "./components/Chat";
import { MiniEywa } from "./components/MiniEywa";
import { MiniEywaEink } from "./components/MiniEywaEink";
import { CLIAuth } from "./components/CLIAuth";
import { SessionGraph } from "./components/SessionGraph";
import { SpectaclesView } from "./components/SpectaclesView";
import { SpectaclesReceiver } from "./components/SpectaclesReceiver";
import { GlobalKnowledgeHub } from "./components/GlobalKnowledgeHub";
import { NavigatorMap } from "./components/NavigatorMap";
import { OperationsView } from "./components/OperationsView";
import { DocsLayout, DocsOverview } from "./components/DocsLayout";
import { IntegrationGuide } from "./components/IntegrationGuide";
import { QuickstartDocs } from "./components/docs/QuickstartDocs";
import { CLIDocs } from "./components/docs/CLIDocs";
import { VSCodeDocs } from "./components/docs/VSCodeDocs";
import { DiscordDocs } from "./components/docs/DiscordDocs";
import { SpectaclesDocs } from "./components/docs/SpectaclesDocs";
import { PiDisplayDocs } from "./components/docs/PiDisplayDocs";
import { ArchitectureDocs } from "./components/docs/ArchitectureDocs";
import { SelfHostingDocs } from "./components/docs/SelfHostingDocs";
import "./App.css";

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ScrollToTop />
        <AppHeader />
        <Routes>
          <Route path="/" element={<Landing />} />
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
          <Route path="/r/:slug/eink" element={<RoomProvider><MiniEywaEink /></RoomProvider>} />
          <Route path="/r/:slug/phone" element={<RoomProvider><MiniEywa /></RoomProvider>} />
          <Route path="/r/:slug/spectacles" element={<RoomProvider><SpectaclesView /></RoomProvider>} />
          <Route path="/r/:slug/spectacles/rx" element={<RoomProvider><SpectaclesReceiver /></RoomProvider>} />
          <Route path="/r/:slug/*" element={<RoomRoutes />} />
        </Routes>
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

function RoomRoutes() {
  return (
    <RoomProvider>
      <RoomLayout>
        <Routes>
          <Route index element={<ThreadTree />} />
          <Route path="ops" element={<OperationsView />} />
          <Route path="thread/:agent/:sessionId" element={<ThreadView />} />
          <Route path="workspace" element={<WorkspaceView />} />
          <Route path="agent/:name" element={<AgentDetail />} />
          <Route path="chat" element={<Chat />} />
          <Route path="graph" element={<SessionGraph />} />
          <Route path="knowledge" element={<GlobalKnowledgeHub />} />
          <Route path="map" element={<NavigatorMap />} />
        </Routes>
      </RoomLayout>
    </RoomProvider>
  );
}

export default App;
