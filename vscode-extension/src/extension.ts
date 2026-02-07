/**
 * Eywa VS Code Extension — entry point.
 * Wires up tree providers (agents, knowledge, activity), realtime subscriptions,
 * CodeLens, status bar, and all commands (inject, connect, dashboard, etc.).
 * Configuration is read from `eywa.*` settings; changes trigger re-init.
 */
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { AgentTreeProvider, SessionItem } from "./agentTree";
import { KnowledgeTreeProvider } from "./knowledgeTree";
import { ActivityTreeProvider } from "./activityTree";
import { EywaClient } from "./client";
import { RealtimeManager, type MemoryPayload } from "./realtime";
import { injectSelection } from "./injectCommand";
import { KnowledgeCodeLensProvider, registerKnowledgeForFileCommand } from "./knowledgeLens";
import { startLoginFlow } from "./authServer";

const TAB_TITLE_FLAG = path.join(os.homedir(), ".config", "eywa", "tab-title");

let client: EywaClient | undefined;
let statusBarItem: vscode.StatusBarItem;
let realtime: RealtimeManager | undefined;

export function activate(context: vscode.ExtensionContext) {
  // Status bar — enhanced with active agent count
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusBarItem.command = "eywa.showStatus";
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

  // First-run onboarding: if no room is configured, prompt the user
  if (!getConfig("room")) {
    showWelcome();
  }

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("eywaAgents", agentProvider),
    vscode.window.registerTreeDataProvider("eywaKnowledge", knowledgeProvider),
    vscode.window.registerTreeDataProvider("eywaActivity", activityProvider),
    vscode.languages.registerCodeLensProvider({ scheme: "file" }, codeLensProvider),
  );

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("eywa.refreshAgents", () => {
      agentProvider.refresh();
      knowledgeProvider.refresh();
      activityProvider.refresh();
      codeLensProvider.refreshCache();
    }),

    vscode.commands.registerCommand("eywa.openDashboard", () => {
      const room = getConfig("room");
      const url = room
        ? `https://eywa-ai.dev/r/${room}`
        : "https://eywa-ai.dev";
      vscode.env.openExternal(vscode.Uri.parse(url));
    }),

    vscode.commands.registerCommand("eywa.login", async () => {
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Waiting for browser login...",
          cancellable: true,
        },
        (_progress, token) => {
          const loginPromise = startLoginFlow((url) => {
            vscode.env.openExternal(vscode.Uri.parse(url));
          });
          return new Promise<Awaited<typeof loginPromise>>((resolve) => {
            token.onCancellationRequested(() => resolve(null));
            loginPromise.then(resolve);
          });
        },
      );

      if (!result) {
        return;
      }

      const config = vscode.workspace.getConfiguration("eywa");
      await config.update("supabaseUrl", result.supabaseUrl, true);
      await config.update("supabaseKey", result.supabaseKey, true);
      await config.update("room", result.room, true);
      vscode.window.showInformationMessage(`Connected to Eywa room: ${result.room}`);
    }),

    vscode.commands.registerCommand("eywa.connectAgent", async () => {
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

      const mcpUrl = `https://mcp.eywa-ai.dev/mcp?room=${room}&agent=${agent}`;

      await vscode.env.clipboard.writeText(mcpUrl);
      vscode.window.showInformationMessage(
        `MCP URL copied! Add to your MCP config:\n${mcpUrl}`,
        "Open Terminal",
      ).then((action) => {
        if (action === "Open Terminal") {
          const terminal = vscode.window.createTerminal("Eywa");
          terminal.sendText(`claude mcp add --transport http eywa "${mcpUrl}"`);
          terminal.show();
        }
      });

      await vscode.workspace.getConfiguration("eywa").update("room", room, true);
      initClient(agentProvider, codeLensProvider, handleRealtimeEvent, context);
      agentProvider.refresh();
    }),

    // Original inject context (manual text input)
    vscode.commands.registerCommand("eywa.injectContext", async () => {
      if (!client) {
        const action = await vscode.window.showWarningMessage("Not connected to Eywa.", "Login");
        if (action === "Login") vscode.commands.executeCommand("eywa.login");
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
    vscode.commands.registerCommand("eywa.injectSelection", () => injectSelection(() => client)),

    // Session context menu: inject to session's agent
    vscode.commands.registerCommand("eywa.injectToSession", async (item: SessionItem) => {
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
    vscode.commands.registerCommand("eywa.copySessionSummary", async (item: SessionItem) => {
      if (!item.session) return;
      const s = item.session;
      const text = `${s.agent} [${s.status}]: ${s.task}\nMemories: ${s.memoryCount} · Last seen: ${s.lastSeen}`;
      await vscode.env.clipboard.writeText(text);
      vscode.window.showInformationMessage("Session summary copied.");
    }),

    // Session context menu: open in dashboard
    vscode.commands.registerCommand("eywa.openSessionInDashboard", (item: SessionItem) => {
      if (!item.session) return;
      const room = getConfig("room");
      const url = `https://eywa-ai.dev/r/${room}`;
      vscode.env.openExternal(vscode.Uri.parse(url));
    }),

    // Enhanced status bar: QuickPick menu
    vscode.commands.registerCommand("eywa.showStatus", async () => {
      if (!client) {
        const action = await vscode.window.showWarningMessage("Not connected to Eywa.", "Login");
        if (action === "Login") vscode.commands.executeCommand("eywa.login");
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
        vscode.commands.executeCommand("eywa.injectContext");
      } else if (pick.label.includes("Open web dashboard")) {
        vscode.commands.executeCommand("eywa.openDashboard");
      } else if (pick.label.includes("Connect new agent")) {
        vscode.commands.executeCommand("eywa.connectAgent");
      }
    }),
  );

  // Tab title toggle (controls the PostToolUse hook via flag file)
  context.subscriptions.push(
    vscode.commands.registerCommand("eywa.toggleTabTitles", () => {
      const dir = path.dirname(TAB_TITLE_FLAG);
      if (fs.existsSync(TAB_TITLE_FLAG)) {
        fs.unlinkSync(TAB_TITLE_FLAG);
        vscode.window.showInformationMessage("Agent tab titles disabled");
      } else {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(TAB_TITLE_FLAG, "1");
        vscode.window.showInformationMessage("Agent tab titles enabled - terminal tabs will show what Claude is doing");
      }
    }),
  );

  // Register knowledge-for-file command
  registerKnowledgeForFileCommand(context);

  // Watch for config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("eywa.supabaseUrl") ||
        e.affectsConfiguration("eywa.supabaseKey") ||
        e.affectsConfiguration("eywa.room")
      ) {
        initClient(agentProvider, codeLensProvider, handleRealtimeEvent, context);
        agentProvider.refresh();
        knowledgeProvider.refresh();
      }
    }),
  );
}

async function showWelcome() {
  const action = await vscode.window.showInformationMessage(
    "Welcome to Eywa! Log in to connect your agents.",
    "Login with Browser",
    "Open Dashboard",
  );
  if (action === "Login with Browser") {
    vscode.commands.executeCommand("eywa.login");
  } else if (action === "Open Dashboard") {
    vscode.commands.executeCommand("eywa.openDashboard");
  }
}

function getConfig(key: string): string {
  return vscode.workspace.getConfiguration("eywa").get<string>(key) ?? "";
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
 * (Re-)initialize the EywaClient and Realtime subscription from current settings.
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
    client = new EywaClient(url, key, room);
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
