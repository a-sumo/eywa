/**
 * Eywa VS Code Extension — entry point.
 * Wires up tree providers (agents, knowledge, activity), realtime subscriptions,
 * CodeLens, status bar, and all commands (inject, connect, dashboard, etc.).
 * Configuration is read from `remix.*` settings; changes trigger re-init.
 */
import * as vscode from "vscode";
import { AgentTreeProvider, SessionItem } from "./agentTree";
import { KnowledgeTreeProvider } from "./knowledgeTree";
import { ActivityTreeProvider } from "./activityTree";
import { RemixClient } from "./client";
import { RealtimeManager, type MemoryPayload } from "./realtime";
import { injectSelection } from "./injectCommand";
import { KnowledgeCodeLensProvider, registerKnowledgeForFileCommand } from "./knowledgeLens";

let client: RemixClient | undefined;
let statusBarItem: vscode.StatusBarItem;
let realtime: RealtimeManager | undefined;

export function activate(context: vscode.ExtensionContext) {
  // Status bar — enhanced with active agent count
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusBarItem.command = "remix.showStatus";
  statusBarItem.text = "$(cloud) Eywa";
  statusBarItem.tooltip = "Click for Eywa quick actions";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Tree providers
  const agentProvider = new AgentTreeProvider(() => client);
  const knowledgeProvider = new KnowledgeTreeProvider(() => client);
  const activityProvider = new ActivityTreeProvider();
  const codeLensProvider = new KnowledgeCodeLensProvider(() => client);

  // Debounced refresh — coalesces rapid realtime events into a single tree update
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  function debouncedRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      agentProvider.refresh();
      updateStatusBar(agentProvider);
    }, 500);
  }

  // Realtime event handler
  function handleRealtimeEvent(mem: MemoryPayload) {
    const meta = mem.metadata ?? {};
    const event = meta.event as string | undefined;

    // Feed activity events
    if (event === "session_start") {
      const task = (meta.task as string) || "";
      activityProvider.addEvent({
        id: mem.id,
        agent: mem.agent,
        type: "session_start",
        message: `${mem.agent} started${task ? `: ${task.slice(0, 80)}` : ""}`,
        ts: mem.ts,
        metadata: meta,
      });
    } else if (event === "session_done" || event === "session_end") {
      const status = (meta.status as string) || "done";
      const summary = (meta.summary as string) || "";
      activityProvider.addEvent({
        id: mem.id,
        agent: mem.agent,
        type: "session_done",
        message: `${mem.agent} [${status}]${summary ? `: ${summary.slice(0, 80)}` : ""}`,
        ts: mem.ts,
        metadata: meta,
      });
    } else if (event === "context_injection") {
      const from = (meta.from_agent as string) || mem.agent;
      const target = (meta.target_agent as string) || "all";
      const priority = (meta.priority as string) || "normal";
      const label = meta.label as string | null;

      const msg = `${from} injected context${target !== "all" ? ` → ${target}` : ""}${label ? ` (${label})` : ""}`;
      activityProvider.addEvent({
        id: mem.id,
        agent: from,
        type: "injection",
        message: msg,
        ts: mem.ts,
        priority,
        metadata: meta,
      });

      // Only urgent injections get a native popup
      if (priority === "urgent") {
        vscode.window.showWarningMessage(`$(alert) URGENT: ${msg}`, "Open Dashboard").then((choice) => {
          if (choice === "Open Dashboard") vscode.commands.executeCommand("eywa.openDashboard");
        });
      }
    } else if (event === "knowledge_stored" || mem.message_type === "knowledge") {
      const title = (meta.title as string) || "";
      activityProvider.addEvent({
        id: mem.id,
        agent: mem.agent,
        type: "knowledge",
        message: `${mem.agent} stored knowledge${title ? `: ${title}` : ""}`,
        ts: mem.ts,
        metadata: meta,
      });
      codeLensProvider.refreshCache();
    } else if (mem.content) {
      // General memory log — show as message activity
      activityProvider.addEvent({
        id: mem.id,
        agent: mem.agent,
        type: "message",
        message: mem.content.slice(0, 100),
        ts: mem.ts,
        metadata: meta,
      });
    }

    debouncedRefresh();
  }

  // Initialize client BEFORE registering tree providers so first getChildren sees the client
  initClient(agentProvider, codeLensProvider, handleRealtimeEvent, context);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("remixAgents", agentProvider),
    vscode.window.registerTreeDataProvider("remixKnowledge", knowledgeProvider),
    vscode.window.registerTreeDataProvider("remixActivity", activityProvider),
    vscode.languages.registerCodeLensProvider({ scheme: "file" }, codeLensProvider),
  );

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("remix.refreshAgents", () => {
      agentProvider.refresh();
      knowledgeProvider.refresh();
      activityProvider.refresh();
      codeLensProvider.refreshCache();
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

      await vscode.env.clipboard.writeText(mcpUrl);
      vscode.window.showInformationMessage(
        `MCP URL copied! Add to your MCP config:\n${mcpUrl}`,
        "Open Terminal",
      ).then((action) => {
        if (action === "Open Terminal") {
          const terminal = vscode.window.createTerminal("Eywa");
          terminal.sendText(`claude mcp add --transport http remix "${mcpUrl}"`);
          terminal.show();
        }
      });

      await vscode.workspace.getConfiguration("remix").update("room", room, true);
      initClient(agentProvider, codeLensProvider, handleRealtimeEvent, context);
      agentProvider.refresh();
    }),

    // Original inject context (manual text input)
    vscode.commands.registerCommand("remix.injectContext", async () => {
      if (!client) {
        vscode.window.showWarningMessage("Configure eywa.room, eywa.supabaseUrl, and eywa.supabaseKey first.");
        return;
      }

      const agents = await client.getAgents();
      const target = await vscode.window.showQuickPick(
        [...agents.map((a) => a.name), "all"],
        { placeHolder: "Target agent (or 'all' for broadcast)" },
      );
      if (!target) return;

      const content = await vscode.window.showInputBox({
        prompt: "Context/instructions to inject",
        placeHolder: "Focus on the auth module, the schema changed to use UUIDs",
      });
      if (!content) return;

      const priority = await vscode.window.showQuickPick(
        ["normal", "high", "urgent"],
        { placeHolder: "Priority" },
      ) as "normal" | "high" | "urgent" | undefined;
      if (!priority) return;

      await client.inject("vscode-user", target, content, priority);
      vscode.window.showInformationMessage(`Injected context for ${target} (${priority})`);
    }),

    // Editor selection inject (Cmd+Shift+I)
    vscode.commands.registerCommand("remix.injectSelection", () => injectSelection(() => client)),

    // Session context menu: inject to session's agent
    vscode.commands.registerCommand("remix.injectToSession", async (item: SessionItem) => {
      if (!client || !item.session) return;
      const content = await vscode.window.showInputBox({
        prompt: `Inject context to ${item.session.agent}`,
        placeHolder: "Instructions or context...",
      });
      if (!content) return;
      await client.inject("vscode-user", item.session.agent, content, "normal");
      vscode.window.showInformationMessage(`Injected context → ${item.session.agent}`);
    }),

    // Session context menu: copy summary
    vscode.commands.registerCommand("remix.copySessionSummary", async (item: SessionItem) => {
      if (!item.session) return;
      const s = item.session;
      const text = `${s.agent} [${s.status}]: ${s.task}\nMemories: ${s.memoryCount} · Last seen: ${s.lastSeen}`;
      await vscode.env.clipboard.writeText(text);
      vscode.window.showInformationMessage("Session summary copied.");
    }),

    // Session context menu: open in dashboard
    vscode.commands.registerCommand("remix.openSessionInDashboard", (item: SessionItem) => {
      if (!item.session) return;
      const room = getConfig("room");
      const url = `https://remix-memory.vercel.app/r/${room}`;
      vscode.env.openExternal(vscode.Uri.parse(url));
    }),

    // Enhanced status bar: QuickPick menu
    vscode.commands.registerCommand("remix.showStatus", async () => {
      if (!client) {
        vscode.window.showWarningMessage("Configure eywa.room, eywa.supabaseUrl, and eywa.supabaseKey first.");
        return;
      }

      const agents = await client.getAgents();
      const items: vscode.QuickPickItem[] = [
        {
          label: "$(arrow-right) Inject context to agent...",
          description: "",
        },
        ...agents.map((a) => ({
          label: `$(${a.isActive ? "circle-filled" : "circle-outline"}) ${a.name}`,
          description: a.isActive ? "active" : "idle",
        })),
        {
          label: "$(link-external) Open web dashboard",
          description: getConfig("room"),
        },
        {
          label: "$(plug) Connect new agent",
          description: "",
        },
      ];

      const pick = await vscode.window.showQuickPick(items, {
        placeHolder: `Eywa: ${getConfig("room")}`,
      });
      if (!pick) return;

      if (pick.label.includes("Inject context")) {
        vscode.commands.executeCommand("remix.injectContext");
      } else if (pick.label.includes("Open web dashboard")) {
        vscode.commands.executeCommand("remix.openDashboard");
      } else if (pick.label.includes("Connect new agent")) {
        vscode.commands.executeCommand("remix.connectAgent");
      }
    }),
  );

  // Register knowledge-for-file command
  registerKnowledgeForFileCommand(context);

  // Watch for config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("remix.supabaseUrl") ||
        e.affectsConfiguration("remix.supabaseKey") ||
        e.affectsConfiguration("remix.room")
      ) {
        initClient(agentProvider, codeLensProvider, handleRealtimeEvent, context);
        agentProvider.refresh();
        knowledgeProvider.refresh();
      }
    }),
  );
}

function getConfig(key: string): string {
  return vscode.workspace.getConfiguration("remix").get<string>(key) ?? "";
}

function updateStatusBar(agentProvider: AgentTreeProvider) {
  const room = getConfig("room");
  if (!room) {
    statusBarItem.text = "$(cloud) Eywa (unconfigured)";
    return;
  }
  const active = agentProvider.getActiveCount();
  if (active > 0) {
    statusBarItem.text = `$(cloud) Eywa: /${room}  $(person) ${active} active`;
  } else {
    statusBarItem.text = `$(cloud) Eywa: /${room}`;
  }
}

/**
 * (Re-)initialize the RemixClient and Realtime subscription from current settings.
 * Tears down any existing connection before creating a new one.
 */
function initClient(
  agentProvider: AgentTreeProvider,
  codeLensProvider: KnowledgeCodeLensProvider,
  onEvent: (mem: MemoryPayload) => void,
  context: vscode.ExtensionContext,
) {
  const url = getConfig("supabaseUrl");
  const key = getConfig("supabaseKey");
  const room = getConfig("room");

  // Clean up previous realtime
  if (realtime && client) {
    realtime.unsubscribe(client.getSupabase());
  }

  if (url && key && room) {
    client = new RemixClient(url, key, room);
    updateStatusBar(agentProvider);
    codeLensProvider.refreshCache();

    // Set up realtime
    realtime = new RealtimeManager();
    const unsub = realtime.on(onEvent);
    context.subscriptions.push({ dispose: unsub });

    // Resolve room ID then subscribe
    client.resolveRoomId().then((roomId) => {
      if (roomId && realtime && client) {
        realtime.subscribe(client.getSupabase(), roomId);
      }
    });
  } else {
    client = undefined;
    realtime = undefined;
    statusBarItem.text = "$(cloud) Eywa (unconfigured)";
  }
}

export function deactivate() {
  if (realtime && client) {
    realtime.unsubscribe(client.getSupabase());
  }
}
