import { useState } from "react";

const WORKER_URL = "https://remix-mcp.armandsumo.workers.dev/mcp";

type Client = "claude" | "cursor" | "gemini";

function mcpUrl(slug: string, agent: string): string {
  return `${WORKER_URL}?room=${encodeURIComponent(slug)}&agent=${encodeURIComponent(agent)}`;
}

function getConfig(client: Client, slug: string, agent: string): string {
  const url = mcpUrl(slug, agent);

  switch (client) {
    case "claude":
      return `claude mcp add --transport http remix "${url}"`;
    case "cursor":
      return JSON.stringify(
        {
          mcpServers: {
            remix: { url },
          },
        },
        null,
        2
      );
    case "gemini":
      return JSON.stringify(
        {
          mcpServers: {
            remix: { httpUrl: url },
          },
        },
        null,
        2
      );
  }
}

function getLabel(client: Client): string {
  switch (client) {
    case "claude":
      return "Claude Code";
    case "cursor":
      return "Cursor / Windsurf";
    case "gemini":
      return "Gemini CLI";
  }
}

function getHint(client: Client): string {
  switch (client) {
    case "claude":
      return "Run this in your terminal:";
    case "cursor":
      return "Add to your MCP config file:";
    case "gemini":
      return "Add to your MCP config file (uses httpUrl):";
  }
}

const QUICK_START_PROMPT = `Start logging to Eywa. Call remix_start with a description of what we're working on, then use remix_import to upload a summary of our conversation so far. After that, periodically call remix_log for important exchanges.`;

interface ConnectAgentProps {
  slug: string;
  inline?: boolean;
}

export function ConnectAgent({ slug, inline }: ConnectAgentProps) {
  const [agent, setAgent] = useState("alpha");
  const [client, setClient] = useState<Client>("claude");
  const [copied, setCopied] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  const config = getConfig(client, slug, agent);

  function handleCopy() {
    navigator.clipboard.writeText(config);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCopyPrompt() {
    navigator.clipboard.writeText(QUICK_START_PROMPT);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  }

  return (
    <div className={`connect-agent ${inline ? "connect-agent-inline" : ""}`}>
      {!inline && (
        <div className="connect-agent-header">
          <h3>Connect an AI Agent</h3>
          <p>
            Two steps to start logging your AI session to this room.
          </p>
        </div>
      )}

      <div className="connect-agent-steps">
        <button
          className={`connect-step-btn ${step === 1 ? "connect-step-active" : ""}`}
          onClick={() => setStep(1)}
        >
          1. Connect
        </button>
        <button
          className={`connect-step-btn ${step === 2 ? "connect-step-active" : ""}`}
          onClick={() => setStep(2)}
        >
          2. Start logging
        </button>
      </div>

      {step === 1 && (
        <>
          <div className="connect-agent-fields">
            <label className="connect-agent-label">
              <span>Agent name</span>
              <input
                className="connect-agent-input"
                value={agent}
                onChange={(e) => setAgent(e.target.value.replace(/\s/g, "-"))}
                placeholder="alpha"
              />
            </label>

            <div className="connect-agent-clients">
              {(["claude", "cursor", "gemini"] as Client[]).map((c) => (
                <button
                  key={c}
                  className={`connect-client-btn ${client === c ? "connect-client-active" : ""}`}
                  onClick={() => setClient(c)}
                >
                  {getLabel(c)}
                </button>
              ))}
            </div>
          </div>

          <div className="connect-agent-config">
            <span className="connect-agent-hint">{getHint(client)}</span>
            <pre className="connect-agent-code">{config}</pre>
            <button className="connect-agent-copy" onClick={handleCopy}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          <button className="connect-next-btn" onClick={() => setStep(2)}>
            Next: Start logging &rarr;
          </button>
        </>
      )}

      {step === 2 && (
        <div className="connect-agent-quickstart">
          <span className="connect-agent-hint">
            Paste this into your {getLabel(client)} session:
          </span>
          <pre className="connect-agent-code connect-agent-prompt">
            {QUICK_START_PROMPT}
          </pre>
          <button className="connect-agent-copy" onClick={handleCopyPrompt}>
            {copiedPrompt ? "Copied!" : "Copy prompt"}
          </button>
          <div className="connect-agent-tools-info">
            <span className="connect-agent-hint">Available tools once connected:</span>
            <div className="connect-tools-grid">
              <span className="connect-tool-tag">remix_start</span>
              <span className="connect-tool-desc">Begin logging a session</span>
              <span className="connect-tool-tag">remix_log</span>
              <span className="connect-tool-desc">Log important exchanges</span>
              <span className="connect-tool-tag">remix_import</span>
              <span className="connect-tool-desc">Bulk-upload conversation history</span>
              <span className="connect-tool-tag">remix_file</span>
              <span className="connect-tool-desc">Store code files</span>
              <span className="connect-tool-tag">remix_sync</span>
              <span className="connect-tool-desc">Pull another agent's context</span>
              <span className="connect-tool-tag">remix_msg</span>
              <span className="connect-tool-desc">Message teammates</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
