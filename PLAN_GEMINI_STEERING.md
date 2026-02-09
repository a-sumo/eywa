# Plan: Gemini as Active Steering Agent

## Goal
Transform Gemini from a passive Q&A chatbot into an active steering agent that detects patterns, tracks execution flow, and measures progress toward the user's destination.

## Current State
- `useGeminiChat` hook calls Gemini API with system prompt + selected context
- System prompt: generic "analyze shared context from multiple AI agent threads"
- No tool calling: Gemini can't fetch threads, query agents, or access knowledge
- No streaming: waits for full response
- Only sees manually selected memories (drag-drop)
- No pattern detection (redundancy, divergence, idleness)

## What to Build

### 1. Gemini Function Calling (Tools)
Add tools so Gemini can query Eywa data directly:

```typescript
tools: [
  {
    name: "get_agent_status",
    description: "Get current status of all active agents with their tasks and systems",
    // No params needed - returns room summary
  },
  {
    name: "get_thread",
    description: "Get full operation history for a specific agent's session",
    parameters: { agent: string, limit?: number }
  },
  {
    name: "get_knowledge",
    description: "Query the project knowledge base",
    parameters: { search?: string, tag?: string }
  },
  {
    name: "detect_patterns",
    description: "Analyze recent activity for redundancy, divergence, or idle capacity",
    // Returns structured pattern analysis
  }
]
```

Implementation: These tools call Supabase directly from the browser (same client as hooks).

### 2. Proactive System Prompt
Replace generic prompt with navigation-aware steering prompt:

```
You are the steering agent for an Eywa room. Your job is to help the human navigate their agent swarm toward their destination.

You have tools to query agent status, thread history, and knowledge. Use them proactively.

When analyzing activity, look for:
- REDUNDANCY: Multiple agents doing similar work
- DIVERGENCE: Agents pulling in different directions
- IDLENESS: Agents that could be productive but aren't
- FLOW: The execution sequence toward the destination
- PROGRESS: How close are we to completion?

Be direct. Highlight what matters. Skip noise.
```

### 3. Streaming Responses
- Switch from `generateContent` to `streamGenerateContent`
- Show tokens as they arrive in the chat UI
- Progressive rendering in Spectacles tiles

### 4. Auto-Context
- On room load, Gemini gets full room summary automatically (not manual drag-drop)
- On new agent activity, Gemini gets notified (can choose to analyze or not)
- Periodic pattern detection (every N minutes or on significant activity)

## Files to Modify
- `web/src/hooks/useGeminiChat.ts` - Add tool calling, streaming, auto-context
- `web/src/lib/geminiTools.ts` - NEW: Tool definitions and handlers
- `web/src/components/GeminiPanel.tsx` or equivalent - Streaming UI
- `web/src/components/SpectaclesView.tsx` - Streaming chat tiles

## Definition of Done
- Gemini can answer "what are my agents doing?" by calling get_agent_status
- Gemini can deep-dive into a thread by calling get_thread
- Gemini proactively flags redundancy/divergence/idleness
- Responses stream token-by-token
- Works without manual memory selection (auto-context)
