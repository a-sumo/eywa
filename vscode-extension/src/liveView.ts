/**
 * Live webview sidebar - unified agents + activity panel.
 * Uses Kurzgesagt-style SVG avatars matching the mini/eink displays.
 */
import * as vscode from "vscode";
import type { EywaClient } from "./client";
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
  private getClient: () => EywaClient | undefined;
  private room: string;

  constructor(getClient: () => EywaClient | undefined, room: string) {
    this.getClient = getClient;
    this.room = room;
  }

  setRoom(room: string) {
    this.room = room;
    this.agents.clear();
    this.activity = [];
    this.postMessage({ type: "loading", room });
    this.loadInitial();
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.getHtml();

    view.webview.onDidReceiveMessage((msg) => {
      if (msg.type === "setRoom") vscode.commands.executeCommand("eywa.setRoom");
      else if (msg.type === "inject") vscode.commands.executeCommand("eywa.injectContext");
      else if (msg.type === "openDashboard") vscode.commands.executeCommand("eywa.openDashboard");
      else if (msg.type === "refresh") this.loadInitial();
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
      // Load agents from sessions (Map<string, SessionInfo[]>)
      const sessionMap = await client.getSessions();
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
        .map((e) => ({
          id: e.id,
          agent: e.agent,
          content: e.content.slice(0, 150),
          type: e.message_type,
          ts: e.ts,
        }));

      this.pushState();
    } catch (err) {
      this.postMessage({ type: "error", message: "Could not connect to room" });
    }
  }

  handleEvent(mem: MemoryPayload) {
    const meta = mem.metadata ?? {};
    const event = meta.event as string | undefined;

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
      this.activity.unshift({
        id: mem.id,
        agent: mem.agent,
        content: (mem.content || "").slice(0, 150),
        type: mem.message_type || "assistant",
        ts: mem.ts,
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

  /* Agent strip */
  .strip {
    display: flex; gap: 2px; padding: 8px 10px;
    overflow-x: auto; scrollbar-width: none;
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  .strip::-webkit-scrollbar { display: none; }
  .agent-chip {
    display: flex; flex-direction: column; align-items: center;
    padding: 4px 6px; border-radius: 4px; min-width: 52px;
    cursor: default;
  }
  .agent-chip:hover { background: var(--vscode-list-hoverBackground); }
  .agent-chip .av-wrap {
    position: relative; width: 32px; height: 32px; margin-bottom: 3px;
  }
  .agent-chip .av-img {
    width: 32px; height: 32px; border-radius: 50%; overflow: hidden;
  }
  .agent-chip .dot {
    position: absolute; bottom: 0; right: 0;
    width: 8px; height: 8px; border-radius: 50%;
    border: 2px solid var(--vscode-sideBar-background, #1e1e1e);
  }
  .agent-chip.active .dot { background: #3fb950; }
  .agent-chip.idle .dot { background: #d29922; }
  .agent-chip.finished .dot { background: var(--vscode-disabledForeground); }
  .agent-chip .name {
    font-size: 9px; opacity: 0.7; max-width: 52px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    text-align: center;
  }
  .agent-chip.active .name { opacity: 1; font-weight: 600; }
  .agent-chip.finished { opacity: 0.45; }

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
  }
  .feed-time { font-size: 9px; opacity: 0.3; margin-top: 2px; }

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

const LOGO = '<svg class="logo" viewBox="0 0 250 250" fill="none"><path d="M116 124.524C116 110.47 128.165 99.5067 142.143 100.963L224.55 109.547C232.478 110.373 238.5 117.055 238.5 125.025C238.5 133.067 232.372 139.785 224.364 140.522L141.858 148.112C127.977 149.389 116 138.463 116 124.524Z"/><path d="M120.76 120.274C134.535 120.001 145.285 132.097 143.399 145.748L131.891 229.05C131.094 234.817 126.162 239.114 120.341 239.114C114.442 239.114 109.478 234.703 108.785 228.845L98.9089 145.354C97.351 132.184 107.5 120.536 120.76 120.274Z"/><path d="M122.125 5.51834C128.648 5.51832 134.171 10.3232 135.072 16.7832L147.586 106.471C149.482 120.063 139.072 132.267 125.35 132.538C111.847 132.805 101.061 121.382 102.1 107.915L109.067 17.6089C109.593 10.7878 115.284 5.51835 122.125 5.51834Z"/><path d="M12 126.211C12 117.753 18.3277 110.632 26.7274 109.638L95.0607 101.547C109.929 99.787 123 111.402 123 126.374V128.506C123 143.834 109.333 155.552 94.1845 153.213L26.1425 142.706C18.005 141.449 12 134.445 12 126.211Z"/><rect width="69.09" height="37.63" rx="18.81" transform="matrix(-0.682 -0.731 0.715 -0.7 165.13 184.31)"/><rect width="69.09" height="37.47" rx="18.73" transform="matrix(-0.682 0.731 -0.714 -0.7 182.38 88.9)"/><rect width="75.28" height="37.98" rx="18.99" transform="matrix(0.679 0.734 -0.717 0.697 95.87 64.43)"/><rect width="71.22" height="41.64" rx="20.82" transform="matrix(0.799 -0.601 0.583 0.813 55 149.83)"/></svg>';

function render(data) {
  if (!data) {
    root.innerHTML = '<div class="state-msg">'
      + '<svg class="state-icon" viewBox="0 0 250 250" fill="none"><path d="M116 124.524C116 110.47 128.165 99.5067 142.143 100.963L224.55 109.547C232.478 110.373 238.5 117.055 238.5 125.025C238.5 133.067 232.372 139.785 224.364 140.522L141.858 148.112C127.977 149.389 116 138.463 116 124.524Z"/><path d="M120.76 120.274C134.535 120.001 145.285 132.097 143.399 145.748L131.891 229.05C131.094 234.817 126.162 239.114 120.341 239.114C114.442 239.114 109.478 234.703 108.785 228.845L98.9089 145.354C97.351 132.184 107.5 120.536 120.76 120.274Z"/><path d="M122.125 5.51834C128.648 5.51832 134.171 10.3232 135.072 16.7832L147.586 106.471C149.482 120.063 139.072 132.267 125.35 132.538C111.847 132.805 101.061 121.382 102.1 107.915L109.067 17.6089C109.593 10.7878 115.284 5.51835 122.125 5.51834Z"/><path d="M12 126.211C12 117.753 18.3277 110.632 26.7274 109.638L95.0607 101.547C109.929 99.787 123 111.402 123 126.374V128.506C123 143.834 109.333 155.552 94.1845 153.213L26.1425 142.706C18.005 141.449 12 134.445 12 126.211Z"/><rect width="69.09" height="37.63" rx="18.81" transform="matrix(-0.682 -0.731 0.715 -0.7 165.13 184.31)"/><rect width="69.09" height="37.47" rx="18.73" transform="matrix(-0.682 0.731 -0.714 -0.7 182.38 88.9)"/><rect width="75.28" height="37.98" rx="18.99" transform="matrix(0.679 0.734 -0.717 0.697 95.87 64.43)"/><rect width="71.22" height="41.64" rx="20.82" transform="matrix(0.799 -0.601 0.583 0.813 55 149.83)"/></svg>'
      + '<p>Set a room to start<br>monitoring your agents.</p>'
      + '<button class="btn" onclick="vscode.postMessage({type:\\'setRoom\\'})">Set Room</button></div>';
    return;
  }

  const { agents, activity, room, avatars } = data;
  const active = agents.filter(a => a.status === 'active').length;

  // Header
  let html = '<div class="header">' + LOGO
    + '<div class="header-room" onclick="vscode.postMessage({type:\\'setRoom\\'})" title="Switch room">/' + esc(room)
    + '<span class="header-meta">' + (active > 0 ? active + ' active' : '') + '</span></div>'
    + '<div class="header-actions">'
    + '<button class="ibtn" onclick="vscode.postMessage({type:\\'refresh\\'})" title="Refresh"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M13 3a8 8 0 00-11 0l1 1a6.5 6.5 0 019 0L11 5h4V1l-2 2zM3 13a8 8 0 0011 0l-1-1a6.5 6.5 0 01-9 0L5 11H1v4l2-2z"/></svg></button>'
    + '<button class="ibtn" onclick="vscode.postMessage({type:\\'inject\\'})" title="Inject context"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M10.5 3L14 8l-3.5 5h-2l3-4.5H2V7.5h9.5l-3-4.5h2z"/></svg></button>'
    + '<button class="ibtn" onclick="vscode.postMessage({type:\\'openDashboard\\'})" title="Web dashboard"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 1h13l.5.5v13l-.5.5h-13l-.5-.5v-13l.5-.5zM2 5v9h12V5H2zm0-1h12V2H2v2z"/></svg></button>'
    + '</div></div>';

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

  // Agent strip
  if (agents.length > 0) {
    html += '<div class="strip">';
    for (const a of agents) {
      const src = avatars[a.name] || '';
      html += '<div class="agent-chip ' + a.status + '" title="' + esc(a.name) + '\\n' + esc(a.task) + '">'
        + '<div class="av-wrap"><img class="av-img" src="' + src + '" alt="' + esc(shortName(a.name)) + '"/><span class="dot"></span></div>'
        + '<div class="name">' + esc(shortName(a.name)) + '</div></div>';
    }
    html += '</div>';
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
      + (ev.content ? '<div class="feed-text">' + esc(ev.content) + '</div>' : '')
      + '<div class="feed-time">' + timeAgo(ev.ts) + '</div>'
      + '</div></div>';
  }
  html += '</div>';

  root.innerHTML = html;
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
