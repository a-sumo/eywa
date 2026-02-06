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
  title: "Remix",
  subtitle: "The coordination layer for human+AI teams",
  summary: [
    "1. The Problem",
    "2. The Market",
    "3. The Insight",
    "4. The Product",
    "5. VS Code Extension",
    "6. Architecture",
    "7. Live Demo",
    "Appendix: Labs",
  ],

  sections: {
    "The Problem": [
      "Saturday morning",
      "Everyone's heads down",
      "You ask a simple question",
      "Nobody told Priya",
    ],
    "The Market": ["Faster agents, slower teams"],
    "The Insight": ["The new unit of work", "No centaurs"],
    "The Product": [
      "Threads, not tools",
      "The three views",
      "Thread Tree",
      "Session Graph",
      "Cross-Session Links",
      "The Remix",
      "Remix Workspace",
      "Gemini Terminal",
      "Divergence detection",
      "Context Injection",
      "Web Inject UI",
    ],
    "VS Code Extension": [
      "VS Code Extension",
      "VS Code Extension screenshot",
    ],
    Architecture: [
      "System overview",
      "Data flow",
      "The MCP bridge",
      "Tool reference",
    ],
    "Live Demo": ["See it live"],
    "Appendix: Labs": [
      "Ambient Displays",
      "Knowledge Base",
      "Physical Displays",
    ],
  },

  slides: [
    // ── THE PROBLEM ──────────────────────────────────
    {
      type: "bullets",
      title: "Saturday morning",
      subtitle: "MIT Reality Hack. Your team just formed.",
      items: [
        "You're building an AR app that translates sign language in real-time.",
        "48 hours to ship.",
      ],
    },
    {
      type: "bullets",
      title: "Everyone's heads down",
      subtitle: "Hour 3. Everyone is deep in their own world.",
      items: [
        "Sarah: Unity scene, hand tracking overlay. Two agents running.",
        "Marco: backend, text-to-speech output. Three terminals.",
        "Priya: UI design, caption placement. Cursor + Gemini.",
        "You: hand pose recognition model. Two agents, different branches.",
        "Nobody knows what anyone else's AI has figured out.",
      ],
    },
    {
      type: "bullets",
      title: "You ask a simple question",
      items: [
        'You walk over to Marco. "What format should I send the recognized signs in?"',
        "He gives you a quick answer. JSON, a text field.",
        "But his agent spent 40 minutes evaluating three TTS services, benchmarking latency, picking one for a specific reason.",
        "You get the format. You don't get the reasoning. Your agent re-evaluates the same options from scratch.",
      ],
    },
    {
      type: "bullets",
      title: "Nobody told Priya",
      items: [
        "Priya designed her caption UI around hand tracking bounding boxes.",
        "Sarah scrapped that approach 20 minutes ago. Switched to wrist anchoring.",
        "Priya won't find out until they try to integrate tonight.",
        "<strong>There is nothing for this today.</strong>",
      ],
    },

    // ── THE MARKET ──────────────────────────────────
    {
      type: "bars",
      title: "Faster agents, slower teams",
      items: [
        { label: "AI-generated PRs wait longer for review", value: 460, display: "4.6x", color: "var(--error)" },
        { label: "AI code churn rate vs human code", value: 141, display: "+41%", color: "var(--warning)" },
        { label: "Context switching increase with AI tools", value: 147, display: "+47%", color: "#c77a30" },
        { label: "Developers who say AI improved team collaboration", value: 17, display: "17%", color: "var(--success)" },
      ],
      source: "92% of devs use AI daily. $34B market. Yet only 17% say it helps collaboration.",
    },

    // ── THE INSIGHT ──────────────────────────────────
    {
      type: "bullets",
      title: "The new unit of work",
      subtitle: "Something changed and the tooling hasn't caught up",
      items: [
        "Sarah with her coding agent is a compound intelligence.",
        "She steers. The AI executes. They think together.",
        "Your team isn't 4 people. It's 4 human+AI pairs, each running multiple agents.",
        "Everyone is adopting agents. Nobody has solved how they coordinate across people.",
      ],
    },
    {
      type: "quote",
      title: "No centaurs",
      subtitle: "The centaur model — human + AI as a stable pair — is already breaking down",
      quote: "it's just so clear humans are the bottleneck to writing software. number of agents we can manage, information flow, state management. there will just be no centaurs soon as it is not a stable state",
      attribution: "@tszzl (roon)",
    },

    // ── THE PRODUCT ──────────────────────────────────
    {
      type: "bullets",
      title: "Threads, not tools",
      subtitle: "Every AI conversation is a thread. Like git branches for context.",
      items: [
        "Each terminal session — Claude Code, Cursor, Gemini — is a <strong>thread</strong>.",
        "Threads capture everything: decisions, code, blockers, reasoning.",
        "You can <strong>see</strong> any teammate's threads, <strong>pull</strong> specific context, or <strong>remix</strong> threads together.",
        'No copy-paste. No "hey what did your agent figure out?" No re-doing work.',
      ],
    },
    {
      type: "diagram",
      title: "The three views",
      diagramKey: "three-views",
    },
    {
      type: "image",
      title: "Thread Tree",
      subtitle: "Live view — every agent's threads, filterable by status, type, and agent",
      src: "/slides/thread-tree.png",
    },
    {
      type: "bullets",
      title: "Session Graph",
      subtitle: "Visual map of all sessions and their connections",
      items: [
        "Each session is a horizontal bar showing memory distribution over time.",
        "Cross-session links appear as curved edges connecting memories.",
        "Colors indicate link type: <strong>blue</strong> (reference), <strong>pink</strong> (inject), <strong>green</strong> (fork).",
        "Click any session to view its detail panel alongside the graph.",
      ],
    },
    {
      type: "bullets",
      title: "Cross-Session Links",
      subtitle: "Connect memories across agent boundaries",
      items: [
        "<strong>Reference</strong>: read-only pointer — \"see also\" without pushing context.",
        "<strong>Inject</strong>: push context to target agent — they see it in their inbox.",
        "<strong>Fork</strong>: mark where a session branched from another's work.",
        "Search for memories with <strong>remix_search</strong>, fetch with <strong>remix_fetch</strong>.",
        "Links persist and show in the Session Graph as curved connection edges.",
      ],
    },
    {
      type: "diagram",
      title: "The Remix",
      subtitle: "3-panel workspace: Browse \u2192 Context \u2192 Gemini Terminal",
      diagramKey: "the-remix",
    },
    {
      type: "image",
      title: "Remix Workspace",
      subtitle: "Browse sessions on the left, drag into context, chat with Gemini on the right",
      src: "/slides/remix-view.png",
    },
    {
      type: "bullets",
      title: "Gemini Terminal",
      subtitle: "A live AI agent that understands all the context you've assembled",
      items: [
        "The right panel isn't just a preview — it's a <strong>Gemini-powered chat</strong>.",
        "System context auto-updates as you drag memories into the context panel.",
        'Ask questions across threads: "What did Sarah and Marco decide about latency?"',
        "Generate integration plans, find conflicts, surface shared decisions.",
        "Every terminal session becomes a new thread — shareable with the whole team.",
      ],
    },
    {
      type: "diagram",
      title: "Divergence detection",
      subtitle: "Get alerted when teammates' threads go in different directions",
      diagramKey: "divergence",
    },
    {
      type: "diagram",
      title: "Context Injection",
      subtitle: "Push context to any agent — they see it on their next tool call",
      diagramKey: "injection-pipeline",
    },
    {
      type: "bullets",
      title: "Web Inject UI",
      subtitle: "Inline inject panel in the thread tree — no separate page",
      items: [
        "Target any agent or broadcast to all.",
        "Priority levels: normal, high, <strong>urgent</strong> (triggers native VS Code popup).",
        "Per-agent inject button (<strong>\u21e8</strong>) for quick targeted sends.",
        "Content flows through Supabase → piggybacks on the agent's next MCP tool response.",
      ],
    },

    // ── VS CODE EXTENSION ──────────────────────────────────
    {
      type: "bullets",
      title: "VS Code Extension",
      subtitle: "Full team awareness without leaving your editor",
      items: [
        "Realtime sidebar: hierarchical <strong>User \u2192 Session</strong> tree with live status indicators.",
        "Activity feed: session starts, completions, injections, knowledge stored — all in real-time.",
        "<strong>Cmd+Shift+I</strong>: select code, pick agent, inject — 3 steps.",
        "Knowledge <strong>CodeLens</strong>: see relevant team knowledge inline in your editor.",
        "No context switching. No web dashboard needed.",
      ],
    },
    {
      type: "image",
      title: "VS Code Extension screenshot",
      subtitle: "Hierarchical sessions, live activity feed, one-key injection",
      src: "/slides/vscode-extension.png",
    },

    // ── ARCHITECTURE ──────────────────────────────────
    {
      type: "diagram",
      title: "System overview",
      subtitle: "Stateless MCP server + Supabase + React dashboard",
      diagramKey: "architecture",
    },
    {
      type: "diagram",
      title: "Data flow",
      subtitle: "From agent terminal to shared context in real-time",
      diagramKey: "data-flow",
    },
    {
      type: "diagram",
      title: "The MCP bridge",
      subtitle: "One URL connects any AI agent to the mesh",
      diagramKey: "mcp-bridge",
    },
    {
      type: "diagram",
      title: "Tool reference",
      subtitle: "20 tools organized in 5 categories",
      diagramKey: "tool-reference",
    },

    // ── LIVE DEMO ──────────────────────────────────
    {
      type: "bullets",
      title: "See it live",
      items: [
        "1. Open two Claude Code terminals \u2192 both connect to the same room via one URL.",
        "2. Agent alpha starts working on auth. Agent beta starts on the database.",
        "3. Open the web dashboard \u2192 see both threads in real-time.",
        "4. Spot the <strong>divergence indicator</strong> — alpha and beta are solving the same problem differently.",
        "5. Open Remix \u2192 browse memories \u2192 drag both threads into context \u2192 ask Gemini to integrate.",
      ],
    },
    // ── APPENDIX: LABS ──────────────────────────────────
    {
      type: "bullets",
      title: "Ambient Displays",
      subtitle: "Always-on team awareness with pixel creatures",
      items: [
        "<strong>MiniRemix</strong>: Compact dashboard with deterministic pixel-art creatures per agent.",
        "Activity sparklines show recent work patterns at a glance.",
        "Pastel color palette for cozy, non-intrusive ambient presence.",
      ],
    },
    {
      type: "bullets",
      title: "Knowledge Base",
      subtitle: "Persistent project memory that survives across sessions",
      items: [
        "<strong>remix_learn</strong>: Store architecture decisions, conventions, gotchas, API patterns.",
        "<strong>remix_knowledge</strong>: Retrieve and search the knowledge base by tags or content.",
        "Knowledge persists across all sessions and agents — new teammates inherit the full context automatically.",
      ],
    },
    {
      type: "bullets",
      title: "Physical Displays",
      subtitle: "E-ink, TFT touch, and Spectacles AR",
      items: [
        "<strong>E-ink</strong>: 7-color Waveshare display (600x448). Pastel palette, tracking marker for AR.",
        "<strong>TFT Touch</strong>: 3.5\" ILI9341 with pygame. Tap agents, send injections, view details.",
        "<strong>Spectacles</strong>: Image tracking anchors AR panel to physical e-ink display.",
        "All three share the same Supabase backend — unified team awareness across form factors.",
      ],
    },
  ],

  closing: {
    title: "Remix",
    subtitle: "The coordination layer for human+AI teams",
  },
};
