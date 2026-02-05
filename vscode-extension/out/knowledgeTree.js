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
exports.KnowledgeTreeProvider = void 0;
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
class KnowledgeTreeProvider {
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
        if (!client)
            return [];
        try {
            const entries = await client.getKnowledge();
            if (entries.length === 0) {
                return [new KnowledgeItem("No knowledge entries yet", "", "")];
            }
            return entries.map((e) => new KnowledgeItem(e.title || e.content.slice(0, 50), `${e.tags.join(", ")} · ${e.agent} · ${timeAgo(e.ts)}`, e.content));
        }
        catch {
            return [new KnowledgeItem("Error fetching knowledge", "", "")];
        }
    }
}
exports.KnowledgeTreeProvider = KnowledgeTreeProvider;
class KnowledgeItem extends vscode.TreeItem {
    constructor(label, detail, content) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = detail;
        this.tooltip = content;
        this.iconPath = new vscode.ThemeIcon("book");
    }
}
//# sourceMappingURL=knowledgeTree.js.map