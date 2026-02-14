/**
 * Shared color constants for fold product UI.
 * Warm muted tones aligned with armandsumo dark palette.
 * Restrained and professional: no neon, no glow.
 */

export const SYSTEM_COLORS: Record<string, string> = {
  git: "#D4976A",
  filesystem: "#8E9099",
  ci: "#E8C56A",
  deploy: "#81C995",
  database: "#7ABAD0",
  api: "#B0A0DC",
  infra: "#D4A0C0",
  communication: "#8CA9FF",
  browser: "#7ABAD0",
  terminal: "#8E9099",
  editor: "#B0A0DC",
  ci_cd: "#E8C56A",
  cloud: "#9DA5C0",
  monitor: "#7ABAD0",
  test: "#E8C56A",
  build: "#B0A0DC",
  file: "#8E9099",
  other: "#9DA5C0",
};

export const OUTCOME_COLORS: Record<string, string> = {
  success: "#81C995",
  failure: "#FFB4AB",
  blocked: "#E8C56A",
  in_progress: "#8CA9FF",
};

export const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#FFB4AB",
  high: "#D4976A",
  normal: "#8CA9FF",
  low: "#8E9099",
};

export const STATUS_COLORS: Record<string, string> = {
  open: "#8CA9FF",
  claimed: "#DDBCE0",
  in_progress: "#E8C56A",
  done: "#81C995",
  blocked: "#FFB4AB",
};

export const EVENT_STYLES: Record<string, { borderColor: string; bgTint: string }> = {
  distress: { borderColor: "#FFB4AB", bgTint: "rgba(255, 180, 171, 0.06)" },
  session_start: { borderColor: "#81C995", bgTint: "transparent" },
  session_done: { borderColor: "#8E9099", bgTint: "transparent" },
  session_end: { borderColor: "#8E9099", bgTint: "transparent" },
  context_injection: { borderColor: "#DDBCE0", bgTint: "rgba(221, 188, 224, 0.04)" },
  checkpoint: { borderColor: "#E8C56A", bgTint: "rgba(232, 197, 106, 0.04)" },
};

export const TASK_STATUS_COLORS = STATUS_COLORS;
export const TASK_PRIORITY_COLORS = PRIORITY_COLORS;
