"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationWatcher = void 0;
const vscode = __importStar(require("vscode"));
class NotificationWatcher {
    client;
    timer;
    lastCheck;
    seenIds = new Set();
    constructor(client) {
        this.client = client;
        // Start checking from now
        this.lastCheck = new Date().toISOString();
    }
    start() {
        // Poll every 10 seconds for new events
        this.timer = setInterval(() => this.poll(), 10_000);
        // Do an initial check
        this.poll();
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }
    async poll() {
        const enabled = vscode.workspace.getConfiguration("remix").get("notifications", true);
        if (!enabled)
            return;
        try {
            const events = await this.client.getRecentEvents(this.lastCheck, 20);
            for (const event of events) {
                if (this.seenIds.has(event.id))
                    continue;
                this.seenIds.add(event.id);
                const meta = event.metadata;
                const eventType = meta.event;
                if (eventType === "session_done") {
                    const status = meta.status;
                    const summary = meta.summary?.slice(0, 120) ?? "";
                    const icon = status === "completed" ? "$(check)" :
                        status === "failed" ? "$(error)" :
                            status === "blocked" ? "$(warning)" : "$(info)";
                    const action = status === "failed" || status === "blocked"
                        ? vscode.window.showWarningMessage
                        : vscode.window.showInformationMessage;
                    action(`${icon} ${event.agent} [${status}]: ${summary}`, "Open Dashboard")
                        .then((choice) => {
                        if (choice === "Open Dashboard") {
                            vscode.commands.executeCommand("remix.openDashboard");
                        }
                    });
                }
                if (eventType === "context_injection") {
                    const from = meta.from_agent;
                    const target = meta.target_agent;
                    const priority = meta.priority;
                    const label = meta.label;
                    const prefix = priority === "urgent" ? "$(alert) URGENT: " :
                        priority === "high" ? "$(warning) " : "";
                    vscode.window.showInformationMessage(`${prefix}${from} injected context${target !== "all" ? ` for ${target}` : ""}${label ? ` (${label})` : ""}`);
                }
                if (eventType === "agent_connected") {
                    // Subtle status bar update only, no popup
                }
                if (eventType === "knowledge_stored") {
                    const title = meta.title;
                    vscode.window.showInformationMessage(`$(book) ${event.agent} stored knowledge${title ? `: ${title}` : ""}`);
                }
            }
            // Advance the checkpoint
            if (events.length > 0) {
                this.lastCheck = events[0].ts;
            }
            // Keep seenIds bounded
            if (this.seenIds.size > 500) {
                const arr = Array.from(this.seenIds);
                this.seenIds = new Set(arr.slice(arr.length - 200));
            }
        }
        catch {
            // Silently ignore polling errors
        }
    }
}
exports.NotificationWatcher = NotificationWatcher;
//# sourceMappingURL=notifications.js.map