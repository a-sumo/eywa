/**
 * navigatorClient.ts - Client for the Guild Navigator spatial layout API.
 *
 * Guild Navigator positions events semantically in polar coordinates around goals.
 * We feed Eywa room data (destination, agents, memories) into Navigator and get
 * back a 2D spatial map with node positions, trajectories, and alignment scores.
 */

const BASE_URL = "https://impartial-vitality-production.up.railway.app";

// --- Types (matching actual API response) ---

export interface NavigatorNode {
  id: string;
  label: string;
  type: "source" | "goal" | "action" | "state";
  x: number;       // cartesian, range roughly [-1, 1]
  y: number;
  polar?: Record<string, { r: number; theta: number }>;
  agent?: string;
}

export interface NavigatorTrajectory {
  from: string;
  to: string;
  agent: string;
}

export interface NavigatorAlignment {
  actionId: string;
  goalId: string;
  agent: string;
  alignment: number; // -1 to 1
}

export interface NavigatorMapResponse {
  meta: {
    itemCount: number;
    goalCount: number;
    goalIds: string[];
    agents: string[];
  };
  nodes: NavigatorNode[];
  trajectory: NavigatorTrajectory[];
  alignments: NavigatorAlignment[];
}

// --- API Client ---

export async function sendEvent(roomId: string, event: {
  type: "source" | "goal" | "step" | "action" | "state";
  label?: string;
  agent?: string;
  action?: string;
  state?: string;
}): Promise<void> {
  await fetch(`${BASE_URL}/api/rooms/${roomId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
}

export async function loadScenario(roomId: string, scenario: {
  sources: Array<{ id: string; label: string }>;
  goals: string[];
  trajectories: Array<{
    agent: string;
    source: string;
    steps: Array<{ action: string; state: string }>;
  }>;
}): Promise<void> {
  await fetch(`${BASE_URL}/api/rooms/${roomId}/scenario`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(scenario),
  });
}

export async function getMap(roomId: string): Promise<NavigatorMapResponse> {
  const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/map`);
  return res.json();
}

export async function listRooms(): Promise<Array<{
  id: string;
  items: number;
  agents: string[];
  clients: number;
}>> {
  const res = await fetch(`${BASE_URL}/api/rooms`);
  return res.json();
}

/**
 * Connect to SSE stream for real-time map updates.
 * Returns a cleanup function to close the connection.
 */
export function connectStream(
  roomId: string,
  onState: (state: NavigatorMapResponse) => void,
  onProgress?: (msg: string | null) => void,
): () => void {
  const es = new EventSource(`${BASE_URL}/api/rooms/${roomId}/stream`);

  es.addEventListener("state", (e) => {
    try {
      const data = JSON.parse(e.data);
      onState(data);
    } catch { /* ignore parse errors */ }
  });

  es.addEventListener("progress", (e) => {
    try {
      const data = JSON.parse(e.data);
      onProgress?.(data.message ?? null);
    } catch { /* ignore */ }
  });

  es.onerror = () => {
    // EventSource auto-reconnects
  };

  return () => es.close();
}

// --- Eywa Bridge ---

/**
 * Sync Eywa room data into Guild Navigator.
 * Maps: destination -> goal, agent sessions -> sources + trajectories.
 */
export async function syncEywaRoom(
  navigatorRoomId: string,
  eywaData: {
    destination: string;
    agents: Array<{
      name: string;
      isActive: boolean;
      memories: Array<{ content: string; action?: string }>;
    }>;
  },
): Promise<void> {
  const sources = eywaData.agents.map(a => ({
    id: a.name,
    label: a.name + (a.isActive ? " (active)" : ""),
  }));

  const goals = eywaData.destination ? [eywaData.destination] : [];

  const trajectories = eywaData.agents
    .filter(a => a.memories.length > 0)
    .map(a => ({
      agent: a.name,
      source: a.name,
      steps: a.memories.slice(-20).map(m => ({
        action: m.action || m.content.slice(0, 120),
        state: m.content.slice(0, 200),
      })),
    }));

  await loadScenario(navigatorRoomId, { sources, goals, trajectories });
}

export { BASE_URL };
