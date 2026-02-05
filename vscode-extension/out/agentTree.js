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
exports.AgentTreeProvider = void 0;
const vscode = __importStar(require("vscode"));
function timeAgo(ts) {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)
        return "now";
    if (mins < 60)
        return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24)
        return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}
class AgentTreeProvider {
    getClient;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    constructor(getClient) {
        this.getClient = getClient;
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren() {
        const client = this.getClient();
        if (!client) {
            return [new AgentItem("Configure remix.room, remix.supabaseUrl, remix.supabaseKey", "", false, "")];
        }
        try {
            const agents = await client.getAgents();
            if (agents.length === 0) {
                return [new AgentItem("No agents yet", "", false, "")];
            }
            return agents.map((a) => new AgentItem(a.name, `${a.sessionCount}s · ${timeAgo(a.lastSeen)} · ${a.status}`, a.isActive, a.lastContent));
        }
        catch {
            return [new AgentItem("Error fetching agents", "", false, "")];
        }
    }
}
exports.AgentTreeProvider = AgentTreeProvider;
class AgentItem extends vscode.TreeItem {
    agentName;
    detail;
    isActive;
    lastContent;
    constructor(agentName, detail, isActive, lastContent) {
        super(agentName, vscode.TreeItemCollapsibleState.None);
        this.agentName = agentName;
        this.detail = detail;
        this.isActive = isActive;
        this.lastContent = lastContent;
        this.description = detail;
        this.tooltip = lastContent || agentName;
        this.iconPath = new vscode.ThemeIcon(isActive ? "circle-filled" : "circle-outline", isActive
            ? new vscode.ThemeColor("testing.iconPassed")
            : new vscode.ThemeColor("disabledForeground"));
    }
}
//# sourceMappingURL=agentTree.js.map