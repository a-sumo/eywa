import * as vscode from "vscode";
import type { RemixClient, AgentInfo } from "./client";

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export class AgentTreeProvider implements vscode.TreeDataProvider<AgentItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AgentItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private getClient: () => RemixClient | undefined) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: AgentItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<AgentItem[]> {
    const client = this.getClient();
    if (!client) {
      return [new AgentItem("Configure remix.room, remix.supabaseUrl, remix.supabaseKey", "", false, "")];
    }

    try {
      const agents = await client.getAgents();
      if (agents.length === 0) {
        return [new AgentItem("No agents yet", "", false, "")];
      }
      return agents.map((a) => new AgentItem(
        a.name,
        `${a.sessionCount}s · ${timeAgo(a.lastSeen)} · ${a.status}`,
        a.isActive,
        a.lastContent,
      ));
    } catch {
      return [new AgentItem("Error fetching agents", "", false, "")];
    }
  }
}

class AgentItem extends vscode.TreeItem {
  constructor(
    public readonly agentName: string,
    public readonly detail: string,
    public readonly isActive: boolean,
    public readonly lastContent: string,
  ) {
    super(agentName, vscode.TreeItemCollapsibleState.None);
    this.description = detail;
    this.tooltip = lastContent || agentName;
    this.iconPath = new vscode.ThemeIcon(
      isActive ? "circle-filled" : "circle-outline",
      isActive
        ? new vscode.ThemeColor("testing.iconPassed")
        : new vscode.ThemeColor("disabledForeground"),
    );
  }
}
