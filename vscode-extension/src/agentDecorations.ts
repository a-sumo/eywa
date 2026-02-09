/**
 * Inline editor decorations showing which agents are actively touching files.
 * Gutter dots, after-text annotations, overview ruler marks, and hover content.
 */
import * as vscode from "vscode";
import type { EywaClient, MemoryEvent } from "./client";
import type { MemoryPayload } from "./realtime";

interface FileTouch {
  agent: string;
  action: string;
  scope: string;
  system: string;
  ts: string;
  content: string;
}

const TTL_MS = 30 * 60 * 1000; // 30 minutes

// Same hash + pink-magenta spectrum as web/src/lib/agentColor.ts
function agentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = (300 + (Math.abs(hash) % 60)) / 360;
  const sat = (60 + (Math.abs(hash >> 8) % 30)) / 100;
  const lit = (55 + (Math.abs(hash >> 16) % 20)) / 100;
  // HSL to hex
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

function shortName(agent: string): string {
  return agent.includes("/") ? agent.split("/").pop()! : agent;
}

/** Extract file path fragments from scope and content fields. */
function extractFileRefs(
  scope: string | undefined,
  content: string | undefined,
): string[] {
  const refs: string[] = [];
  if (scope) refs.push(scope);
  // Also look for file-like patterns in content (paths with extensions)
  if (content) {
    const pathMatches = content.match(
      /[\w./-]+\.\w{1,6}/g,
    );
    if (pathMatches) {
      for (const m of pathMatches) {
        if (m.includes("/") || m.includes("\\")) refs.push(m);
      }
    }
  }
  return refs;
}

/** Fuzzy match file references against an editor's workspace-relative path. */
function matchesFile(refs: string[], editorRelPath: string): boolean {
  const lower = editorRelPath.toLowerCase();
  const parts = lower.split("/");
  const fileName = parts[parts.length - 1] ?? "";
  const stem = fileName.replace(/\.[^.]+$/, "");
  const dirName = parts.length > 1 ? parts[parts.length - 2] : "";

  for (const ref of refs) {
    const refLower = ref.toLowerCase();
    // Exact relative path match
    if (lower.includes(refLower) || refLower.includes(lower)) return true;
    // File stem match (e.g. scope mentions "tileRenderers" and file is tileRenderers.ts)
    if (stem && refLower.includes(stem)) return true;
    // Directory match (e.g. scope mentions "web/src" and file is in web/src/)
    if (dirName && refLower.includes(dirName)) return true;
    // Path-like ref: check basename match
    if (ref.includes("/") || ref.includes("\\")) {
      const refParts = refLower.split(/[/\\]/);
      const refFile = refParts[refParts.length - 1] ?? "";
      const refStem = refFile.replace(/\.[^.]+$/, "");
      if (refStem && refStem === stem) return true;
    }
  }
  return false;
}

export class AgentDecorationManager {
  // file path (workspace-relative, lowercase) -> touches
  private fileTouches = new Map<string, FileTouch[]>();
  // All touches keyed by agent for global lookup
  private allTouches: FileTouch[] = [];
  private decorationTypes = new Map<string, vscode.TextEditorDecorationType>();
  private pruneTimer: ReturnType<typeof setInterval>;

  constructor(private getClient: () => EywaClient | undefined) {
    this.pruneTimer = setInterval(() => this.pruneStale(), 60_000);
  }

  /** Seed from recent operations on initial load. */
  async seed(): Promise<void> {
    const client = this.getClient();
    if (!client) return;
    const since = new Date(Date.now() - TTL_MS).toISOString();
    const events = await client.getRecentOperations(since, 200);
    for (const e of events) {
      this.processEvent(e.agent, e.metadata, e.ts, e.content);
    }
    this.updateAllVisibleEditors();
  }

  /** Handle a realtime memory event. */
  handleEvent(mem: MemoryPayload): void {
    this.processEvent(mem.agent, mem.metadata ?? {}, mem.ts, mem.content);
    this.updateAllVisibleEditors();
  }

  private processEvent(
    agent: string,
    metadata: Record<string, unknown>,
    ts: string,
    content: string,
  ): void {
    const scope = metadata.scope as string | undefined;
    const system = metadata.system as string | undefined;
    const action = metadata.action as string | undefined;

    // Only care about events with scope or system metadata
    if (!scope && !system) return;

    const refs = extractFileRefs(scope, content);
    if (refs.length === 0) return;

    const touch: FileTouch = {
      agent,
      action: action || "touch",
      scope: scope || "",
      system: system || "",
      ts,
      content: (content || "").slice(0, 100),
    };

    this.allTouches.push(touch);

    // Index by workspace files that match
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
      // No workspace, store under the scope itself for matching later
      const key = (scope || "").toLowerCase();
      if (key) {
        const list = this.fileTouches.get(key) || [];
        list.push(touch);
        this.fileTouches.set(key, list);
      }
      return;
    }

    // Store the touch under a generic key based on refs for lazy matching
    for (const ref of refs) {
      const key = ref.toLowerCase();
      const list = this.fileTouches.get(key) || [];
      // Dedupe: skip if same agent + same action within last minute
      const isDupe = list.some(
        (t) =>
          t.agent === touch.agent &&
          t.action === touch.action &&
          Math.abs(new Date(t.ts).getTime() - new Date(touch.ts).getTime()) <
            60_000,
      );
      if (!isDupe) {
        list.push(touch);
        this.fileTouches.set(key, list);
      }
    }
  }

  /** Find touches relevant to an editor's file. */
  private findTouches(editor: vscode.TextEditor): FileTouch[] {
    const relPath = vscode.workspace.asRelativePath(editor.document.uri);
    const matches: FileTouch[] = [];
    const seen = new Set<string>(); // dedupe agent+action+ts

    for (const touch of this.allTouches) {
      const refs = extractFileRefs(touch.scope, touch.content);
      if (!matchesFile(refs, relPath)) continue;

      const key = `${touch.agent}:${touch.action}:${touch.ts}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push(touch);
    }

    // Sort by time descending, then take latest per agent
    matches.sort(
      (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime(),
    );
    const agentSeen = new Set<string>();
    const unique: FileTouch[] = [];
    for (const m of matches) {
      if (agentSeen.has(m.agent)) continue;
      agentSeen.add(m.agent);
      unique.push(m);
    }
    return unique;
  }

  /** Get or create a decoration type for an agent. */
  private getDecorationType(
    agent: string,
    line: number,
    touch: FileTouch,
  ): vscode.TextEditorDecorationType {
    const key = `${agent}:${line}`;
    const existing = this.decorationTypes.get(key);
    if (existing) {
      existing.dispose();
      this.decorationTypes.delete(key);
    }

    const color = agentColor(agent);
    const name = shortName(agent);
    const ago = timeAgo(touch.ts);
    const actionLabel = touch.action;
    // Shorten scope to just the filename/component if it's long
    const scopeShort =
      touch.scope.length > 30
        ? touch.scope.split(/[/\\]/).pop() || touch.scope.slice(0, 30)
        : touch.scope;

    const decType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: this.makeGutterDot(color),
      gutterIconSize: "60%",
      overviewRulerColor: color,
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      after: {
        contentText: `  ${name} ${actionLabel} ${scopeShort}  ${ago}`,
        color: new vscode.ThemeColor("editorCodeLens.foreground"),
        fontStyle: "italic",
        fontWeight: "normal",
        margin: "0 0 0 2em",
      },
    });

    this.decorationTypes.set(key, decType);
    return decType;
  }

  /** Create a tiny SVG dot for the gutter. */
  private makeGutterDot(color: string): vscode.Uri {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="6" height="16" viewBox="0 0 6 16"><circle cx="3" cy="8" r="2.5" fill="${color}"/></svg>`;
    return vscode.Uri.parse(
      `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    );
  }

  /** Apply decorations to a single editor. */
  updateDecorations(editor: vscode.TextEditor): void {
    const touches = this.findTouches(editor);
    if (touches.length === 0) {
      // Clear any existing decorations on this editor
      for (const [, dec] of this.decorationTypes) {
        editor.setDecorations(dec, []);
      }
      return;
    }

    // Each agent gets its own line, starting from line 0
    for (let i = 0; i < touches.length && i < 5; i++) {
      const touch = touches[i];
      const line = Math.min(i, editor.document.lineCount - 1);
      const range = new vscode.Range(line, 0, line, 0);
      const decType = this.getDecorationType(touch.agent, line, touch);
      editor.setDecorations(decType, [range]);
    }
  }

  /** Refresh decorations on all visible editors. */
  updateAllVisibleEditors(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.updateDecorations(editor);
    }
  }

  /** Build hover content for a file's agent touches. */
  getHoverContent(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | null {
    // Only show hover for the first few lines where decorations live
    if (position.line > 4) return null;

    const relPath = vscode.workspace.asRelativePath(document.uri);
    const touches = this.findTouches(
      vscode.window.activeTextEditor!,
    );
    const touch = touches[position.line];
    if (!touch) return null;

    const color = agentColor(touch.agent);
    const md = new vscode.MarkdownString("", true);
    md.isTrusted = true;
    md.supportHtml = true;

    md.appendMarkdown(
      `<span style="color:${color};">**${touch.agent}**</span>\n\n`,
    );
    md.appendMarkdown(`**Action:** ${touch.action}\n\n`);
    if (touch.scope) md.appendMarkdown(`**Scope:** ${touch.scope}\n\n`);
    if (touch.system) md.appendMarkdown(`**System:** ${touch.system}\n\n`);
    md.appendMarkdown(`**When:** ${timeAgo(touch.ts)} ago\n\n`);
    if (touch.content) {
      md.appendMarkdown(`> ${touch.content}\n\n`);
    }
    md.appendMarkdown(
      `[Open Eywa](command:eywaLive.focus)`,
    );

    return new vscode.Hover(md);
  }

  /** Remove touches older than TTL. */
  private pruneStale(): void {
    const cutoff = Date.now() - TTL_MS;
    this.allTouches = this.allTouches.filter(
      (t) => new Date(t.ts).getTime() > cutoff,
    );

    for (const [key, list] of this.fileTouches) {
      const filtered = list.filter(
        (t) => new Date(t.ts).getTime() > cutoff,
      );
      if (filtered.length === 0) {
        this.fileTouches.delete(key);
      } else {
        this.fileTouches.set(key, filtered);
      }
    }

    // Re-render after pruning
    this.updateAllVisibleEditors();
  }

  dispose(): void {
    clearInterval(this.pruneTimer);
    for (const [, dec] of this.decorationTypes) {
      dec.dispose();
    }
    this.decorationTypes.clear();
    this.fileTouches.clear();
    this.allTouches = [];
  }
}
