/**
 * Approval queue tree view for the Eywa VS Code extension.
 * Shows pending approval requests from agents with approve/deny actions.
 */
import * as vscode from "vscode";
import type { EywaClient, ApprovalRequest } from "./client";
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
  return `${hours}h ago`;
}

const RISK_ICONS: Record<string, string> = {
  low: "info",
  medium: "warning",
  high: "flame",
  critical: "error",
};

const RISK_COLORS: Record<string, string> = {
  low: "testing.iconPassed",
  medium: "list.warningForeground",
  high: "list.errorForeground",
  critical: "errorForeground",
};

class ApprovalItem extends vscode.TreeItem {
  constructor(public readonly approval: ApprovalRequest) {
    const name = shortName(approval.agent);
    const riskIcon = RISK_ICONS[approval.riskLevel] || "warning";

    super(
      `${approval.action.slice(0, 60)}`,
      vscode.TreeItemCollapsibleState.Expanded,
    );

    this.description =
      approval.status === "pending"
        ? `${name} - ${timeAgo(approval.ts)}`
        : `${approval.status} by ${approval.resolvedBy || "?"}`;

    const lines = [
      `**Action:** ${approval.action}`,
      `**Agent:** ${approval.agent}`,
      `**Risk:** ${approval.riskLevel}`,
    ];
    if (approval.scope) lines.push(`**Scope:** ${approval.scope}`);
    if (approval.context) lines.push(`**Context:** ${approval.context}`);
    if (approval.status !== "pending") {
      lines.push(`**Status:** ${approval.status}`);
      if (approval.resolvedBy) lines.push(`**Resolved by:** ${approval.resolvedBy}`);
      if (approval.responseMessage) lines.push(`**Message:** ${approval.responseMessage}`);
    }
    lines.push(`**Requested:** ${timeAgo(approval.ts)}`);
    this.tooltip = new vscode.MarkdownString(lines.join("\n\n"));

    this.contextValue =
      approval.status === "pending" ? "pendingApproval" : "resolvedApproval";

    this.iconPath = new vscode.ThemeIcon(
      approval.status === "pending"
        ? riskIcon
        : approval.status === "approved"
          ? "pass-filled"
          : "close",
      new vscode.ThemeColor(
        approval.status === "pending"
          ? RISK_COLORS[approval.riskLevel] || "list.warningForeground"
          : approval.status === "approved"
            ? "testing.iconPassed"
            : "errorForeground",
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

type TreeNode = ApprovalItem | DetailItem;

export class ApprovalTreeProvider
  implements vscode.TreeDataProvider<TreeNode>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    TreeNode | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private approvals: ApprovalRequest[] = [];
  private refreshTimer: ReturnType<typeof setInterval>;

  constructor(private getClient: () => EywaClient | undefined) {
    this.refreshTimer = setInterval(() => this._onDidChangeTreeData.fire(), 30_000);
  }

  async seed(): Promise<void> {
    const client = this.getClient();
    if (!client) return;
    this.approvals = await client.getApprovalRequests();
    this._onDidChangeTreeData.fire();
  }

  handleEvent(mem: MemoryPayload): void {
    if (mem.message_type !== "approval_request") return;
    const meta = (mem.metadata ?? {}) as Record<string, unknown>;

    // Update or add the approval
    const existing = this.approvals.find((a) => a.id === mem.id);
    if (existing) {
      existing.status = ((meta.status as string) || "pending") as ApprovalRequest["status"];
      existing.resolvedBy = (meta.resolved_by as string) || null;
      existing.responseMessage = (meta.response_message as string) || null;
    } else {
      this.approvals.unshift({
        id: mem.id,
        agent: mem.agent,
        action: (meta.action_description as string) || "",
        scope: (meta.scope as string) || null,
        riskLevel: ((meta.risk_level as string) || "medium") as ApprovalRequest["riskLevel"],
        context: (meta.context as string) || null,
        status: ((meta.status as string) || "pending") as ApprovalRequest["status"],
        resolvedBy: (meta.resolved_by as string) || null,
        responseMessage: (meta.response_message as string) || null,
        ts: mem.ts,
      });
    }

    this._onDidChangeTreeData.fire();
  }

  async approveRequest(item: ApprovalItem): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    const message = await vscode.window.showInputBox({
      prompt: "Optional message for the agent",
      placeHolder: "Proceed with caution",
    });

    await client.resolveApproval(
      item.approval.id,
      "approved",
      "vscode-user",
      message || undefined,
    );

    item.approval.status = "approved";
    item.approval.resolvedBy = "vscode-user";
    item.approval.responseMessage = message || null;
    this._onDidChangeTreeData.fire();

    vscode.window.showInformationMessage(
      `Approved: ${item.approval.action.slice(0, 50)}`,
    );
  }

  async denyRequest(item: ApprovalItem): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    const message = await vscode.window.showInputBox({
      prompt: "Reason for denial",
      placeHolder: "Too risky, try a different approach",
    });

    if (message === undefined) return; // cancelled

    await client.resolveApproval(
      item.approval.id,
      "denied",
      "vscode-user",
      message || undefined,
    );

    item.approval.status = "denied";
    item.approval.resolvedBy = "vscode-user";
    item.approval.responseMessage = message || null;
    this._onDidChangeTreeData.fire();

    vscode.window.showInformationMessage(
      `Denied: ${item.approval.action.slice(0, 50)}`,
    );
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      // Pending first, then resolved (most recent first within each group)
      const pending = this.approvals.filter((a) => a.status === "pending");
      const resolved = this.approvals.filter((a) => a.status !== "pending");

      const items: TreeNode[] = [];
      for (const a of pending) items.push(new ApprovalItem(a));
      for (const a of resolved.slice(0, 10)) items.push(new ApprovalItem(a));
      return items;
    }

    if (element instanceof ApprovalItem) {
      const a = element.approval;
      const children: DetailItem[] = [];

      children.push(new DetailItem("Agent", a.agent, "person"));
      children.push(
        new DetailItem("Risk", a.riskLevel.toUpperCase(), RISK_ICONS[a.riskLevel] || "warning"),
      );
      if (a.scope) {
        children.push(new DetailItem("Scope", a.scope, "folder"));
      }
      if (a.context) {
        children.push(new DetailItem("Context", a.context.slice(0, 80), "comment"));
      }
      if (a.status !== "pending") {
        children.push(
          new DetailItem(
            "Decision",
            `${a.status} by ${a.resolvedBy || "?"}`,
            a.status === "approved" ? "pass-filled" : "close",
          ),
        );
        if (a.responseMessage) {
          children.push(new DetailItem("Message", a.responseMessage.slice(0, 80), "quote"));
        }
      }
      children.push(new DetailItem("Requested", timeAgo(a.ts), "clock"));

      return children;
    }

    return [];
  }

  getPendingCount(): number {
    return this.approvals.filter((a) => a.status === "pending").length;
  }

  dispose(): void {
    clearInterval(this.refreshTimer);
    this._onDidChangeTreeData.dispose();
  }
}
