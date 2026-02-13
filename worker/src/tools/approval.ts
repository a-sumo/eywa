import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SupabaseClient } from "../lib/supabase.js";
import type { EywaContext, MemoryRow } from "../lib/types.js";

/**
 * Approval queue tools.
 *
 * Agents request human approval for risky actions. Humans approve/deny
 * from the dashboard (via Gemini steering or the UI). The decision is
 * delivered back to the agent as an injection piggyback.
 *
 * Storage: memories table with message_type "approval_request".
 * metadata.event = "approval_request"
 * metadata.status = "pending" | "approved" | "denied"
 * metadata.action_description = what the agent wants to do
 * metadata.scope = affected files/systems
 * metadata.risk_level = "low" | "medium" | "high" | "critical"
 */

export function registerApprovalTools(
  server: McpServer,
  db: SupabaseClient,
  ctx: EywaContext,
) {
  server.tool(
    "eywa_request_approval",
    "[CONTEXT] Request human approval before taking a risky action. The request appears in the dashboard and the human can approve or deny it. Poll with eywa_check_approval to see the decision.",
    {
      action: z.string().describe("What you want to do (e.g. 'delete staging database', 'force-push to main', 'deploy to production')"),
      scope: z.string().optional().describe("What files, systems, or services are affected"),
      risk_level: z.enum(["low", "medium", "high", "critical"]).optional().default("medium").describe("How risky is this action"),
      context: z.string().optional().describe("Additional context for the human reviewer"),
    },
    {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    async ({ action, scope, risk_level, context: extraContext }) => {
      const rows = await db.insert<MemoryRow>("memories", {
        fold_id: ctx.foldId,
        agent: ctx.agent,
        session_id: ctx.sessionId,
        message_type: "approval_request",
        content: `APPROVAL REQUEST: ${action}`,
        token_count: Math.floor(action.length / 4),
        metadata: {
          event: "approval_request",
          status: "pending",
          action_description: action,
          scope: scope ?? null,
          risk_level,
          context: extraContext ?? null,
          requested_at: new Date().toISOString(),
        },
      });

      const approvalId = rows[0]?.id;
      if (!approvalId) {
        return {
          content: [{ type: "text" as const, text: "Failed to create approval request: no ID returned from insert." }],
        };
      }

      return {
        content: [{
          type: "text" as const,
          text: `Approval requested (ID: ${approvalId}). Waiting for human review.\n\nAction: ${action}\nRisk: ${risk_level}\n${scope ? `Scope: ${scope}\n` : ""}` +
            `\nPoll with eywa_check_approval to see the decision. The approval or denial will also appear as an injection on your next tool call.`,
        }],
      };
    },
  );

  server.tool(
    "eywa_check_approval",
    "[COORDINATION] Check the status of a pending approval request. Returns whether it was approved, denied, or is still pending.",
    {
      approval_id: z.string().uuid("approval_id must be a valid UUID").describe("The approval ID returned by eywa_request_approval"),
    },
    {
      readOnlyHint: true,
      destructiveHint: false,
    },
    async ({ approval_id }) => {
      const rows = await db.select<MemoryRow>("memories", {
        select: "id,agent,content,metadata,ts",
        id: `eq.${approval_id}`,
        fold_id: `eq.${ctx.foldId}`,
        limit: "1",
      });

      if (!rows.length) {
        return {
          content: [{ type: "text" as const, text: `Approval request ${approval_id} not found.` }],
        };
      }

      const meta = (rows[0].metadata ?? {}) as Record<string, unknown>;
      const status = (meta.status as string) || "unknown";

      if (status === "pending") {
        return {
          content: [{ type: "text" as const, text: `Still pending. No human has reviewed this yet. Keep working on other tasks and check back later.` }],
        };
      }

      const resolvedBy = (meta.resolved_by as string) || "unknown";
      const message = (meta.response_message as string) || "";

      if (status === "approved") {
        return {
          content: [{ type: "text" as const, text: `APPROVED by ${resolvedBy}. ${message ? `Message: ${message}` : "Proceed with the action."}` }],
        };
      }

      if (status === "denied") {
        return {
          content: [{ type: "text" as const, text: `DENIED by ${resolvedBy}. Reason: ${message || "No reason given."}. Do NOT proceed with this action.` }],
        };
      }

      return {
        content: [{ type: "text" as const, text: `Unknown status: ${status}` }],
      };
    },
  );
}
