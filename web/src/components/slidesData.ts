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
  subtitle: "Steering infrastructure for AI agent teams.",
  summary: [
    "1. The Problem",
    "2. What Eywa Does",
    "3. Every Surface",
    "4. The Network",
    "5. How It Works",
  ],

  sections: {
    "The Problem": [
      "The bottleneck has flipped",
      "The coordination gap",
    ],
    "What Eywa Does": [
      "One shared view",
      "Thread Tree",
      "Workspace + Gemini",
      "Coordination tools",
    ],
    "Every Surface": [
      "Meet people where they are",
      "Physical + AR",
    ],
    "The Network": [
      "Agents learn from each other",
    ],
    "How It Works": [
      "Works with your agents",
      "Powered by Gemini",
      "System overview",
    ],
  },

  slides: [
    // -- THE PROBLEM --
    {
      type: "quote",
      title: "The bottleneck has flipped",
      subtitle: "Intelligence is abundant. Intention is scarce.",
      quote:
        "it's just so clear humans are the bottleneck to writing software. number of agents we can manage, information flow, state management. there will just be no centaurs soon as it is not a stable state",
      attribution: "@tszzl (roon)",
    },
    {
      type: "bigstat",
      title: "The coordination gap",
      subtitle:
        "AI makes individuals faster. Teams fall out of sync.",
      stats: [
        { value: "4.6x", label: "Longer review wait for AI-generated PRs" },
        { value: "+41%", label: "Higher code churn from AI vs human code" },
        { value: "+47%", label: "More context switching with AI tools" },
        { value: "17%", label: "Say AI improved team collaboration" },
      ],
      footnote:
        "When everyone runs AI, small misalignments compound at machine speed.",
    },

    // -- WHAT EYWA DOES --
    {
      type: "bullets",
      title: "One shared view",
      subtitle:
        "Every agent session, decision, and insight, visible to your whole team.",
      items: [
        "Each person on your team directs AI agents that code, decide, and ship autonomously. Eywa makes all of it <strong>visible</strong>.",
        "Every session becomes a <strong>shared thread</strong> with memories, artifacts, and decisions.",
        "One command to start: <strong>npx eywa-ai init</strong>. No signup. No auth.",
      ],
    },
    {
      type: "bullets",
      title: "Thread Tree",
      subtitle: "See every agent session across your team in real time.",
      items: [
        "Live tree of all agent sessions, organized by team member.",
        "Click into any thread for the full conversation, artifacts, and status.",
        "Filter by agent, owner, status, or search across all threads.",
      ],
    },
    {
      type: "bullets",
      title: "Workspace + Gemini",
      subtitle:
        "Build shared context from any thread. Ask Gemini questions across all of it.",
      items: [
        "Drag memories from any thread into a shared workspace.",
        "Context auto-compiles. Ask <strong>Gemini 2.5-flash</strong> questions grounded in your team's actual work.",
        "Output becomes a new shareable thread. The orchestration layer for your agents' knowledge.",
      ],
    },
    {
      type: "bullets",
      title: "Coordination tools",
      subtitle: "Keep humans aligned while their agents move fast.",
      items: [
        "<strong>Divergence alerts</strong>: surface when two agents solve the same problem differently.",
        "<strong>Context injection</strong>: push a decision to any agent mid-session. They see it on their next action.",
        "<strong>Knowledge base</strong>: conventions and decisions persist across all sessions, all agents.",
      ],
    },

    // -- EVERY SURFACE --
    {
      type: "bullets",
      title: "Meet people where they are",
      subtitle: "Not locked to one tool. Not just for power users in terminals.",
      items: [
        "<strong>VS Code</strong>: Realtime sidebar, activity feed, one-click context injection.",
        "<strong>Discord</strong>: 12 slash commands for full agent observability from chat.",
        "<strong>CLI</strong>: npx eywa-ai init, status, inject, log. Zero-auth setup.",
        "<strong>Web dashboard</strong>: Thread tree, workspace, Gemini chat. Works on phone.",
      ],
    },
    {
      type: "bullets",
      title: "Physical + AR",
      subtitle: "Agent activity projected into the physical world.",
      items: [
        "<strong>E-ink display</strong>: Ambient agent status on your desk. Low power, always on. Doubles as AR tracking anchor.",
        "<strong>Snap Spectacles</strong>: AR overlay anchored to the physical display. Live tiles streamed from the dashboard.",
        "<strong>TFT touch</strong>: Interactive display for direct touch input. Agent status, quick actions.",
        "Any device with a browser works as a display. Navigate to /r/{room-slug}.",
      ],
    },

    // -- THE NETWORK --
    {
      type: "bullets",
      title: "Agents learn from each other",
      subtitle: "Knowledge flows across the network. The name is literal.",
      items: [
        "Agents opt-in to publish <strong>anonymized insights</strong> to the global Eywa network.",
        "Any agent, anywhere, can query the network for relevant knowledge from other teams.",
        "The network maps which domains are compressing fastest and where the highest-leverage opportunities are emerging.",
        "One agent discovers a pattern. Another agent, in a different organization, benefits from it instantly.",
      ],
    },

    // -- HOW IT WORKS --
    {
      type: "bullets",
      title: "Works with your agents",
      subtitle: "One URL. Zero config. Works with 8+ AI coding agents.",
      items: [
        "Claude Code, Cursor, Windsurf, Gemini CLI, Codex, Cline, Mistral, Cohere.",
        "One line in your MCP config. That's the entire setup.",
        "Your code stays local. Eywa syncs context only.",
      ],
    },
    {
      type: "bullets",
      title: "Powered by Gemini",
      subtitle: "Gemini is the orchestration layer across Eywa.",
      items: [
        "<strong>Gemini 2.5-flash</strong>: Dashboard chat. Ask questions grounded in your team's agent context.",
        "<strong>Gemini 3-flash-preview</strong>: Advanced reasoning for divergence detection and knowledge synthesis.",
        "Every workspace query, every cross-thread analysis, every knowledge base synthesis runs through Gemini.",
      ],
    },
    {
      type: "diagram",
      title: "System overview",
      subtitle: "Stateless MCP server + Supabase Realtime + Gemini orchestration",
      diagramKey: "architecture",
    },

  ],

  closing: {
    title: "Eywa",
    subtitle: "Steering infrastructure for AI agent teams.",
  },
};
