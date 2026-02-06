import { BrowserRouter, Routes, Route } from "react-router-dom";
import { RoomProvider } from "./context/RoomContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Landing } from "./components/Landing";
import { RoomLayout } from "./components/RoomLayout";
import { ThreadTree } from "./components/ThreadTree";
import { ThreadView } from "./components/ThreadView";
import { RemixView } from "./components/RemixView";
import { AgentDetail } from "./components/AgentDetail";
import { Chat } from "./components/Chat";
import { MiniRemix } from "./components/MiniRemix";
import { MiniRemixEink } from "./components/MiniRemixEink";
import { CLIAuth } from "./components/CLIAuth";
import { SlidePresentation } from "./components/SlidePresentation";
import { SessionGraph } from "./components/SessionGraph";
import { SpectaclesView } from "./components/SpectaclesView";
import { SpectaclesReceiver } from "./components/SpectaclesReceiver";
import { DocsLayout, DocsOverview } from "./components/DocsLayout";
import { IntegrationGuide } from "./components/IntegrationGuide";
import "./App.css";

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/slides" element={<SlidePresentation />} />
          <Route path="/cli-auth" element={<CLIAuth />} />
          <Route path="/docs" element={<DocsLayout />}>
            <Route index element={<DocsOverview />} />
            <Route path="integrations/:provider" element={<IntegrationGuide />} />
          </Route>
          <Route path="/r/:slug/eink" element={<RoomProvider><MiniRemixEink /></RoomProvider>} />
          <Route path="/r/:slug/spectacles" element={<RoomProvider><SpectaclesView /></RoomProvider>} />
          <Route path="/r/:slug/spectacles/rx" element={<RoomProvider><SpectaclesReceiver /></RoomProvider>} />
          <Route path="/r/:slug/*" element={<RoomRoutes />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

function RoomRoutes() {
  return (
    <RoomProvider>
      <RoomLayout>
        <Routes>
          <Route index element={<ThreadTree />} />
          <Route path="thread/:agent/:sessionId" element={<ThreadView />} />
          <Route path="workspace" element={<RemixView />} />
          <Route path="agent/:name" element={<AgentDetail />} />
          <Route path="chat" element={<Chat />} />
          <Route path="mini" element={<MiniRemix />} />
          <Route path="graph" element={<SessionGraph />} />
          <Route path="eink" element={<MiniRemixEink />} />
        </Routes>
      </RoomLayout>
    </RoomProvider>
  );
}

export default App;
