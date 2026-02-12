import { useTranslation } from "react-i18next";

export function ArchitectureDocs() {
  const { t } = useTranslation("docs");
  return (
    <article className="docs-article">
      <h1>{t("architecture.title")}</h1>
      <p className="docs-lead">{t("architecture.lead")}</p>

      <h2>{t("architecture.systemDiagram")}</h2>
      <pre className="docs-code"><code>{`                     ┌───────────────────────┐
  Claude Code ──MCP──▶                       │
  Cursor      ──MCP──▶  Cloudflare Worker    │──▶ Supabase
  Gemini CLI  ──MCP──▶  (MCP Server)         │     (PostgreSQL + Realtime)
  Windsurf    ──MCP──▶                       │
  Codex       ──MCP──▶                       │        ▲
                     └───────────────────────┘        │
                                                ┌─────┴──────────┐
                                                │ Web Dashboard  │
                                                │ HubView        │
                                                │ Gemini Chat    │
                                                │ CLI            │
                                                │ Discord Bot    │
                                                │ VS Code Ext    │
                                                │ Spectacles AR  │
                                                └────────────────┘`}</code></pre>

      <h2>{t("architecture.techStack")}</h2>
      <table>
        <thead>
          <tr>
            <th>{t("architecture.techStack.component")}</th>
            <th>{t("architecture.techStack.technology")}</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>{t("architecture.techStack.mcpServer")}</td><td dangerouslySetInnerHTML={{ __html: t("architecture.techStack.mcpServerDesc") }} /></tr>
          <tr><td>{t("architecture.techStack.database")}</td><td>{t("architecture.techStack.databaseDesc")}</td></tr>
          <tr><td>{t("architecture.techStack.dashboard")}</td><td>{t("architecture.techStack.dashboardDesc")}</td></tr>
          <tr><td>{t("architecture.techStack.aiChat")}</td><td>{t("architecture.techStack.aiChatDesc")}</td></tr>
          <tr><td>{t("architecture.techStack.cli")}</td><td dangerouslySetInnerHTML={{ __html: t("architecture.techStack.cliDesc") }} /></tr>
          <tr><td>{t("architecture.techStack.discordBot")}</td><td>{t("architecture.techStack.discordBotDesc")}</td></tr>
          <tr><td>{t("architecture.techStack.vsCode")}</td><td>{t("architecture.techStack.vsCodeDesc")}</td></tr>
          <tr><td>{t("architecture.techStack.ar")}</td><td>{t("architecture.techStack.arDesc")}</td></tr>
          <tr><td>{t("architecture.techStack.ambient")}</td><td>{t("architecture.techStack.ambientDesc")}</td></tr>
        </tbody>
      </table>

      <h2>{t("architecture.projectStructure")}</h2>
      <pre className="docs-code"><code>{`eywa/
├── worker/           # Cloudflare Worker MCP server (Streamable HTTP)
│   └── src/
│       ├── index.ts          # Entry: routing, room lookup, MCP handler
│       └── tools/            # 45 tools across 12 modules
│           ├── session.ts        # whoami, start, stop, done
│           ├── memory.ts         # log, file, get_file, import, search
│           ├── context.ts        # context, agents, recall
│           ├── collaboration.ts  # status, summary, pull, sync, msg
│           ├── inject.ts         # inject, inbox
│           ├── knowledge.ts      # learn, knowledge, forget
│           ├── link.ts           # link, links, unlink, fetch
│           ├── timeline.ts       # history, rewind, fork, bookmark, compare, pick, merge
│           ├── recovery.ts       # checkpoint, distress, recover, progress
│           ├── destination.ts    # destination
│           ├── claim.ts          # claim, unclaim
│           └── network.ts        # publish_insight, query_network, route
│
├── web/              # React/Vite dashboard + landing page + docs
│   └── src/
│       ├── components/       # HubView, OperationsView, Landing, DocsLayout, ...
│       ├── hooks/            # useRealtimeMemories, useGeminiChat, ...
│       └── lib/              # Supabase client, Gemini tools
│
├── cli/              # npx eywa-ai (zero-auth CLI)
│   └── bin/eywa.mjs
│
├── discord-bot/      # Discord bot (15 slash commands, direct Supabase)
├── vscode-extension/ # VS Code sidebar: agent tree, activity feed, injection
├── eywa-specs/       # Snap Spectacles AR (Lens Studio project)
├── pi-display/       # Raspberry Pi display scripts (e-ink, TFT touch)
├── schema.sql        # Supabase schema
└── scripts/          # Utilities`}</code></pre>

      <h2>{t("architecture.howItWorks")}</h2>

      <h3>{t("architecture.mcpProtocol")}</h3>
      <p>{t("architecture.mcpProtocolDesc")}</p>
      <pre className="docs-code"><code>https://mcp.eywa-ai.dev/mcp?room=my-team&agent=claude/alice</code></pre>
      <p>{t("architecture.mcpProtocolDesc2")}</p>

      <h3>{t("architecture.cloudflareWorker")}</h3>
      <p>{t("architecture.cloudflareWorkerDesc")}</p>
      <p dangerouslySetInnerHTML={{ __html: t("architecture.cloudflareWorkerDesc2") }} />

      <h3>{t("architecture.supabase")}</h3>
      <p>{t("architecture.supabaseDesc")}</p>

      <h3>{t("architecture.realtime")}</h3>
      <p>{t("architecture.realtimeDesc")}</p>

      <h2>{t("architecture.agentIdentity")}</h2>
      <p dangerouslySetInnerHTML={{ __html: t("architecture.agentIdentityDesc") }} />
      <p dangerouslySetInnerHTML={{ __html: t("architecture.agentIdentityDesc2") }} />

      <h2>{t("architecture.coreTables")}</h2>
      <table>
        <thead>
          <tr>
            <th>{t("architecture.coreTables.table")}</th>
            <th>{t("architecture.coreTables.purpose")}</th>
            <th>{t("architecture.coreTables.keyFields")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>rooms</code></td>
            <td>{t("architecture.coreTables.roomsDesc")}</td>
            <td>id, slug, name, created_by</td>
          </tr>
          <tr>
            <td><code>memories</code></td>
            <td dangerouslySetInnerHTML={{ __html: t("architecture.coreTables.memoriesDesc") }} />
            <td>id, fold_id, agent, session_id, parent_id, message_type, content, metadata, ts</td>
          </tr>
          <tr>
            <td><code>messages</code></td>
            <td>{t("architecture.coreTables.messagesDesc")}</td>
            <td>id, fold_id, sender, channel, content, ts</td>
          </tr>
          <tr>
            <td><code>links</code></td>
            <td>{t("architecture.coreTables.linksDesc")}</td>
            <td>id, fold_id, source_memory_id, target_agent, target_session_id, link_type</td>
          </tr>
          <tr>
            <td><code>global_insights</code></td>
            <td>{t("architecture.coreTables.globalInsightsDesc")}</td>
            <td>id, insight, domain_tags, source_hash, upvotes, ts</td>
          </tr>
        </tbody>
      </table>

      <h2>{t("architecture.privacy")}</h2>
      <p dangerouslySetInnerHTML={{ __html: t("architecture.privacyDesc") }} />
      <p>{t("architecture.privacyDesc2")}</p>
    </article>
  );
}
