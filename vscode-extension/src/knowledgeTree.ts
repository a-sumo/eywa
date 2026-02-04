import * as vscode from "vscode";
import type { RemixClient, KnowledgeEntry } from "./client";

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export class KnowledgeTreeProvider implements vscode.TreeDataProvider<KnowledgeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<KnowledgeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private getClient: () => RemixClient | undefined) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: KnowledgeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<KnowledgeItem[]> {
    const client = this.getClient();
    if (!client) return [];

    try {
      const entries = await client.getKnowledge();
      if (entries.length === 0) {
        return [new KnowledgeItem("No knowledge entries yet", "", "")];
      }
      return entries.map((e) => new KnowledgeItem(
        e.title || e.content.slice(0, 50),
        `${e.tags.join(", ")} · ${e.agent} · ${timeAgo(e.ts)}`,
        e.content,
      ));
    } catch {
      return [new KnowledgeItem("Error fetching knowledge", "", "")];
    }
  }
}

class KnowledgeItem extends vscode.TreeItem {
  constructor(
    label: string,
    detail: string,
    content: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = detail;
    this.tooltip = content;
    this.iconPath = new vscode.ThemeIcon("book");
  }
}
