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
import { AgentDecorationManager } from "./agentDecorations";
import { SessionTreeProvider } from "./sessionTree";
import { PanelViewProvider } from "./panelView";
import { startLoginFlow } from "./authServer";
import { LiveViewProvider } from "./liveView";
import { ApprovalTreeProvider } from "./approvalTree";
import { TaskTreeProvider } from "./taskTree";
import type { AttentionItem } from "./client";

const TAB_TITLE_FLAG = path.join(os.homedir(), ".config", "eywa", "tab-title");

let client: EywaClient | undefined;
let statusBarItem: vscode.StatusBarItem;
let realtime: RealtimeManager | undefined;

// Terminal <-> Agent associations
const terminalAgentMap = new Map<vscode.Terminal, string>();

export function activate(context: vscode.ExtensionContext) {
  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusBarItem.command = "eywa.showStatus";
  statusBarItem.text = "$(cloud) Eywa";
  statusBarItem.tooltip = "Click for Eywa quick actions";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Providers
  const decorationManager = new AgentDecorationManager(() => client);
  const sessionTree = new SessionTreeProvider(() => client);
  const panelView = new PanelViewProvider(() => client);
  const liveProvider = new LiveViewProvider(() => client, getConfig("fold"));
  const approvalTree = new ApprovalTreeProvider(() => client);
  const taskTree = new TaskTreeProvider(() => client);

  // Track attention items for badge and notifications
  let knownAttentionAgents = new Set<string>();

  liveProvider.setAttentionListener((items: AttentionItem[]) => {
    // Update badge on Eywa view
    const count = items.length;
    if (count > 0) {
      statusBarItem.text = `$(bell) Eywa: ${count} need${count === 1 ? "s" : ""} you`;
      statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    } else {
      updateStatusBar();
      statusBarItem.backgroundColor = undefined;
    }

    // Badge on the view
    liveProvider.setBadge(count);

    // Fire native notifications for NEW distress/blocked items
    for (const item of items) {
      if (knownAttentionAgents.has(item.agent)) continue;
      if (item.reason === "distress" || item.reason === "blocked") {
        const short = item.agent.includes("/") ? item.agent.split("/").pop()! : item.agent;
        const label = item.reason === "distress" ? "DISTRESS" : "BLOCKED";
        vscode.window
          .showWarningMessage(
            `${label}: ${short} - ${item.summary.slice(0, 80)}`,
            "Open Eywa",
            "Dismiss",
          )
          .then((choice) => {
            if (choice === "Open Eywa") {
              vscode.commands.executeCommand("eywaLive.focus");
            }
          });
      }
    }
    knownAttentionAgents = new Set(items.map((i) => i.agent));
  });

  // Realtime event handler
  function handleRealtimeEvent(mem: MemoryPayload) {
    const meta = mem.metadata ?? {};
    const event = meta.event as string | undefined;

    // Urgent injections get a native popup
    if (event === "context_injection") {
      const priority = (meta.priority as string) || "normal";
      if (priority === "urgent") {
        const from = (meta.from_agent as string) || mem.agent;
        const target = (meta.target_agent as string) || "all";
        const msg = `${from} injected context${target !== "all" ? ` to ${target}` : ""}`;
        vscode.window.showWarningMessage(`URGENT: ${msg}`, "Open Eywa").then((choice) => {
          if (choice === "Open Eywa") vscode.commands.executeCommand("eywaLive.focus");
        });
      }
    }

    // Distress signals get an immediate high-priority notification
    if (event === "distress") {
      const short = mem.agent.includes("/") ? mem.agent.split("/").pop()! : mem.agent;
      vscode.window.showErrorMessage(
        `Agent ${short} sent a distress signal and needs direction`,
        "Open Eywa",
      ).then((choice) => {
        if (choice === "Open Eywa") vscode.commands.executeCommand("eywaLive.focus");
      });
    }

    decorationManager.handleEvent(mem);
    sessionTree.handleEvent(mem);
    panelView.handleEvent(mem);
    liveProvider.handleEvent(mem);
    approvalTree.handleEvent(mem);
    taskTree.handleEvent(mem);
    updateStatusBar();
  }

  // Initialize client
  initClient(decorationManager, sessionTree, panelView, approvalTree, taskTree, handleRealtimeEvent, context);

  if (!getConfig("fold")) {
    showWelcome();
  }

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(LiveViewProvider.viewType, liveProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider(PanelViewProvider.viewType, panelView, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerTreeDataProvider("eywaSessions", sessionTree),
    vscode.window.registerTreeDataProvider("eywaApprovals", approvalTree),
    vscode.window.registerTreeDataProvider("eywaTasks", taskTree),
    // Agent decoration lifecycle
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) decorationManager.updateDecorations(editor);
    }),
    vscode.window.onDidChangeVisibleTextEditors(() => {
      decorationManager.updateAllVisibleEditors();
    }),
    vscode.languages.registerHoverProvider({ scheme: "file" }, {
      provideHover(doc, pos) { return decorationManager.getHoverContent(doc, pos); },
    }),
    { dispose: () => decorationManager.dispose() },
    { dispose: () => sessionTree.dispose() },
    { dispose: () => panelView.dispose() },
    { dispose: () => approvalTree.dispose() },
    { dispose: () => taskTree.dispose() },
  );

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("eywa.refreshAgents", () => {
      const onErr = (name: string) => (err: unknown) =>
        console.error(`[eywa] ${name} refresh failed:`, err);
      decorationManager.seed().catch(onErr("decorationManager"));
      sessionTree.seed().catch(onErr("sessionTree"));
      panelView.seed().catch(onErr("panelView"));
      liveProvider.loadInitial().catch(onErr("liveProvider"));
      approvalTree.seed().catch(onErr("approvalTree"));
      taskTree.seed().catch(onErr("taskTree"));
    }),

    vscode.commands.registerCommand("eywa.openDashboard", () => {
      const fold = getConfig("fold");
      vscode.env.openExternal(vscode.Uri.parse(fold ? `https://eywa-ai.dev/f/${fold}` : "https://eywa-ai.dev"));
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
      await config.update("fold", result.fold, true);
      vscode.window.showInformationMessage(`Connected to Eywa fold: ${result.fold}`);
    }),

    vscode.commands.registerCommand("eywa.connectAgent", async () => {
      const fold = await vscode.window.showInputBox({ prompt: "Fold slug", placeHolder: "my-project", value: getConfig("fold") });
      if (!fold) return;
      const agent = await vscode.window.showInputBox({ prompt: "Agent name", placeHolder: "claude-code" });
      if (!agent) return;
      const mcpUrl = `https://mcp.eywa-ai.dev/mcp?fold=${fold}&agent=${agent}`;
      await vscode.env.clipboard.writeText(mcpUrl);
      vscode.window.showInformationMessage(`MCP URL copied! Add to your MCP config:\n${mcpUrl}`, "Open Terminal").then((action) => {
        if (action === "Open Terminal") {
          const terminal = vscode.window.createTerminal("Eywa");
          terminal.sendText(`claude mcp add --transport http eywa "${mcpUrl}"`);
          terminal.show();
        }
      });
      await vscode.workspace.getConfiguration("eywa").update("fold", fold, true);
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

    vscode.commands.registerCommand("eywa.setFold", async () => {
      const fold = await vscode.window.showInputBox({
        prompt: "Enter fold slug", placeHolder: "my-project", value: getConfig("fold"),
        validateInput: (v) => /^[a-zA-Z0-9_-]{1,64}$/.test(v) ? null : "Letters, numbers, hyphens, underscores only",
      });
      if (!fold) return;
      await vscode.workspace.getConfiguration("eywa").update("fold", fold, true);
    }),

    vscode.commands.registerCommand("eywa.showStatus", async () => {
      const fold = getConfig("fold");
      const tabTitlesOn = fs.existsSync(TAB_TITLE_FLAG);

      const items: vscode.QuickPickItem[] = [
        { label: `$(folder) ${fold || "(no fold)"}`, description: "Switch fold", detail: fold ? `Connected to /${fold}` : "Click to set a fold" },
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
        { label: "$(link-external) Open web dashboard", description: fold || "" },
        { label: "$(log-in) Login with browser", description: "" },
      );

      const pick = await vscode.window.showQuickPick(items, { placeHolder: fold ? `Eywa: /${fold}` : "Eywa: set up your fold" });
      if (!pick) return;

      if (pick.label.includes(fold || "(no fold)")) vscode.commands.executeCommand("eywa.setFold");
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

    vscode.commands.registerCommand("eywa.approveRequest", (item: unknown) => {
      if (item && typeof item === "object" && "approval" in item) {
        approvalTree.approveRequest(item as Parameters<typeof approvalTree.approveRequest>[0]);
      }
    }),

    vscode.commands.registerCommand("eywa.denyRequest", (item: unknown) => {
      if (item && typeof item === "object" && "approval" in item) {
        approvalTree.denyRequest(item as Parameters<typeof approvalTree.denyRequest>[0]);
      }
    }),

    vscode.commands.registerCommand("eywa.refreshApprovals", () => {
      approvalTree.seed();
    }),

    vscode.commands.registerCommand("eywa.refreshTasks", () => {
      taskTree.seed();
    }),

    vscode.commands.registerCommand("eywa.tagTerminal", async () => {
      const terminal = vscode.window.activeTerminal;
      if (!terminal) {
        vscode.window.showWarningMessage("No active terminal to tag.");
        return;
      }
      if (!client) {
        vscode.window.showWarningMessage("Not connected to Eywa.");
        return;
      }
      const agents = await client.getAgents();
      const items = agents.map((a) => ({
        label: a.name,
        description: a.isActive ? "active" : "idle",
      }));
      items.push({ label: "Custom name...", description: "" });
      const pick = await vscode.window.showQuickPick(items, { placeHolder: "Associate this terminal with an agent" });
      if (!pick) return;

      let agentName = pick.label;
      if (agentName === "Custom name...") {
        const custom = await vscode.window.showInputBox({ prompt: "Agent name for this terminal" });
        if (!custom) return;
        agentName = custom;
      }

      terminalAgentMap.set(terminal, agentName);
      const short = agentName.includes("/") ? agentName.split("/").pop()! : agentName;
      terminal.sendText(`# Tagged: ${agentName}`, false);
      vscode.window.showInformationMessage(`Terminal tagged as ${short}`);
    }),
  );

  // Clean up terminal tags when terminals close
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((t) => { terminalAgentMap.delete(t); }),
  );

  // Auto-tag terminals when agent sessions start
  context.subscriptions.push(
    vscode.window.onDidOpenTerminal((terminal) => {
      // Check terminal name for known agent patterns
      const name = terminal.name.toLowerCase();
      if (name.includes("claude") || name.includes("eywa")) {
        // Will be tagged when the agent connects via realtime
      }
    }),
  );

  // Config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("eywa.supabaseUrl") || e.affectsConfiguration("eywa.supabaseKey") || e.affectsConfiguration("eywa.fold")) {
        initClient(decorationManager, sessionTree, panelView, approvalTree, taskTree, handleRealtimeEvent, context);
        liveProvider.setFold(getConfig("fold"));
        updateStatusBar();
      }
    }),
  );
}

async function showWelcome() {
  const action = await vscode.window.showInformationMessage(
    "Welcome to Eywa. Run `npx eywa-ai init` in your terminal to create a fold and auto-configure your agents, then set the fold here.",
    "Get Started",
    "Set Fold",
  );
  if (action === "Get Started") {
    vscode.commands.executeCommand("workbench.action.openWalkthrough", "curvilinear.eywa-agents#eywa.welcome");
  } else if (action === "Set Fold") {
    vscode.commands.executeCommand("eywa.setFold");
  }
}

function getConfig(key: string): string {
  return vscode.workspace.getConfiguration("eywa").get<string>(key) ?? "";
}

function updateStatusBar() {
  const fold = getConfig("fold");
  if (!fold) { statusBarItem.text = "$(cloud) Eywa (unconfigured)"; return; }
  statusBarItem.text = `$(cloud) Eywa: /${fold}`;
}

function initClient(
  decorationManager: AgentDecorationManager,
  sessionTree: SessionTreeProvider,
  panelView: PanelViewProvider,
  approvalTree: ApprovalTreeProvider,
  taskTree: TaskTreeProvider,
  onEvent: (mem: MemoryPayload) => void,
  context: vscode.ExtensionContext,
) {
  const url = getConfig("supabaseUrl");
  const key = getConfig("supabaseKey");
  const fold = getConfig("fold");

  if (realtime && client) {
    realtime.unsubscribe(client.getSupabase());
  }

  if (url && key && fold) {
    client = new EywaClient(url, key, fold);
    updateStatusBar();
    const logSeedError = (name: string) => (err: unknown) =>
      console.error(`[eywa] ${name}.seed() failed:`, err);
    decorationManager.seed().catch(logSeedError("decorationManager"));
    sessionTree.seed().catch(logSeedError("sessionTree"));
    panelView.seed().catch(logSeedError("panelView"));
    approvalTree.seed().catch(logSeedError("approvalTree"));
    taskTree.seed().catch(logSeedError("taskTree"));

    realtime = new RealtimeManager();
    const unsub = realtime.on(onEvent);
    context.subscriptions.push({ dispose: unsub });

    client.resolveFoldId().then((foldId) => {
      if (foldId && realtime && client) {
        realtime.subscribe(client.getSupabase(), foldId);
      }
    }).catch((err) => console.error("[eywa] resolveFoldId failed:", err));
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
