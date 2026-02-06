/**
 * Editor selection injection command (Cmd+Shift+I).
 * Grabs the active editor selection, wraps it with file path + line range,
 * shows a QuickPick to choose a target agent, and sends via eywa_inject.
 */
import * as vscode from "vscode";
import type { EywaClient } from "./client";

/**
 * Inject the current editor selection to a chosen agent.
 * Content is formatted as `[file:startLine-endLine]\n```\ncode\n````.
 */
export async function injectSelection(getClient: () => EywaClient | undefined): Promise<void> {
  const client = getClient();
  if (!client) {
    vscode.window.showWarningMessage("Configure eywa.room, eywa.supabaseUrl, and eywa.supabaseKey first.");
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("No active editor with selection.");
    return;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showWarningMessage("Select some text first.");
    return;
  }

  const text = editor.document.getText(selection);
  const filePath = vscode.workspace.asRelativePath(editor.document.uri);
  const startLine = selection.start.line + 1;
  const endLine = selection.end.line + 1;

  // Pick target agent
  const agents = await client.getAgents();
  const items = [...agents.map((a) => ({
    label: a.name,
    description: a.isActive ? "active" : "idle",
  })), {
    label: "all",
    description: "Broadcast to all agents",
  }];

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: "Inject to which agent?",
  });
  if (!pick) return;

  const content = `[${filePath}:${startLine}-${endLine}]\n\`\`\`\n${text}\n\`\`\``;

  await client.inject("vscode-user", pick.label, content, "normal");
  vscode.window.showInformationMessage(`Injected ${filePath}:${startLine}-${endLine} → ${pick.label}`);
}
