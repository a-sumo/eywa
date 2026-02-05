import * as vscode from "vscode";
import type { RemixClient, SessionInfo } from "./client";

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

type TreeNode = UserItem | SessionItem;

export class AgentTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private cachedSessions: Map<string, SessionInfo[]> = new Map();

  constructor(private getClient: () => RemixClient | undefined) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getActiveCount(): number {
    let count = 0;
    for (const sessions of this.cachedSessions.values()) {
      if (sessions.some((s) => s.status === "active")) count++;
    }
    return count;
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    const client = this.getClient();
    if (!client) {
      return [new UserItem("Configure remix settings", "", 0, 0)];
    }

    // Top level: user items
    if (!element) {
      try {
        this.cachedSessions = await client.getSessions();
        if (this.cachedSessions.size === 0) {
          return [new UserItem("No agents yet", "", 0, 0)];
        }
        return Array.from(this.cachedSessions.entries()).map(([user, sessions]) => {
          const activeCount = sessions.filter((s) => s.status === "active").length;
          return new UserItem(user, user, sessions.length, activeCount);
        });
      } catch {
        return [new UserItem("Error fetching agents", "", 0, 0)];
      }
    }

    // Second level: sessions under a user
    if (element instanceof UserItem && element.userId) {
      const sessions = this.cachedSessions.get(element.userId) ?? [];
      return sessions.map((s) => new SessionItem(s));
    }

    return [];
  }
}

class UserItem extends vscode.TreeItem {
  contextValue = "remixUser";

  constructor(
    label: string,
    public readonly userId: string,
    sessionCount: number,
    activeCount: number,
  ) {
    super(
      label,
      sessionCount > 0
        ? (activeCount > 0
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed)
        : vscode.TreeItemCollapsibleState.None,
    );

    if (sessionCount > 0) {
      const parts: string[] = [];
      if (activeCount > 0) parts.push(`${activeCount} active`);
      parts.push(`${sessionCount} session${sessionCount !== 1 ? "s" : ""}`);
      this.description = parts.join(" · ");
    }

    this.iconPath = new vscode.ThemeIcon(
      activeCount > 0 ? "account" : "account",
      activeCount > 0
        ? new vscode.ThemeColor("testing.iconPassed")
        : new vscode.ThemeColor("disabledForeground"),
    );
  }
}

export class SessionItem extends vscode.TreeItem {
  contextValue = "remixSession";
  public readonly session: SessionInfo;

  constructor(session: SessionInfo) {
    // Extract session name from agent: "armand/quiet-oak" → "quiet-oak"
    const sessionName = session.agent.includes("/")
      ? session.agent.split("/")[1]
      : session.sessionId.slice(0, 10);

    const taskPreview = session.task
      ? `: ${session.task.slice(0, 50)}`
      : "";

    super(`${sessionName}${taskPreview}`, vscode.TreeItemCollapsibleState.None);

    this.session = session;

    this.description = `${session.status} · ${session.memoryCount} mem · ${timeAgo(session.lastSeen)}`;

    this.tooltip = [
      `Agent: ${session.agent}`,
      `Session: ${session.sessionId}`,
      `Status: ${session.status}`,
      `Task: ${session.task || "(none)"}`,
      `Memories: ${session.memoryCount}`,
      `Last seen: ${session.lastSeen}`,
    ].join("\n");

    const iconMap = {
      active: "circle-filled",
      finished: "check",
      idle: "circle-outline",
    } as const;
    const colorMap = {
      active: "testing.iconPassed",
      finished: "disabledForeground",
      idle: "disabledForeground",
    } as const;

    this.iconPath = new vscode.ThemeIcon(
      iconMap[session.status],
      new vscode.ThemeColor(colorMap[session.status]),
    );
  }
}
