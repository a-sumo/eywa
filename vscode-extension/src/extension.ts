/**
 * Eywa VS Code Extension - entry point.
 * Live webview panel, CodeLens, status bar, and commands.
 */
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { EywaClient } from "./client";
import { RealtimeManager, type MemoryPayload } from "./realtime";
import { injectSelection } from "./injectCommand";
import { KnowledgeCodeLensProvider, registerKnowledgeForFileCommand } from "./knowledgeLens";
import { startLoginFlow } from "./authServer";
import { LiveViewProvider } from "./liveView";

const TAB_TITLE_FLAG = path.join(os.homedir(), ".config", "eywa", "tab-title");

let client: EywaClient | undefined;
let statusBarItem: vscode.StatusBarItem;
let realtime: RealtimeManager | undefined;

export function activate(context: vscode.ExtensionContext) {
  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusBarItem.command = "eywa.showStatus";
  statusBarItem.text = "$(cloud) Eywa";
  statusBarItem.tooltip = "Click for Eywa quick actions";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Providers
  const codeLensProvider = new KnowledgeCodeLensProvider(() => client);
  const liveProvider = new LiveViewProvider(() => client, getConfig("room"));

  // Realtime event handler
  function handleRealtimeEvent(mem: MemoryPayload) {
    const meta = mem.metadata ?? {};
    const event = meta.event as string | undefined;

    if (event === "knowledge_stored" || mem.message_type === "knowledge") {
      codeLensProvider.refreshCache();
    }

    // Urgent injections get a native popup
    if (event === "context_injection") {
      const priority = (meta.priority as string) || "normal";
      if (priority === "urgent") {
        const from = (meta.from_agent as string) || mem.agent;
        const target = (meta.target_agent as string) || "all";
        const msg = `${from} injected context${target !== "all" ? ` to ${target}` : ""}`;
        vscode.window.showWarningMessage(`URGENT: ${msg}`, "Open Dashboard").then((choice) => {
          if (choice === "Open Dashboard") vscode.commands.executeCommand("eywa.openDashboard");
        });
      }
    }

    liveProvider.handleEvent(mem);
    updateStatusBar();
  }

  // Initialize client
  initClient(codeLensProvider, handleRealtimeEvent, context);

  if (!getConfig("room")) {
    showWelcome();
  }

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(LiveViewProvider.viewType, liveProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.languages.registerCodeLensProvider({ scheme: "file" }, codeLensProvider),
  );

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("eywa.refreshAgents", () => {
      codeLensProvider.refreshCache();
      liveProvider.loadInitial();
    }),

    vscode.commands.registerCommand("eywa.openDashboard", () => {
      const room = getConfig("room");
      vscode.env.openExternal(vscode.Uri.parse(room ? `https://eywa-ai.dev/r/${room}` : "https://eywa-ai.dev"));
    }),

    vscode.commands.registerCommand("eywa.login", async () => {
      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Waiting for browser login...", cancellable: true },
        (_progress, token) => {
          const loginPromise = startLoginFlow((url) => vscode.env.openExternal(vscode.Uri.parse(url)));
          return new Promise<Awaited<typeof loginPromise>>((resolve) => {
            token.onCancellationRequested(() => resolve(null));
            loginPromise.then(resolve);
          });
        },
      );
      if (!result) return;
      const config = vscode.workspace.getConfiguration("eywa");
      await config.update("supabaseUrl", result.supabaseUrl, true);
      await config.update("supabaseKey", result.supabaseKey, true);
      await config.update("room", result.room, true);
      vscode.window.showInformationMessage(`Connected to Eywa room: ${result.room}`);
    }),

    vscode.commands.registerCommand("eywa.connectAgent", async () => {
      const room = await vscode.window.showInputBox({ prompt: "Room slug", placeHolder: "my-project", value: getConfig("room") });
      if (!room) return;
      const agent = await vscode.window.showInputBox({ prompt: "Agent name", placeHolder: "claude-code" });
      if (!agent) return;
      const mcpUrl = `https://mcp.eywa-ai.dev/mcp?room=${room}&agent=${agent}`;
      await vscode.env.clipboard.writeText(mcpUrl);
      vscode.window.showInformationMessage(`MCP URL copied! Add to your MCP config:\n${mcpUrl}`, "Open Terminal").then((action) => {
        if (action === "Open Terminal") {
          const terminal = vscode.window.createTerminal("Eywa");
          terminal.sendText(`claude mcp add --transport http eywa "${mcpUrl}"`);
          terminal.show();
        }
      });
      await vscode.workspace.getConfiguration("eywa").update("room", room, true);
    }),

    vscode.commands.registerCommand("eywa.injectContext", async () => {
      if (!client) {
        const action = await vscode.window.showWarningMessage("Not connected to Eywa.", "Login");
        if (action === "Login") vscode.commands.executeCommand("eywa.login");
        return;
      }
      const agents = await client.getAgents();
      const target = await vscode.window.showQuickPick([...agents.map((a) => a.name), "all"], { placeHolder: "Target agent (or 'all' for broadcast)" });
      if (!target) return;
      const content = await vscode.window.showInputBox({ prompt: "Context/instructions to inject", placeHolder: "Focus on the auth module, the schema changed to use UUIDs" });
      if (!content) return;
      const priority = await vscode.window.showQuickPick(["normal", "high", "urgent"], { placeHolder: "Priority" }) as "normal" | "high" | "urgent" | undefined;
      if (!priority) return;
      await client.inject("vscode-user", target, content, priority);
      vscode.window.showInformationMessage(`Injected context for ${target} (${priority})`);
    }),

    vscode.commands.registerCommand("eywa.injectSelection", () => injectSelection(() => client)),

    vscode.commands.registerCommand("eywa.setRoom", async () => {
      const room = await vscode.window.showInputBox({
        prompt: "Enter room slug", placeHolder: "my-project", value: getConfig("room"),
        validateInput: (v) => /^[a-zA-Z0-9_-]{1,64}$/.test(v) ? null : "Letters, numbers, hyphens, underscores only",
      });
      if (!room) return;
      await vscode.workspace.getConfiguration("eywa").update("room", room, true);
    }),

    vscode.commands.registerCommand("eywa.showStatus", async () => {
      const room = getConfig("room");
      const tabTitlesOn = fs.existsSync(TAB_TITLE_FLAG);

      const items: vscode.QuickPickItem[] = [
        { label: `$(folder) ${room || "(no room)"}`, description: "Switch room", detail: room ? `Connected to /${room}` : "Click to set a room" },
        { label: "", kind: vscode.QuickPickItemKind.Separator },
      ];

      if (client) {
        const agents = await client.getAgents();
        if (agents.length > 0) {
          items.push(
            ...agents.map((a) => ({ label: `$(${a.isActive ? "circle-filled" : "circle-outline"}) ${a.name}`, description: a.isActive ? "active" : "idle" })),
            { label: "", kind: vscode.QuickPickItemKind.Separator },
          );
        }
        items.push({ label: "$(arrow-right) Inject context to agent...", description: "" });
      }

      items.push(
        { label: "$(terminal) Agent tab titles", description: tabTitlesOn ? "ON" : "OFF", detail: "Show what Claude is doing in terminal tab names" },
        { label: "$(plug) Connect new agent", description: "" },
        { label: "$(link-external) Open web dashboard", description: room || "" },
        { label: "$(log-in) Login with browser", description: "" },
      );

      const pick = await vscode.window.showQuickPick(items, { placeHolder: room ? `Eywa: /${room}` : "Eywa: set up your room" });
      if (!pick) return;

      if (pick.label.includes(room || "(no room)")) vscode.commands.executeCommand("eywa.setRoom");
      else if (pick.label.includes("Inject context")) vscode.commands.executeCommand("eywa.injectContext");
      else if (pick.label.includes("Agent tab titles")) vscode.commands.executeCommand("eywa.toggleTabTitles");
      else if (pick.label.includes("Open web dashboard")) vscode.commands.executeCommand("eywa.openDashboard");
      else if (pick.label.includes("Connect new agent")) vscode.commands.executeCommand("eywa.connectAgent");
      else if (pick.label.includes("Login")) vscode.commands.executeCommand("eywa.login");
    }),

    vscode.commands.registerCommand("eywa.toggleTabTitles", () => {
      const dir = path.dirname(TAB_TITLE_FLAG);
      if (fs.existsSync(TAB_TITLE_FLAG)) {
        fs.unlinkSync(TAB_TITLE_FLAG);
        vscode.window.showInformationMessage("Agent tab titles disabled");
      } else {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(TAB_TITLE_FLAG, "1");
        vscode.window.showInformationMessage("Agent tab titles enabled");
      }
    }),
  );

  registerKnowledgeForFileCommand(context);

  // Config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("eywa.supabaseUrl") || e.affectsConfiguration("eywa.supabaseKey") || e.affectsConfiguration("eywa.room")) {
        initClient(codeLensProvider, handleRealtimeEvent, context);
        liveProvider.setRoom(getConfig("room"));
        updateStatusBar();
      }
    }),
  );
}

async function showWelcome() {
  const action = await vscode.window.showInformationMessage("Eywa: enter a room slug to start monitoring your agents.", "Set Room", "Login with Browser");
  if (action === "Set Room") vscode.commands.executeCommand("eywa.setRoom");
  else if (action === "Login with Browser") vscode.commands.executeCommand("eywa.login");
}

function getConfig(key: string): string {
  return vscode.workspace.getConfiguration("eywa").get<string>(key) ?? "";
}

function updateStatusBar() {
  const room = getConfig("room");
  if (!room) { statusBarItem.text = "$(cloud) Eywa (unconfigured)"; return; }
  statusBarItem.text = `$(cloud) Eywa: /${room}`;
}

function initClient(
  codeLensProvider: KnowledgeCodeLensProvider,
  onEvent: (mem: MemoryPayload) => void,
  context: vscode.ExtensionContext,
) {
  const url = getConfig("supabaseUrl");
  const key = getConfig("supabaseKey");
  const room = getConfig("room");

  if (realtime && client) {
    realtime.unsubscribe(client.getSupabase());
  }

  if (url && key && room) {
    client = new EywaClient(url, key, room);
    updateStatusBar();
    codeLensProvider.refreshCache();

    realtime = new RealtimeManager();
    const unsub = realtime.on(onEvent);
    context.subscriptions.push({ dispose: unsub });

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
