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
  subtitle: "Shared memory for AI agent swarms",
  summary: [
    "1. The Problem",
    "2. The Solution",
    "3. How It Works",
    "4. Live Demo",
    "Appendix: Labs",
  ],

  sections: {
    "The Problem": [
      "The coordination gap",
      "Faster agents, slower teams",
      "It's only accelerating",
    ],
    "The Solution": [
      "Eywa",
      "Thread Tree",
      "Workspace + Gemini",
      "Coordination primitives",
    ],
    "How It Works": [
      "Works with your agents",
      "Ecosystem",
      "System overview",
    ],
    "Live Demo": ["See it live"],
    "Appendix: Labs": [
      "Ambient Displays",
      "Timeline Features",
      "Physical Displays",
    ],
  },

  slides: [
    // -- THE PROBLEM --
    {
      type: "bullets",
      title: "The coordination gap",
      subtitle: "AI agents are powerful alone. On a team, they're blind.",
      items: [
        "92% of developers use AI coding agents daily. Each runs in <strong>complete isolation</strong>.",
        "Agent A decides on an API format. Agent B never finds out. Work diverges silently.",
        "The more agents you run, the more time you spend re-syncing them manually.",
      ],
    },
    {
      type: "bigstat",
      title: "Faster agents, slower teams",
      subtitle: "Individual productivity is up. Team coordination is down.",
      stats: [
        { value: "4.6x", label: "Longer review wait for AI-generated PRs" },
        { value: "+41%", label: "Higher code churn from AI vs human code" },
        { value: "+47%", label: "More context switching with AI tools" },
        { value: "17%", label: "Say AI improved team collaboration" },
      ],
      footnote: "$34B AI coding tools market. Coordination is the bottleneck.",
    },
    {
      type: "quote",
      title: "It's only accelerating",
      subtitle: "The number of agents per developer is only going up",
      quote: "it's just so clear humans are the bottleneck to writing software. number of agents we can manage, information flow, state management. there will just be no centaurs soon as it is not a stable state",
      attribution: "@tszzl (roon)",
    },

    // -- THE SOLUTION --
    {
      type: "bullets",
      title: "Eywa",
      subtitle: "Shared memory that keeps every agent in sync. Like git, but for AI context.",
      items: [
        "Every agent session becomes a <strong>shared thread</strong> with memories, artifacts, and decisions.",
        "Any team member can browse, search, or inject context into any agent's session.",
        "One MCP endpoint. Zero config. Works with 8+ AI coding agents today.",
      ],
    },
    {
      type: "bullets",
      title: "Thread Tree",
      subtitle: "See every agent's work in real-time.",
      items: [
        "Live tree of all agent sessions across your team.",
        "Click into any thread for the full conversation, artifacts, and status.",
        "Filter by agent, owner, status, or search across all threads.",
      ],
    },
    {
      type: "bullets",
      title: "Workspace + Gemini",
      subtitle: "Build context from threads. Ask questions across all of it.",
      items: [
        "Drag memories from any thread into a shared workspace.",
        "Context auto-compiles. Ask Gemini questions grounded in your agents' actual work.",
        "Output becomes a new shareable thread.",
      ],
    },
    {
      type: "bullets",
      title: "Coordination primitives",
      subtitle: "Built-in mechanisms so agents don't drift apart",
      items: [
        "<strong>Divergence alerts</strong>: warnings when two agents solve the same problem differently.",
        "<strong>Context injection</strong>: push a decision to any agent. They see it on their next action.",
        "<strong>Knowledge base</strong>: architecture decisions and conventions persist across all sessions.",
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
      title: "Ecosystem",
      subtitle: "Meet your team where they already work",
      items: [
        "<strong>VS Code</strong>: Realtime sidebar, activity feed, one-click code injection.",
        "<strong>Discord</strong>: 12 slash commands for full agent control from chat.",
        "<strong>Docs portal</strong>: Step-by-step setup for every supported agent.",
      ],
    },
    {
      type: "diagram",
      title: "System overview",
      subtitle: "Stateless MCP server + Supabase + realtime dashboard",
      diagramKey: "architecture",
    },

    // -- LIVE DEMO --
    {
      type: "bullets",
      title: "See it live",
      subtitle: "Two agents. One room. Real-time shared context.",
      items: [
        "Agent alpha works on auth. Agent beta works on the database.",
        "Both threads appear in the dashboard as they work.",
        "Drag both into Eywa. Ask Gemini to integrate.",
      ],
    },

    // -- APPENDIX: LABS --
    {
      type: "bullets",
      title: "Ambient Displays",
      subtitle: "Always-on team awareness with pixel creatures",
      items: [
        "<strong>MiniEywa</strong>: Compact dashboard with deterministic pixel-art creatures per agent.",
        "Activity sparklines show recent work patterns at a glance.",
        "Pastel color palette for cozy, non-intrusive ambient presence.",
      ],
    },
    {
      type: "bullets",
      title: "Timeline Features",
      subtitle: "Git-like history for your agent sessions",
      items: [
        "<strong>Rewind</strong>: Jump back to any point in session history.",
        "<strong>Fork</strong>: Branch from a historical moment to explore alternatives.",
        "<strong>Compare</strong>: Diff two sessions to find divergence points.",
      ],
    },
    {
      type: "bullets",
      title: "Physical Displays",
      subtitle: "E-ink, TFT touch, and Spectacles AR",
      items: [
        "<strong>E-ink</strong>: 7-color Waveshare display. Pastel palette, AR tracking marker.",
        "<strong>TFT Touch</strong>: 3.5\" ILI9341 with pygame. Tap agents, send injections.",
        "<strong>Spectacles</strong>: Image tracking anchors AR panel to physical e-ink display.",
      ],
    },
  ],

  closing: {
    title: "Eywa",
    subtitle: "Your agents are powerful. Make them a team.",
  },
};
