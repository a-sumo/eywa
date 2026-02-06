/**
 * CodeLens provider that surfaces relevant Eywa knowledge entries inline.
 * Matches knowledge to files by checking whether the entry content or tags
 * reference the current file's relative path or filename.
 */
import * as vscode from "vscode";
import type { EywaClient, KnowledgeEntry } from "./client";

/**
 * Shows a CodeLens at line 0 when knowledge entries match the open file.
 * Clicking the lens opens an output channel with the full knowledge content.
 */
export class KnowledgeCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
  private cache: KnowledgeEntry[] = [];

  constructor(private getClient: () => EywaClient | undefined) {}

  async refreshCache(): Promise<void> {
    const client = this.getClient();
    if (!client) {
      this.cache = [];
      return;
    }
    this.cache = await client.getKnowledge(100);
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const relativePath = vscode.workspace.asRelativePath(document.uri);
    const fileName = document.uri.path.split("/").pop() ?? "";

    const matches = this.cache.filter((k) => {
      const content = k.content.toLowerCase();
      const tags = k.tags.map((t) => t.toLowerCase());
      return (
        content.includes(relativePath.toLowerCase()) ||
        content.includes(fileName.toLowerCase()) ||
        tags.includes(relativePath.toLowerCase()) ||
        tags.includes(fileName.toLowerCase())
      );
    });

    if (matches.length === 0) return [];

    const range = new vscode.Range(0, 0, 0, 0);
    const titles = matches.map((m) => m.title || m.content.slice(0, 40)).join(", ");

    return [
      new vscode.CodeLens(range, {
        title: `$(book) Eywa: ${matches.length} knowledge entr${matches.length === 1 ? "y" : "ies"} about this file`,
        command: "eywa.showKnowledgeForFile",
        arguments: [matches],
        tooltip: titles,
      }),
    ];
  }
}

/** Register the `eywa.showKnowledgeForFile` command that displays matched entries in an output channel. */
export function registerKnowledgeForFileCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("eywa.showKnowledgeForFile", (entries: KnowledgeEntry[]) => {
      const channel = vscode.window.createOutputChannel("Eywa Knowledge");
      channel.clear();
      channel.appendLine(`Eywa Knowledge - ${entries.length} entries\n`);
      for (const e of entries) {
        channel.appendLine(`--- ${e.title || "(untitled)"} ---`);
        channel.appendLine(`Agent: ${e.agent} · Tags: ${e.tags.join(", ")}`);
        channel.appendLine(e.content);
        channel.appendLine("");
      }
      channel.show();
    }),
  );
}
