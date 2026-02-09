/**
 * Context pressure monitor for Eywa MCP worker.
 * Tracks tool calls per session and piggybacks checkpoint/distress
 * reminders onto tool responses when context is likely getting full.
 *
 * The worker can't see the agent's actual token count, so tool call
 * count is used as a proxy. Thresholds are conservative.
 */

/** Thresholds for checkpoint reminders (tool call counts) */
const WARN_AT = 30;       // "You should checkpoint soon"
const URGENT_AT = 50;     // "Checkpoint NOW"
const CRITICAL_AT = 70;   // "Call eywa_distress immediately"

/** Tools that reset/acknowledge pressure */
const RELIEF_TOOLS = new Set([
  "eywa_checkpoint",
  "eywa_distress",
  "eywa_done",
  "eywa_stop",
]);

/** Tools that should never get pressure warnings appended */
const SKIP_PRESSURE = new Set([
  "eywa_checkpoint",
  "eywa_distress",
  "eywa_done",
  "eywa_stop",
  "eywa_recover",
]);

export class ContextPressureMonitor {
  private callCount = 0;
  private lastCheckpointAt = 0; // call count when last checkpoint happened
  private hasDistressed = false;

  /** Call this on every tool invocation. Returns warning text or null. */
  tick(toolName: string): string | null {
    this.callCount++;

    // If agent is actively checkpointing/distressing, note it
    if (RELIEF_TOOLS.has(toolName)) {
      this.lastCheckpointAt = this.callCount;
      if (toolName === "eywa_distress") this.hasDistressed = true;
      return null;
    }

    // Don't append warnings to recovery tools
    if (SKIP_PRESSURE.has(toolName)) return null;

    // How many calls since last checkpoint?
    const sinceLast = this.callCount - this.lastCheckpointAt;

    if (this.hasDistressed) return null; // already fired distress, stop nagging

    if (sinceLast >= CRITICAL_AT) {
      return [
        "\n---",
        "CONTEXT PRESSURE: CRITICAL (70+ tool calls since last checkpoint)",
        "Call eywa_distress NOW. Your context window is likely near capacity.",
        "Pass your current task state so another session can continue your work.",
        "---",
      ].join("\n");
    }

    if (sinceLast >= URGENT_AT) {
      return [
        "\n---",
        "CONTEXT PRESSURE: HIGH (50+ tool calls since last checkpoint)",
        "Call eywa_checkpoint with your current task, progress, and remaining work.",
        "If you're nearly done, finish and call eywa_done. Otherwise checkpoint now.",
        "---",
      ].join("\n");
    }

    if (sinceLast >= WARN_AT) {
      return [
        "\n---",
        "CONTEXT PRESSURE: reminder (30+ tool calls since last checkpoint)",
        "Consider calling eywa_checkpoint to save your progress.",
        "---",
      ].join("\n");
    }

    return null;
  }

  /** Current tool call count */
  get calls(): number {
    return this.callCount;
  }
}
