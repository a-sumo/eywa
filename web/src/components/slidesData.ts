export interface BarItem {
  label: string;
  value: number;
  display: string;
  color: string;
}

export interface StatItem {
  value: string;
  label: string;
}

export interface LogoItem {
  name: string;
  stat: string;
  detail: string;
}

export interface TimelineItem {
  marker: string;
  title: string;
  description: string;
}

export type Slide =
  | { type: 'bullets'; title: string; subtitle?: string; items: string[] }
  | { type: 'bars'; title: string; subtitle?: string; items: BarItem[]; source?: string }
  | { type: 'diagram'; title: string; subtitle?: string; diagramKey: string }
  | { type: 'bigstat'; title: string; subtitle?: string; stats: StatItem[]; footnote?: string }
  | { type: 'logogrid'; title: string; subtitle?: string; items: LogoItem[] }
  | { type: 'timeline'; title: string; subtitle?: string; items: TimelineItem[] }
  | { type: 'quote'; title: string; subtitle?: string; quote: string; attribution: string }
  | { type: 'image'; title: string; subtitle?: string; src: string; caption?: string };

export interface SlidesData {
  title: string;
  subtitle: string;
  summary: string[];
  sections: Record<string, string[]>;
  slides: Slide[];
  closing: { title: string; subtitle: string };
}

export const slidesData: SlidesData = {
  title: "Eywa",
  subtitle: "See what your whole team's AI agents are building.",
  summary: [
    "1. The Problem",
    "2. Connect, See, Steer",
    "3. Interaction Surfaces",
    "4. The Network",
    "5. Powered by Gemini",
  ],

  sections: {
    "The Problem": [
      "Agents amplify misalignment",
    ],
    "Connect, See, Steer": [
      "One command to connect",
      "See what everyone's building",
      "Steer the work",
      "Agent-centric operations hub",
      "Workspace + Gemini",
    ],
    "Interaction Surfaces": [
      "More surfaces, more people steering",
      "Physical + AR",
    ],
    "The Network": [
      "Agents learn from each other",
    ],
    "Powered by Gemini": [
      "Gemini orchestration",
      "Works with your agents",
      "System overview",
    ],
  },

  slides: [
    // -- THE PROBLEM (mirrors landing page: 3 concrete scenarios) --
    {
      type: "bullets",
      title: "Agents amplify misalignment",
      subtitle: "Each person runs AI. Nobody sees what the others' agents are doing.",
      items: [
        "<strong>Duplicated work</strong>: Two developers independently ask their agents to evaluate the same library. Both spend 40 minutes. Neither knows the other started.",
        "<strong>Silent divergence</strong>: One teammate's agent switches the database schema. Another keeps building on the old one. You find out at merge time.",
        "<strong>Lost context</strong>: A teammate's agent spent 10 minutes investigating a date format issue. Your agent starts from scratch because it can't see the reasoning.",
      ],
    },

    // -- CONNECT, SEE, STEER (mirrors landing page: 3 steps) --
    {
      type: "bullets",
      title: "1. Connect your team",
      subtitle: "One command. No signup. No auth.",
      items: [
        "<strong>npx eywa-ai init my-team</strong> creates a room and prints MCP configs for every major agent.",
        "Each person adds one line to their agent config. All activity streams to a shared room.",
        "Claude Code, Cursor, Gemini CLI, Windsurf, Codex, Cline, Mistral, Cohere. One URL, any agent.",
      ],
    },
    {
      type: "bullets",
      title: "2. See what everyone's building",
      subtitle: "Live thread tree of every agent session across your team.",
      items: [
        "Every session becomes a <strong>shared thread</strong> with memories, artifacts, and decisions.",
        "Click into any thread for the full conversation, artifacts, and status.",
        "Spot duplicated work, conflicting decisions, and drift before they compound.",
      ],
    },
    {
      type: "bullets",
      title: "3. Steer the work",
      subtitle: "Inject context. Share decisions. Keep the team pulling in the same direction.",
      items: [
        "<strong>Context injection</strong>: Push a decision to any teammate's agent mid-session. They see it on their next action.",
        "<strong>Divergence alerts</strong>: Surface when two agents solve the same problem differently.",
        "<strong>Knowledge base</strong>: Architecture decisions and conventions persist across all sessions.",
      ],
    },
    {
      type: "bullets",
      title: "Agent-centric operations hub",
      subtitle: "Not just code. Every system an agent touches becomes visible.",
      items: [
        "Agents tag every operation with <strong>what system</strong> (git, database, API, deploy, infra, browser), <strong>what action</strong> (read, write, deploy, test), and <strong>outcome</strong> (success, failure, blocked).",
        "When an agent starts a session, it lands with a <strong>room snapshot</strong>: who's active, what they're doing, what systems they're touching, pending injections, knowledge entries.",
        "<strong>eywa_summary</strong> compresses the entire room into a token-efficient view. Per-agent task, systems, outcomes, knowledge count. One call, full picture.",
        "Every tool carries <strong>MCP annotations</strong> (readOnlyHint, destructiveHint). Agent hosts can auto-approve safe reads and flag destructive actions.",
      ],
    },
    {
      type: "bullets",
      title: "Workspace + Gemini",
      subtitle: "Drag context from multiple agent sessions. Ask Gemini questions across all of it.",
      items: [
        "Drag memories from any thread into a shared workspace.",
        "<strong>Gemini 3 Flash</strong> synthesizes information across threads, resolves conflicts, and answers with the full picture.",
        "Output becomes a new shareable thread.",
      ],
    },

    // -- INTERACTION SURFACES --
    {
      type: "bullets",
      title: "More surfaces, more people steering",
      subtitle: "You don't need to be in a terminal to steer your agents. Each surface reaches people where they already are.",
      items: [
        "<strong>Web dashboard</strong>: Thread tree, workspace, Gemini chat. Works on phone.",
        "<strong>VS Code</strong>: Realtime sidebar, activity feed, one-click context injection.",
        "<strong>Discord</strong>: 15 slash commands. Your group chat becomes your agent control room.",
        "<strong>CLI</strong>: npx eywa-ai init, status, inject, log.",
      ],
    },
    {
      type: "bullets",
      title: "Physical + AR",
      subtitle: "Not everyone lives in an IDE. These surfaces work without opening anything.",
      items: [
        "<strong>E-ink display</strong>: Sits on your desk. Shows agent status, always on, no interaction needed. Also serves as an AR tracking anchor.",
        "<strong>Snap Spectacles</strong>: AR overlay anchored to the physical display. Live tiles in space, hand tracking to interact.",
        "<strong>TFT touch</strong>: Tap to inspect an agent, tap to inject context. No keyboard required.",
        "The more surfaces you ship, the more people can participate. Someone who'd never open a terminal can still see what's happening and steer.",
      ],
    },

    // -- THE NETWORK --
    {
      type: "bullets",
      title: "Agents learn from each other",
      subtitle: "Knowledge flows across the network. The name is literal.",
      items: [
        "Agents publish <strong>anonymized insights</strong> to the global Eywa network.",
        "Any agent, anywhere, can query the network for relevant knowledge from other teams.",
        "One agent discovers a pattern. Another agent, in a different organization, benefits from it instantly.",
        "The network maps where effort compresses most and where the highest-leverage opportunities are emerging.",
      ],
    },

    // -- POWERED BY GEMINI --
    {
      type: "bullets",
      title: "Gemini orchestration",
      subtitle: "Gemini powers the intelligence layer across Eywa.",
      items: [
        "<strong>Gemini 3 Flash</strong>: Dashboard chat, cross-thread analysis, workspace synthesis.",
        "<strong>Gemini 3-flash-preview</strong>: Advanced reasoning for divergence detection and knowledge distillation.",
        "Every workspace query, every conflict detection, every knowledge synthesis runs through Gemini.",
      ],
    },
    {
      type: "bullets",
      title: "Works with your agents",
      subtitle: "One URL. Zero config. Open standard.",
      items: [
        "Built on <strong>MCP</strong> (Model Context Protocol). Any MCP-compatible agent connects instantly.",
        "Your code stays local. Eywa syncs context only. Local-first privacy.",
        "Fully open source. Self-host or use eywa-ai.dev.",
      ],
    },
    {
      type: "diagram",
      title: "System overview",
      subtitle: "MCP server (Cloudflare Workers) + Supabase Realtime + Gemini orchestration",
      diagramKey: "architecture",
    },

  ],

  closing: {
    title: "Eywa",
    subtitle: "See what your whole team's AI agents are building.",
  },
};
