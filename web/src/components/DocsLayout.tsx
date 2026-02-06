import { Link, Outlet, useLocation } from "react-router-dom";
import EywaLogo from "./EywaLogo";

const integrations = [
  { id: "claude-code", name: "Claude Code", tag: "CLI" },
  { id: "cursor", name: "Cursor", tag: "IDE" },
  { id: "windsurf", name: "Windsurf", tag: "IDE" },
  { id: "gemini-cli", name: "Gemini CLI", tag: "CLI" },
  { id: "codex", name: "Codex", tag: "CLI" },
  { id: "cline", name: "Cline", tag: "VS Code" },
  { id: "mistral", name: "Mistral", tag: "API" },
  { id: "cohere", name: "Cohere", tag: "API" },
];

export function DocsLayout() {
  const location = useLocation();

  return (
    <div className="docs-layout">
      <header className="docs-header">
        <Link to="/" className="docs-logo">
          <EywaLogo size={32} />
          <span>Eywa</span>
        </Link>
        <nav className="docs-nav">
          <Link to="/docs" className={location.pathname === "/docs" ? "active" : ""}>
            Overview
          </Link>
          <Link
            to="/docs/integrations/claude-code"
            className={location.pathname.includes("/integrations") ? "active" : ""}
          >
            Integrations
          </Link>
        </nav>
      </header>

      <div className="docs-container">
        <aside className="docs-sidebar">
          <div className="docs-sidebar-section">
            <h3>Getting Started</h3>
            <Link to="/docs" className={location.pathname === "/docs" ? "active" : ""}>
              Overview
            </Link>
            <Link to="/docs/quickstart" className={location.pathname === "/docs/quickstart" ? "active" : ""}>
              Quickstart
            </Link>
          </div>

          <div className="docs-sidebar-section">
            <h3>Integrations</h3>
            {integrations.map((item) => (
              <Link
                key={item.id}
                to={`/docs/integrations/${item.id}`}
                className={location.pathname === `/docs/integrations/${item.id}` ? "active" : ""}
              >
                {item.name}
                <span className="docs-sidebar-tag">{item.tag}</span>
              </Link>
            ))}
          </div>
        </aside>

        <main className="docs-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function DocsOverview() {
  return (
    <article className="docs-article">
      <h1>Eywa Documentation</h1>
      <p className="docs-lead">
        Eywa gives your AI coding agents shared memory. When agents work together on a codebase,
        Eywa captures their context, decisions, and progress so nothing gets lost.
      </p>

      <h2>What is Eywa?</h2>
      <p>
        Eywa is an MCP server that provides persistent, shared memory for AI coding agents.
        It works with any agent that supports the Model Context Protocol, including Claude Code,
        Cursor, Windsurf, Gemini CLI, and more.
      </p>

      <h2>Key Features</h2>
      <ul>
        <li><strong>Shared Memory</strong> - Agents can read and write to a shared context</li>
        <li><strong>Session Tracking</strong> - See what each agent is working on in real-time</li>
        <li><strong>Knowledge Base</strong> - Persistent project knowledge that survives across sessions</li>
        <li><strong>Context Injection</strong> - Push context to agents when they need it</li>
        <li><strong>Timeline</strong> - Rewind and fork from any point in your project history</li>
      </ul>

      <h2>Getting Started</h2>
      <p>
        Choose your AI coding agent from the sidebar to see specific setup instructions.
        Most integrations take less than 2 minutes to configure.
      </p>

      <div className="docs-cta-grid">
        <Link to="/docs/integrations/claude-code" className="docs-cta-card">
          <h3>Claude Code</h3>
          <p>Anthropic's CLI agent</p>
        </Link>
        <Link to="/docs/integrations/cursor" className="docs-cta-card">
          <h3>Cursor</h3>
          <p>AI-first code editor</p>
        </Link>
        <Link to="/docs/integrations/windsurf" className="docs-cta-card">
          <h3>Windsurf</h3>
          <p>Codeium's IDE</p>
        </Link>
      </div>
    </article>
  );
}
