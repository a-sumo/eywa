import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { RoomProvider } from "./context/RoomContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
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
import { SlidePresentation } from "./components/SlidePresentation";
import { SessionGraph } from "./components/SessionGraph";
import { SpectaclesView } from "./components/SpectaclesView";
import { SpectaclesReceiver } from "./components/SpectaclesReceiver";
import { GlobalKnowledgeHub } from "./components/GlobalKnowledgeHub";
import { OperationsView } from "./components/OperationsView";
import { BroadcastTest } from "./components/BroadcastTest";
import { LogoGlowTuner } from "./components/LogoGlowTuner";
import { JellyEditor } from "./components/JellyEditor";
import { DocsLayout, DocsOverview } from "./components/DocsLayout";
import { IntegrationGuide } from "./components/IntegrationGuide";
import "./App.css";

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/slides" element={<SlidePresentation />} />
          <Route path="/logo-glow" element={<LogoGlowTuner />} />
          <Route path="/jelly" element={<JellyEditor />} />
          <Route path="/cli-auth" element={<CLIAuth />} />
          <Route path="/docs" element={<DocsLayout />}>
            <Route index element={<DocsOverview />} />
            <Route path="integrations/:provider" element={<IntegrationGuide />} />
          </Route>
          <Route path="/r/:slug/eink" element={<RoomProvider><MiniEywaEink /></RoomProvider>} />
          <Route path="/r/:slug/phone" element={<RoomProvider><MiniEywa /></RoomProvider>} />
          <Route path="/r/:slug/spectacles" element={<RoomProvider><SpectaclesView /></RoomProvider>} />
          <Route path="/r/:slug/spectacles/rx" element={<RoomProvider><SpectaclesReceiver /></RoomProvider>} />
          <Route path="/r/:slug/spectacles/test" element={<RoomProvider><BroadcastTest /></RoomProvider>} />
          <Route path="/r/:slug/*" element={<RoomRoutes />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

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
          <Route path="mini" element={<MiniEywa />} />
          <Route path="graph" element={<SessionGraph />} />
          <Route path="knowledge" element={<GlobalKnowledgeHub />} />
          <Route path="eink" element={<MiniEywaEink />} />
        </Routes>
      </RoomLayout>
    </RoomProvider>
  );
}

export default App;
