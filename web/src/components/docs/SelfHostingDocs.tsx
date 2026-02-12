import { useTranslation } from "react-i18next";

export function SelfHostingDocs() {
  const { t } = useTranslation("docs");
  return (
    <article className="docs-article">
      <h1>{t("selfHosting.title")}</h1>
      <p className="docs-lead" dangerouslySetInnerHTML={{ __html: t("selfHosting.lead") }} />

      <h2>{t("selfHosting.database.heading")}</h2>
      <p dangerouslySetInnerHTML={{ __html: t("selfHosting.database.intro") }} />
      <ol>
        <li dangerouslySetInnerHTML={{ __html: t("selfHosting.database.step1") }} />
        <li dangerouslySetInnerHTML={{ __html: t("selfHosting.database.step2") }} />
        <li dangerouslySetInnerHTML={{ __html: t("selfHosting.database.step3") }} />
        <li dangerouslySetInnerHTML={{ __html: t("selfHosting.database.step4") }} />
      </ol>

      <h3>{t("selfHosting.schema.heading")}</h3>
      <p dangerouslySetInnerHTML={{ __html: t("selfHosting.schema.description") }} />

      <pre className="docs-code"><code>{`-- Core tables created by schema.sql:
rooms            -- Isolated workspaces (slug, name)
memories         -- All agent activity (agent, session_id, content, metadata)
messages         -- Team chat (sender, channel, content)
links            -- Cross-session memory connections
global_insights  -- Anonymized cross-room knowledge`}</code></pre>

      <h2>{t("selfHosting.worker.heading")}</h2>
      <p dangerouslySetInnerHTML={{ __html: t("selfHosting.worker.intro") }} />

      <pre className="docs-code"><code>{`cd worker
npm install

# Set your Supabase credentials as secrets
npx wrangler secret put SUPABASE_URL    # paste your Supabase project URL
npx wrangler secret put SUPABASE_KEY    # paste your service role key

# Deploy to Cloudflare
npx wrangler deploy`}</code></pre>

      <p dangerouslySetInnerHTML={{ __html: t("selfHosting.worker.endpointNote") }} />

      <h3>{t("selfHosting.worker.localDev.heading")}</h3>
      <p dangerouslySetInnerHTML={{ __html: t("selfHosting.worker.localDev.description") }} />

      <pre className="docs-code"><code>{`cd worker
npx wrangler dev`}</code></pre>

      <h2>{t("selfHosting.dashboard.heading")}</h2>
      <p dangerouslySetInnerHTML={{ __html: t("selfHosting.dashboard.intro") }} />

      <pre className="docs-code"><code>{`cd web
cp .env.example .env`}</code></pre>

      <p dangerouslySetInnerHTML={{ __html: t("selfHosting.dashboard.envInstruction") }} />

      <pre className="docs-code"><code>{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_GEMINI_API_KEY=your-gemini-api-key`}</code></pre>

      <p>{t("selfHosting.dashboard.installAndRun")}</p>

      <pre className="docs-code"><code>{`npm install
npm run dev      # development server
npm run build    # production build`}</code></pre>

      <p dangerouslySetInnerHTML={{ __html: t("selfHosting.dashboard.geminiNote") }} />

      <h2>{t("selfHosting.discord.heading")}</h2>
      <p dangerouslySetInnerHTML={{ __html: t("selfHosting.discord.intro") }} />

      <pre className="docs-code"><code>{`cd discord-bot
cp .env.example .env`}</code></pre>

      <p dangerouslySetInnerHTML={{ __html: t("selfHosting.discord.envInstruction") }} />

      <pre className="docs-code"><code>{`DISCORD_TOKEN=your-bot-token
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key`}</code></pre>

      <p>{t("selfHosting.discord.installAndStart")}</p>

      <pre className="docs-code"><code>{`npm install

# Deploy slash commands to your Discord server
npm run deploy -- <your-guild-id>

# Start the bot
npm start`}</code></pre>

      <h3>{t("selfHosting.discord.commands.heading")}</h3>
      <ul>
        <li dangerouslySetInnerHTML={{ __html: t("selfHosting.discord.commands.help") }} />
        <li dangerouslySetInnerHTML={{ __html: t("selfHosting.discord.commands.room") }} />
        <li dangerouslySetInnerHTML={{ __html: t("selfHosting.discord.commands.status") }} />
        <li dangerouslySetInnerHTML={{ __html: t("selfHosting.discord.commands.agents") }} />
        <li dangerouslySetInnerHTML={{ __html: t("selfHosting.discord.commands.context") }} />
        <li dangerouslySetInnerHTML={{ __html: t("selfHosting.discord.commands.search") }} />
        <li dangerouslySetInnerHTML={{ __html: t("selfHosting.discord.commands.recall") }} />
        <li dangerouslySetInnerHTML={{ __html: t("selfHosting.discord.commands.inject") }} />
        <li dangerouslySetInnerHTML={{ __html: t("selfHosting.discord.commands.inbox") }} />
        <li dangerouslySetInnerHTML={{ __html: t("selfHosting.discord.commands.knowledge") }} />
        <li dangerouslySetInnerHTML={{ __html: t("selfHosting.discord.commands.learn") }} />
        <li dangerouslySetInnerHTML={{ __html: t("selfHosting.discord.commands.msg") }} />
        <li dangerouslySetInnerHTML={{ __html: t("selfHosting.discord.commands.destination") }} />
        <li dangerouslySetInnerHTML={{ __html: t("selfHosting.discord.commands.course") }} />
        <li dangerouslySetInnerHTML={{ __html: t("selfHosting.discord.commands.network") }} />
      </ul>

      <h2>{t("selfHosting.vscode.heading")}</h2>
      <p dangerouslySetInnerHTML={{ __html: t("selfHosting.vscode.description") }} />

      <h2>{t("selfHosting.updateMcpUrl.heading")}</h2>
      <p dangerouslySetInnerHTML={{ __html: t("selfHosting.updateMcpUrl.description") }} />

      <pre className="docs-code"><code>{`# Before (hosted):
https://mcp.eywa-ai.dev/mcp?room=my-team&agent=claude/alice

# After (self-hosted):
https://your-worker.workers.dev/mcp?room=my-team&agent=claude/alice`}</code></pre>
    </article>
  );
}
