/**
 * Shared color constants for fold product UI.
 * M3-muted values: subdued enough for daily use, distinct enough to scan.
 */

export const SYSTEM_COLORS: Record<string, string> = {
  git: "#D4976A",
  filesystem: "#8E9099",
  ci: "#E8C56A",
  deploy: "#81C995",
  database: "#7ABAD0",
  api: "#B0A0DC",
  infra: "#D4A0C0",
  communication: "#AAC7FF",
  browser: "#7ABAD0",
  terminal: "#8E9099",
  editor: "#B0A0DC",
  ci_cd: "#E8C56A",
  cloud: "#9DA5C0",
  monitor: "#7ABAD0",
  other: "#9DA5C0",
};

export const OUTCOME_COLORS: Record<string, string> = {
  success: "#81C995",
  failure: "#FFB4AB",
  blocked: "#E8C56A",
  in_progress: "#AAC7FF",
};

export const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#FFB4AB",
  high: "#D4976A",
  normal: "#AAC7FF",
  low: "#8E9099",
};

export const STATUS_COLORS: Record<string, string> = {
  open: "#AAC7FF",
  claimed: "#DDBCE0",
  in_progress: "#E8C56A",
  done: "#81C995",
  blocked: "#FFB4AB",
};

export const TASK_STATUS_COLORS = STATUS_COLORS;
export const TASK_PRIORITY_COLORS = PRIORITY_COLORS;
