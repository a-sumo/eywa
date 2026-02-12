import { Link, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation("docs");

  return (
    <div className="docs-layout">
      <div className="docs-container">
        <aside className="docs-sidebar">
          <div className="docs-sidebar-section">
            <h3>{t("sidebar.gettingStarted")}</h3>
            <Link to="/docs" className={location.pathname === "/docs" ? "active" : ""}>
              {t("sidebar.overview")}
            </Link>
            <Link to="/docs/quickstart" className={location.pathname === "/docs/quickstart" ? "active" : ""}>
              {t("sidebar.quickstart")}
            </Link>
          </div>

          <div className="docs-sidebar-section">
            <h3>{t("sidebar.integrations")}</h3>
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

          <div className="docs-sidebar-section">
            <h3>{t("sidebar.surfaces")}</h3>
            <Link to="/docs/cli" className={location.pathname === "/docs/cli" ? "active" : ""}>
              {t("sidebar.cli")}
            </Link>
            <Link to="/docs/vscode" className={location.pathname === "/docs/vscode" ? "active" : ""}>
              {t("sidebar.vscodeExtension")}
            </Link>
            <Link to="/docs/discord" className={location.pathname === "/docs/discord" ? "active" : ""}>
              {t("sidebar.discordBot")}
            </Link>
            <Link to="/docs/spectacles" className={location.pathname === "/docs/spectacles" ? "active" : ""}>
              {t("sidebar.spectaclesAR")}
            </Link>
            <Link to="/docs/pi-displays" className={location.pathname === "/docs/pi-displays" ? "active" : ""}>
              {t("sidebar.piDisplays")}
            </Link>
          </div>

          <div className="docs-sidebar-section">
            <h3>{t("sidebar.reference")}</h3>
            <Link to="/docs/architecture" className={location.pathname === "/docs/architecture" ? "active" : ""}>
              {t("sidebar.architecture")}
            </Link>
            <Link to="/docs/self-hosting" className={location.pathname === "/docs/self-hosting" ? "active" : ""}>
              {t("sidebar.selfHosting")}
            </Link>
          </div>

          <div className="docs-sidebar-section">
            <h3>{t("sidebar.resources")}</h3>
            <a href="/llms.txt" target="_blank" rel="noopener noreferrer">
              {t("sidebar.llmDocs")}
            </a>
            <a href="https://github.com/a-sumo/eywa" target="_blank" rel="noopener noreferrer">
              {t("sidebar.github")}
            </a>
            <a href="https://discord.gg/TyEUUnNm" target="_blank" rel="noopener noreferrer">
              {t("sidebar.discord")}
            </a>
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
  const { t } = useTranslation("docs");

  return (
    <article className="docs-article">
      <h1>{t("overview.title")}</h1>
      <p className="docs-lead">
        {t("overview.lead")}
      </p>

      <h2>{t("overview.whatIsEywa")}</h2>
      <p>
        {t("overview.whatIsEywaDesc")}
      </p>

      <h2>{t("overview.coreFeatures")}</h2>

      <h3>{t("overview.destinationProgress")}</h3>
      <p>
        {t("overview.destinationProgressDesc")}
      </p>

      <h3>{t("overview.liveAgentMap")}</h3>
      <p>
        {t("overview.liveAgentMapDesc")}
      </p>

      <h3>{t("overview.contextInjection")}</h3>
      <p>
        {t("overview.contextInjectionDesc")}
      </p>

      <h3>{t("overview.teamKnowledge")}</h3>
      <p dangerouslySetInnerHTML={{ __html: t("overview.teamKnowledgeDesc") }} />

      <h3>{t("overview.timelineBranching")}</h3>
      <p dangerouslySetInnerHTML={{ __html: t("overview.timelineBranchingDesc") }} />

      <h3>{t("overview.globalInsights")}</h3>
      <p dangerouslySetInnerHTML={{ __html: t("overview.globalInsightsDesc") }} />

      <h3>{t("overview.contextRecovery")}</h3>
      <p dangerouslySetInnerHTML={{ __html: t("overview.contextRecoveryDesc") }} />

      <h3>{t("overview.workClaiming")}</h3>
      <p dangerouslySetInnerHTML={{ __html: t("overview.workClaimingDesc") }} />

      <h3>{t("overview.geminiSteering")}</h3>
      <p>
        {t("overview.geminiSteeringDesc")}
      </p>

      <h2>{t("overview.interactionSurfaces")}</h2>
      <p>
        {t("overview.interactionSurfacesDesc")}
      </p>
      <ul>
        <li><strong>{t("overview.surfaceWeb")}</strong> - {t("overview.surfaceWebDesc")}</li>
        <li><strong>{t("overview.surfaceVscode")}</strong> - {t("overview.surfaceVscodeDesc")}</li>
        <li><strong>{t("overview.surfaceDiscord")}</strong> - <span dangerouslySetInnerHTML={{ __html: t("overview.surfaceDiscordDesc") }} /></li>
        <li><strong>{t("overview.surfaceCli")}</strong> - <span dangerouslySetInnerHTML={{ __html: t("overview.surfaceCliDesc") }} /></li>
        <li><strong>{t("overview.surfaceSpectacles")}</strong> - {t("overview.surfaceSpectaclesDesc")}</li>
      </ul>

      <h2>{t("overview.usageLimits")}</h2>
      <p>
        {t("overview.usageLimitsDesc")}
      </p>
      <table className="docs-table">
        <thead>
          <tr><th></th><th>{t("overview.table.free")}</th><th>{t("overview.table.pro")}</th><th>{t("overview.table.enterprise")}</th></tr>
        </thead>
        <tbody>
          <tr><td>{t("overview.table.teamMembers")}</td><td>5</td><td>{t("overview.table.unlimited")}</td><td>{t("overview.table.unlimited")}</td></tr>
          <tr><td>{t("overview.table.history")}</td><td>7 days</td><td>90 days</td><td>{t("overview.table.custom")}</td></tr>
          <tr><td>{t("overview.table.memoriesPerRoom")}</td><td>10,000</td><td>100,000</td><td>{t("overview.table.unlimited")}</td></tr>
          <tr><td>{t("overview.table.integrations")}</td><td>{t("overview.table.all")}</td><td>{t("overview.table.all")}</td><td>{t("overview.table.allCustom")}</td></tr>
          <tr><td>{t("overview.table.knowledgeBase")}</td><td>{t("overview.table.readOnly")}</td><td>{t("overview.table.full")}</td><td>{t("overview.table.full")}</td></tr>
          <tr><td>{t("overview.table.timelineBranching")}</td><td>{t("overview.table.viewOnly")}</td><td>{t("overview.table.full")}</td><td>{t("overview.table.full")}</td></tr>
          <tr><td>{t("overview.table.price")}</td><td>$0</td><td>$5/seat/month</td><td>{t("overview.table.contactUs")}</td></tr>
        </tbody>
      </table>
      <p dangerouslySetInnerHTML={{ __html: t("overview.demoNote") }} />

      <h2>{t("overview.llmDocs")}</h2>
      <p dangerouslySetInnerHTML={{ __html: t("overview.llmDocsDesc") }} />

      <h2>{t("overview.gettingStarted")}</h2>
      <p>
        {t("overview.gettingStartedDesc")}
      </p>

      <div className="docs-cta-grid">
        <Link to="/docs/integrations/claude-code" className="docs-cta-card">
          <h3>Claude Code</h3>
          <p>{t("overview.claudeCodeDesc")}</p>
        </Link>
        <Link to="/docs/integrations/cursor" className="docs-cta-card">
          <h3>Cursor</h3>
          <p>{t("overview.cursorDesc")}</p>
        </Link>
        <Link to="/docs/integrations/windsurf" className="docs-cta-card">
          <h3>Windsurf</h3>
          <p>{t("overview.windsurfDesc")}</p>
        </Link>
      </div>
    </article>
  );
}
