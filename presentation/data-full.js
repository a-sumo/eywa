const presentation = {
  title: "Eywa",
  subtitle: "The coordination layer for human+AI teams",
  summary: [
    "1. The Problem",
    "2. The Market",
    "3. The Insight",
    "4. The Product",
    "5. Let's Build",
  ],

  sections: {
    "The Problem": ["The Scene", "Hour 3", "The Question", "Stale"],
    "The Market": ["The Explosion", "The Players", "The Paradox", "The Missing Layer"],
    "The Insight": ["The New Unit", "The Gap", "The Hard Part"],
    "The Product": ["Eywa", "From 0 to 1", "On Your Laptop", "On Your Phone", "At Integration"],
    "Let's Build": ["What Exists", "The Ask"],
  },

  slides: [
    // ── THE PROBLEM ──────────────────────────────────
    {
      title: "The Scene",
      type: "bullets",
      subtitle: "Saturday morning. MIT Reality Hack. Your team just formed.",
      items: [
        "You're building an AR app that translates sign language in real-time.",
        "48 hours to ship.",
      ]
    },

    {
      title: "Hour 3",
      type: "bullets",
      subtitle: "Everyone is deep in their own world",
      items: [
        "Sarah: Unity scene, hand tracking overlay. Two agents running.",
        "Marco: backend, text-to-speech output. Three terminals.",
        "Priya: UI design, caption placement. Cursor + Gemini.",
        "You: hand pose recognition model. Two agents, different branches.",
        "Nobody knows what anyone else's AI has figured out.",
      ]
    },

    {
      title: "The Question",
      type: "bullets",
      subtitle: "",
      items: [
        "You walk over to Marco. \"What format should I send the recognized signs in?\"",
        "He gives you a quick answer. JSON, a text field.",
        "But his agent spent 40 minutes evaluating three TTS services, benchmarking latency, picking one for a specific reason.",
        "You get the format. You don't get the reasoning. Your agent re-evaluates the same options from scratch.",
      ]
    },

    {
      title: "Stale",
      type: "bullets",
      subtitle: "",
      items: [
        "Meanwhile, Priya designed her caption UI around hand tracking bounding boxes.",
        "Sarah scrapped that approach 20 minutes ago. Switched to wrist anchoring.",
        "Priya won't find out until they try to integrate tonight.",
        "<strong>There is nothing for this today.</strong>",
      ]
    },

    // ── THE MARKET ──────────────────────────────────
    {
      title: "The Explosion",
      type: "bigstat",
      subtitle: "AI coding tools grew faster than any dev category in history",
      stats: [
        { value: "92%", label: "of US developers use AI coding tools daily" },
        { value: "41%", label: "of all code globally is now AI-generated" },
        { value: "$34B", label: "AI code tools market in 2026" },
      ]
    },

    {
      title: "The Players",
      type: "logogrid",
      subtitle: "Everyone is building faster individual agents",
      items: [
        { name: "Gemini", stat: "650M users", detail: "85B API calls/mo, 85K enterprises" },
        { name: "GitHub Copilot", stat: "20M users", detail: "90% of Fortune 100, 1.3M paid" },
        { name: "Cursor", stat: "$29B valuation", detail: "$1B+ ARR, 1M daily active devs" },
        { name: "Claude Code", stat: "115K devs", detail: "195M lines/week, 300% growth" },
        { name: "Replit", stat: "$9B valuation", detail: "$240M revenue, 150K paying" },
        { name: "Lovable", stat: "$6.6B valuation", detail: "8M users, 100K projects/day" },
      ]
    },

    {
      title: "The Paradox",
      type: "bars",
      subtitle: "Faster agents. Slower teams.",
      items: [
        { label: "AI-generated PRs wait longer for review", value: 460, display: "4.6x", color: "#ef4444" },
        { label: "AI code churn rate vs human code", value: 141, display: "+41%", color: "#f59e0b" },
        { label: "Context switching increase with AI tools", value: 147, display: "+47%", color: "#f97316" },
        { label: "Developers who say AI improved team collaboration", value: 17, display: "17%", color: "#22c55e" },
      ],
      source: "Stack Overflow 2025, DORA 2025, LinearB 2025, GitClear 2024"
    },

    {
      title: "The Missing Layer",
      type: "diagram",
      content: `<div class="layer-diagram">
        <div class="layer-row">
          <div class="layer-box layer-exists">Gemini</div>
          <div class="layer-box layer-exists">Copilot</div>
          <div class="layer-box layer-exists">Claude</div>
          <div class="layer-box layer-exists">Cursor</div>
        </div>
        <div class="layer-label">Individual AI agents <span class="check">&#10003;</span></div>
        <div class="layer-row">
          <div class="layer-box layer-exists">MCP</div>
          <div class="layer-box layer-exists">A2A</div>
        </div>
        <div class="layer-label">Agent protocols <span class="check">&#10003;</span></div>
        <div class="layer-row">
          <div class="layer-box layer-missing">???</div>
        </div>
        <div class="layer-label layer-label-missing">Team coordination for compound intelligences <span class="x-mark">&#10007;</span></div>
      </div>`,
      subtitle: "Protocols exist. Products don't."
    },

    // ── THE INSIGHT ──────────────────────────────────
    {
      title: "The New Unit",
      type: "bullets",
      subtitle: "Something changed and the tooling hasn't caught up",
      items: [
        "Sarah with her coding agent is a compound intelligence.",
        "She steers. The AI executes. They think together.",
        "Your team isn't 4 people. It's 4 human+AI pairs, each running multiple agents.",
      ]
    },

    {
      title: "The Gap",
      type: "bigstat",
      subtitle: "",
      stats: [
        { value: "8.4h", label: "lost per developer per week to knowledge silos" },
        { value: "53-86%", label: "token waste from redundant context in multi-agent systems" },
        { value: "1,445%", label: "surge in multi-agent system inquiries (Gartner, 2024-2025)" },
      ],
      footnote: "Everyone is adopting agents. Nobody has solved how they coordinate across people."
    },

    {
      title: "The Hard Part",
      type: "bullets",
      subtitle: "You can't just share everything",
      items: [
        "Dumping all context into every agent explodes context windows. Creates noise.",
        "Your CV agent doesn't need Priya's UI copy. Marco's API agent doesn't need Sarah's shader code.",
        "Context goes stale fast. Syncing Sarah's old spatial anchor decisions to Priya is actively harmful.",
        "You need <strong>selective, pull-based sync</strong>. The right data, to the right agent, when it asks.",
      ]
    },

    // ── THE PRODUCT ──────────────────────────────────
    {
      title: "Eywa",
      type: "bullets",
      subtitle: "Shared memory across your team's human+AI pairs",
      items: [
        "Every agent logs its work to a shared memory. Decisions, files, blockers, progress.",
        "Anyone can pull specific context from any teammate's agent, on demand.",
        "A live feed shows what every agent on the team is doing right now.",
      ]
    },

    {
      title: "From 0 to 1",
      type: "timeline",
      subtitle: "",
      items: [
        { year: "0", title: "Create a room", description: "One click. Get a code. Share it with Sarah, Marco, and Priya." },
        { year: "\u2192", title: "Everyone joins", description: "One command each. All agents connect to the shared memory." },
        { year: "\u2192", title: "Everyone works", description: "Agents log automatically. The shared feed fills up in real time." },
        { year: "1", title: "Pull what you need", description: "One command. A teammate's agent context lands in your session." },
      ]
    },

    {
      title: "On Your Laptop",
      type: "bullets",
      subtitle: "",
      items: [
        "Live dashboard in the browser. See all agent activity updating.",
        "Tap into Sarah's stream. See she pivoted from spatial anchors to plane detection. See why.",
        "Pull Marco's voice API research into your terminal. Your agent picks up where his left off.",
      ]
    },

    {
      title: "On Your Phone",
      type: "bullets",
      subtitle: "",
      items: [
        "Same shared URL. Works on any phone.",
        "Voice input: \"What's Priya working on?\"",
        "Post to the team: \"CV pipeline outputs bounding boxes at 30fps.\"",
        "Stay in the loop without opening a laptop.",
      ]
    },

    {
      title: "At Integration",
      type: "bullets",
      subtitle: "Sunday night. Time to merge.",
      items: [
        "Priya already knows Sarah switched to plane detection. She pulled her context hours ago.",
        "Marco's API decisions are in your agent's memory. No surprises.",
        "Everyone's agents already know what the others decided.",
        "You integrate in hours, not in a panic.",
      ]
    },

    // ── LET'S BUILD ──────────────────────────────────
    {
      title: "What Exists",
      type: "bullets",
      subtitle: "Working prototype. Runs today.",
      items: [
        "Server that connects to any AI coding agent via MCP. Compatible with Gemini, Claude, Copilot.",
        "Web dashboard with real-time updates. Desktop and mobile.",
        "One-command onboarding per teammate.",
        "Open source. Built on Google Cloud + Supabase.",
      ]
    },

    {
      title: "The Ask",
      type: "bullets",
      subtitle: "",
      items: [
        "The problem is real. Everyone building with AI teammates feels it.",
        "The prototype works. The gap in tooling is wide open.",
        "I need a talented builder to turn this into a product this weekend.",
        "If you've felt this pain, let's fix it.",
      ]
    },
  ],

  closing: {
    title: "Eywa",
    subtitle: "The compound intelligence is here. Nothing is built for it yet."
  }
};
