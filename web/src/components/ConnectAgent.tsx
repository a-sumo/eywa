import { useState } from "react";

const WORKER_URL = "https://eywa-mcp.armandsumo.workers.dev/mcp";

type Client = "claude" | "cursor" | "gemini";

function mcpUrl(slug: string, agent: string): string {
  return `${WORKER_URL}?room=${encodeURIComponent(slug)}&agent=${encodeURIComponent(agent)}`;
}

function getConfig(client: Client, slug: string, agent: string): string {
  const url = mcpUrl(slug, agent);

  switch (client) {
    case "claude":
      return `claude mcp add neuralmesh --url "${url}"`;
    case "cursor":
      return JSON.stringify(
        {
          mcpServers: {
            neuralmesh: { url },
          },
        },
        null,
        2
      );
    case "gemini":
      return JSON.stringify(
        {
          mcpServers: {
            neuralmesh: { httpUrl: url },
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

interface ConnectAgentProps {
  slug: string;
  inline?: boolean;
}

export function ConnectAgent({ slug, inline }: ConnectAgentProps) {
  const [agent, setAgent] = useState("alpha");
  const [client, setClient] = useState<Client>("claude");
  const [copied, setCopied] = useState(false);

  const config = getConfig(client, slug, agent);

  function handleCopy() {
    navigator.clipboard.writeText(config);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={`connect-agent ${inline ? "connect-agent-inline" : ""}`}>
      {!inline && (
        <div className="connect-agent-header">
          <h3>Connect an AI Agent</h3>
          <p>
            Paste the config below into your AI tool to start logging to this
            room.
          </p>
        </div>
      )}

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
    </div>
  );
}
