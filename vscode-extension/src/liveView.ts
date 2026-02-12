/**
 * Live webview sidebar - unified agents + activity panel.
 * Uses Kurzgesagt-style SVG avatars matching the mini/eink displays.
 */
import * as vscode from "vscode";
import type { EywaClient, DestinationInfo, AgentProgress, AttentionItem, TaskInfo } from "./client";
import type { MemoryPayload } from "./realtime";
import { getAvatarDataUri } from "./avatars";

interface AgentState {
  name: string;
  status: "active" | "idle" | "finished";
  task: string;
  lastSeen: string;
  memoryCount: number;
}

interface ActivityItem {
  id: string;
  agent: string;
  content: string;
  type: string;
  ts: string;
  opTag?: string;
}

/** Which message types pass a given log level filter. */
const LOG_LEVEL_FILTERS: Record<string, Set<string>> = {
  sessions: new Set(["resource"]),
  important: new Set(["resource", "knowledge", "injection"]),
  all: new Set(), // empty = show everything
};

/** Which metadata events pass a given log level. */
const LOG_LEVEL_EVENTS: Record<string, Set<string> | null> = {
  sessions: new Set(["session_start", "session_done", "session_end"]),
  important: new Set(["session_start", "session_done", "session_end", "knowledge_stored", "context_injection", "learned"]),
  all: null,
};

function passesLogFilter(type: string, event: string | undefined, level: string): boolean {
  if (level === "all") return true;
  const typeSet = LOG_LEVEL_FILTERS[level];
  const eventSet = LOG_LEVEL_EVENTS[level];
  if (typeSet && typeSet.has(type)) {
    // For resource type, only pass if event is in allowed events
    if (type === "resource" && eventSet && event && !eventSet.has(event)) return false;
    if (type === "resource" && eventSet && !event) return false;
    return true;
  }
  if (eventSet && event && eventSet.has(event)) return true;
  if (!typeSet?.size) return true; // "all" - show everything
  return typeSet.has(type);
}

export class LiveViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "eywaLive";
  private view?: vscode.WebviewView;
  private agents = new Map<string, AgentState>();
  private activity: ActivityItem[] = [];
  private destination: DestinationInfo | null = null;
  private agentProgress: AgentProgress[] = [];
  private attentionItems: AttentionItem[] = [];
  private tasks: TaskInfo[] = [];
  private getClient: () => EywaClient | undefined;
  private room: string;
  private onAttentionChange?: (items: AttentionItem[]) => void;

  constructor(getClient: () => EywaClient | undefined, room: string) {
    this.getClient = getClient;
    this.room = room;
  }

  /** Register callback for attention count changes (used for badge + notifications). */
  setAttentionListener(cb: (items: AttentionItem[]) => void) {
    this.onAttentionChange = cb;
  }

  getAttentionItems(): AttentionItem[] {
    return this.attentionItems;
  }

  /** Update the view badge (attention count). */
  setBadge(count: number) {
    if (!this.view) return;
    this.view.badge = count > 0
      ? { tooltip: `${count} agent${count === 1 ? "" : "s"} need attention`, value: count }
      : undefined;
  }

  setRoom(room: string) {
    this.room = room;
    this.agents.clear();
    this.activity = [];
    this.destination = null;
    this.agentProgress = [];
    this.attentionItems = [];
    this.tasks = [];
    this.postMessage({ type: "loading", room });
    this.loadInitial();
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.getHtml();

    view.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "setRoom") vscode.commands.executeCommand("eywa.setRoom");
      else if (msg.type === "inject") {
        if (msg.targetAgent) {
          // Quick inject to a specific agent from detail panel
          const client = this.getClient();
          if (!client) return;
          const content = await vscode.window.showInputBox({
            prompt: `Inject context to ${msg.targetAgent}`,
            placeHolder: "Context or instructions...",
          });
          if (!content) return;
          await client.inject("vscode-user", msg.targetAgent, content, "normal");
          vscode.window.showInformationMessage(`Injected to ${msg.targetAgent}`);
        } else {
          vscode.commands.executeCommand("eywa.injectContext");
        }
      }
      else if (msg.type === "openDashboard") vscode.commands.executeCommand("eywa.openDashboard");
      else if (msg.type === "refresh") this.loadInitial();
      else if (msg.type === "attentionReply") {
        // Inline reply to an agent needing attention
        const client = this.getClient();
        if (!client || !msg.agent || !msg.content) return;
        await client.inject("vscode-user", msg.agent, msg.content, "high");
        // Remove the attention item after reply
        this.attentionItems = this.attentionItems.filter((a) => a.agent !== msg.agent);
        this.onAttentionChange?.(this.attentionItems);
        this.pushState();
        vscode.window.showInformationMessage(`Sent to ${msg.agent}`);
      } else if (msg.type === "attentionDismiss") {
        // Dismiss an attention item
        this.attentionItems = this.attentionItems.filter((a) => a.agent !== msg.agent);
        this.onAttentionChange?.(this.attentionItems);
        this.pushState();
      }
    });

    // Re-push state when sidebar becomes visible again
    view.onDidChangeVisibility(() => {
      if (view.visible) {
        if (this.agents.size > 0 || this.activity.length > 0) {
          this.pushState();
        } else {
          this.loadInitial();
        }
      }
    });

    this.loadInitial();
  }

  async loadInitial() {
    const client = this.getClient();
    if (!client) {
      this.postMessage({ type: "noRoom" });
      return;
    }

    try {
      // Load destination, progress, and attention items in parallel with sessions
      const [sessionMap, dest, prog, attention, tasks] = await Promise.all([
        client.getSessions(),
        client.getDestination(),
        client.getAgentProgress(),
        client.getAttentionItems(),
        client.getTasks(),
      ]);
      this.destination = dest;
      this.agentProgress = prog;
      this.attentionItems = attention;
      this.tasks = tasks;
      this.onAttentionChange?.(this.attentionItems);
      this.agents.clear();
      for (const [, sessions] of sessionMap) {
        for (const s of sessions) {
          // Keep the most recent session per agent
          if (!this.agents.has(s.agent) || new Date(s.lastSeen) > new Date(this.agents.get(s.agent)!.lastSeen)) {
            this.agents.set(s.agent, {
              name: s.agent,
              status: s.status,
              task: s.task,
              lastSeen: s.lastSeen,
              memoryCount: s.memoryCount,
            });
          }
        }
      }

      // Load recent activity (respecting history depth and log level)
      const historyHours = vscode.workspace.getConfiguration("eywa").get<number>("historyHours") ?? 24;
      const logLevel = vscode.workspace.getConfiguration("eywa").get<string>("logLevel") ?? "all";
      const since = new Date(Date.now() - historyHours * 60 * 60 * 1000).toISOString();
      const events = await client.getRecentEvents(since, 50);
      this.activity = events
        .filter((e) => {
          const event = (e.metadata?.event as string) || undefined;
          return passesLogFilter(e.message_type, event, logLevel);
        })
        .slice(0, 40)
        .map((e) => {
          const opParts = [e.metadata?.system, e.metadata?.action, e.metadata?.outcome].filter(Boolean);
          return {
            id: e.id,
            agent: e.agent,
            content: e.content.slice(0, 150),
            type: e.message_type,
            ts: e.ts,
            opTag: opParts.length ? opParts.join(":") : undefined,
          };
        });

      this.pushState();
    } catch (err) {
      this.postMessage({ type: "error", message: "Could not connect to room" });
    }
  }

  handleEvent(mem: MemoryPayload) {
    const meta = mem.metadata ?? {};
    const event = meta.event as string | undefined;

    // Real-time attention detection
    if (event === "distress" || event === "checkpoint" ||
        (event === "progress" && (meta.status as string) === "blocked") ||
        event === "session_done" || event === "session_end") {

      const reason = event === "distress" ? "distress" as const
        : event === "checkpoint" ? "checkpoint" as const
        : (meta.status as string) === "blocked" ? "blocked" as const
        : "stopped" as const;

      const urgencyMap = { distress: 4, blocked: 3, stopped: 2, checkpoint: 1, idle: 0 };

      // Replace existing item for same agent+reason, or add new
      const existing = this.attentionItems.findIndex(
        (a) => a.agent === mem.agent && a.reason === reason,
      );
      const item = {
        agent: mem.agent,
        reason,
        summary: ((meta.remaining as string) || (meta.summary as string) || (meta.detail as string) || (meta.task as string) || "Needs attention").slice(0, 150),
        ts: mem.ts,
        sessionId: mem.session_id,
        urgency: urgencyMap[reason],
      };

      if (existing >= 0) {
        this.attentionItems[existing] = item;
      } else {
        this.attentionItems.push(item);
      }

      // Re-sort
      this.attentionItems.sort((a, b) => {
        if (a.urgency !== b.urgency) return b.urgency - a.urgency;
        return new Date(b.ts).getTime() - new Date(a.ts).getTime();
      });

      this.onAttentionChange?.(this.attentionItems);
    }

    // If an agent starts a new session, clear their attention items
    if (event === "session_start") {
      const hadItems = this.attentionItems.some((a) => a.agent === mem.agent);
      this.attentionItems = this.attentionItems.filter((a) => a.agent !== mem.agent);
      if (hadItems) this.onAttentionChange?.(this.attentionItems);
    }

    // Update destination if a new one comes in
    if (event === "destination" && mem.message_type === "knowledge") {
      const dest = meta as Record<string, unknown>;
      this.destination = {
        destination: (dest.destination as string) || "",
        milestones: (dest.milestones as string[]) || [],
        progress: (dest.progress as Record<string, boolean>) || {},
        notes: (dest.notes as string) || null,
        setBy: (dest.set_by as string) || mem.agent,
        ts: mem.ts,
      };
    }

    // Update progress
    if (event === "progress") {
      const existing = this.agentProgress.findIndex((p) => p.agent === mem.agent);
      const prog = {
        agent: mem.agent,
        percent: (meta.percent as number) ?? 0,
        status: (meta.status as string) || "working",
        detail: (meta.detail as string) || null,
        task: (meta.task as string) || "",
        ts: mem.ts,
      };
      if (existing >= 0) {
        this.agentProgress[existing] = prog;
      } else {
        this.agentProgress.push(prog);
      }
    }

    // Update tasks in real-time
    if (event === "task" || mem.message_type === "task") {
      const taskMeta = meta as Record<string, unknown>;
      const taskId = mem.id;
      const status = (taskMeta.status as string) || "open";
      const existing = this.tasks.findIndex((t) => t.id === taskId);
      const taskItem = {
        id: taskId,
        title: (taskMeta.title as string) || "",
        description: (taskMeta.description as string) || null,
        status: status as TaskInfo["status"],
        priority: ((taskMeta.priority as string) || "normal") as TaskInfo["priority"],
        assignedTo: (taskMeta.assigned_to as string) || null,
        milestone: (taskMeta.milestone as string) || null,
        blockedReason: (taskMeta.blocked_reason as string) || null,
        createdBy: (taskMeta.created_by as string) || mem.agent,
        ts: mem.ts,
      };

      if (status === "done") {
        // Remove done tasks from the list
        if (existing >= 0) this.tasks.splice(existing, 1);
      } else if (existing >= 0) {
        this.tasks[existing] = taskItem;
      } else {
        this.tasks.push(taskItem);
      }

      // Re-sort by priority
      const pOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
      this.tasks.sort((a, b) => {
        const pd = (pOrder[a.priority] ?? 2) - (pOrder[b.priority] ?? 2);
        if (pd !== 0) return pd;
        return new Date(b.ts).getTime() - new Date(a.ts).getTime();
      });
    }

    // Update agent state
    if (event === "session_start") {
      this.agents.set(mem.agent, {
        name: mem.agent,
        status: "active",
        task: (meta.task as string) || "",
        lastSeen: mem.ts,
        memoryCount: 1,
      });
    } else if (event === "session_done" || event === "session_end") {
      const existing = this.agents.get(mem.agent);
      if (existing) {
        existing.status = "finished";
        existing.task = (meta.summary as string) || existing.task;
        existing.lastSeen = mem.ts;
      }
    } else if (this.agents.has(mem.agent)) {
      const a = this.agents.get(mem.agent)!;
      a.lastSeen = mem.ts;
      a.memoryCount++;
    }

    // Add to activity feed (filtered by log level)
    const logLevel = vscode.workspace.getConfiguration("eywa").get<string>("logLevel") ?? "all";
    if (passesLogFilter(mem.message_type || "assistant", event, logLevel)) {
      const opParts = [meta.system, meta.action, meta.outcome].filter(Boolean);
      this.activity.unshift({
        id: mem.id,
        agent: mem.agent,
        content: (mem.content || "").slice(0, 150),
        type: mem.message_type || "assistant",
        ts: mem.ts,
        opTag: opParts.length ? (opParts as string[]).join(":") : undefined,
      });
      if (this.activity.length > 40) this.activity.length = 40;
    }

    this.pushState();
  }

  private pushState() {
    const sorted = [...this.agents.values()].sort((a, b) => {
      const order = { active: 0, idle: 1, finished: 2 };
      const diff = order[a.status] - order[b.status];
      if (diff !== 0) return diff;
      return b.lastSeen.localeCompare(a.lastSeen);
    });

    // Compute avatar data URIs on the extension host side
    const avatarMap: Record<string, string> = {};
    for (const a of sorted) {
      if (!avatarMap[a.name]) avatarMap[a.name] = getAvatarDataUri(a.name);
    }
    for (const ev of this.activity) {
      if (!avatarMap[ev.agent]) avatarMap[ev.agent] = getAvatarDataUri(ev.agent);
    }

    this.postMessage({
      type: "state",
      agents: sorted,
      activity: this.activity,
      room: this.room,
      avatars: avatarMap,
      destination: this.destination,
      agentProgress: this.agentProgress,
      attention: this.attentionItems,
      tasks: this.tasks,
    });
  }

  private postMessage(msg: unknown) {
    this.view?.webview.postMessage(msg);
  }

  private getHtml(): string {
    return /*html*/ `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: transparent;
  }

  .header {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  .logo { width: 20px; height: 20px; flex-shrink: 0; opacity: 0.7; }
  .logo path, .logo rect { fill: var(--vscode-foreground); }
  .header-room {
    flex: 1; min-width: 0;
    font-weight: 600; font-size: 12px;
    cursor: pointer; opacity: 0.9;
  }
  .header-room:hover { opacity: 1; text-decoration: underline; }
  .header-meta { font-size: 10px; opacity: 0.4; font-weight: 400; margin-left: 4px; }
  .header-actions { display: flex; gap: 2px; flex-shrink: 0; }
  .ibtn {
    background: none; border: none; color: var(--vscode-foreground);
    opacity: 0.4; cursor: pointer; width: 22px; height: 22px;
    display: flex; align-items: center; justify-content: center; border-radius: 3px;
  }
  .ibtn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
  .ibtn svg { width: 14px; height: 14px; }

  /* Agent topology map */
  .agent-topo {
    border-bottom: 1px solid var(--vscode-panel-border);
    overflow: hidden;
  }
  .agent-topo canvas { display: block; width: 100%; cursor: pointer; }
  .topo-legend {
    display: flex; align-items: center; gap: 6px;
    padding: 3px 10px 5px; font-size: 9px; opacity: 0.35;
  }
  .topo-dot {
    width: 5px; height: 5px; border-radius: 50%;
    display: inline-block; margin-left: 6px;
  }
  .topo-dot:first-child { margin-left: 0; }

  /* Activity feed */
  .feed-header {
    padding: 8px 12px 4px; font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.4;
  }
  .feed { padding: 0 8px 8px; }
  .feed-item {
    display: flex; gap: 6px; padding: 4px 4px;
    border-radius: 3px; align-items: flex-start;
  }
  .feed-item:hover { background: var(--vscode-list-hoverBackground); }
  .feed-avatar {
    width: 16px; height: 16px; border-radius: 50%;
    flex-shrink: 0; margin-top: 1px;
  }
  .feed-body { flex: 1; min-width: 0; }
  .feed-agent { font-size: 10px; font-weight: 600; opacity: 0.8; }
  .feed-type {
    display: inline-block; width: 6px; height: 6px; border-radius: 50%;
    margin-left: 4px; vertical-align: middle;
  }
  .feed-text {
    font-size: 11px; opacity: 0.65; margin-top: 1px;
    display: -webkit-box; -webkit-line-clamp: 2;
    -webkit-box-orient: vertical; overflow: hidden;
    line-height: 1.35;
    cursor: pointer;
  }
  .feed-text.expanded {
    -webkit-line-clamp: unset; display: block;
  }
  .feed-time { font-size: 9px; opacity: 0.3; margin-top: 2px; }

  /* Agent detail panel (shown below strip on click) */
  .agent-detail {
    padding: 8px 12px;
    border-bottom: 1px solid var(--vscode-panel-border);
    background: var(--vscode-editor-background);
    display: flex; gap: 8px; align-items: flex-start;
  }
  .agent-detail .detail-avatar { width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; }
  .agent-detail .detail-body { flex: 1; min-width: 0; }
  .agent-detail .detail-name { font-size: 12px; font-weight: 600; }
  .agent-detail .detail-status {
    display: inline-block; font-size: 9px; padding: 1px 5px; border-radius: 3px;
    margin-left: 6px; text-transform: uppercase; letter-spacing: 0.3px;
  }
  .agent-detail .detail-status.active { background: rgba(63,185,80,0.15); color: #3fb950; }
  .agent-detail .detail-status.idle { background: rgba(210,153,34,0.15); color: #d29922; }
  .agent-detail .detail-status.finished { background: rgba(139,148,158,0.15); color: #8b949e; }
  .agent-detail .detail-task { font-size: 11px; opacity: 0.7; margin-top: 3px; line-height: 1.35; }
  .agent-detail .detail-progress {
    margin-top: 4px; height: 3px; background: rgba(128,128,128,0.15);
    border-radius: 2px; overflow: hidden;
  }
  .agent-detail .detail-progress-fill { height: 100%; border-radius: 2px; }
  .agent-detail .detail-meta { font-size: 10px; opacity: 0.4; margin-top: 3px; }
  .agent-detail .detail-actions { display: flex; gap: 4px; margin-top: 5px; }
  .agent-detail .detail-btn {
    font-size: 10px; padding: 2px 8px; border-radius: 3px; cursor: pointer;
    border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3));
    background: transparent; color: var(--vscode-foreground); font-family: inherit;
  }
  .agent-detail .detail-btn:hover { background: var(--vscode-toolbar-hoverBackground); }

  /* States */
  .state-msg { text-align: center; padding: 32px 16px; }
  .state-msg .state-icon { width: 36px; height: 36px; margin: 0 auto 10px; opacity: 0.2; }
  .state-msg .state-icon path, .state-msg .state-icon rect { fill: var(--vscode-foreground); }
  .state-msg p { opacity: 0.5; font-size: 12px; line-height: 1.5; margin-bottom: 10px; }
  .btn {
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    border: none; padding: 5px 14px; border-radius: 4px;
    cursor: pointer; font-size: 12px; font-family: inherit;
  }
  .btn:hover { background: var(--vscode-button-hoverBackground); }
  .spinner {
    width: 14px; height: 14px; border: 2px solid var(--vscode-foreground);
    border-top-color: transparent; border-radius: 50%;
    animation: spin 0.8s linear infinite; opacity: 0.3; margin: 0 auto 8px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes mascot-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-1px); } }
  .mascot-wrap svg { animation: mascot-bob 2s ease-in-out infinite; }

  /* Attention section */
  @keyframes attn-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.7; } }
  .attn-section {
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  .attn-header {
    display: flex; align-items: center; gap: 6px;
    padding: 8px 12px 4px; font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.5px;
    color: #f85149;
  }
  .attn-badge {
    background: #f85149; color: #fff; font-size: 9px; font-weight: 700;
    padding: 1px 5px; border-radius: 8px; min-width: 16px; text-align: center;
  }
  .attn-item {
    padding: 6px 12px; display: flex; flex-direction: column; gap: 4px;
    border-left: 3px solid transparent;
    transition: background 0.15s ease-in-out;
  }
  .attn-item:hover { background: var(--vscode-list-hoverBackground); }
  .attn-item.distress { border-left-color: #f85149; animation: attn-pulse 2s ease-in-out infinite; }
  .attn-item.blocked { border-left-color: #d29922; }
  .attn-item.stopped { border-left-color: #8b949e; }
  .attn-item.checkpoint { border-left-color: #58a6ff; }
  .attn-top {
    display: flex; align-items: center; gap: 6px;
  }
  .attn-avatar {
    width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0;
  }
  .attn-agent { font-size: 11px; font-weight: 600; flex: 1; min-width: 0; }
  .attn-reason {
    font-size: 9px; font-weight: 600; padding: 1px 5px; border-radius: 3px;
    text-transform: uppercase; letter-spacing: 0.3px; flex-shrink: 0;
  }
  .attn-reason.distress { background: rgba(248,81,73,0.15); color: #f85149; }
  .attn-reason.blocked { background: rgba(210,153,34,0.15); color: #d29922; }
  .attn-reason.stopped { background: rgba(139,148,158,0.15); color: #8b949e; }
  .attn-reason.checkpoint { background: rgba(88,166,255,0.15); color: #58a6ff; }
  .attn-dismiss {
    background: none; border: none; color: var(--vscode-foreground);
    opacity: 0.3; cursor: pointer; font-size: 14px; line-height: 1; padding: 0 2px;
  }
  .attn-dismiss:hover { opacity: 0.8; }
  .attn-summary { font-size: 10px; opacity: 0.6; line-height: 1.3; }
  .attn-reply-row {
    display: flex; gap: 4px; align-items: center; margin-top: 2px;
  }
  .attn-input {
    flex: 1; background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3));
    border-radius: 3px; padding: 3px 6px; font-size: 11px;
    font-family: var(--vscode-font-family); outline: none;
  }
  .attn-input:focus { border-color: var(--vscode-focusBorder); }
  .attn-input::placeholder { opacity: 0.4; }
  .attn-send {
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    border: none; border-radius: 3px; padding: 3px 8px; font-size: 10px;
    cursor: pointer; font-weight: 600; font-family: inherit; white-space: nowrap;
  }
  .attn-send:hover { background: var(--vscode-button-hoverBackground); }

  /* Task queue */
  .tasks-section { border-bottom: 1px solid var(--vscode-panel-border); }
  .tasks-header {
    display: flex; align-items: center; gap: 6px;
    padding: 8px 12px 4px; font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.4;
  }
  .tasks-count {
    background: rgba(128,128,128,0.15); font-size: 9px; font-weight: 600;
    padding: 1px 5px; border-radius: 8px; min-width: 16px; text-align: center;
  }
  .task-item {
    padding: 5px 12px; display: flex; align-items: flex-start; gap: 6px;
    transition: background 0.15s ease-in-out;
  }
  .task-item:hover { background: var(--vscode-list-hoverBackground); }
  .task-priority {
    font-size: 8px; font-weight: 700; padding: 1px 4px; border-radius: 2px;
    text-transform: uppercase; letter-spacing: 0.3px; flex-shrink: 0; margin-top: 1px;
  }
  .task-priority.urgent { background: rgba(248,81,73,0.2); color: #f85149; }
  .task-priority.high { background: rgba(210,153,34,0.2); color: #d29922; }
  .task-priority.normal { background: rgba(139,148,158,0.12); color: #8b949e; }
  .task-priority.low { background: rgba(139,148,158,0.08); color: #64748b; }
  .task-body { flex: 1; min-width: 0; }
  .task-title { font-size: 11px; line-height: 1.3; }
  .task-meta { font-size: 9px; opacity: 0.4; margin-top: 2px; }
  .task-status {
    font-size: 8px; font-weight: 600; padding: 1px 4px; border-radius: 2px;
    text-transform: uppercase; flex-shrink: 0; margin-top: 1px;
  }
  .task-status.open { background: rgba(88,166,255,0.15); color: #58a6ff; }
  .task-status.claimed { background: rgba(139,92,246,0.15); color: #a78bfa; }
  .task-status.in_progress { background: rgba(63,185,80,0.15); color: #3fb950; }
  .task-status.blocked { background: rgba(210,153,34,0.15); color: #d29922; }
</style>
</head>
<body>
<div id="root"></div>
<script>
const vscode = acquireVsCodeApi();
const root = document.getElementById('root');

const TYPE_COLORS = {
  assistant:'#339AF0', user:'#51CF66', tool_call:'#FF922B', tool_result:'#FCC419',
  injection:'#E64980', knowledge:'#CC5DE8', resource:'#22B8CF',
};

function shortName(agent) {
  const slash = agent.indexOf('/');
  return slash >= 0 ? agent.slice(slash + 1) : agent;
}

function timeAgo(ts) {
  const d = Date.now() - new Date(ts).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'now';
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  return Math.floor(h / 24) + 'd';
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

let selectedAgent = null;
let lastData = null;

function selectAgent(name) {
  selectedAgent = selectedAgent === name ? null : name;
  if (lastData) render(lastData);
}

function toggleFeedItem(el) {
  el.classList.toggle('expanded');
}

function sendAttn(input) {
  const agent = input.dataset.agent;
  const content = input.value.trim();
  if (!content) return;
  vscode.postMessage({ type: 'attentionReply', agent: agent, content: content });
  input.value = '';
  input.placeholder = 'Sent!';
  input.disabled = true;
  setTimeout(() => { input.disabled = false; input.placeholder = 'Reply...'; }, 1500);
}

function dismissAttn(agent) {
  vscode.postMessage({ type: 'attentionDismiss', agent: agent });
}

// Topology map state
var topoLanes = [];
var topoAnimId = 0;

function drawTopology(canvas, agents, progressMap, destination) {
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;
  var dpr = window.devicePixelRatio || 1;
  var W = canvas.clientWidth;
  var H = canvas.clientHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  var LEFT = 70, RIGHT = W - 20, TOP = 10, BOTTOM = H - 10;
  var LANE_W = RIGHT - LEFT;
  var fg = getComputedStyle(document.documentElement).getPropertyValue('--vscode-foreground').trim() || '#ccc';

  // Sort: active first, then finished, then idle
  var sorted = agents.slice().sort(function(a, b) {
    var order = { active: 0, finished: 1, idle: 2 };
    return (order[a.status] || 2) - (order[b.status] || 2);
  });

  var lineH = 14;
  var maxLanes = Math.max(1, Math.floor((BOTTOM - TOP) / lineH));
  var visible = sorted.slice(0, maxLanes);

  // Build lanes
  topoLanes = [];
  for (var i = 0; i < visible.length; i++) {
    var a = visible[i];
    var color = a.status === 'active' ? '#8b5cf6' : a.status === 'finished' ? '#6ee7b7' : '#64748b';
    var jitter = ((hashStr(a.name) % 100) / 100) * 0.06;
    var gp = progressMap[a.name];
    var progress;
    if (gp && gp.percent > 0) {
      progress = gp.percent / 100;
    } else if (a.status === 'active') {
      progress = 0.55 + jitter;
    } else if (a.status === 'finished') {
      progress = 0.92 + jitter * 0.5;
    } else {
      progress = 0.08 + jitter * 2;
    }
    var y = TOP + i * lineH + lineH / 2;
    topoLanes.push({ agent: a, color: color, progress: progress, y: y });
  }

  var t = 0;
  cancelAnimationFrame(topoAnimId);

  function frame() {
    t += 0.004;
    ctx.clearRect(0, 0, W, H);

    // Draw lanes
    for (var li = 0; li < topoLanes.length; li++) {
      var lane = topoLanes[li];
      var y = lane.y;
      var x1 = LEFT + lane.progress * LANE_W;
      var sel = selectedAgent === lane.agent.name;

      // Agent name (right-aligned)
      var sn = shortName(lane.agent.name);
      if (sn.length > 10) sn = sn.slice(0, 9) + '..';
      ctx.font = (sel ? '600 ' : '') + '9px var(--vscode-font-family, sans-serif)';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = fg;
      ctx.globalAlpha = lane.agent.status === 'active' ? 0.8 : (sel ? 0.6 : 0.3);
      ctx.fillText(sn, LEFT - 6, y);
      ctx.globalAlpha = 1;

      // Trace line
      ctx.strokeStyle = lane.color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.moveTo(LEFT, y);
      ctx.lineTo(RIGHT, y);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Filled portion
      if (lane.progress > 0.01) {
        ctx.strokeStyle = lane.color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.moveTo(LEFT, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Dot
      var r = lane.agent.status === 'active' ? 3.5 : lane.agent.status === 'finished' ? 2.5 : 2;
      if (sel) r += 1.5;
      ctx.fillStyle = lane.color;
      ctx.beginPath();
      ctx.arc(x1, y, r, 0, Math.PI * 2);
      ctx.fill();

      // Pulse for active
      if (lane.agent.status === 'active') {
        var pulse = 0.3 + 0.7 * Math.abs(Math.sin(t * 3 + y * 0.1));
        ctx.strokeStyle = lane.color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = pulse * 0.3;
        ctx.beginPath();
        ctx.arc(x1, y, r + 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Selection ring
      if (sel) {
        ctx.strokeStyle = lane.color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(x1, y, r + 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Destination bar on right
    if (destination && destination.milestones) {
      var ms = destination.milestones;
      var prog = destination.progress || {};
      var done = 0;
      for (var mi = 0; mi < ms.length; mi++) { if (prog[ms[mi]]) done++; }
      var pct = ms.length > 0 ? done / ms.length : 0;
      var barH = BOTTOM - TOP;
      var barX = RIGHT + 2;
      ctx.fillStyle = 'rgba(139, 92, 246, 0.12)';
      ctx.fillRect(barX, TOP, 3, barH);
      ctx.fillStyle = pct === 1 ? '#34d399' : '#8b5cf6';
      ctx.fillRect(barX, BOTTOM - barH * pct, 3, barH * pct);
    }

    // Overflow label
    if (sorted.length > maxLanes) {
      ctx.fillStyle = fg;
      ctx.globalAlpha = 0.2;
      ctx.font = '8px var(--vscode-font-family, sans-serif)';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('+' + (sorted.length - maxLanes) + ' more', LEFT - 6, H - 2);
      ctx.globalAlpha = 1;
    }

    topoAnimId = requestAnimationFrame(frame);
  }
  frame();
}

function topoClick(e) {
  var canvas = e.target;
  var rect = canvas.getBoundingClientRect();
  var y = e.clientY - rect.top;
  var closest = null, bestDist = 999;
  for (var i = 0; i < topoLanes.length; i++) {
    var d = Math.abs(topoLanes[i].y - y);
    if (d < bestDist) { bestDist = d; closest = topoLanes[i]; }
  }
  if (closest && bestDist < 10) {
    selectAgent(closest.agent.name);
  } else {
    selectAgent(null);
  }
}

function hashStr(s) {
  var h = 0;
  for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const LOGO = '<svg class="logo" viewBox="0 0 250 250" fill="none"><path d="M116 124.524C116 110.47 128.165 99.5067 142.143 100.963L224.55 109.547C232.478 110.373 238.5 117.055 238.5 125.025C238.5 133.067 232.372 139.785 224.364 140.522L141.858 148.112C127.977 149.389 116 138.463 116 124.524Z"/><path d="M120.76 120.274C134.535 120.001 145.285 132.097 143.399 145.748L131.891 229.05C131.094 234.817 126.162 239.114 120.341 239.114C114.442 239.114 109.478 234.703 108.785 228.845L98.9089 145.354C97.351 132.184 107.5 120.536 120.76 120.274Z"/><path d="M122.125 5.51834C128.648 5.51832 134.171 10.3232 135.072 16.7832L147.586 106.471C149.482 120.063 139.072 132.267 125.35 132.538C111.847 132.805 101.061 121.382 102.1 107.915L109.067 17.6089C109.593 10.7878 115.284 5.51835 122.125 5.51834Z"/><path d="M12 126.211C12 117.753 18.3277 110.632 26.7274 109.638L95.0607 101.547C109.929 99.787 123 111.402 123 126.374V128.506C123 143.834 109.333 155.552 94.1845 153.213L26.1425 142.706C18.005 141.449 12 134.445 12 126.211Z"/><rect width="69.09" height="37.63" rx="18.81" transform="matrix(-0.682 -0.731 0.715 -0.7 165.13 184.31)"/><rect width="69.09" height="37.47" rx="18.73" transform="matrix(-0.682 0.731 -0.714 -0.7 182.38 88.9)"/><rect width="75.28" height="37.98" rx="18.99" transform="matrix(0.679 0.734 -0.717 0.697 95.87 64.43)"/><rect width="71.22" height="41.64" rx="20.82" transform="matrix(0.799 -0.601 0.583 0.813 55 149.83)"/></svg>';

function render(data) {
  if (!data) {
    root.innerHTML = '<div class="state-msg">'
      + '<svg class="state-icon" viewBox="0 0 250 250" fill="none"><path d="M116 124.524C116 110.47 128.165 99.5067 142.143 100.963L224.55 109.547C232.478 110.373 238.5 117.055 238.5 125.025C238.5 133.067 232.372 139.785 224.364 140.522L141.858 148.112C127.977 149.389 116 138.463 116 124.524Z"/><path d="M120.76 120.274C134.535 120.001 145.285 132.097 143.399 145.748L131.891 229.05C131.094 234.817 126.162 239.114 120.341 239.114C114.442 239.114 109.478 234.703 108.785 228.845L98.9089 145.354C97.351 132.184 107.5 120.536 120.76 120.274Z"/><path d="M122.125 5.51834C128.648 5.51832 134.171 10.3232 135.072 16.7832L147.586 106.471C149.482 120.063 139.072 132.267 125.35 132.538C111.847 132.805 101.061 121.382 102.1 107.915L109.067 17.6089C109.593 10.7878 115.284 5.51835 122.125 5.51834Z"/><path d="M12 126.211C12 117.753 18.3277 110.632 26.7274 109.638L95.0607 101.547C109.929 99.787 123 111.402 123 126.374V128.506C123 143.834 109.333 155.552 94.1845 153.213L26.1425 142.706C18.005 141.449 12 134.445 12 126.211Z"/><rect width="69.09" height="37.63" rx="18.81" transform="matrix(-0.682 -0.731 0.715 -0.7 165.13 184.31)"/><rect width="69.09" height="37.47" rx="18.73" transform="matrix(-0.682 0.731 -0.714 -0.7 182.38 88.9)"/><rect width="75.28" height="37.98" rx="18.99" transform="matrix(0.679 0.734 -0.717 0.697 95.87 64.43)"/><rect width="71.22" height="41.64" rx="20.82" transform="matrix(0.799 -0.601 0.583 0.813 55 149.83)"/></svg>'
      + '<p>Set a room to start<br>monitoring your agents.</p>'
      + '<button class="btn" onclick="vscode.postMessage({type:\\'setRoom\\'})">Set Room</button></div>';
    return;
  }

  lastData = data;
  const { agents, activity, room, avatars, destination, agentProgress, attention, tasks } = data;
  const active = agents.filter(a => a.status === 'active').length;
  const progressMap = {};
  if (agentProgress) {
    for (const p of agentProgress) progressMap[p.agent] = p;
  }
  const attnItems = attention || [];

  // Header
  let html = '<div class="header">' + LOGO
    + '<div class="header-room" onclick="vscode.postMessage({type:\\'setRoom\\'})" title="Switch room">/' + esc(room)
    + '<span class="header-meta">' + (active > 0 ? active + ' active' : '') + '</span></div>'
    + '<div class="header-actions">'
    + '<button class="ibtn" onclick="vscode.postMessage({type:\\'refresh\\'})" title="Refresh"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M13 3a8 8 0 00-11 0l1 1a6.5 6.5 0 019 0L11 5h4V1l-2 2zM3 13a8 8 0 0011 0l-1-1a6.5 6.5 0 01-9 0L5 11H1v4l2-2z"/></svg></button>'
    + '<button class="ibtn" onclick="vscode.postMessage({type:\\'inject\\'})" title="Inject context"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M10.5 3L14 8l-3.5 5h-2l3-4.5H2V7.5h9.5l-3-4.5h2z"/></svg></button>'
    + '<button class="ibtn" onclick="vscode.postMessage({type:\\'openDashboard\\'})" title="Web dashboard"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 1h13l.5.5v13l-.5.5h-13l-.5-.5v-13l.5-.5zM2 5v9h12V5H2zm0-1h12V2H2v2z"/></svg></button>'
    + '</div></div>';

  // Attention section (agents that need your input)
  if (attnItems.length > 0) {
    html += '<div class="attn-section">';
    html += '<div class="attn-header"><span>Needs You</span><span class="attn-badge">' + attnItems.length + '</span></div>';
    for (const a of attnItems) {
      const src = avatars[a.agent] || '';
      const sn = shortName(a.agent);
      html += '<div class="attn-item ' + a.reason + '">';
      html += '<div class="attn-top">';
      html += '<img class="attn-avatar" src="' + src + '" alt=""/>';
      html += '<span class="attn-agent">' + esc(sn) + '</span>';
      html += '<span class="attn-reason ' + a.reason + '">' + esc(a.reason) + '</span>';
      html += '<button class="attn-dismiss" onclick="dismissAttn(\\'' + esc(a.agent).replace(/'/g, "\\\\'") + '\\')" title="Dismiss">&times;</button>';
      html += '</div>';
      html += '<div class="attn-summary">' + esc(a.summary) + '</div>';
      html += '<div class="attn-reply-row">';
      html += '<input class="attn-input" data-agent="' + esc(a.agent) + '" placeholder="Reply to ' + esc(sn) + '..." onkeydown="if(event.key===\\'Enter\\')sendAttn(this)"/>';
      html += '<button class="attn-send" onclick="sendAttn(this.previousElementSibling)">Send</button>';
      html += '</div>';
      html += '</div>';
    }
    html += '</div>';
  }

  // Destination banner
  if (destination && destination.destination) {
    const ms = destination.milestones || [];
    const prog = destination.progress || {};
    const done = ms.filter(m => prog[m]).length;
    const total = ms.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    html += '<div style="padding:8px 12px;border-bottom:1px solid var(--vscode-panel-border)">';
    html += '<div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;opacity:0.5;margin-bottom:4px">Destination</div>';
    html += '<div style="font-size:11px;font-weight:600;margin-bottom:4px;line-height:1.3">' + esc(destination.destination).slice(0, 200) + '</div>';

    if (total > 0) {
      html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">';
      html += '<div style="flex:1;height:3px;background:rgba(128,128,128,0.2);border-radius:2px;overflow:hidden">';
      html += '<div style="width:' + pct + '%;height:100%;background:' + (pct === 100 ? '#3fb950' : '#7946FF') + ';border-radius:2px;transition:width 0.5s ease-in-out"></div>';
      html += '</div>';
      html += '<span style="font-size:10px;font-weight:600;opacity:0.7">' + done + '/' + total + '</span>';
      html += '</div>';

      html += '<div style="display:flex;flex-wrap:wrap;gap:3px">';
      for (const m of ms) {
        const isDone = prog[m];
        html += '<span style="font-size:9px;padding:1px 5px;border-radius:2px;'
          + 'background:' + (isDone ? 'rgba(63,185,80,0.15)' : 'rgba(128,128,128,0.1)') + ';'
          + 'color:' + (isDone ? '#3fb950' : 'inherit') + ';opacity:' + (isDone ? '0.7' : '0.4') + ';'
          + (isDone ? 'text-decoration:line-through;' : '')
          + '">' + (isDone ? '\\u2713 ' : '') + esc(m) + '</span>';
      }
      html += '</div>';
    }

    if (destination.notes) {
      html += '<div style="font-size:10px;opacity:0.4;margin-top:4px">' + esc(destination.notes).slice(0, 150) + '</div>';
    }
    html += '</div>';
  }

  // Task queue section
  const taskItems = tasks || [];
  if (taskItems.length > 0) {
    html += '<div class="tasks-section">';
    html += '<div class="tasks-header"><span>Tasks</span><span class="tasks-count">' + taskItems.length + '</span></div>';
    for (const t of taskItems.slice(0, 8)) {
      const assignee = t.assignedTo ? shortName(t.assignedTo) : '';
      html += '<div class="task-item">';
      html += '<span class="task-priority ' + t.priority + '">' + esc(t.priority) + '</span>';
      html += '<div class="task-body">';
      html += '<div class="task-title">' + esc(t.title) + '</div>';
      html += '<div class="task-meta">' + (assignee ? assignee + ' · ' : '') + timeAgo(t.ts) + '</div>';
      html += '</div>';
      html += '<span class="task-status ' + t.status.replace(' ', '_') + '">' + esc(t.status.replace('_', ' ')) + '</span>';
      html += '</div>';
    }
    if (taskItems.length > 8) {
      html += '<div style="padding:3px 12px 6px;font-size:9px;opacity:0.3;text-align:center">+' + (taskItems.length - 8) + ' more</div>';
    }
    html += '</div>';
  }

  // Mascot: cross-body between header and agent strip
  const mascotMood = agents.filter(a => a.status === 'active').length > 0 ? 'active' : (agents.length > 0 ? 'idle' : 'sleeping');
  // Color palette per mood
  const mPalette = mascotMood === 'active'
    ? { core:'#eef0ff', up:'#7946FF', down:'#393CF5', left:'#E72B76', right:'#15D1FF', nub:'#15D1FF', tendril:'#5ec8e6' }
    : mascotMood === 'idle'
    ? { core:'#b0a8d0', up:'#5a3ab0', down:'#3a3890', left:'#a02060', right:'#1090b0', nub:'#1090b0', tendril:'#4a90a0' }
    : { core:'#444', up:'#333', down:'#2a2a2a', left:'#333', right:'#333', nub:'#333', tendril:'#2a2a2a' };
  const mascotGlow = mascotMood === 'active' ? 'drop-shadow(0 0 4px rgba(21,209,255,0.4))' : 'none';
  const mascotOp = mascotMood === 'sleeping' ? '0.3' : '0.7';

  // Build cross-body pixel rects (scaled to ~32x36 viewport from 32x32 grid, each grid cell = 1 unit)
  const mBody = [
    [15,-6,'nub'],[16,-6,'nub'],
    [15,-5,'up'],[16,-5,'up'],
    [14,-4,'up'],[15,-4,'up'],[16,-4,'up'],[17,-4,'up'],
    [14,-3,'up'],[15,-3,'up'],[16,-3,'up'],[17,-3,'up'],
    [12,-2,'left'],[13,-2,'left'],[14,-2,'core'],[15,-2,'core'],[16,-2,'core'],[17,-2,'core'],[18,-2,'right'],[19,-2,'right'],
    [11,-1,'left'],[12,-1,'left'],[13,-1,'left'],[14,-1,'core'],[15,-1,'core'],[16,-1,'core'],[17,-1,'core'],[18,-1,'right'],[19,-1,'right'],[20,-1,'right'],
    [11, 0,'left'],[12, 0,'left'],[13, 0,'left'],[14, 0,'core'],[15, 0,'core'],[16, 0,'core'],[17, 0,'core'],[18, 0,'right'],[19, 0,'right'],[20, 0,'right'],
    [12,+1,'left'],[13,+1,'left'],[14,+1,'core'],[15,+1,'core'],[16,+1,'core'],[17,+1,'core'],[18,+1,'right'],[19,+1,'right'],
    [14,+2,'down'],[15,+2,'down'],[16,+2,'down'],[17,+2,'down'],
    [14,+3,'down'],[15,+3,'down'],[16,+3,'down'],[17,+3,'down'],
    [15,+4,'down'],[16,+4,'down'],
    [15,+5,'nub'],[16,+5,'nub'],
  ];
  let bodyRects = '';
  for (const [bx, dy, part] of mBody) {
    bodyRects += '<rect x="' + bx + '" y="' + (18 + dy) + '" width="1" height="1" fill="' + mPalette[part] + '"/>';
  }

  // Eyes
  let eyeSvg = '';
  if (mascotMood === 'sleeping') {
    eyeSvg = '<line x1="13.5" y1="17.5" x2="15" y2="17.5" stroke="#0a0a12" stroke-width="0.6"/>'
      + '<line x1="16.5" y1="17.5" x2="18" y2="17.5" stroke="#0a0a12" stroke-width="0.6"/>';
  } else {
    eyeSvg = '<rect x="14" y="17" width="1" height="2" fill="#0a0a12"/>'
      + '<rect x="17" y="17" width="1" height="2" fill="#0a0a12"/>';
  }

  // Tendrils as arc paths
  const tC = mPalette.tendril;
  const tendrils = '<path d="M11 12 Q9 7 11 3 Q13 0 15 -1" stroke="' + tC + '" fill="none" stroke-width="0.6" opacity="0.5"/>'
    + '<path d="M13 12 Q13 7 14.5 3 Q15 0 16 -1" stroke="' + tC + '" fill="none" stroke-width="0.6" opacity="0.6"/>'
    + '<path d="M16 12 Q16 6 16 2 Q16 0 16 -1" stroke="' + tC + '" fill="none" stroke-width="0.6" opacity="0.7"/>'
    + '<path d="M19 12 Q19 7 17.5 3 Q17 0 16 -1" stroke="' + tC + '" fill="none" stroke-width="0.6" opacity="0.6"/>'
    + '<path d="M21 12 Q23 7 21 3 Q19 0 17 -1" stroke="' + tC + '" fill="none" stroke-width="0.6" opacity="0.5"/>';

  html += '<div class="mascot-wrap" style="text-align:center;padding:4px 0;opacity:' + mascotOp + ';filter:' + mascotGlow + '">'
    + '<svg width="32" height="36" viewBox="0 -2 32 34" shape-rendering="crispEdges">'
    + tendrils + bodyRects + eyeSvg
    + '</svg></div>';

  // Agent topology map (compact progress tracker)
  if (agents.length > 0) {
    var topoH = Math.min(180, Math.max(80, agents.length * 14 + 24));
    html += '<div class="agent-topo">';
    html += '<canvas id="topoCanvas" style="height:' + topoH + 'px" onclick="topoClick(event)"></canvas>';
    html += '<div class="topo-legend">';
    html += '<span class="topo-dot" style="background:#8b5cf6"></span> active';
    html += '<span class="topo-dot" style="background:#6ee7b7"></span> done';
    html += '<span class="topo-dot" style="background:#64748b"></span> idle';
    html += '<span style="opacity:0.5;margin-left:6px">\\u2192 destination</span>';
    html += '</div></div>';

    // Agent detail panel (expanded below strip when an agent is selected)
    if (selectedAgent) {
      const sa = agents.find(a => a.name === selectedAgent);
      if (sa) {
        const src = avatars[sa.name] || '';
        const ap = progressMap[sa.name];
        html += '<div class="agent-detail">';
        html += '<img class="detail-avatar" src="' + src + '" alt=""/>';
        html += '<div class="detail-body">';
        html += '<span class="detail-name">' + esc(sa.name) + '</span>';
        html += '<span class="detail-status ' + sa.status + '">' + sa.status + '</span>';
        if (sa.task) {
          html += '<div class="detail-task">' + esc(sa.task) + '</div>';
        }
        if (ap) {
          html += '<div class="detail-progress"><div class="detail-progress-fill" style="width:' + ap.percent + '%;background:' + (ap.status === 'blocked' ? '#d29922' : '#7946FF') + '"></div></div>';
          html += '<div class="detail-meta">' + ap.percent + '% ' + (ap.status || 'working') + (ap.detail ? ' - ' + esc(ap.detail) : '') + '</div>';
        }
        html += '<div class="detail-meta">' + sa.memoryCount + ' memories, last seen ' + timeAgo(sa.lastSeen) + '</div>';
        html += '<div class="detail-actions">';
        html += '<button class="detail-btn" onclick="vscode.postMessage({type:\\'inject\\', targetAgent:\\'' + esc(sa.name).replace(/'/g, "\\\\'") + '\\'})">Inject</button>';
        html += '<button class="detail-btn" onclick="vscode.postMessage({type:\\'openDashboard\\'})">Dashboard</button>';
        html += '</div>';
        html += '</div></div>';
      }
    }
  }

  // Activity feed
  html += '<div class="feed-header">Activity</div><div class="feed">';
  if (activity.length === 0) {
    html += '<div style="text-align:center;padding:12px;opacity:0.4;font-size:11px">No recent activity</div>';
  }
  for (const ev of activity) {
    const dotColor = TYPE_COLORS[ev.type] || '#888';
    const src = avatars[ev.agent] || '';
    html += '<div class="feed-item">'
      + '<img class="feed-avatar" src="' + src + '" alt=""/>'
      + '<div class="feed-body">'
      + '<span class="feed-agent">' + esc(shortName(ev.agent)) + '</span>'
      + '<span class="feed-type" style="background:' + dotColor + '" title="' + esc(ev.type) + '"></span>'
      + (ev.opTag ? '<span style="font-size:9px;opacity:0.5;margin-left:4px">' + esc(ev.opTag) + '</span>' : '')
      + (ev.content ? '<div class="feed-text" onclick="toggleFeedItem(this)">' + esc(ev.content) + '</div>' : '')
      + '<div class="feed-time">' + timeAgo(ev.ts) + '</div>'
      + '</div></div>';
  }
  html += '</div>';

  root.innerHTML = html;

  // Draw topology map after DOM update
  var topoCanvas = document.getElementById('topoCanvas');
  if (topoCanvas) {
    drawTopology(topoCanvas, agents, progressMap, destination);
  }
}

window.addEventListener('message', e => {
  const m = e.data;
  if (m.type === 'state') {
    vscode.setState(m);
    render(m);
  } else if (m.type === 'noRoom') {
    // Only show noRoom if we don't already have data
    const prev = vscode.getState();
    if (!prev || prev.type !== 'state') {
      vscode.setState(null);
      render(null);
    }
  } else if (m.type === 'loading') {
    root.innerHTML = '<div class="state-msg"><div class="spinner"></div><p>Connecting to /' + esc(m.room) + '</p></div>';
  } else if (m.type === 'error') {
    root.innerHTML = '<div class="state-msg"><p>' + esc(m.message) + '</p>'
      + '<button class="btn" onclick="vscode.postMessage({type:\\'refresh\\'})">Retry</button></div>';
  }
});

// Restore persisted state on load
const saved = vscode.getState();
if (saved && saved.type === 'state') {
  render(saved);
} else {
  render(null);
  // Only ask for refresh if we have no saved state
  vscode.postMessage({ type: 'refresh' });
}
</script>
</body>
</html>`;
  }
}
