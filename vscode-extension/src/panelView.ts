/**
 * Bottom panel webview: rich agent cards next to terminal tabs.
 * Shows live agent status, progress, systems, and recent actions.
 */
import * as vscode from "vscode";
import type { EywaClient } from "./client";
import type { MemoryPayload } from "./realtime";

interface AgentState {
  agent: string;
  status: "active" | "idle" | "finished";
  task: string;
  lastAction: string;
  lastScope: string;
  lastSystem: string;
  lastContent: string;
  progress: number;
  progressDetail: string;
  systems: Set<string>;
  outcomes: { success: number; failure: number; blocked: number };
  ts: string;
}

function shortName(agent: string): string {
  return agent.includes("/") ? agent.split("/").pop()! : agent;
}

// Pink-magenta spectrum matching web/src/lib/agentColor.ts
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

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h`;
}

export class PanelViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "eywaAgentPanel";
  private view?: vscode.WebviewView;
  private agents = new Map<string, AgentState>();
  private refreshTimer?: ReturnType<typeof setInterval>;

  constructor(private getClient: () => EywaClient | undefined) {}

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = { enableScripts: true };

    // Re-render time-ago labels periodically
    this.refreshTimer = setInterval(() => this.render(), 30_000);
    view.onDidDispose(() => {
      if (this.refreshTimer) clearInterval(this.refreshTimer);
    });

    // Handle inject messages from webview
    view.webview.onDidReceiveMessage((msg) => {
      if (msg.type === "inject") {
        vscode.commands.executeCommand("eywa.injectContext");
      }
    });

    this.render();
  }

  async seed(): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const events = await client.getRecentEvents(since, 300);

    // Process oldest first
    for (const e of events.reverse()) {
      this.processEvent(e.agent, e.metadata, e.ts, e.content);
    }
    this.render();
  }

  handleEvent(mem: MemoryPayload): void {
    this.processEvent(mem.agent, mem.metadata ?? {}, mem.ts, mem.content);
    this.render();
  }

  private processEvent(
    agent: string,
    metadata: Record<string, unknown>,
    ts: string,
    content: string,
  ): void {
    const event = metadata.event as string | undefined;
    const existing = this.agents.get(agent);

    if (event === "session_start") {
      this.agents.set(agent, {
        agent,
        status: "active",
        task: (metadata.task as string) || "",
        lastAction: "",
        lastScope: "",
        lastSystem: "",
        lastContent: "",
        progress: 0,
        progressDetail: "",
        systems: new Set(),
        outcomes: { success: 0, failure: 0, blocked: 0 },
        ts,
      });
      return;
    }

    if (event === "session_done" || event === "session_end") {
      if (existing) {
        existing.status = "finished";
        existing.task = (metadata.summary as string) || existing.task;
        existing.ts = ts;
      }
      return;
    }

    if (event === "progress") {
      if (existing) {
        existing.progress = (metadata.percent as number) ?? existing.progress;
        existing.progressDetail = (metadata.detail as string) || "";
        existing.ts = ts;
      }
      return;
    }

    const scope = metadata.scope as string | undefined;
    const system = metadata.system as string | undefined;
    const action = metadata.action as string | undefined;
    const outcome = metadata.outcome as string | undefined;

    if (existing) {
      if (action) existing.lastAction = action;
      if (scope) existing.lastScope = scope;
      if (system) {
        existing.lastSystem = system;
        existing.systems.add(system);
      }
      if (content) existing.lastContent = content.slice(0, 100);
      if (outcome === "success") existing.outcomes.success++;
      else if (outcome === "failure") existing.outcomes.failure++;
      else if (outcome === "blocked") existing.outcomes.blocked++;
      if (existing.status !== "finished") existing.status = "active";
      existing.ts = ts;
    } else {
      const systems = new Set<string>();
      if (system) systems.add(system);
      this.agents.set(agent, {
        agent,
        status: "active",
        task: "",
        lastAction: action || "",
        lastScope: scope || "",
        lastSystem: system || "",
        lastContent: (content || "").slice(0, 100),
        progress: 0,
        progressDetail: "",
        systems,
        outcomes: {
          success: outcome === "success" ? 1 : 0,
          failure: outcome === "failure" ? 1 : 0,
          blocked: outcome === "blocked" ? 1 : 0,
        },
        ts,
      });
    }
  }

  private render(): void {
    if (!this.view) return;

    // Sort: active first, then by recency. Prune stale (>2h).
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    const agents = [...this.agents.values()]
      .filter((a) => new Date(a.ts).getTime() > cutoff)
      .sort((a, b) => {
        const order = { active: 0, finished: 1, idle: 2 };
        const diff = order[a.status] - order[b.status];
        if (diff !== 0) return diff;
        return new Date(b.ts).getTime() - new Date(a.ts).getTime();
      });

    const cards = agents.map((a) => this.renderCard(a)).join("");

    this.view.webview.html = `<!DOCTYPE html>
<html>
<head>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family, sans-serif);
    font-size: 12px;
    color: var(--vscode-foreground);
    background: var(--vscode-panel-background, transparent);
    padding: 6px 8px;
    overflow-x: auto;
  }
  .agents {
    display: flex;
    gap: 6px;
    align-items: stretch;
    min-height: 48px;
  }
  .card {
    flex: 0 0 auto;
    min-width: 180px;
    max-width: 260px;
    padding: 6px 10px;
    border-radius: 5px;
    border: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.08));
    background: var(--vscode-editor-background, rgba(0,0,0,0.15));
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .card.active { border-left: 2px solid var(--agent-color, #a78bfa); }
  .card.finished { opacity: 0.6; }
  .card.idle { opacity: 0.4; }
  .header {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .dot.active { background: #34d399; }
  .dot.finished { background: #64748b; }
  .dot.idle { background: #475569; }
  .name {
    font-weight: 600;
    font-size: 11px;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .time {
    font-size: 10px;
    opacity: 0.4;
    flex-shrink: 0;
  }
  .task {
    font-size: 11px;
    opacity: 0.7;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .action {
    font-size: 10px;
    opacity: 0.5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .progress-bar {
    height: 2px;
    background: rgba(255,255,255,0.06);
    border-radius: 1px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    border-radius: 1px;
    transition: width 0.5s ease-in-out;
  }
  .systems {
    display: flex;
    gap: 3px;
    flex-wrap: wrap;
  }
  .sys-tag {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 3px;
    background: rgba(139, 92, 246, 0.15);
    color: rgba(255,255,255,0.5);
  }
  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 48px;
    opacity: 0.3;
    font-size: 11px;
  }
</style>
</head>
<body>
  <div class="agents">
    ${cards || '<div class="empty">No agents active</div>'}
  </div>
</body>
</html>`;
  }

  private renderCard(a: AgentState): string {
    const name = shortName(a.agent);
    const color = agentColor(a.agent);
    const ago = timeAgo(a.ts);

    const actionText = a.lastAction
      ? `${a.lastAction}${a.lastScope ? " " + a.lastScope.slice(0, 40) : ""}`
      : a.lastContent.slice(0, 50);

    const systemTags = a.systems.size > 0
      ? `<div class="systems">${[...a.systems].map((s) => `<span class="sys-tag">${s}</span>`).join("")}</div>`
      : "";

    const progressBar = a.progress > 0
      ? `<div class="progress-bar"><div class="progress-fill" style="width:${a.progress}%;background:${color}"></div></div>`
      : "";

    return `<div class="card ${a.status}" style="--agent-color:${color}">
  <div class="header">
    <span class="dot ${a.status}"></span>
    <span class="name" style="color:${color}">${this.esc(name)}</span>
    <span class="time">${ago}</span>
  </div>
  ${a.task ? `<div class="task">${this.esc(a.task.slice(0, 60))}</div>` : ""}
  ${progressBar}
  ${actionText ? `<div class="action">${this.esc(actionText)}</div>` : ""}
  ${systemTags}
</div>`;
  }

  private esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  dispose(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }
}
