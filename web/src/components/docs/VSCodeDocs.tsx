import { useTranslation } from "react-i18next";

export function VSCodeDocs() {
  const { t } = useTranslation("docs");
  return (
    <article className="docs-article">
      <h1>{t("vscode.title")}</h1>
      <p className="docs-lead" dangerouslySetInnerHTML={{ __html: t("vscode.lead") }} />

      <h2>{t("vscode.installation.heading")}</h2>
      <p dangerouslySetInnerHTML={{ __html: t("vscode.installation.text") }} />
      <pre className="docs-code">
        <code>ext install curvilinear.eywa-agents</code>
      </pre>

      <h2>{t("vscode.quickStart.heading")}</h2>
      <ol>
        <li>{t("vscode.quickStart.step1")}</li>
        <li dangerouslySetInnerHTML={{ __html: t("vscode.quickStart.step2") }} />
        <li dangerouslySetInnerHTML={{ __html: t("vscode.quickStart.step3") }} />
      </ol>
      <p dangerouslySetInnerHTML={{ __html: t("vscode.quickStart.selfHost") }} />

      <h2>{t("vscode.features.heading")}</h2>

      <h3>{t("vscode.features.liveSidebar.heading")}</h3>
      <p>{t("vscode.features.liveSidebar.p1")}</p>
      <p>{t("vscode.features.liveSidebar.p2")}</p>
      <p>{t("vscode.features.liveSidebar.p3")}</p>

      <h3>{t("vscode.features.attentionSystem.heading")}</h3>
      <p>{t("vscode.features.attentionSystem.p1")}</p>
      <p>{t("vscode.features.attentionSystem.p2")}</p>

      <h3>{t("vscode.features.agentsPanel.heading")}</h3>
      <p>{t("vscode.features.agentsPanel.text")}</p>

      <h3>{t("vscode.features.agentDecorations.heading")}</h3>
      <p>{t("vscode.features.agentDecorations.text")}</p>

      <h3>{t("vscode.features.contextInjection.heading")}</h3>
      <p>{t("vscode.features.contextInjection.text")}</p>
      <ul>
        <li dangerouslySetInnerHTML={{ __html: t("vscode.features.contextInjection.item1") }} />
        <li dangerouslySetInnerHTML={{ __html: t("vscode.features.contextInjection.item2") }} />
        <li dangerouslySetInnerHTML={{ __html: t("vscode.features.contextInjection.item3") }} />
      </ul>
      <p dangerouslySetInnerHTML={{ __html: t("vscode.features.contextInjection.priority") }} />

      <h3>{t("vscode.features.terminalTabTitles.heading")}</h3>
      <p dangerouslySetInnerHTML={{ __html: t("vscode.features.terminalTabTitles.text") }} />

      <h3>{t("vscode.features.tagTerminals.heading")}</h3>
      <p dangerouslySetInnerHTML={{ __html: t("vscode.features.tagTerminals.text") }} />

      <h3>{t("vscode.features.statusBar.heading")}</h3>
      <p>{t("vscode.features.statusBar.text")}</p>

      <h2>{t("vscode.commands.heading")}</h2>
      <table>
        <thead>
          <tr>
            <th>{t("vscode.commands.col.command")}</th>
            <th>{t("vscode.commands.col.keybinding")}</th>
            <th>{t("vscode.commands.col.description")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Eywa: Login</td>
            <td>-</td>
            <td>{t("vscode.commands.login.desc")}</td>
          </tr>
          <tr>
            <td>Eywa: Switch Room</td>
            <td>-</td>
            <td>{t("vscode.commands.switchRoom.desc")}</td>
          </tr>
          <tr>
            <td>Eywa: Connect Agent</td>
            <td>-</td>
            <td>{t("vscode.commands.connectAgent.desc")}</td>
          </tr>
          <tr>
            <td>Eywa: Inject Context</td>
            <td>-</td>
            <td>{t("vscode.commands.injectContext.desc")}</td>
          </tr>
          <tr>
            <td>Eywa: Inject Selection</td>
            <td>
              <code>Cmd+Shift+I</code> / <code>Ctrl+Shift+I</code>
            </td>
            <td>{t("vscode.commands.injectSelection.desc")}</td>
          </tr>
          <tr>
            <td>Eywa: Open Dashboard</td>
            <td>-</td>
            <td>{t("vscode.commands.openDashboard.desc")}</td>
          </tr>
          <tr>
            <td>Eywa: Refresh Agents</td>
            <td>-</td>
            <td>{t("vscode.commands.refreshAgents.desc")}</td>
          </tr>
          <tr>
            <td>Eywa: Toggle Agent Tab Titles</td>
            <td>-</td>
            <td>{t("vscode.commands.toggleTabTitles.desc")}</td>
          </tr>
          <tr>
            <td>Eywa: Tag Terminal with Agent</td>
            <td>-</td>
            <td>{t("vscode.commands.tagTerminal.desc")}</td>
          </tr>
          <tr>
            <td>Eywa: Show Status</td>
            <td>-</td>
            <td>{t("vscode.commands.showStatus.desc")}</td>
          </tr>
        </tbody>
      </table>

      <h2>{t("vscode.settings.heading")}</h2>
      <table>
        <thead>
          <tr>
            <th>{t("vscode.settings.col.setting")}</th>
            <th>{t("vscode.settings.col.default")}</th>
            <th>{t("vscode.settings.col.description")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>eywa.supabaseUrl</code></td>
            <td>{t("vscode.settings.supabaseUrl.default")}</td>
            <td>{t("vscode.settings.supabaseUrl.desc")}</td>
          </tr>
          <tr>
            <td><code>eywa.supabaseKey</code></td>
            <td>{t("vscode.settings.supabaseKey.default")}</td>
            <td>{t("vscode.settings.supabaseKey.desc")}</td>
          </tr>
          <tr>
            <td><code>eywa.room</code></td>
            <td>{t("vscode.settings.room.default")}</td>
            <td>{t("vscode.settings.room.desc")}</td>
          </tr>
          <tr>
            <td><code>eywa.logLevel</code></td>
            <td><code>all</code></td>
            <td dangerouslySetInnerHTML={{ __html: t("vscode.settings.logLevel.desc") }} />
          </tr>
          <tr>
            <td><code>eywa.historyHours</code></td>
            <td><code>24</code></td>
            <td>{t("vscode.settings.historyHours.desc")}</td>
          </tr>
        </tbody>
      </table>
      <p>{t("vscode.settings.note")}</p>

      <h2>{t("vscode.links.heading")}</h2>
      <ul>
        <li dangerouslySetInnerHTML={{ __html: t("vscode.links.marketplace") }} />
        <li dangerouslySetInnerHTML={{ __html: t("vscode.links.dashboard") }} />
        <li dangerouslySetInnerHTML={{ __html: t("vscode.links.github") }} />
      </ul>
    </article>
  );
}
