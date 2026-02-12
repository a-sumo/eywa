import { useParams, Link } from "react-router-dom";
import type { ReactNode } from "react";

interface IntegrationConfig {
  name: string;
  description: string;
  tag: string;
  logo: ReactNode;
  website: string;
  mcpDocs?: string;
  configPath: string;
  configExample: string;
  notes?: string[];
  features: string[];
}

const integrations: Record<string, IntegrationConfig> = {
  "claude-code": {
    name: "Claude Code",
    description: "Anthropic's official CLI for Claude. A powerful terminal-based coding assistant.",
    tag: "CLI",
    logo: (
      <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
        <path d="M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-7.258 0h3.767L16.906 20h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.522zm4.132 9.959L8.453 7.687 6.205 13.48H10.7z"/>
      </svg>
    ),
    website: "https://claude.ai/claude-code",
    mcpDocs: "https://docs.anthropic.com/en/docs/claude-code/mcp",
    configPath: "Terminal (one command)",
    configExample: `claude mcp add --transport http eywa "https://mcp.eywa-ai.dev/mcp?room=my-team&agent=claude/alice"`,
    features: [
      "Full MCP support with all Eywa tools",
      "Automatic session tracking",
      "Works in any terminal",
      "Supports background agents",
    ],
    notes: [
      "Claude Code has first-class MCP support built-in",
      "Replace my-team with your fold slug and alice with your name",
    ],
  },

  cursor: {
    name: "Cursor",
    description: "The AI-first code editor. Fork of VS Code with deep AI integration.",
    tag: "IDE",
    logo: (
      <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
        <path d="M22.106 5.68L12.5.135a.998.998 0 00-.998 0L1.893 5.68a.84.84 0 00-.419.726v11.186c0 .3.16.577.42.727l9.607 5.547a.999.999 0 00.998 0l9.608-5.547a.84.84 0 00.42-.727V6.407a.84.84 0 00-.42-.726zm-.603 1.176L12.228 22.92c-.063.108-.228.064-.228-.061V12.34a.59.59 0 00-.295-.51l-9.11-5.26c-.107-.062-.063-.228.062-.228h18.55c.264 0 .428.286.296.514z"/>
      </svg>
    ),
    website: "https://cursor.sh",
    mcpDocs: "https://cursor.com/docs",
    configPath: "~/.cursor/mcp.json (global) or .cursor/mcp.json (project)",
    configExample: `{
  "mcpServers": {
    "eywa": {
      "url": "https://mcp.eywa-ai.dev/mcp?room=my-team&agent=cursor/alice"
    }
  }
}`,
    features: [
      "MCP support via settings",
      "Works with Composer and Chat",
      "Codebase-aware context",
      "Multi-file editing",
    ],
    notes: [
      "Enable MCP in Cursor Settings > Features > MCP",
      "Restart Cursor after adding the server",
    ],
  },

  windsurf: {
    name: "Windsurf",
    description: "Codeium's AI-native IDE. Built for agentic workflows from the ground up.",
    tag: "IDE",
    logo: (
      <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
        <path clipRule="evenodd" d="M23.78 5.004h-.228a2.187 2.187 0 00-2.18 2.196v4.912c0 .98-.804 1.775-1.76 1.775a1.818 1.818 0 01-1.472-.773L13.168 5.95a2.197 2.197 0 00-1.81-.95c-1.134 0-2.154.972-2.154 2.173v4.94c0 .98-.797 1.775-1.76 1.775-.57 0-1.136-.289-1.472-.773L.408 5.098C.282 4.918 0 5.007 0 5.228v4.284c0 .216.066.426.188.604l5.475 7.889c.324.466.8.812 1.351.938 1.377.316 2.645-.754 2.645-2.117V11.89c0-.98.787-1.775 1.76-1.775h.002c.586 0 1.135.288 1.472.773l4.972 7.163a2.15 2.15 0 001.81.95c1.158 0 2.151-.973 2.151-2.173v-4.939c0-.98.787-1.775 1.76-1.775h.194c.122 0 .22-.1.22-.222V5.225a.221.221 0 00-.22-.222z"/>
      </svg>
    ),
    website: "https://windsurf.com",
    mcpDocs: "https://docs.windsurf.com/windsurf/cascade/mcp",
    configPath: "~/.codeium/windsurf/mcp_config.json",
    configExample: `{
  "mcpServers": {
    "eywa": {
      "serverUrl": "https://mcp.eywa-ai.dev/mcp?room=my-team&agent=windsurf/alice"
    }
  }
}`,
    features: [
      "Native MCP integration",
      "Cascade agentic workflows",
      "Multi-file context",
      "Terminal integration",
    ],
    notes: [
      "Windsurf has built-in MCP support",
      "Access MCP tools via the Cascade panel",
    ],
  },

  "gemini-cli": {
    name: "Gemini CLI",
    description: "Google's command-line interface for Gemini. Powerful multi-modal coding assistant.",
    tag: "CLI",
    logo: (
      <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
        <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"/>
      </svg>
    ),
    website: "https://github.com/google-gemini/gemini-cli",
    configPath: "~/.gemini/settings.json",
    configExample: `{
  "mcpServers": {
    "eywa": {
      "httpUrl": "https://mcp.eywa-ai.dev/mcp?room=my-team&agent=gemini/alice"
    }
  }
}`,
    features: [
      "MCP support via config",
      "Multi-modal capabilities",
      "Large context window",
      "Google Cloud integration",
    ],
    notes: [
      "Gemini CLI supports MCP servers natively",
      "Run `gemini --help` to see available commands",
    ],
  },

  codex: {
    name: "Codex",
    description: "OpenAI's coding CLI. Lightweight terminal agent powered by GPT models.",
    tag: "CLI",
    logo: (
      <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
        <path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z"/>
      </svg>
    ),
    website: "https://github.com/openai/codex",
    configPath: "~/.codex/config.toml",
    configExample: `[mcp_servers.eywa]
url = "https://mcp.eywa-ai.dev/mcp?room=my-team&agent=codex/alice"`,
    features: [
      "Native MCP support via config.toml",
      "Streamable HTTP transport",
      "GPT-4 powered",
      "Code generation focus",
    ],
    notes: [
      "Codex uses TOML configuration, not JSON",
      "You can also add via CLI: codex mcp add eywa --url https://mcp.eywa-ai.dev/mcp?room=my-team&agent=codex/alice",
      "Set OPENAI_API_KEY in your environment",
    ],
  },

  cline: {
    name: "Cline",
    description: "Autonomous coding agent for VS Code. Formerly Claude Dev.",
    tag: "VS Code",
    logo: (
      <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
        <path d="M17.035 3.991c2.75 0 4.98 2.24 4.98 5.003v1.667l1.45 2.896a1.01 1.01 0 01-.002.909l-1.448 2.864v1.668c0 2.762-2.23 5.002-4.98 5.002H7.074c-2.751 0-4.98-2.24-4.98-5.002V17.33l-1.48-2.855a1.01 1.01 0 01-.003-.927l1.482-2.887V8.994c0-2.763 2.23-5.003 4.98-5.003h9.962zM8.265 9.6a2.274 2.274 0 00-2.274 2.274v4.042a2.274 2.274 0 004.547 0v-4.042A2.274 2.274 0 008.265 9.6zm7.326 0a2.274 2.274 0 00-2.274 2.274v4.042a2.274 2.274 0 104.548 0v-4.042A2.274 2.274 0 0015.59 9.6z"/>
        <path d="M12.054 5.558a2.779 2.779 0 100-5.558 2.779 2.779 0 000 5.558z"/>
      </svg>
    ),
    website: "https://github.com/cline/cline",
    mcpDocs: "https://docs.cline.bot/mcp/configuring-mcp-servers",
    configPath: "cline_mcp_settings.json (via Cline extension)",
    configExample: `{
  "mcpServers": {
    "eywa": {
      "url": "https://mcp.eywa-ai.dev/mcp?room=my-team&agent=cline/alice"
    }
  }
}`,
    features: [
      "MCP support via extension settings",
      "Autonomous task execution",
      "File system access",
      "Terminal integration",
    ],
    notes: [
      "Open the Cline panel, click the MCP Servers icon, then 'Advanced MCP Settings' to edit the config",
      "Cline will prompt to approve tool usage",
    ],
  },

  mistral: {
    name: "Mistral",
    description: "Mistral AI's models via API. Powerful open-weight models for coding.",
    tag: "API",
    logo: (
      <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
        <path clipRule="evenodd" d="M3.428 3.4h3.429v3.428h3.429v3.429h-.002 3.431V6.828h3.427V3.4h3.43v13.714H24v3.429H13.714v-3.428h-3.428v-3.429h-3.43v3.428h3.43v3.429H0v-3.429h3.428V3.4zm10.286 13.715h3.428v-3.429h-3.427v3.429z"/>
      </svg>
    ),
    website: "https://mistral.ai",
    configPath: "Agent-dependent",
    configExample: `// Mistral models can be used with any MCP-compatible agent.
// Configure your agent to use Mistral's API, then add Eywa:
{
  "mcpServers": {
    "eywa": {
      "url": "https://mcp.eywa-ai.dev/mcp?room=my-team&agent=mistral/alice"
    }
  }
}`,
    features: [
      "Works with any MCP-compatible client",
      "Open-weight models",
      "Fast inference",
      "Code-specialized models available",
    ],
    notes: [
      "Mistral models work with MCP-compatible agents",
      "Use with Cursor, Continue, or custom integrations",
    ],
  },

  cohere: {
    name: "Cohere",
    description: "Cohere's Command models. Enterprise-ready AI with strong coding capabilities.",
    tag: "API",
    logo: (
      <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
        <path clipRule="evenodd" d="M8.128 14.099c.592 0 1.77-.033 3.398-.703 1.897-.781 5.672-2.2 8.395-3.656 1.905-1.018 2.74-2.366 2.74-4.18A4.56 4.56 0 0018.1 1H7.549A6.55 6.55 0 001 7.55c0 3.617 2.745 6.549 7.128 6.549z"/>
        <path clipRule="evenodd" d="M9.912 18.61a4.387 4.387 0 012.705-4.052l3.323-1.38c3.361-1.394 7.06 1.076 7.06 4.715a5.104 5.104 0 01-5.105 5.104l-3.597-.001a4.386 4.386 0 01-4.386-4.387z"/>
        <path d="M4.776 14.962A3.775 3.775 0 001 18.738v.489a3.776 3.776 0 007.551 0v-.49a3.775 3.775 0 00-3.775-3.775z"/>
      </svg>
    ),
    website: "https://cohere.com",
    configPath: "Agent-dependent",
    configExample: `// Cohere models can be used with any MCP-compatible agent.
// Configure your agent to use Cohere's API, then add Eywa:
{
  "mcpServers": {
    "eywa": {
      "url": "https://mcp.eywa-ai.dev/mcp?room=my-team&agent=cohere/alice"
    }
  }
}`,
    features: [
      "Works with any MCP-compatible client",
      "Enterprise-grade security",
      "RAG-optimized models",
      "Strong reasoning capabilities",
    ],
    notes: [
      "Cohere Command models work with MCP agents",
      "Ideal for enterprise deployments",
    ],
  },
};

export function IntegrationGuide() {
  const { provider } = useParams<{ provider: string }>();
  const config = provider ? integrations[provider] : null;

  if (!config) {
    return (
      <article className="docs-article">
        <h1>Integration Not Found</h1>
        <p>The requested integration guide doesn't exist.</p>
        <Link to="/docs" className="btn-docs-primary">Back to Docs</Link>
      </article>
    );
  }

  return (
    <article className="docs-article">
      <div className="docs-integration-header">
        <div className="docs-integration-logo">{config.logo}</div>
        <div>
          <h1>{config.name}</h1>
          <p className="docs-lead">{config.description}</p>
          <div className="docs-integration-links">
            <a href={config.website} target="_blank" rel="noopener noreferrer" className="btn-docs-secondary">
              Official Website
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
              </svg>
            </a>
            {config.mcpDocs && (
              <a href={config.mcpDocs} target="_blank" rel="noopener noreferrer" className="btn-docs-secondary">
                MCP Documentation
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
                </svg>
              </a>
            )}
          </div>
        </div>
      </div>

      <h2>Setup Instructions</h2>
      <p>
        The fastest way is to run <code>npx eywa-ai init</code>, which
        auto-detects {config.name} and configures it automatically. If you
        prefer manual setup:
      </p>
      <ol className="docs-steps">
        <li>
          <strong>Add the Eywa MCP endpoint to your config</strong>
          <p>No installation needed. Eywa runs as a hosted HTTP endpoint.</p>
        </li>
        <li>
          <strong>Edit <code>{config.configPath}</code></strong>
          <p>Paste the configuration below with your fold and agent name.</p>
        </li>
        <li>
          <strong>Restart {config.name}</strong>
          <p>The MCP server will connect automatically.</p>
        </li>
      </ol>

      <h2>Configuration</h2>
      <p>Add this to your {config.name} configuration:</p>
      <pre className="docs-code">
        <code>{config.configExample}</code>
      </pre>

      <div className="docs-config-note">
        <strong>URL parameters:</strong>
        <ul>
          <li><code>room</code> - Your team's fold slug (e.g., "my-team"). Create one with <code>npx eywa-ai init</code>.</li>
          <li><code>agent</code> - Your agent identity in <code>{"agent/name"}</code> format (e.g., "cursor/alice"). Each person uses their own name so Eywa can tell agents apart.</li>
        </ul>
      </div>

      <h2>Features</h2>
      <ul className="docs-feature-list">
        {config.features.map((feature, i) => (
          <li key={i}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--aurora-green)" strokeWidth="2">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
            {feature}
          </li>
        ))}
      </ul>

      {config.notes && config.notes.length > 0 && (
        <>
          <h2>Notes</h2>
          <ul>
            {config.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </>
      )}

      <h2>Available Tools</h2>
      <p>Once connected, {config.name} will have access to these Eywa tools:</p>
      <div className="docs-tools-grid">
        <div className="docs-tool">
          <strong>eywa_start</strong>
          <span>Start logging a session</span>
        </div>
        <div className="docs-tool">
          <strong>eywa_log</strong>
          <span>Log messages to shared memory</span>
        </div>
        <div className="docs-tool">
          <strong>eywa_context</strong>
          <span>Get context from other agents</span>
        </div>
        <div className="docs-tool">
          <strong>eywa_inject</strong>
          <span>Push context to other agents</span>
        </div>
        <div className="docs-tool">
          <strong>eywa_knowledge</strong>
          <span>Access the knowledge base</span>
        </div>
        <div className="docs-tool">
          <strong>eywa_learn</strong>
          <span>Store persistent knowledge</span>
        </div>
      </div>

      <div className="docs-next-steps">
        <h2>Next Steps</h2>
        <p>After setup, try these commands with {config.name}:</p>
        <ul>
          <li>"Start a session for working on the auth feature"</li>
          <li>"What are the other agents working on?"</li>
          <li>"Save this decision to the knowledge base"</li>
        </ul>
      </div>
    </article>
  );
}
