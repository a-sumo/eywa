import * as vscode from "vscode";
import { AgentTreeProvider } from "./agentTree";
import { KnowledgeTreeProvider } from "./knowledgeTree";
import { RemixClient } from "./client";
import { NotificationWatcher } from "./notifications";

let client: RemixClient | undefined;
let watcher: NotificationWatcher | undefined;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusBarItem.command = "remix.showStatus";
  statusBarItem.text = "$(cloud) Remix";
  statusBarItem.tooltip = "Click for full agent status";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Initialize client from config
  initClient();

  // Tree providers
  const agentProvider = new AgentTreeProvider(() => client);
  const knowledgeProvider = new KnowledgeTreeProvider(() => client);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("remixAgents", agentProvider),
    vscode.window.registerTreeDataProvider("remixKnowledge", knowledgeProvider),
  );

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("remix.refreshAgents", () => {
      agentProvider.refresh();
      knowledgeProvider.refresh();
    }),

    vscode.commands.registerCommand("remix.openDashboard", () => {
      const room = getConfig("room");
      const url = room
        ? `https://remix-memory.vercel.app/r/${room}`
        : "https://remix-memory.vercel.app";
      vscode.env.openExternal(vscode.Uri.parse(url));
    }),

    vscode.commands.registerCommand("remix.connectAgent", async () => {
      const room = await vscode.window.showInputBox({
        prompt: "Room slug",
        placeHolder: "my-project",
        value: getConfig("room"),
      });
      if (!room) return;

      const agent = await vscode.window.showInputBox({
        prompt: "Agent name",
        placeHolder: "claude-code",
      });
      if (!agent) return;

      const mcpUrl = `https://remix-mcp.armandsumo.workers.dev/mcp?room=${room}&agent=${agent}`;

      // Copy to clipboard
      await vscode.env.clipboard.writeText(mcpUrl);
      vscode.window.showInformationMessage(
        `MCP URL copied! Add to your MCP config:\n${mcpUrl}`,
        "Open Terminal"
      ).then((action) => {
        if (action === "Open Terminal") {
          const terminal = vscode.window.createTerminal("Remix");
          terminal.sendText(`claude mcp add --transport http remix "${mcpUrl}"`);
          terminal.show();
        }
      });

      // Save room to config
      await vscode.workspace.getConfiguration("remix").update("room", room, true);
      initClient();
      agentProvider.refresh();
    }),

    vscode.commands.registerCommand("remix.injectContext", async () => {
      if (!client) {
        vscode.window.showWarningMessage("Configure remix.room, remix.supabaseUrl, and remix.supabaseKey first.");
        return;
      }

      const agents = await client.getAgents();
      const target = await vscode.window.showQuickPick(
        [...agents.map((a) => a.name), "all"],
        { placeHolder: "Target agent (or 'all' for broadcast)" }
      );
      if (!target) return;

      const content = await vscode.window.showInputBox({
        prompt: "Context/instructions to inject",
        placeHolder: "Focus on the auth module, the schema changed to use UUIDs",
      });
      if (!content) return;

      const priority = await vscode.window.showQuickPick(
        ["normal", "high", "urgent"],
        { placeHolder: "Priority" }
      ) as "normal" | "high" | "urgent" | undefined;
      if (!priority) return;

      await client.inject("user", target, content, priority);
      vscode.window.showInformationMessage(`Injected context for ${target} (${priority})`);
    }),

    vscode.commands.registerCommand("remix.showStatus", async () => {
      if (!client) {
        vscode.window.showWarningMessage("Configure remix.room, remix.supabaseUrl, and remix.supabaseKey first.");
        return;
      }

      const agents = await client.getAgents();
      const channel = vscode.window.createOutputChannel("Remix Status");
      channel.clear();
      channel.appendLine(`Remix · Room: ${getConfig("room")}\n`);

      for (const a of agents) {
        const badge = a.isActive ? "[active]" : "[idle]";
        channel.appendLine(`  ${a.name} ${badge} — ${a.sessionCount} sessions — last: ${a.lastSeen}`);
        if (a.lastContent) channel.appendLine(`    ${a.lastContent.slice(0, 200)}`);
        channel.appendLine("");
      }

      if (agents.length === 0) {
        channel.appendLine("  No agents yet.");
      }

      channel.show();
    }),
  );

  // Watch for config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("remix.supabaseUrl") ||
        e.affectsConfiguration("remix.supabaseKey") ||
        e.affectsConfiguration("remix.room")
      ) {
        initClient();
        agentProvider.refresh();
        knowledgeProvider.refresh();
      }
    }),
  );

  // Start polling
  startPolling(agentProvider, knowledgeProvider, context);
}

function getConfig(key: string): string {
  return vscode.workspace.getConfiguration("remix").get<string>(key) ?? "";
}

function initClient() {
  const url = getConfig("supabaseUrl");
  const key = getConfig("supabaseKey");
  const room = getConfig("room");

  if (url && key && room) {
    client = new RemixClient(url, key, room);
    statusBarItem.text = `$(cloud) Remix: /${room}`;

    // Start notification watcher
    if (watcher) watcher.stop();
    watcher = new NotificationWatcher(client);
    watcher.start();
  } else {
    client = undefined;
    statusBarItem.text = "$(cloud) Remix (unconfigured)";
    if (watcher) { watcher.stop(); watcher = undefined; }
  }
}

function startPolling(
  agentProvider: AgentTreeProvider,
  knowledgeProvider: KnowledgeTreeProvider,
  context: vscode.ExtensionContext,
) {
  const interval = (getConfig("pollInterval") as unknown as number) || 10;
  const timer = setInterval(() => {
    if (client) {
      agentProvider.refresh();
      // Knowledge refreshes less often
    }
  }, interval * 1000);

  context.subscriptions.push({ dispose: () => clearInterval(timer) });
}

export function deactivate() {
  if (watcher) watcher.stop();
}
