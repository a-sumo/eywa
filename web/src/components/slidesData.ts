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
    "1. What Eywa Does",
    "2. Why It Matters",
    "3. How It Works",
    "4. Live Demo",
  ],

  sections: {
    "What Eywa Does": [
      "One shared view",
      "Thread Tree",
      "Workspace + Gemini",
      "Coordination tools",
    ],
    "Why It Matters": [
      "The coordination gap",
      "It's only accelerating",
    ],
    "How It Works": [
      "Works with your agents",
      "Ecosystem",
      "System overview",
    ],
    "Live Demo": ["See it live"],
  },

  slides: [
    // -- WHAT EYWA DOES --
    {
      type: "bullets",
      title: "One shared view",
      subtitle:
        "Every agent session, decision, and insight, visible to your whole team.",
      items: [
        "Each person on your team directs AI agents that code, decide, and ship autonomously. Eywa makes all of it <strong>visible</strong>.",
        "Every session becomes a <strong>shared thread</strong> with memories, artifacts, and decisions.",
        "Browse, search, or inject context into any team member's agent sessions.",
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
        "Build shared context from any thread. Ask questions across all of it.",
      items: [
        "Drag memories from any thread into a shared workspace.",
        "Context auto-compiles. Ask Gemini questions grounded in your team's actual work.",
        "Output becomes a new shareable thread.",
      ],
    },
    {
      type: "bullets",
      title: "Coordination tools",
      subtitle: "Keep humans aligned while their agents move fast.",
      items: [
        "<strong>Divergence alerts</strong>: surface when two people's agents solve the same problem differently.",
        "<strong>Context injection</strong>: push a decision to any team member's agent. They see it on their next action.",
        "<strong>Knowledge base</strong>: architecture decisions and conventions persist across all sessions.",
      ],
    },

    // -- WHY IT MATTERS --
    {
      type: "bigstat",
      title: "The coordination gap",
      subtitle:
        "AI makes individuals faster. Teams need to stay in sync.",
      stats: [
        { value: "4.6x", label: "Longer review wait for AI-generated PRs" },
        { value: "+41%", label: "Higher code churn from AI vs human code" },
        { value: "+47%", label: "More context switching with AI tools" },
        { value: "17%", label: "Say AI improved team collaboration" },
      ],
      footnote:
        "When everyone runs AI, small misalignments between people compound at machine speed.",
    },
    {
      type: "quote",
      title: "It's only accelerating",
      subtitle: "The number of agents per developer is only going up.",
      quote:
        "it's just so clear humans are the bottleneck to writing software. number of agents we can manage, information flow, state management. there will just be no centaurs soon as it is not a stable state",
      attribution: "@tszzl (roon)",
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
      subtitle: "Meet your team where they already work.",
      items: [
        "<strong>VS Code</strong>: Realtime sidebar, activity feed, one-click context injection.",
        "<strong>Discord</strong>: 12 slash commands for full agent observability from chat.",
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
      subtitle: "Two people. Multiple agents. One shared room.",
      items: [
        "Alice's agents work on auth. Bob's agents work on the database.",
        "Both sets of threads appear in the dashboard as they work.",
        "Alice spots a conflict, drags context into Bob's session. Aligned in seconds.",
      ],
    },

  ],

  closing: {
    title: "Eywa",
    subtitle: "See what your whole team is building.",
  },
};
