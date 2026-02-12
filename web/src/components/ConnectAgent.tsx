import { useState } from "react";

const WORKER_URL = "https://mcp.eywa-ai.dev/mcp";

type Client = "claude" | "cursor" | "gemini" | "cline" | "windsurf" | "codex";

function mcpUrl(slug: string, agent: string): string {
  return `${WORKER_URL}?room=${encodeURIComponent(slug)}&agent=${encodeURIComponent(agent)}`;
}

function getConfig(client: Client, slug: string, agent: string): string {
  const url = mcpUrl(slug, agent);

  switch (client) {
    case "claude":
      return `claude mcp add --transport http eywa "${url}"`;
    case "cursor":
      return JSON.stringify(
        {
          mcpServers: {
            eywa: { url },
          },
        },
        null,
        2
      );
    case "gemini":
      return JSON.stringify(
        {
          mcpServers: {
            eywa: { httpUrl: url },
          },
        },
        null,
        2
      );
    case "cline":
      return JSON.stringify(
        {
          mcpServers: {
            eywa: {
              url,
              disabled: false,
            },
          },
        },
        null,
        2
      );
    case "windsurf":
      return JSON.stringify(
        {
          mcpServers: {
            eywa: { serverUrl: url },
          },
        },
        null,
        2
      );
    case "codex":
      return `[mcp_servers.eywa]\nurl = "${url}"`;
  }
}

function getLabel(client: Client): string {
  switch (client) {
    case "claude":
      return "Claude Code";
    case "cursor":
      return "Cursor";
    case "gemini":
      return "Gemini CLI";
    case "cline":
      return "Cline / Roo";
    case "windsurf":
      return "Windsurf";
    case "codex":
      return "Codex";
  }
}

function getConfigPath(client: Client): string | null {
  switch (client) {
    case "claude":
      return null; // CLI handles it
    case "cursor":
      return "~/.cursor/mcp.json";
    case "gemini":
      return "~/.gemini/settings.json";
    case "cline":
      return "VS Code Settings → Cline MCP Servers";
    case "windsurf":
      return "~/.codeium/windsurf/mcp_config.json";
    case "codex":
      return "~/.codex/config.toml";
  }
}

function getHint(client: Client): string {
  switch (client) {
    case "claude":
      return "Run this in your terminal:";
    case "cursor":
      return `Add to ${getConfigPath(client)}:`;
    case "gemini":
      return `Add to ${getConfigPath(client)}:`;
    case "cline":
      return "Add to Cline settings in VS Code:";
    case "windsurf":
      return `Add to ${getConfigPath(client)}:`;
    case "codex":
      return `Add to ${getConfigPath(client)}:`;
  }
}

function getSetupSteps(client: Client): string[] {
  switch (client) {
    case "claude":
      return [
        "Copy the command below",
        "Paste into your terminal",
        "Done! Eywa tools are now available",
      ];
    case "cursor":
      return [
        "Open Cursor Settings (Cmd/Ctrl + ,)",
        'Search for "MCP" and click "Edit in settings.json"',
        "Add the config below to mcpServers object",
        "Restart Cursor",
      ];
    case "gemini":
      return [
        "Create ~/.gemini/settings.json if it doesn't exist",
        "Add the config below",
        "Restart Gemini CLI",
      ];
    case "cline":
      return [
        "Open VS Code Command Palette (Cmd/Ctrl + Shift + P)",
        'Type "Cline: MCP Servers"',
        "Click + to add server, paste config",
      ];
    case "windsurf":
      return [
        "Create ~/.codeium/windsurf/mcp_config.json if it doesn't exist",
        "Add the config below",
        "Restart Windsurf",
      ];
    case "codex":
      return [
        "Create ~/.codex/config.toml if it doesn't exist",
        "Add the config below",
        "Run codex to start using Eywa tools",
      ];
  }
}

const ALL_CLIENTS: Client[] = ["claude", "cursor", "gemini", "windsurf", "codex", "cline"];

const QUICK_START_PROMPT = `Start logging to Eywa. Call eywa_start with a description of what we're working on, then use eywa_import to upload a summary of our conversation so far. After that, periodically call eywa_log for important exchanges.`;

interface ConnectAgentProps {
  slug: string;
  inline?: boolean;
}

export function ConnectAgent({ slug, inline }: ConnectAgentProps) {
  const [agent, setAgent] = useState("alpha");
  const [client, setClient] = useState<Client>("claude");
  const [copied, setCopied] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  const config = getConfig(client, slug, agent);
  const configPath = getConfigPath(client);
  const steps = getSetupSteps(client);

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

  function handleDownloadConfig() {
    let filename: string;
    let type: string;
    if (client === "gemini") {
      filename = "settings.json";
      type = "application/json";
    } else if (client === "codex") {
      filename = "config.toml";
      type = "text/plain";
    } else if (client === "windsurf") {
      filename = "mcp_config.json";
      type = "application/json";
    } else {
      filename = "mcp.json";
      type = "application/json";
    }
    const blob = new Blob([config], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCopySetupScript() {
    let script: string;
    if (client === "gemini") {
      script = `mkdir -p ~/.gemini && cat > ~/.gemini/settings.json << 'EOF'
${config}
EOF
echo "Eywa configured for Gemini CLI"`;
    } else if (client === "windsurf") {
      script = `mkdir -p ~/.codeium/windsurf && cat > ~/.codeium/windsurf/mcp_config.json << 'EOF'
${config}
EOF
echo "Eywa configured for Windsurf"`;
    } else if (client === "codex") {
      script = `mkdir -p ~/.codex && cat > ~/.codex/config.toml << 'EOF'
${config}
EOF
echo "Eywa configured for Codex"`;
    } else {
      script = config;
    }
    navigator.clipboard.writeText(script);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  }

  const showDownload = client !== "claude";
  const showSetupScript = client === "gemini" || client === "windsurf" || client === "codex";

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
              {ALL_CLIENTS.map((c) => (
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

          {/* Setup steps */}
          <div className="connect-setup-steps">
            {steps.map((s, i) => (
              <div key={i} className="connect-setup-step">
                <span className="connect-step-num">{i + 1}</span>
                <span>{s}</span>
              </div>
            ))}
          </div>

          <div className="connect-agent-config">
            {configPath && (
              <span className="connect-config-path">
                <code>{configPath}</code>
              </span>
            )}
            <span className="connect-agent-hint">{getHint(client)}</span>
            <pre className="connect-agent-code">{config}</pre>
            <div className="connect-config-actions">
              <button className="connect-agent-copy" onClick={handleCopy}>
                {copied ? "Copied!" : "Copy"}
              </button>
              {showDownload && (
                <button className="connect-agent-download" onClick={handleDownloadConfig}>
                  Download
                </button>
              )}
              {showSetupScript && (
                <button
                  className="connect-agent-script"
                  onClick={handleCopySetupScript}
                  title="Copy a bash script that creates the config file"
                >
                  {copiedScript ? "Copied!" : "Setup Script"}
                </button>
              )}
            </div>
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
              <span className="connect-tool-tag">eywa_start</span>
              <span className="connect-tool-desc">Begin logging a session</span>
              <span className="connect-tool-tag">eywa_log</span>
              <span className="connect-tool-desc">Log important exchanges</span>
              <span className="connect-tool-tag">eywa_import</span>
              <span className="connect-tool-desc">Bulk-upload conversation history</span>
              <span className="connect-tool-tag">eywa_file</span>
              <span className="connect-tool-desc">Store code files</span>
              <span className="connect-tool-tag">eywa_sync</span>
              <span className="connect-tool-desc">Pull another agent's context</span>
              <span className="connect-tool-tag">eywa_msg</span>
              <span className="connect-tool-desc">Message teammates</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
