import { useState } from "react";
import { ParticleGlyph } from "./ParticleGlyph";
import { agentColorHSL } from "../lib/agentColor";
import { extractFeatures } from "../lib/glyphEncoder";
import type { Memory } from "../lib/supabase";

const AGENTS = ["armand/quiet-oak", "kai/bright-fern", "nova/deep-coral"];

function mockMemory(
  text: string,
  messageType: string,
  agent = AGENTS[0],
  metadata: Record<string, unknown> = {},
): Memory {
  return {
    id: `lab-${messageType}-${text.slice(0, 20).replace(/\W/g, "")}`,
    room_id: "lab",
    agent,
    session_id: "lab-session",
    message_type: messageType,
    content: text,
    token_count: Math.ceil(text.length / 4),
    metadata,
    ts: new Date().toISOString(),
  };
}

const PRESETS: { label: string; text: string; type: string; agent?: string; metadata?: Record<string, unknown> }[] = [
  { label: "Short user command", text: "Fix the login bug", type: "user" },
  { label: "Grep search", text: "grep 'useAuth' src/**/*.tsx", type: "tool_call" },
  { label: "File read", text: "Read file src/components/Auth.tsx", type: "tool_call" },
  {
    label: "Short assistant",
    text: "I'll fix the authentication issue in the login component.",
    type: "assistant",
  },
  {
    label: "Long assistant",
    text: "I've analyzed the authentication system and found several issues. The JWT token validation is missing expiry checks, the refresh token rotation isn't implemented correctly, and there's a race condition in the session store when multiple tabs are open. Here's my plan:\n\n1. Add token expiry validation in the middleware\n2. Implement proper refresh token rotation with reuse detection\n3. Use a mutex lock for the session store to prevent concurrent writes\n4. Add comprehensive error handling for each failure mode\n\nLet me start with the middleware changes since they're the most critical.",
    type: "assistant",
  },
  {
    label: "Code output",
    text: "export async function authenticate(req: Request) {\n  const token = req.headers.get('Authorization')?.split(' ')[1];\n  if (!token) throw new Error('Missing token');\n  const payload = await jwt.verify(token, SECRET);\n  if (payload.exp < Date.now() / 1000) throw new Error('Token expired');\n  return payload;\n}",
    type: "assistant",
  },
  {
    label: "Error stack trace",
    text: "Error: ENOENT: no such file or directory, open '/src/config.ts'\n    at Object.openSync (node:fs:603:3)\n    at readFileSync (node:fs:471:35)\n    at loadConfig (/src/lib/config.ts:15:22)\n    at initialize (/src/app.ts:8:16)\nFATAL: Application failed to start",
    type: "tool_result",
  },
  {
    label: "Test results (pass)",
    text: "PASS src/auth.test.ts\n  Authentication\n    - should validate JWT tokens (12ms)\n    - should reject expired tokens (3ms)\n    - should handle refresh token rotation (8ms)\n  Session Store\n    - should handle concurrent writes (15ms)\n\nTests: 4 passed, 4 total\nTime: 0.842s",
    type: "tool_result",
  },
  {
    label: "Knowledge store",
    text: "[Architecture] The auth system uses JWT access tokens (15min) with rotating refresh tokens (7d). Sessions stored in Redis with mutex locks. Token reuse triggers revocation cascade.",
    type: "knowledge",
    metadata: { event: "knowledge_stored" },
  },
  {
    label: "Injection",
    text: "Review the PR for memory leaks in the WebSocket handler. Focus on event listener cleanup.",
    type: "injection",
    metadata: { event: "context_injection" },
  },
  {
    label: "Session start",
    text: "Starting work on auth refactor",
    type: "assistant",
    metadata: { event: "session_start" },
  },
  {
    label: "File paths heavy",
    text: "Modified files:\n  src/lib/auth.ts\n  src/middleware/validate.ts\n  src/routes/login.ts\n  src/routes/refresh.ts\n  src/models/session.ts\n  src/utils/crypto.ts\n  tests/auth.test.ts\n  tests/session.test.ts",
    type: "tool_result",
  },
  {
    label: "Different agent",
    text: "I've reviewed the changes and the approach looks solid. One concern: the mutex lock granularity might cause contention under high load.",
    type: "assistant",
    agent: AGENTS[1],
  },
  {
    label: "Third agent",
    text: "grep 'mutex' src/**/*.ts",
    type: "tool_call",
    agent: AGENTS[2],
  },
];

function FeatureDebug({ memory }: { memory: Memory }) {
  const f = extractFeatures(memory);
  return (
    <div style={{ fontSize: 11, color: "rgba(240,242,248,0.5)", lineHeight: 1.4 }}>
      <div>action: <b>{f.action}</b></div>
      <div>density: {f.density.toFixed(2)} | brevity: {f.brevity.toFixed(2)}</div>
      <div>code: {f.codeWeight.toFixed(2)} | paths: {f.pathWeight.toFixed(2)}</div>
      <div>error: {f.errorWeight.toFixed(2)} | success: {f.successWeight.toFixed(2)}</div>
      <div>lines: {f.lineCount.toFixed(2)} | hash: {f.hash.toString(16).slice(0, 8)}</div>
    </div>
  );
}

export function GlyphLab() {
  const [text, setText] = useState("Fix the login bug");
  const [messageType, setMessageType] = useState("user");
  const [agent, setAgent] = useState(AGENTS[0]);

  const customMemory = mockMemory(text, messageType, agent);
  const hsl = agentColorHSL(agent);

  return (
    <div style={{
      padding: 32,
      background: "#0a0c14",
      minHeight: "100vh",
      color: "#f0f2f8",
      fontFamily: "Inter, sans-serif",
    }}>
      <h1 style={{ fontSize: 24, marginBottom: 8, fontFamily: "Plus Jakarta Sans, sans-serif" }}>
        Glyph Lab
      </h1>
      <p style={{ color: "rgba(240,242,248,0.5)", marginBottom: 32, fontSize: 14 }}>
        Type text below or click a preset. Each input generates a unique particle field.
      </p>

      {/* Custom input */}
      <div style={{
        display: "flex",
        gap: 16,
        marginBottom: 40,
        alignItems: "flex-start",
      }}>
        <div style={{ flex: 1 }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{
              width: "100%",
              height: 120,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              color: "#f0f2f8",
              padding: 12,
              fontSize: 13,
              fontFamily: "monospace",
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <select
              value={messageType}
              onChange={(e) => setMessageType(e.target.value)}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 4,
                color: "#f0f2f8",
                padding: "4px 8px",
                fontSize: 12,
              }}
            >
              <option value="user">user</option>
              <option value="assistant">assistant</option>
              <option value="tool_call">tool_call</option>
              <option value="tool_result">tool_result</option>
              <option value="knowledge">knowledge</option>
              <option value="injection">injection</option>
            </select>
            <select
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 4,
                color: "#f0f2f8",
                padding: "4px 8px",
                fontSize: 12,
              }}
            >
              {AGENTS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Live preview at multiple sizes */}
        <div style={{
          display: "flex",
          gap: 24,
          alignItems: "flex-end",
          background: "rgba(255,255,255,0.02)",
          padding: 16,
          borderRadius: 8,
        }}>
          <div style={{ textAlign: "center" }}>
            <ParticleGlyph
              memory={customMemory}
              agentHSL={hsl}
              live={true}
              title=""
              displaySize={32}
            />
            <div style={{ fontSize: 10, color: "rgba(240,242,248,0.3)", marginTop: 4 }}>32px</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <ParticleGlyph
              memory={customMemory}
              agentHSL={hsl}
              live={true}
              title=""
              displaySize={64}
            />
            <div style={{ fontSize: 10, color: "rgba(240,242,248,0.3)", marginTop: 4 }}>64px</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <ParticleGlyph
              memory={customMemory}
              agentHSL={hsl}
              live={true}
              title=""
              displaySize={128}
            />
            <div style={{ fontSize: 10, color: "rgba(240,242,248,0.3)", marginTop: 4 }}>128px</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <ParticleGlyph
              memory={customMemory}
              agentHSL={hsl}
              live={true}
              title=""
              displaySize={256}
            />
            <div style={{ fontSize: 10, color: "rgba(240,242,248,0.3)", marginTop: 4 }}>256px</div>
          </div>
        </div>
      </div>

      {/* Feature debug for custom input */}
      <div style={{ marginBottom: 40 }}>
        <FeatureDebug memory={customMemory} />
      </div>

      {/* Preset grid */}
      <h2 style={{ fontSize: 16, marginBottom: 16, fontFamily: "Plus Jakarta Sans, sans-serif" }}>
        Presets
      </h2>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 16,
      }}>
        {PRESETS.map((preset) => {
          const mem = mockMemory(preset.text, preset.type, preset.agent, preset.metadata);
          const presetHSL = agentColorHSL(preset.agent ?? AGENTS[0]);
          return (
            <div
              key={preset.label}
              onClick={() => {
                setText(preset.text);
                setMessageType(preset.type);
                setAgent(preset.agent ?? AGENTS[0]);
              }}
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 8,
                padding: 16,
                cursor: "pointer",
                display: "flex",
                gap: 16,
                alignItems: "flex-start",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
            >
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <ParticleGlyph
                  memory={mem}
                  agentHSL={presetHSL}
                  live={false}
                  title={preset.label}
                  displaySize={64}
                />
                <ParticleGlyph
                  memory={mem}
                  agentHSL={presetHSL}
                  live={false}
                  title={preset.label}
                  displaySize={32}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  {preset.label}
                </div>
                <div style={{
                  fontSize: 11,
                  color: "rgba(240,242,248,0.4)",
                  marginBottom: 8,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical" as const,
                  fontFamily: "monospace",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}>
                  {preset.text}
                </div>
                <FeatureDebug memory={mem} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
