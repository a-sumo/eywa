import { useTranslation } from "react-i18next";

export function DiscordDocs() {
  const { t } = useTranslation("docs");
  return (
    <article className="docs-article">
      <h1>{t("discord.title")}</h1>
      <p className="docs-lead">{t("discord.lead")}</p>

      <h2>{t("discord.setup")}</h2>
      <ol>
        <li dangerouslySetInnerHTML={{ __html: t("discord.setup.step1") }} />
        <li dangerouslySetInnerHTML={{ __html: t("discord.setup.step2") }} />
        <li dangerouslySetInnerHTML={{ __html: t("discord.setup.step3") }} />
      </ol>
      <p>{t("discord.setup.multiChannel")}</p>

      <h2>{t("discord.agentIdentity")}</h2>
      <p dangerouslySetInnerHTML={{ __html: t("discord.agentIdentityDesc") }} />

      <h2>{t("discord.commandReference")}</h2>

      <h3>{t("discord.observe")}</h3>
      <table>
        <thead>
          <tr>
            <th>{t("discord.tableCommand")}</th>
            <th>{t("discord.tableDescription")}</th>
            <th>{t("discord.tableOptions")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>/help</code></td>
            <td>{t("discord.helpDesc")}</td>
            <td></td>
          </tr>
          <tr>
            <td><code>/status</code></td>
            <td>{t("discord.statusDesc")}</td>
            <td></td>
          </tr>
          <tr>
            <td><code>/agents</code></td>
            <td>{t("discord.agentsDesc")}</td>
            <td></td>
          </tr>
          <tr>
            <td><code>/context</code></td>
            <td>{t("discord.contextDesc")}</td>
            <td dangerouslySetInnerHTML={{ __html: t("discord.contextOptions") }} />
          </tr>
          <tr>
            <td><code>/recall</code></td>
            <td>{t("discord.recallDesc")}</td>
            <td dangerouslySetInnerHTML={{ __html: t("discord.recallOptions") }} />
          </tr>
          <tr>
            <td><code>/search</code></td>
            <td>{t("discord.searchDesc")}</td>
            <td dangerouslySetInnerHTML={{ __html: t("discord.searchOptions") }} />
          </tr>
        </tbody>
      </table>

      <h3>{t("discord.interact")}</h3>
      <table>
        <thead>
          <tr>
            <th>{t("discord.tableCommand")}</th>
            <th>{t("discord.tableDescription")}</th>
            <th>{t("discord.tableOptions")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>/inject</code></td>
            <td>{t("discord.injectDesc")}</td>
            <td dangerouslySetInnerHTML={{ __html: t("discord.injectOptions") }} />
          </tr>
          <tr>
            <td><code>/inbox</code></td>
            <td>{t("discord.inboxDesc")}</td>
            <td dangerouslySetInnerHTML={{ __html: t("discord.inboxOptions") }} />
          </tr>
          <tr>
            <td><code>/msg</code></td>
            <td>{t("discord.msgDesc")}</td>
            <td dangerouslySetInnerHTML={{ __html: t("discord.msgOptions") }} />
          </tr>
        </tbody>
      </table>

      <h3>{t("discord.knowledge")}</h3>
      <table>
        <thead>
          <tr>
            <th>{t("discord.tableCommand")}</th>
            <th>{t("discord.tableDescription")}</th>
            <th>{t("discord.tableOptions")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>/knowledge</code></td>
            <td>{t("discord.knowledgeDesc")}</td>
            <td dangerouslySetInnerHTML={{ __html: t("discord.knowledgeOptions") }} />
          </tr>
          <tr>
            <td><code>/learn</code></td>
            <td>{t("discord.learnDesc")}</td>
            <td dangerouslySetInnerHTML={{ __html: t("discord.learnOptions") }} />
          </tr>
          <tr>
            <td><code>/network</code></td>
            <td>{t("discord.networkDesc")}</td>
            <td dangerouslySetInnerHTML={{ __html: t("discord.networkOptions") }} />
          </tr>
        </tbody>
      </table>

      <h3>{t("discord.navigation")}</h3>
      <table>
        <thead>
          <tr>
            <th>{t("discord.tableCommand")}</th>
            <th>{t("discord.tableDescription")}</th>
            <th>{t("discord.tableOptions")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>/destination view</code></td>
            <td>{t("discord.destinationViewDesc")}</td>
            <td></td>
          </tr>
          <tr>
            <td><code>/destination set</code></td>
            <td>{t("discord.destinationSetDesc")}</td>
            <td dangerouslySetInnerHTML={{ __html: t("discord.destinationSetOptions") }} />
          </tr>
          <tr>
            <td><code>/destination check</code></td>
            <td>{t("discord.destinationCheckDesc")}</td>
            <td dangerouslySetInnerHTML={{ __html: t("discord.destinationCheckOptions") }} />
          </tr>
          <tr>
            <td><code>/course</code></td>
            <td>{t("discord.courseDesc")}</td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <h3>{t("discord.room")}</h3>
      <table>
        <thead>
          <tr>
            <th>{t("discord.tableCommand")}</th>
            <th>{t("discord.tableDescription")}</th>
            <th>{t("discord.tableOptions")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>/room set</code></td>
            <td>{t("discord.roomSetDesc")}</td>
            <td dangerouslySetInnerHTML={{ __html: t("discord.roomSetOptions") }} />
          </tr>
          <tr>
            <td><code>/room info</code></td>
            <td>{t("discord.roomInfoDesc")}</td>
            <td></td>
          </tr>
          <tr>
            <td><code>/room list</code></td>
            <td>{t("discord.roomListDesc")}</td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <h2>{t("discord.examples")}</h2>

      <h3>{t("discord.exampleCheckTeam")}</h3>
      <pre className="docs-code"><code>{`/status
/context count:20
/recall agent:armand/quiet-oak`}</code></pre>

      <h3>{t("discord.exampleSendInstructions")}</h3>
      <pre className="docs-code"><code>{`/inject target:armand/quiet-oak message:Schema changed, user_id is now UUID priority:High
/inject target:all message:Deploy freeze until 3pm`}</code></pre>

      <h3>{t("discord.exampleStoreKnowledge")}</h3>
      <pre className="docs-code"><code>{`/learn content:API uses /api/v1 prefix, JWT for auth title:API conventions tags:api,convention
/knowledge search:auth
/knowledge tag:api`}</code></pre>

      <h3>{t("discord.exampleSetDestination")}</h3>
      <pre className="docs-code"><code>{`/destination set target:Ship v2 auth system milestones:JWT tokens,Role-based access,Migration script
/destination check milestone:JWT tokens
/course`}</code></pre>

      <h2>{t("discord.selfHosting")}</h2>
      <p>{t("discord.selfHostingDesc")}</p>
      <pre className="docs-code"><code>{`cd discord-bot
cp .env.example .env    # add Discord token + Supabase creds
npm install
npm start`}</code></pre>
      <p dangerouslySetInnerHTML={{ __html: t("discord.selfHostingDeploy") }} />
    </article>
  );
}
