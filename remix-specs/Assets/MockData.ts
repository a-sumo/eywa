// MockData.ts — Static test data for Remix AR Panel (no @component)

import { MemoryItem, AgentInfo } from "./RemixTypes"

const now = Date.now()
const min = 60 * 1000
const hr = 60 * min

export const MOCK_MEMORIES: MemoryItem[] = [
  {
    id: "mem_001",
    role: "user",
    content: "Can you search for authentication patterns in the codebase?",
    agent: "armand/quiet-oak",
    timestamp: now - 2 * min,
  },
  {
    id: "mem_002",
    role: "assistant",
    content: "Found 3 auth modules: JWT middleware, OAuth2 provider, and session store.",
    agent: "armand/quiet-oak",
    timestamp: now - 2 * min + 15000,
  },
  {
    id: "mem_003",
    role: "tool_call",
    content: "grep -r 'authMiddleware' src/ — 12 matches in 5 files",
    agent: "armand/quiet-oak",
    timestamp: now - 1.5 * min,
  },
  {
    id: "mem_004",
    role: "user",
    content: "Refactor the login flow to use refresh tokens",
    agent: "armand/silver-pine",
    timestamp: now - 5 * min,
  },
  {
    id: "mem_005",
    role: "assistant",
    content: "I'll update the auth service to issue refresh tokens alongside access tokens.",
    agent: "armand/silver-pine",
    timestamp: now - 4.8 * min,
  },
  {
    id: "mem_006",
    role: "tool_call",
    content: "edit src/auth/tokenService.ts — added generateRefreshToken()",
    agent: "armand/silver-pine",
    timestamp: now - 4.5 * min,
  },
  {
    id: "mem_007",
    role: "user",
    content: "What's the current status of the WebSocket implementation?",
    agent: "armand/bold-river",
    timestamp: now - 15 * min,
  },
  {
    id: "mem_008",
    role: "assistant",
    content: "WebSocket server is running on port 8080. 3 event handlers registered.",
    agent: "armand/bold-river",
    timestamp: now - 14.5 * min,
  },
  {
    id: "mem_009",
    role: "tool_call",
    content: "read src/ws/handler.ts — 142 lines, exports onConnect, onMessage, onClose",
    agent: "armand/bold-river",
    timestamp: now - 14 * min,
  },
  {
    id: "mem_010",
    role: "user",
    content: "Deploy the staging environment with the new changes",
    agent: "armand/quiet-oak",
    timestamp: now - 1 * hr,
  },
  {
    id: "mem_011",
    role: "assistant",
    content: "Staging deploy initiated. ETA 3 minutes. Watching CI pipeline.",
    agent: "armand/quiet-oak",
    timestamp: now - 58 * min,
  },
  {
    id: "mem_012",
    role: "tool_call",
    content: "bash: docker push registry.io/remix:staging-abc123",
    agent: "armand/quiet-oak",
    timestamp: now - 55 * min,
  },
]

export const MOCK_AGENTS: AgentInfo[] = [
  {
    name: "armand/quiet-oak",
    status: "active",
    sessionCount: 3,
    memoryCount: 45,
    lastActiveAt: now - 2 * min,
    color: new vec4(0.3, 0.7, 1.0, 1.0),
  },
  {
    name: "armand/silver-pine",
    status: "idle",
    sessionCount: 1,
    memoryCount: 18,
    lastActiveAt: now - 4.5 * min,
    color: new vec4(0.9, 0.4, 0.7, 1.0),
  },
  {
    name: "armand/bold-river",
    status: "idle",
    sessionCount: 2,
    memoryCount: 31,
    lastActiveAt: now - 14 * min,
    color: new vec4(1.0, 0.6, 0.2, 1.0),
  },
]
