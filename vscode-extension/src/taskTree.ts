/**
 * Task queue tree view for the Eywa VS Code extension.
 * Shows tasks grouped by status (in_progress, open, claimed, blocked)
 * with priority-based sorting within each group.
 */
import * as vscode from "vscode";
import type { EywaClient, TaskInfo } from "./client";
import type { MemoryPayload } from "./realtime";

function shortName(agent: string): string {
  return agent.includes("/") ? agent.split("/").pop()! : agent;
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const STATUS_ICONS: Record<string, string> = {
  in_progress: "sync~spin",
  open: "circle-outline",
  claimed: "person",
  blocked: "error",
  done: "pass-filled",
};

const STATUS_LABELS: Record<string, string> = {
  in_progress: "In Progress",
  open: "Open",
  claimed: "Claimed",
  blocked: "Blocked",
  done: "Done",
};

const PRIORITY_ICONS: Record<string, string> = {
  urgent: "flame",
  high: "warning",
  normal: "circle-outline",
  low: "circle-outline",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "errorForeground",
  high: "list.warningForeground",
  normal: "foreground",
  low: "disabledForeground",
};

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

// Group header node
class StatusGroupItem extends vscode.TreeItem {
  constructor(
    public readonly status: string,
    public readonly count: number,
  ) {
    const label = STATUS_LABELS[status] || status;
    super(`${label} (${count})`, vscode.TreeItemCollapsibleState.Expanded);
    this.iconPath = new vscode.ThemeIcon(STATUS_ICONS[status] || "circle-outline");
    this.contextValue = `taskGroup-${status}`;
  }
}

// Individual task node
class TaskItem extends vscode.TreeItem {
  constructor(public readonly task: TaskInfo) {
    super(task.title, vscode.TreeItemCollapsibleState.Collapsed);

    const parts: string[] = [];
    if (task.priority !== "normal") parts.push(task.priority.toUpperCase());
    if (task.assignedTo) parts.push(shortName(task.assignedTo));
    parts.push(timeAgo(task.ts));
    this.description = parts.join(" · ");

    const lines = [`**${task.title}**`, ""];
    lines.push(`**Status:** ${STATUS_LABELS[task.status] || task.status}`);
    lines.push(`**Priority:** ${task.priority}`);
    lines.push(`**Created by:** ${shortName(task.createdBy)}`);
    if (task.assignedTo) lines.push(`**Assigned to:** ${shortName(task.assignedTo)}`);
    if (task.milestone) lines.push(`**Milestone:** ${task.milestone}`);
    if (task.blockedReason) lines.push(`**Blocked:** ${task.blockedReason}`);
    if (task.description) lines.push("", task.description.slice(0, 200));
    this.tooltip = new vscode.MarkdownString(lines.join("\n\n"));

    this.contextValue = `task-${task.status}`;
    this.iconPath = new vscode.ThemeIcon(
      PRIORITY_ICONS[task.priority] || "circle-outline",
      new vscode.ThemeColor(PRIORITY_COLORS[task.priority] || "foreground"),
    );
  }
}

// Detail child node
class DetailItem extends vscode.TreeItem {
  constructor(label: string, detail: string, icon?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = detail;
    if (icon) {
      this.iconPath = new vscode.ThemeIcon(icon);
    }
  }
}

type TreeNode = StatusGroupItem | TaskItem | DetailItem;

export class TaskTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private tasks: TaskInfo[] = [];
  private refreshTimer: ReturnType<typeof setInterval>;

  constructor(private getClient: () => EywaClient | undefined) {
    this.refreshTimer = setInterval(() => this._onDidChangeTreeData.fire(), 30_000);
  }

  async seed(): Promise<void> {
    const client = this.getClient();
    if (!client) return;
    this.tasks = await client.getTasks(false);
    this._onDidChangeTreeData.fire();
  }

  handleEvent(mem: MemoryPayload): void {
    if (mem.message_type !== "task") return;
    const meta = (mem.metadata ?? {}) as Record<string, unknown>;

    const existing = this.tasks.find((t) => t.id === mem.id);
    if (existing) {
      const newStatus = ((meta.status as string) || "open") as TaskInfo["status"];
      existing.status = newStatus;
      existing.priority = ((meta.priority as string) || existing.priority) as TaskInfo["priority"];
      existing.assignedTo = (meta.assigned_to as string) || null;
      existing.milestone = (meta.milestone as string) || null;
      existing.blockedReason = (meta.blocked_reason as string) || null;
      existing.title = (meta.title as string) || existing.title;
      existing.ts = mem.ts;

      // Remove done tasks from the list
      if (newStatus === "done") {
        this.tasks = this.tasks.filter((t) => t.id !== mem.id);
      }
    } else {
      const status = ((meta.status as string) || "open") as TaskInfo["status"];
      if (status !== "done") {
        this.tasks.push({
          id: mem.id,
          title: (meta.title as string) || "",
          description: (meta.description as string) || null,
          status,
          priority: ((meta.priority as string) || "normal") as TaskInfo["priority"],
          assignedTo: (meta.assigned_to as string) || null,
          milestone: (meta.milestone as string) || null,
          blockedReason: (meta.blocked_reason as string) || null,
          createdBy: (meta.created_by as string) || mem.agent,
          ts: mem.ts,
        });
      }
    }

    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      // Root: group tasks by status
      const groups: [string, TaskInfo[]][] = [];
      const statusOrder = ["in_progress", "blocked", "open", "claimed"];

      for (const status of statusOrder) {
        const filtered = this.tasks
          .filter((t) => t.status === status)
          .sort((a, b) => {
            const pd = (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2);
            if (pd !== 0) return pd;
            return new Date(b.ts).getTime() - new Date(a.ts).getTime();
          });
        if (filtered.length > 0) {
          groups.push([status, filtered]);
        }
      }

      // If only one group, skip the group header and show tasks directly
      if (groups.length === 1) {
        return groups[0][1].map((t) => new TaskItem(t));
      }

      return groups.map(([status, tasks]) => {
        const group = new StatusGroupItem(status, tasks.length);
        (group as StatusGroupItem & { _tasks: TaskInfo[] })._tasks = tasks;
        return group;
      });
    }

    if (element instanceof StatusGroupItem) {
      const tasks = (element as StatusGroupItem & { _tasks?: TaskInfo[] })._tasks;
      if (tasks) return tasks.map((t) => new TaskItem(t));

      // Fallback: filter from all tasks
      return this.tasks
        .filter((t) => t.status === element.status)
        .map((t) => new TaskItem(t));
    }

    if (element instanceof TaskItem) {
      const t = element.task;
      const children: DetailItem[] = [];

      if (t.assignedTo) {
        children.push(new DetailItem("Assigned to", shortName(t.assignedTo), "person"));
      }
      if (t.milestone) {
        children.push(new DetailItem("Milestone", t.milestone, "target"));
      }
      if (t.description) {
        // Show first 120 chars of description
        children.push(new DetailItem("Description", t.description.slice(0, 120), "comment"));
      }
      if (t.blockedReason) {
        children.push(new DetailItem("Blocked", t.blockedReason.slice(0, 80), "error"));
      }
      children.push(new DetailItem("Created by", shortName(t.createdBy), "person"));
      children.push(new DetailItem("Created", timeAgo(t.ts), "clock"));

      return children;
    }

    return [];
  }

  getActiveCount(): number {
    return this.tasks.filter((t) => t.status !== "done").length;
  }

  dispose(): void {
    clearInterval(this.refreshTimer);
    this._onDidChangeTreeData.dispose();
  }
}
