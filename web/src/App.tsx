import { BrowserRouter, Routes, Route } from "react-router-dom";
import { RoomProvider } from "./context/RoomContext";
import { Landing } from "./components/Landing";
import { RoomLayout } from "./components/RoomLayout";
import { ThreadTree } from "./components/ThreadTree";
import { ThreadView } from "./components/ThreadView";
import { RemixView } from "./components/RemixView";
import { RemixView3D } from "./components/RemixView3D";
import { AgentDetail } from "./components/AgentDetail";
import { Chat } from "./components/Chat";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/r/:slug/*" element={<RoomRoutes />} />
      </Routes>
    </BrowserRouter>
  );
}

function RoomRoutes() {
  return (
    <RoomProvider>
      <RoomLayout>
        <Routes>
          <Route index element={<ThreadTree />} />
          <Route path="thread/:agent/:sessionId" element={<ThreadView />} />
          <Route path="remix/new" element={<RemixView />} />
          <Route path="remix3d" element={<RemixView3D />} />
          <Route path="agent/:name" element={<AgentDetail />} />
          <Route path="chat" element={<Chat />} />
        </Routes>
      </RoomLayout>
    </RoomProvider>
  );
}

export default App;
