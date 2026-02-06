/**
 * Live activity feed for the Eywa sidebar.
 * Displays session starts/completions, injections, knowledge events, and
 * general messages in reverse-chronological order. Capped at {@link MAX_EVENTS}.
 */
import * as vscode from "vscode";

/** Represents a single activity event displayed in the tree view. */
export interface ActivityEvent {
  id: string;
  agent: string;
  type: "session_start" | "session_done" | "injection" | "knowledge" | "message";
  message: string;
  ts: string;
  priority?: string;
  metadata?: Record<string, unknown>;
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Maximum events retained in memory. Oldest events are evicted when exceeded. */
const MAX_EVENTS = 50;

/**
 * TreeDataProvider for the "Eywa Activity" panel.
 * Events are deduped by ID and capped at MAX_EVENTS.
 */
export class ActivityTreeProvider implements vscode.TreeDataProvider<ActivityItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ActivityItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private events: ActivityEvent[] = [];
  private seenIds = new Set<string>();

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /** Add an event to the feed. Dedupes by ID and evicts the oldest when over cap. */
  addEvent(event: ActivityEvent): void {
    if (this.seenIds.has(event.id)) return;
    this.seenIds.add(event.id);
    this.events.unshift(event);
    if (this.events.length > MAX_EVENTS) {
      const removed = this.events.pop();
      if (removed) this.seenIds.delete(removed.id);
    }
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ActivityItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<ActivityItem[]> {
    if (this.events.length === 0) {
      const empty = new ActivityItem(
        "No activity yet",
        "",
        "info",
        "",
      );
      return [empty];
    }

    return this.events.map((e) => new ActivityItem(
      e.message,
      `${e.agent} · ${timeAgo(e.ts)}`,
      e.type,
      e.agent,
    ));
  }
}

class ActivityItem extends vscode.TreeItem {
  contextValue = "eywaActivity";

  constructor(
    message: string,
    detail: string,
    type: string,
    public readonly agent: string,
  ) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.description = detail;
    this.tooltip = message;

    const iconMap: Record<string, string> = {
      session_start: "play",
      session_done: "check",
      injection: "arrow-right",
      knowledge: "book",
      message: "comment",
      info: "info",
    };

    const colorMap: Record<string, string> = {
      session_start: "testing.iconPassed",
      session_done: "testing.iconPassed",
      injection: "notificationsInfoIcon.foreground",
      knowledge: "notificationsInfoIcon.foreground",
    };

    this.iconPath = new vscode.ThemeIcon(
      iconMap[type] ?? "circle-outline",
      colorMap[type] ? new vscode.ThemeColor(colorMap[type]) : undefined,
    );
  }
}
