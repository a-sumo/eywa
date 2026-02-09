/**
 * Course Awareness - inline editor decorations showing destination progress
 * and active agent scopes. Makes navigation visible inside the editor itself.
 */
import * as vscode from "vscode";
import type { EywaClient, DestinationInfo, AgentProgress } from "./client";

/**
 * CodeLens at the top of files showing destination progress and active
 * agents working on related scopes. Clicking opens the Eywa sidebar.
 */
export class CourseCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  private destination: DestinationInfo | null = null;
  private agentProgress: AgentProgress[] = [];
  private activeScopes: { agent: string; scope: string; system: string }[] = [];

  constructor(private getClient: () => EywaClient | undefined) {}

  async refresh(): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    const [dest, prog, events] = await Promise.all([
      client.getDestination(),
      client.getAgentProgress(),
      client.getRecentEvents(
        new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        100,
      ),
    ]);

    this.destination = dest;
    this.agentProgress = prog;

    // Extract active agent scopes from recent operations
    const scopeMap = new Map<string, { scope: string; system: string }>();
    for (const e of events) {
      const meta = e.metadata ?? {};
      const scope = meta.scope as string | undefined;
      const system = meta.system as string | undefined;
      if (scope && !scopeMap.has(e.agent)) {
        scopeMap.set(e.agent, { scope, system: system || "" });
      }
    }
    this.activeScopes = Array.from(scopeMap.entries()).map(([agent, info]) => ({
      agent,
      ...info,
    }));

    this._onDidChangeCodeLenses.fire();
  }

  updateDestination(dest: DestinationInfo) {
    this.destination = dest;
    this._onDidChangeCodeLenses.fire();
  }

  updateProgress(prog: AgentProgress[]) {
    this.agentProgress = prog;
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    const range = new vscode.Range(0, 0, 0, 0);

    // Destination + progress lens
    if (this.destination) {
      const ms = this.destination.milestones;
      const done = ms.filter((m) => this.destination!.progress[m]).length;
      const total = ms.length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const bar = total > 0 ? progressBar(done, total) : "";

      lenses.push(
        new vscode.CodeLens(range, {
          title: `$(compass) Course: ${done}/${total} ${bar} ${pct}%`,
          command: "eywaLive.focus",
          tooltip: this.destination.destination,
        }),
      );
    }

    // Active agents on related scopes
    const relativePath = vscode.workspace.asRelativePath(document.uri);
    const pathParts = relativePath.toLowerCase().split("/");
    const fileName = pathParts[pathParts.length - 1] ?? "";
    const dirName = pathParts.length > 1 ? pathParts[pathParts.length - 2] : "";

    const related = this.activeScopes.filter((s) => {
      const scopeLower = s.scope.toLowerCase();
      // Match if scope mentions this file's directory, name, or component area
      return (
        scopeLower.includes(fileName.replace(/\.[^.]+$/, "")) ||
        (dirName && scopeLower.includes(dirName)) ||
        relativePath.toLowerCase().includes(scopeLower)
      );
    });

    if (related.length > 0) {
      const names = related
        .map((r) => {
          const short = r.agent.includes("/") ? r.agent.split("/").pop()! : r.agent;
          return short;
        })
        .join(", ");

      lenses.push(
        new vscode.CodeLens(range, {
          title: `$(broadcast) ${related.length} agent${related.length === 1 ? "" : "s"} nearby: ${names}`,
          command: "eywaLive.focus",
          tooltip: related.map((r) => `${r.agent}: ${r.scope} (${r.system})`).join("\n"),
        }),
      );
    }

    // Show active agent count even if none are on this file
    const activeCount = this.agentProgress.filter(
      (p) => p.status === "working" || p.status === "blocked",
    ).length;
    if (activeCount > 0 && related.length === 0) {
      lenses.push(
        new vscode.CodeLens(range, {
          title: `$(pulse) ${activeCount} agent${activeCount === 1 ? "" : "s"} active`,
          command: "eywaLive.focus",
          tooltip: this.agentProgress
            .filter((p) => p.status === "working" || p.status === "blocked")
            .map((p) => `${p.agent}: ${p.task} (${p.percent}%)`)
            .join("\n"),
        }),
      );
    }

    return lenses;
  }
}

function progressBar(done: number, total: number): string {
  const filled = Math.round((done / total) * 8);
  return "\u2588".repeat(filled) + "\u2591".repeat(8 - filled);
}
