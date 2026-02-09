/**
 * Terminal panel tree view showing what each agent session is doing in real time.
 * Lives in the bottom panel next to terminals so you can see at a glance.
 */
import * as vscode from "vscode";
import type { EywaClient } from "./client";
import type { MemoryPayload } from "./realtime";

interface SessionState {
  agent: string;
  task: string;
  lastAction: string;
  lastScope: string;
  lastSystem: string;
  lastContent: string;
  status: "active" | "idle" | "finished";
  progress: number;
  ts: string;
}

// Same hash as web/src/lib/agentColor.ts
function agentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = (300 + (Math.abs(hash) % 60)) / 360;
  const sat = (60 + (Math.abs(hash >> 8) % 30)) / 100;
  const lit = (55 + (Math.abs(hash >> 16) % 20)) / 100;
  const a = sat * Math.min(lit, 1 - lit);
  const f = (n: number) => {
    const k = (n + hue * 12) % 12;
    const c = lit - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * Math.max(0, Math.min(1, c)))
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function shortName(agent: string): string {
  return agent.includes("/") ? agent.split("/").pop()! : agent;
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

class SessionItem extends vscode.TreeItem {
  constructor(public readonly session: SessionState) {
    const name = shortName(session.agent);
    const statusIcon =
      session.status === "active"
        ? "$(pulse)"
        : session.status === "finished"
          ? "$(check)"
          : "$(circle-outline)";

    // Show the current action as the main label
    const actionText = session.lastAction
      ? `${session.lastAction} ${session.lastScope}`
      : session.task || "starting...";

    super(`${statusIcon} ${name}`, vscode.TreeItemCollapsibleState.Expanded);

    this.description = actionText.slice(0, 60);

    // Tooltip with full details
    const lines = [
      `Agent: ${session.agent}`,
      `Status: ${session.status}`,
    ];
    if (session.task) lines.push(`Task: ${session.task}`);
    if (session.lastAction) lines.push(`Action: ${session.lastAction}`);
    if (session.lastScope) lines.push(`Scope: ${session.lastScope}`);
    if (session.lastSystem) lines.push(`System: ${session.lastSystem}`);
    if (session.lastContent) lines.push(`\n${session.lastContent}`);
    if (session.progress > 0) lines.push(`Progress: ${session.progress}%`);
    lines.push(`Last seen: ${timeAgo(session.ts)}`);
    this.tooltip = new vscode.MarkdownString(lines.join("\n\n"));

    this.contextValue = "session";
    this.iconPath = new vscode.ThemeIcon(
      session.status === "active"
        ? "vm-running"
        : session.status === "finished"
          ? "pass-filled"
          : "circle-outline",
      new vscode.ThemeColor(
        session.status === "active"
          ? "testing.runAction"
          : session.status === "finished"
            ? "testing.iconPassed"
            : "disabledForeground",
      ),
    );
  }
}

class DetailItem extends vscode.TreeItem {
  constructor(label: string, detail: string, icon?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = detail;
    if (icon) {
      this.iconPath = new vscode.ThemeIcon(icon);
    }
  }
}

type TreeNode = SessionItem | DetailItem;

export class SessionTreeProvider
  implements vscode.TreeDataProvider<TreeNode>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    TreeNode | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private sessions = new Map<string, SessionState>();
  private refreshTimer: ReturnType<typeof setInterval>;

  constructor(private getClient: () => EywaClient | undefined) {
    // Refresh time-ago display every 30s
    this.refreshTimer = setInterval(() => this._onDidChangeTreeData.fire(), 30_000);
  }

  /** Seed from recent events on startup. */
  async seed(): Promise<void> {
    const client = this.getClient();
    if (!client) return;
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour
    const events = await client.getRecentEvents(since, 200);

    // Process oldest first to build up state correctly
    for (const e of events.reverse()) {
      this.processEvent(e.agent, e.metadata, e.ts, e.content);
    }
    this._onDidChangeTreeData.fire();
  }

  /** Handle a realtime memory event. */
  handleEvent(mem: MemoryPayload): void {
    this.processEvent(mem.agent, mem.metadata ?? {}, mem.ts, mem.content);
    this._onDidChangeTreeData.fire();
  }

  private processEvent(
    agent: string,
    metadata: Record<string, unknown>,
    ts: string,
    content: string,
  ): void {
    const event = metadata.event as string | undefined;
    const existing = this.sessions.get(agent);

    if (event === "session_start") {
      this.sessions.set(agent, {
        agent,
        task: (metadata.task as string) || "",
        lastAction: "",
        lastScope: "",
        lastSystem: "",
        lastContent: "",
        status: "active",
        progress: 0,
        ts,
      });
      return;
    }

    if (event === "session_done" || event === "session_end") {
      if (existing) {
        existing.status = "finished";
        existing.task =
          (metadata.summary as string) || existing.task;
        existing.ts = ts;
      }
      return;
    }

    if (event === "progress") {
      if (existing) {
        existing.progress = (metadata.percent as number) ?? existing.progress;
        existing.ts = ts;
        const detail = metadata.detail as string | undefined;
        if (detail) existing.lastContent = detail.slice(0, 100);
      }
      return;
    }

    // Regular operation log
    const scope = metadata.scope as string | undefined;
    const system = metadata.system as string | undefined;
    const action = metadata.action as string | undefined;

    if (existing) {
      if (action) existing.lastAction = action;
      if (scope) existing.lastScope = scope;
      if (system) existing.lastSystem = system;
      if (content) existing.lastContent = content.slice(0, 100);
      existing.ts = ts;
      // If we get activity, mark as active (unless finished)
      if (existing.status !== "finished") {
        existing.status = "active";
      }
    } else {
      // Agent we haven't seen a session_start for
      this.sessions.set(agent, {
        agent,
        task: "",
        lastAction: action || "",
        lastScope: scope || "",
        lastSystem: system || "",
        lastContent: (content || "").slice(0, 100),
        status: "active",
        progress: 0,
        ts,
      });
    }
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      // Root: show sessions sorted by status then recency
      const sessions = [...this.sessions.values()];

      // Prune sessions older than 2 hours
      const cutoff = Date.now() - 2 * 60 * 60 * 1000;
      const recent = sessions.filter(
        (s) => new Date(s.ts).getTime() > cutoff,
      );

      recent.sort((a, b) => {
        const order = { active: 0, idle: 1, finished: 2 };
        const diff = order[a.status] - order[b.status];
        if (diff !== 0) return diff;
        return new Date(b.ts).getTime() - new Date(a.ts).getTime();
      });

      return recent.map((s) => new SessionItem(s));
    }

    if (element instanceof SessionItem) {
      const s = element.session;
      const children: DetailItem[] = [];

      if (s.task) {
        children.push(new DetailItem("Task", s.task.slice(0, 80), "target"));
      }
      if (s.lastAction && s.lastScope) {
        children.push(
          new DetailItem(
            s.lastAction,
            s.lastScope.slice(0, 60),
            "edit",
          ),
        );
      }
      if (s.lastSystem) {
        children.push(
          new DetailItem("System", s.lastSystem, "server-environment"),
        );
      }
      if (s.progress > 0) {
        const bar = progressBar(s.progress);
        children.push(
          new DetailItem("Progress", `${bar} ${s.progress}%`, "graph"),
        );
      }
      if (s.lastContent) {
        children.push(
          new DetailItem("Latest", s.lastContent.slice(0, 80), "comment"),
        );
      }
      children.push(new DetailItem("Seen", timeAgo(s.ts), "clock"));

      return children;
    }

    return [];
  }

  dispose(): void {
    clearInterval(this.refreshTimer);
    this._onDidChangeTreeData.dispose();
  }
}

function progressBar(pct: number): string {
  const filled = Math.round(pct / 12.5);
  return "\u2588".repeat(filled) + "\u2591".repeat(8 - filled);
}
