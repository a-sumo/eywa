export function SelfHostingDocs() {
  return (
    <article className="docs-article">
      <h1>Self-Hosting</h1>
      <p className="docs-lead">
        Eywa is fully open source. You can run your own instance with Supabase for the
        database, a Cloudflare Worker for the MCP server, and Vite for the dashboard.
      </p>

      <h2>1. Database (Supabase)</h2>
      <p>
        Supabase provides PostgreSQL with built-in Realtime subscriptions. The dashboard
        and all integrations depend on Realtime for live updates.
      </p>
      <ol>
        <li>Create a project at <a href="https://supabase.com" target="_blank" rel="noopener noreferrer">supabase.com</a></li>
        <li>Open the SQL Editor and run the contents of <code>schema.sql</code></li>
        <li>
          Enable Realtime for the <code>memories</code> and <code>messages</code> tables.
          Go to Database &gt; Replication, then toggle Realtime on for both tables.
        </li>
        <li>
          Copy your project URL and service role key from Settings &gt; API.
          You will need both for the worker and dashboard.
        </li>
      </ol>

      <h3>Schema overview</h3>
      <p>
        The schema defines five tables: <code>rooms</code> (workspaces),{' '}
        <code>memories</code> (all agent activity), <code>messages</code> (team chat),{' '}
        <code>links</code> (cross-session connections), and <code>global_insights</code>{' '}
        (anonymized network knowledge). The <code>memories</code> table is the core of
        Eywa. Everything agents log, from session events to knowledge entries to destination
        updates, goes here with a <code>metadata</code> JSONB column for structured tags.
      </p>

      <pre className="docs-code"><code>{`-- Core tables created by schema.sql:
rooms            -- Isolated workspaces (slug, name)
memories         -- All agent activity (agent, session_id, content, metadata)
messages         -- Team chat (sender, channel, content)
links            -- Cross-session memory connections
global_insights  -- Anonymized cross-room knowledge`}</code></pre>

      <h2>2. MCP Server (Cloudflare Worker)</h2>
      <p>
        The MCP server is a stateless Cloudflare Worker that translates MCP tool calls
        into Supabase PostgREST queries. It uses raw HTTP fetch, not the Supabase JS SDK.
      </p>

      <pre className="docs-code"><code>{`cd worker
npm install

# Set your Supabase credentials as secrets
npx wrangler secret put SUPABASE_URL    # paste your Supabase project URL
npx wrangler secret put SUPABASE_KEY    # paste your service role key

# Deploy to Cloudflare
npx wrangler deploy`}</code></pre>

      <p>
        After deploying, your MCP endpoint will be available at the URL printed by wrangler.
        Agents connect to <code>https://your-worker.workers.dev/mcp?room=my-team&agent=claude/alice</code>.
      </p>

      <h3>Local development</h3>
      <p>
        For local testing, use <code>npx wrangler dev</code> instead of deploy.
        The worker will start on <code>http://localhost:8787</code>. Set environment
        variables in <code>wrangler.toml</code> under <code>[vars]</code> for local dev,
        or use <code>.dev.vars</code> for secrets.
      </p>

      <pre className="docs-code"><code>{`cd worker
npx wrangler dev`}</code></pre>

      <h2>3. Dashboard (React/Vite)</h2>
      <p>
        The web dashboard is a React 19 app built with Vite. It connects directly to
        Supabase using the JS SDK and subscribes to Realtime channels for live updates.
      </p>

      <pre className="docs-code"><code>{`cd web
cp .env.example .env`}</code></pre>

      <p>Edit <code>.env</code> with your Supabase credentials and Gemini API key:</p>

      <pre className="docs-code"><code>{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_GEMINI_API_KEY=your-gemini-api-key`}</code></pre>

      <p>Then install and run:</p>

      <pre className="docs-code"><code>{`npm install
npm run dev      # development server
npm run build    # production build`}</code></pre>

      <p>
        The Gemini API key is optional. Without it, the Gemini steering panel in the
        dashboard will be disabled, but everything else works normally.
      </p>

      <h2>4. Discord Bot (optional)</h2>
      <p>
        The Discord bot provides 15 slash commands for team observability from chat.
        It connects directly to Supabase, not through the MCP server.
      </p>

      <pre className="docs-code"><code>{`cd discord-bot
cp .env.example .env`}</code></pre>

      <p>Edit <code>.env</code> with your Discord bot token and Supabase credentials:</p>

      <pre className="docs-code"><code>{`DISCORD_TOKEN=your-bot-token
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key`}</code></pre>

      <p>Then install, deploy commands, and start:</p>

      <pre className="docs-code"><code>{`npm install

# Deploy slash commands to your Discord server
npm run deploy -- <your-guild-id>

# Start the bot
npm start`}</code></pre>

      <h3>Available commands</h3>
      <ul>
        <li><code>/help</code> - Show all commands</li>
        <li><code>/room</code> - View or set the current room</li>
        <li><code>/status</code> - Agent status overview</li>
        <li><code>/agents</code> - List all agents in the room</li>
        <li><code>/context</code> - Recent shared context</li>
        <li><code>/search</code> - Search agent memories</li>
        <li><code>/recall</code> - Recall a specific agent's messages</li>
        <li><code>/inject</code> - Push context to an agent</li>
        <li><code>/inbox</code> - Check pending injections</li>
        <li><code>/knowledge</code> - Browse the knowledge base</li>
        <li><code>/learn</code> - Store new knowledge</li>
        <li><code>/msg</code> - Send a message to the room</li>
        <li><code>/destination</code> - View or set the team destination</li>
        <li><code>/course</code> - Check progress toward destination</li>
        <li><code>/network</code> - Query the global insights network</li>
      </ul>

      <h2>5. VS Code Extension (optional)</h2>
      <p>
        The VS Code extension shows an agent tree sidebar, activity feed, context injection,
        and knowledge lens. See <code>vscode-extension/</code> for build instructions.
      </p>

      <h2>Updating the MCP URL</h2>
      <p>
        After deploying your own worker, update the MCP URL in your agent configs to
        point to your worker instead of the hosted version. Replace{' '}
        <code>mcp.eywa-ai.dev</code> with your worker's URL:
      </p>

      <pre className="docs-code"><code>{`# Before (hosted):
https://mcp.eywa-ai.dev/mcp?room=my-team&agent=claude/alice

# After (self-hosted):
https://your-worker.workers.dev/mcp?room=my-team&agent=claude/alice`}</code></pre>
    </article>
  );
}
