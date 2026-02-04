import * as vscode from "vscode";
import type { RemixClient, MemoryEvent } from "./client";

export class NotificationWatcher {
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastCheck: string;
  private seenIds = new Set<string>();

  constructor(private client: RemixClient) {
    // Start checking from now
    this.lastCheck = new Date().toISOString();
  }

  start(): void {
    // Poll every 10 seconds for new events
    this.timer = setInterval(() => this.poll(), 10_000);
    // Do an initial check
    this.poll();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async poll(): Promise<void> {
    const enabled = vscode.workspace.getConfiguration("remix").get<boolean>("notifications", true);
    if (!enabled) return;

    try {
      const events = await this.client.getRecentEvents(this.lastCheck, 20);

      for (const event of events) {
        if (this.seenIds.has(event.id)) continue;
        this.seenIds.add(event.id);

        const meta = event.metadata;
        const eventType = meta.event as string | undefined;

        if (eventType === "session_done") {
          const status = meta.status as string;
          const summary = (meta.summary as string)?.slice(0, 120) ?? "";
          const icon = status === "completed" ? "$(check)" :
                       status === "failed" ? "$(error)" :
                       status === "blocked" ? "$(warning)" : "$(info)";

          const action = status === "failed" || status === "blocked"
            ? vscode.window.showWarningMessage
            : vscode.window.showInformationMessage;

          action(`${icon} ${event.agent} [${status}]: ${summary}`, "Open Dashboard")
            .then((choice) => {
              if (choice === "Open Dashboard") {
                vscode.commands.executeCommand("remix.openDashboard");
              }
            });
        }

        if (eventType === "context_injection") {
          const from = meta.from_agent as string;
          const target = meta.target_agent as string;
          const priority = meta.priority as string;
          const label = meta.label as string | null;
          const prefix = priority === "urgent" ? "$(alert) URGENT: " :
                         priority === "high" ? "$(warning) " : "";

          vscode.window.showInformationMessage(
            `${prefix}${from} injected context${target !== "all" ? ` for ${target}` : ""}${label ? ` (${label})` : ""}`,
          );
        }

        if (eventType === "agent_connected") {
          // Subtle status bar update only, no popup
        }

        if (eventType === "knowledge_stored") {
          const title = meta.title as string | null;
          vscode.window.showInformationMessage(
            `$(book) ${event.agent} stored knowledge${title ? `: ${title}` : ""}`,
          );
        }
      }

      // Advance the checkpoint
      if (events.length > 0) {
        this.lastCheck = events[0].ts;
      }

      // Keep seenIds bounded
      if (this.seenIds.size > 500) {
        const arr = Array.from(this.seenIds);
        this.seenIds = new Set(arr.slice(arr.length - 200));
      }
    } catch {
      // Silently ignore polling errors
    }
  }
}
