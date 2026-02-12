import { useTranslation } from "react-i18next";

export function CLIDocs() {
  const { t } = useTranslation("docs");
  return (
    <article className="docs-article">
      <h1>{t("cli.title")}</h1>
      <p className="docs-lead" dangerouslySetInnerHTML={{ __html: t("cli.lead") }} />

      <h2>{t("cli.installation")}</h2>
      <p>{t("cli.installationDesc")}</p>
      <pre className="docs-code"><code>npx eywa-ai</code></pre>
      <p dangerouslySetInnerHTML={{ __html: t("cli.stateDesc") }} />

      <h2>{t("cli.commands")}</h2>

      <h3>{t("cli.initTitle")}</h3>
      <p dangerouslySetInnerHTML={{ __html: t("cli.initDesc") }} />
      <pre className="docs-code"><code>{`# Auto-configure everything
npx eywa-ai init

# Named room
npx eywa-ai init my-team`}</code></pre>

      <h3>{t("cli.joinTitle")}</h3>
      <p>{t("cli.joinDesc")}</p>
      <pre className="docs-code"><code>npx eywa-ai join cosmic-fox-a1b2</code></pre>

      <h3>{t("cli.statusTitle")}</h3>
      <p>{t("cli.statusDesc")}</p>
      <pre className="docs-code"><code>{`# Status for your default room
npx eywa-ai status

# Status for a specific room
npx eywa-ai status my-team`}</code></pre>

      <h3>{t("cli.logTitle")}</h3>
      <p>{t("cli.logDesc")}</p>
      <pre className="docs-code"><code>{`# Last 30 entries
npx eywa-ai log

# Last 10 entries for a specific room
npx eywa-ai log my-team 10`}</code></pre>

      <h3>{t("cli.injectTitle")}</h3>
      <p>{t("cli.injectDesc")}</p>
      <pre className="docs-code"><code>{`npx eywa-ai inject agent-beta "use REST, not GraphQL"
npx eywa-ai inject all "schema changed: user_id is UUID now"`}</code></pre>

      <h3>{t("cli.dashboardTitle")}</h3>
      <p dangerouslySetInnerHTML={{ __html: t("cli.dashboardDesc") }} />
      <pre className="docs-code"><code>npx eywa-ai dashboard</code></pre>

      <h3>{t("cli.helpTitle")}</h3>
      <p dangerouslySetInnerHTML={{ __html: t("cli.helpDesc") }} />
      <pre className="docs-code"><code>npx eywa-ai help</code></pre>

      <h2>{t("cli.whatAgentsCanDo")}</h2>
      <p>{t("cli.whatAgentsCanDoDesc")}</p>

      <table>
        <thead>
          <tr>
            <th>{t("cli.tableCategory")}</th>
            <th>{t("cli.tableTools")}</th>
            <th>{t("cli.tableWhatTheyDo")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>{t("cli.categorySession")}</strong></td>
            <td><code>eywa_whoami</code>, <code>eywa_start</code>, <code>eywa_stop</code>, <code>eywa_done</code></td>
            <td>{t("cli.sessionDesc")}</td>
          </tr>
          <tr>
            <td><strong>{t("cli.categoryMemory")}</strong></td>
            <td><code>eywa_log</code>, <code>eywa_file</code>, <code>eywa_get_file</code>, <code>eywa_import</code>, <code>eywa_search</code></td>
            <td>{t("cli.memoryDesc")}</td>
          </tr>
          <tr>
            <td><strong>{t("cli.categoryContext")}</strong></td>
            <td><code>eywa_context</code>, <code>eywa_agents</code>, <code>eywa_recall</code>, <code>eywa_status</code>, <code>eywa_summary</code>, <code>eywa_pull</code>, <code>eywa_sync</code></td>
            <td>{t("cli.contextDesc")}</td>
          </tr>
          <tr>
            <td><strong>{t("cli.categoryInjection")}</strong></td>
            <td><code>eywa_inject</code>, <code>eywa_inbox</code></td>
            <td>{t("cli.injectionDesc")}</td>
          </tr>
          <tr>
            <td><strong>{t("cli.categoryKnowledge")}</strong></td>
            <td><code>eywa_learn</code>, <code>eywa_knowledge</code>, <code>eywa_forget</code></td>
            <td>{t("cli.knowledgeDesc")}</td>
          </tr>
          <tr>
            <td><strong>{t("cli.categoryMessaging")}</strong></td>
            <td><code>eywa_msg</code></td>
            <td>{t("cli.messagingDesc")}</td>
          </tr>
          <tr>
            <td><strong>{t("cli.categoryDestination")}</strong></td>
            <td><code>eywa_destination</code>, <code>eywa_progress</code></td>
            <td>{t("cli.destinationDesc")}</td>
          </tr>
          <tr>
            <td><strong>{t("cli.categoryRecovery")}</strong></td>
            <td><code>eywa_checkpoint</code>, <code>eywa_distress</code>, <code>eywa_recover</code></td>
            <td>{t("cli.recoveryDesc")}</td>
          </tr>
          <tr>
            <td><strong>{t("cli.categoryClaiming")}</strong></td>
            <td><code>eywa_claim</code>, <code>eywa_unclaim</code></td>
            <td>{t("cli.claimingDesc")}</td>
          </tr>
          <tr>
            <td><strong>{t("cli.categoryLinking")}</strong></td>
            <td><code>eywa_link</code>, <code>eywa_links</code>, <code>eywa_unlink</code>, <code>eywa_fetch</code></td>
            <td>{t("cli.linkingDesc")}</td>
          </tr>
          <tr>
            <td><strong>{t("cli.categoryTimeline")}</strong></td>
            <td><code>eywa_history</code>, <code>eywa_rewind</code>, <code>eywa_fork</code>, <code>eywa_bookmark</code>, <code>eywa_bookmarks</code>, <code>eywa_compare</code>, <code>eywa_pick</code>, <code>eywa_timelines</code>, <code>eywa_merge</code></td>
            <td>{t("cli.timelineDesc")}</td>
          </tr>
          <tr>
            <td><strong>{t("cli.categoryNetwork")}</strong></td>
            <td><code>eywa_publish_insight</code>, <code>eywa_query_network</code>, <code>eywa_route</code></td>
            <td>{t("cli.networkDesc")}</td>
          </tr>
        </tbody>
      </table>

      <h2>{t("cli.howItWorks")}</h2>
      <p>{t("cli.howItWorksDesc")}</p>
      <pre className="docs-code"><code>{`Claude Code ──MCP──▶
Cursor      ──MCP──▶  Cloudflare Worker  ──▶  Supabase
Gemini CLI  ──MCP──▶  (stateless)              (memories, rooms)
Windsurf    ──MCP──▶
Codex       ──MCP──▶`}</code></pre>
    </article>
  );
}
