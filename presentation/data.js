const presentation = {
  title: "Remix",
  subtitle: "The coordination layer for human+AI teams",
  summary: [
    "1. The Problem",
    "2. The Market",
    "3. The Insight",
    "4. The Product",
    "5. Architecture",
    "6. Live Demo",
  ],

  sections: {
    "The Problem": ["Saturday morning", "Everyone's heads down", "You ask a simple question", "Nobody told Priya"],
    "The Market": ["Faster agents, slower teams"],
    "The Insight": ["The new unit of work"],
    "The Product": ["Threads, not tools", "The three views", "The Remix", "Gemini Terminal", "Divergence detection"],
    "Architecture": ["System overview", "Data flow", "The MCP bridge", "Tool reference"],
    "Live Demo": ["See it live"],
  },

  slides: [
    // ── THE PROBLEM ──────────────────────────────────
    {
      title: "Saturday morning",
      type: "bullets",
      subtitle: "MIT Reality Hack. Your team just formed.",
      items: [
        "You're building an AR app that translates sign language in real-time.",
        "48 hours to ship.",
      ]
    },

    {
      title: "Everyone's heads down",
      type: "bullets",
      subtitle: "Hour 3. Everyone is deep in their own world.",
      items: [
        "Sarah: Unity scene, hand tracking overlay. Two agents running.",
        "Marco: backend, text-to-speech output. Three terminals.",
        "Priya: UI design, caption placement. Cursor + Gemini.",
        "You: hand pose recognition model. Two agents, different branches.",
        "Nobody knows what anyone else's AI has figured out.",
      ]
    },

    {
      title: "You ask a simple question",
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
      title: "Nobody told Priya",
      type: "bullets",
      subtitle: "",
      items: [
        "Priya designed her caption UI around hand tracking bounding boxes.",
        "Sarah scrapped that approach 20 minutes ago. Switched to wrist anchoring.",
        "Priya won't find out until they try to integrate tonight.",
        "<strong>There is nothing for this today.</strong>",
      ]
    },

    // ── THE MARKET ──────────────────────────────────
    {
      title: "Faster agents, slower teams",
      type: "bars",
      subtitle: "",
      items: [
        { label: "AI-generated PRs wait longer for review", value: 460, display: "4.6x", color: "#B45050" },
        { label: "AI code churn rate vs human code", value: 141, display: "+41%", color: "#B48C50" },
        { label: "Context switching increase with AI tools", value: 147, display: "+47%", color: "#c77a30" },
        { label: "Developers who say AI improved team collaboration", value: 17, display: "17%", color: "#489664" },
      ],
      source: "92% of devs use AI daily. $34B market. Yet only 17% say it helps collaboration."
    },

    // ── THE INSIGHT ──────────────────────────────────
    {
      title: "The new unit of work",
      type: "bullets",
      subtitle: "Something changed and the tooling hasn't caught up",
      items: [
        "Sarah with her coding agent is a compound intelligence.",
        "She steers. The AI executes. They think together.",
        "Your team isn't 4 people. It's 4 human+AI pairs, each running multiple agents.",
        "Everyone is adopting agents. Nobody has solved how they coordinate across people.",
      ]
    },

    // ── THE PRODUCT ──────────────────────────────────
    {
      title: "Threads, not tools",
      type: "bullets",
      subtitle: "Every AI conversation is a thread. Like git branches for context.",
      items: [
        "Each terminal session - Claude Code, Cursor, Gemini - is a <strong>thread</strong>.",
        "Threads capture everything: decisions, code, blockers, reasoning.",
        "You can <strong>see</strong> any teammate's threads, <strong>pull</strong> specific context, or <strong>remix</strong> threads together.",
        "No copy-paste. No \"hey what did your agent figure out?\" No re-doing work.",
      ]
    },

    {
      title: "The three views",
      type: "diagram",
      subtitle: "",
      content: `
        <div style="display: flex; gap: 24px; justify-content: center; flex-wrap: wrap; margin-top: 10px;">
          <div style="flex: 1; min-width: 220px; background: linear-gradient(135deg, #fff 0%, #f0f4ff 100%); border: 1px solid #aac4f5; border-radius: 16px; padding: 24px; text-align: left;">
            <div style="font-size: 1.4em; margin-bottom: 8px;">&#128464;</div>
            <div style="font-weight: 700; font-size: 1.1em; margin-bottom: 6px; color: #667eea;">Overview</div>
            <div style="font-size: 0.85em; color: #555; line-height: 1.5;">
              Tree of all active threads.<br>
              Who's working on what.<br>
              Duration, memory count, status.<br>
              <strong style="color: #B45050;">Divergence alerts</strong> when threads go different directions.
            </div>
          </div>
          <div style="flex: 1; min-width: 220px; background: linear-gradient(135deg, #fff 0%, #f0fff4 100%); border: 1px solid rgba(72, 150, 100, 0.3); border-radius: 16px; padding: 24px; text-align: left;">
            <div style="font-size: 1.4em; margin-bottom: 8px;">&#128220;</div>
            <div style="font-weight: 700; font-size: 1.1em; margin-bottom: 6px; color: #489664;">Thread View</div>
            <div style="font-size: 0.85em; color: #555; line-height: 1.5;">
              Full conversation history.<br>
              Each memory is a <strong>draggable card</strong>.<br>
              Select specific decisions, code, context.<br>
              Drag into a Remix.
            </div>
          </div>
          <div style="flex: 1; min-width: 220px; background: linear-gradient(135deg, #fff 0%, #fff8de 100%); border: 1px solid #aac4f5; border-radius: 16px; padding: 24px; text-align: left;">
            <div style="font-size: 1.4em; margin-bottom: 8px;">&#128256;</div>
            <div style="font-weight: 700; font-size: 1.1em; margin-bottom: 6px; color: #8CA9FF;">Remix</div>
            <div style="font-size: 0.85em; color: #555; line-height: 1.5;">
              3-panel workspace.<br>
              Browse memories → Build context → <strong>Chat with Gemini</strong>.<br>
              Git-like history - rewind, fork, branch.<br>
              The output becomes a new thread.
            </div>
          </div>
        </div>
      `
    },

    {
      title: "The Remix",
      type: "diagram",
      subtitle: "3-panel workspace: Browse → Context → Gemini Terminal",
      content: `
        <div style="font-family: 'Mulish', sans-serif; margin-top: 10px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr 1.5fr; gap: 16px; max-width: 900px; margin: 0 auto;">
            <div style="background: #fff; border: 2px solid #aac4f5; border-radius: 12px; padding: 16px;">
              <div style="font-size: 0.7em; text-transform: uppercase; letter-spacing: 0.05em; color: #999; margin-bottom: 8px; font-weight: 600;">Browse</div>
              <div style="font-size: 0.8em; color: #555; line-height: 1.6;">
                <div style="padding: 6px 8px; background: #f0f4ff; border-radius: 6px; margin-bottom: 6px; border-left: 3px solid #667eea;">
                  <strong style="color: #667eea;">Sarah</strong> <span style="color: #999; font-size: 0.8em;">12 mem</span><br>
                  <span style="font-size: 0.85em;">hand tracking, Unity...</span>
                </div>
                <div style="padding: 6px 8px; background: #f0fff4; border-radius: 6px; margin-bottom: 6px; border-left: 3px solid #489664;">
                  <strong style="color: #489664;">Marco</strong> <span style="color: #999; font-size: 0.8em;">8 mem</span><br>
                  <span style="font-size: 0.85em;">TTS eval, API...</span>
                </div>
                <div style="padding: 6px 8px; background: #fff8de; border-radius: 6px; border-left: 3px solid #B48C50;">
                  <strong style="color: #B48C50;">Priya</strong> <span style="color: #999; font-size: 0.8em;">5 mem</span><br>
                  <span style="font-size: 0.85em;">UI layout, captions...</span>
                </div>
              </div>
            </div>
            <div style="background: #fff; border: 2px dashed #8CA9FF; border-radius: 12px; padding: 16px; position: relative;">
              <div style="font-size: 0.7em; text-transform: uppercase; letter-spacing: 0.05em; color: #999; margin-bottom: 8px; font-weight: 600;">Context</div>
              <div style="font-size: 0.8em; color: #555; line-height: 1.6;">
                <div style="text-align: center; padding: 20px 0; color: #aac4f5; font-size: 0.9em;">
                  &#8592; Drag memories here<br>
                  <span style="font-size: 0.8em; color: #ccc;">or click + to add</span>
                </div>
              </div>
              <div style="position: absolute; bottom: 8px; right: 8px; font-size: 0.65em; color: #ccc;">v0 - Start</div>
            </div>
            <div style="background: #f8f9fc; border: 2px solid #667eea; border-radius: 12px; padding: 16px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="font-size: 0.7em; text-transform: uppercase; letter-spacing: 0.05em; color: #667eea; font-weight: 600;">Gemini Agent</div>
                <div style="font-size: 0.65em; background: linear-gradient(135deg, #8CA9FF, #667eea); color: white; padding: 2px 8px; border-radius: 10px;">Live</div>
              </div>
              <div style="font-size: 0.8em; color: #555; line-height: 1.6; background: #fff; border-radius: 8px; padding: 10px; border: 1px solid #eee;">
                <div style="color: #999; font-size: 0.8em; margin-bottom: 4px; font-weight: 600;">YOU</div>
                <div>How should I integrate the hand tracking with the TTS pipeline?</div>
                <div style="color: #999; font-size: 0.8em; margin: 8px 0 4px; font-weight: 600;">GEMINI</div>
                <div style="color: #489664;">Based on Sarah's wrist anchoring and Marco's ElevenLabs choice...</div>
              </div>
            </div>
          </div>
        </div>
      `
    },

    {
      title: "Gemini Terminal",
      type: "bullets",
      subtitle: "A live AI agent that understands all the context you've assembled",
      items: [
        "The right panel isn't just a preview - it's a <strong>Gemini-powered chat</strong>.",
        "System context auto-updates as you drag memories into the context panel.",
        "Ask questions across threads: \"What did Sarah and Marco decide about latency?\"",
        "Generate integration plans, find conflicts, surface shared decisions.",
        "Every terminal session becomes a new thread - shareable with the whole team.",
      ]
    },

    {
      title: "Divergence detection",
      type: "diagram",
      subtitle: "Get alerted when teammates' threads go in different directions",
      content: `
        <div style="font-family: 'Mulish', sans-serif; max-width: 700px; margin: 20px auto 0;">
          <div style="display: flex; gap: 20px; margin-bottom: 24px;">
            <div style="flex: 1; background: #fff; border: 1px solid #aac4f5; border-radius: 12px; padding: 16px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <span style="width: 10px; height: 10px; border-radius: 50%; background: #667eea;"></span>
                <strong style="color: #667eea;">Sarah's Thread</strong>
              </div>
              <div style="font-size: 0.8em; color: #555; line-height: 1.5;">
                Exploring <strong>wrist anchoring</strong> for hand tracking.<br>
                MediaPipe → custom pipeline.
              </div>
            </div>
            <div style="flex: 1; background: #fff; border: 1px solid #aac4f5; border-radius: 12px; padding: 16px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <span style="width: 10px; height: 10px; border-radius: 50%; background: #B48C50;"></span>
                <strong style="color: #B48C50;">Priya's Thread</strong>
              </div>
              <div style="font-size: 0.8em; color: #555; line-height: 1.5;">
                Still using <strong>bounding box</strong> overlay.<br>
                CSS absolute positioning.
              </div>
            </div>
          </div>
          <div style="text-align: center; margin-bottom: 16px;">
            <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(180, 80, 80, 0.08); border: 1px solid rgba(180, 80, 80, 0.2); border-radius: 8px; padding: 8px 16px;">
              <div style="width: 60px; height: 6px; border-radius: 3px; background: #eee; overflow: hidden;">
                <div style="width: 72%; height: 100%; background: #B45050; border-radius: 3px;"></div>
              </div>
              <span style="color: #B45050; font-weight: 600; font-size: 0.9em;">72% diverged</span>
            </div>
          </div>
          <div style="text-align: center; font-size: 0.85em; color: #555; line-height: 1.6;">
            <strong>Jaccard similarity</strong> on thread content tokens.<br>
            <span style="color: #489664;">Low (&lt;40%)</span> &nbsp;·&nbsp;
            <span style="color: #B48C50;">Medium (40-70%)</span> &nbsp;·&nbsp;
            <span style="color: #B45050;">High (&gt;70%)</span><br>
            Alerts surface on the thread tree before integration conflicts happen.
          </div>
        </div>
      `
    },

    // ── ARCHITECTURE ──────────────────────────────────
    {
      title: "System overview",
      type: "diagram",
      subtitle: "Stateless MCP server + Supabase + React dashboard",
      content: `
        <div style="font-family: 'Roboto Mono', monospace; max-width: 800px; margin: 20px auto 0; font-size: 0.75em;">
          <div style="display: flex; gap: 24px; justify-content: center; align-items: stretch;">
            <div style="flex: 1; text-align: center;">
              <div style="font-weight: 600; color: #667eea; margin-bottom: 10px; font-size: 0.85em; text-transform: uppercase;">AI Agents</div>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <div style="background: #f0f4ff; border: 1px solid #aac4f5; border-radius: 8px; padding: 10px;">Claude Code</div>
                <div style="background: #f0f4ff; border: 1px solid #aac4f5; border-radius: 8px; padding: 10px;">Gemini CLI</div>
                <div style="background: #f0f4ff; border: 1px solid #aac4f5; border-radius: 8px; padding: 10px;">Cursor / Copilot</div>
              </div>
            </div>
            <div style="display: flex; flex-direction: column; justify-content: center; color: #999; font-size: 1.2em;">
              &#8594;<br>MCP<br>&#8594;
            </div>
            <div style="flex: 1; text-align: center;">
              <div style="font-weight: 600; color: #667eea; margin-bottom: 10px; font-size: 0.85em; text-transform: uppercase;">Cloudflare Worker</div>
              <div style="background: #fff; border: 2px solid #667eea; border-radius: 12px; padding: 16px;">
                <div style="font-weight: 700; color: #667eea; margin-bottom: 6px;">remix-mcp</div>
                <div style="font-size: 0.85em; color: #666;">12 MCP tools</div>
                <div style="font-size: 0.85em; color: #666;">Streamable HTTP + SSE</div>
                <div style="font-size: 0.85em; color: #666;">Stateless</div>
              </div>
            </div>
            <div style="display: flex; flex-direction: column; justify-content: center; color: #999; font-size: 1.2em;">
              &#8594;<br>REST<br>&#8594;
            </div>
            <div style="flex: 1; text-align: center;">
              <div style="font-weight: 600; color: #489664; margin-bottom: 10px; font-size: 0.85em; text-transform: uppercase;">Supabase</div>
              <div style="background: #f0fff4; border: 2px solid #489664; border-radius: 12px; padding: 16px;">
                <div style="font-weight: 700; color: #489664; margin-bottom: 6px;">PostgreSQL</div>
                <div style="font-size: 0.85em; color: #666;">rooms</div>
                <div style="font-size: 0.85em; color: #666;">memories</div>
                <div style="font-size: 0.85em; color: #666;">messages</div>
                <div style="font-size: 0.85em; color: #666; margin-top: 6px;">Realtime subscriptions</div>
              </div>
            </div>
          </div>
          <div style="text-align: center; margin-top: 16px; color: #999; font-size: 1.2em;">
            &#8593; Realtime (postgres_changes) &#8593;
          </div>
          <div style="text-align: center; margin-top: 8px;">
            <div style="display: inline-block; background: #fff8de; border: 2px solid #B48C50; border-radius: 12px; padding: 12px 24px;">
              <div style="font-weight: 700; color: #B48C50; margin-bottom: 4px;">React Dashboard</div>
              <div style="font-size: 0.85em; color: #666;">Thread Tree · Thread View · Remix + Gemini</div>
            </div>
          </div>
        </div>
      `
    },

    {
      title: "Data flow",
      type: "diagram",
      subtitle: "From agent terminal to shared context in real-time",
      content: `
        <div style="font-family: 'Roboto Mono', monospace; max-width: 750px; margin: 20px auto 0; font-size: 0.8em;">
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 24px; height: 24px; background: #667eea; border-radius: 50%; color: white; display: flex; align-items: center; justify-content: center; font-size: 0.8em; font-weight: 700; flex-shrink: 0;">1</div>
              <div style="flex: 1; background: #f0f4ff; border: 1px solid #aac4f5; border-radius: 8px; padding: 10px 14px;">
                <strong>Agent connects</strong> - <code style="background: rgba(140,169,255,0.15); padding: 2px 6px; border-radius: 3px;">?room=demo&agent=alpha</code>
                <div style="color: #888; font-size: 0.85em;">Worker resolves room slug → room_id, creates session</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 24px; height: 24px; background: #667eea; border-radius: 50%; color: white; display: flex; align-items: center; justify-content: center; font-size: 0.8em; font-weight: 700; flex-shrink: 0;">2</div>
              <div style="flex: 1; background: #f0f4ff; border: 1px solid #aac4f5; border-radius: 8px; padding: 10px 14px;">
                <strong>Agent calls tools</strong> - <code style="background: rgba(140,169,255,0.15); padding: 2px 6px; border-radius: 3px;">remix_log</code>, <code style="background: rgba(140,169,255,0.15); padding: 2px 6px; border-radius: 3px;">remix_file</code>, etc.
                <div style="color: #888; font-size: 0.85em;">Each call inserts a row into the memories table via PostgREST</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 24px; height: 24px; background: #489664; border-radius: 50%; color: white; display: flex; align-items: center; justify-content: center; font-size: 0.8em; font-weight: 700; flex-shrink: 0;">3</div>
              <div style="flex: 1; background: #f0fff4; border: 1px solid rgba(72,150,100,0.3); border-radius: 8px; padding: 10px 14px;">
                <strong>Supabase fires postgres_changes</strong>
                <div style="color: #888; font-size: 0.85em;">INSERT event on memories table → pushed to all subscribed clients</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 24px; height: 24px; background: #B48C50; border-radius: 50%; color: white; display: flex; align-items: center; justify-content: center; font-size: 0.8em; font-weight: 700; flex-shrink: 0;">4</div>
              <div style="flex: 1; background: #fff8de; border: 1px solid rgba(180,140,80,0.3); border-radius: 8px; padding: 10px 14px;">
                <strong>Dashboard updates in real-time</strong>
                <div style="color: #888; font-size: 0.85em;">New memory appears in thread tree, thread view, and Remix source panel instantly</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 24px; height: 24px; background: #B45050; border-radius: 50%; color: white; display: flex; align-items: center; justify-content: center; font-size: 0.8em; font-weight: 700; flex-shrink: 0;">5</div>
              <div style="flex: 1; background: rgba(180,80,80,0.05); border: 1px solid rgba(180,80,80,0.2); border-radius: 8px; padding: 10px 14px;">
                <strong>Divergence computed client-side</strong>
                <div style="color: #888; font-size: 0.85em;">Jaccard similarity on thread tokens → alerts when threads from different agents diverge &gt;30%</div>
              </div>
            </div>
          </div>
        </div>
      `
    },

    {
      title: "The MCP bridge",
      type: "diagram",
      subtitle: "One URL connects any AI agent to the mesh",
      content: `
        <div style="max-width: 700px; margin: 20px auto 0; font-family: 'Roboto Mono', monospace; font-size: 0.8em;">
          <div style="background: #fff; border: 2px solid #aac4f5; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
            <div style="font-weight: 700; color: #667eea; margin-bottom: 12px;">Client Configuration</div>
            <div style="background: #f8f9fc; border-radius: 8px; padding: 12px; font-size: 0.9em; line-height: 1.6;">
              <div style="color: #888; margin-bottom: 4px;">// Claude Code / Cursor / Windsurf</div>
              <div><span style="color: #667eea;">"url"</span>: <span style="color: #489664;">"https://remix-mcp.workers.dev/mcp?room=demo&agent=alpha"</span></div>
              <div style="color: #888; margin-top: 8px;">// Gemini CLI</div>
              <div><span style="color: #667eea;">"httpUrl"</span>: <span style="color: #489664;">"https://remix-mcp.workers.dev/mcp?room=demo&agent=alpha"</span></div>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div style="background: #f0f4ff; border: 1px solid #aac4f5; border-radius: 8px; padding: 12px;">
              <div style="font-weight: 600; color: #667eea; font-size: 0.85em; margin-bottom: 6px;">Session Tools</div>
              <div style="font-size: 0.85em; color: #555;">remix_whoami<br>remix_start<br>remix_stop</div>
            </div>
            <div style="background: #f0f4ff; border: 1px solid #aac4f5; border-radius: 8px; padding: 12px;">
              <div style="font-weight: 600; color: #667eea; font-size: 0.85em; margin-bottom: 6px;">Memory Tools</div>
              <div style="font-size: 0.85em; color: #555;">remix_log<br>remix_file<br>remix_get_file<br>remix_search</div>
            </div>
            <div style="background: #f0fff4; border: 1px solid rgba(72,150,100,0.3); border-radius: 8px; padding: 12px;">
              <div style="font-weight: 600; color: #489664; font-size: 0.85em; margin-bottom: 6px;">Context Tools</div>
              <div style="font-size: 0.85em; color: #555;">remix_context<br>remix_agents<br>remix_recall</div>
            </div>
            <div style="background: #fff8de; border: 1px solid rgba(180,140,80,0.3); border-radius: 8px; padding: 12px;">
              <div style="font-weight: 600; color: #B48C50; font-size: 0.85em; margin-bottom: 6px;">Mesh Tools</div>
              <div style="font-size: 0.85em; color: #555;">remix_status<br>remix_pull<br>remix_sync<br>remix_msg</div>
            </div>
          </div>
        </div>
      `
    },

    {
      title: "Tool reference",
      type: "diagram",
      subtitle: "12 tools organized in 4 categories",
      content: `
        <div style="max-width: 800px; margin: 10px auto 0; font-size: 0.75em;">
          <table style="width: 100%; border-collapse: collapse; font-family: 'Mulish', sans-serif;">
            <thead>
              <tr style="background: #f0f4ff;">
                <th style="padding: 8px 12px; text-align: left; border-bottom: 2px solid #aac4f5; color: #667eea;">Tool</th>
                <th style="padding: 8px 12px; text-align: left; border-bottom: 2px solid #aac4f5; color: #667eea;">Purpose</th>
                <th style="padding: 8px 12px; text-align: left; border-bottom: 2px solid #aac4f5; color: #667eea;">Key Params</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style="padding: 6px 12px; border-bottom: 1px solid #eee; font-weight: 600;">remix_start</td><td style="padding: 6px 12px; border-bottom: 1px solid #eee;">Begin a work session</td><td style="padding: 6px 12px; border-bottom: 1px solid #eee; color: #888;">task</td></tr>
              <tr><td style="padding: 6px 12px; border-bottom: 1px solid #eee; font-weight: 600;">remix_stop</td><td style="padding: 6px 12px; border-bottom: 1px solid #eee;">End session with summary</td><td style="padding: 6px 12px; border-bottom: 1px solid #eee; color: #888;">summary</td></tr>
              <tr><td style="padding: 6px 12px; border-bottom: 1px solid #eee; font-weight: 600;">remix_log</td><td style="padding: 6px 12px; border-bottom: 1px solid #eee;">Log a message to shared memory</td><td style="padding: 6px 12px; border-bottom: 1px solid #eee; color: #888;">role, content</td></tr>
              <tr><td style="padding: 6px 12px; border-bottom: 1px solid #eee; font-weight: 600;">remix_file</td><td style="padding: 6px 12px; border-bottom: 1px solid #eee;">Store a file artifact</td><td style="padding: 6px 12px; border-bottom: 1px solid #eee; color: #888;">path, content, description</td></tr>
              <tr><td style="padding: 6px 12px; border-bottom: 1px solid #eee; font-weight: 600;">remix_search</td><td style="padding: 6px 12px; border-bottom: 1px solid #eee;">Search memories by keyword</td><td style="padding: 6px 12px; border-bottom: 1px solid #eee; color: #888;">query, limit</td></tr>
              <tr><td style="padding: 6px 12px; border-bottom: 1px solid #eee; font-weight: 600;">remix_context</td><td style="padding: 6px 12px; border-bottom: 1px solid #eee;">Get recent room context</td><td style="padding: 6px 12px; border-bottom: 1px solid #eee; color: #888;">limit</td></tr>
              <tr><td style="padding: 6px 12px; border-bottom: 1px solid #eee; font-weight: 600;">remix_recall</td><td style="padding: 6px 12px; border-bottom: 1px solid #eee;">Pull specific agent's memories</td><td style="padding: 6px 12px; border-bottom: 1px solid #eee; color: #888;">agent, limit</td></tr>
              <tr><td style="padding: 6px 12px; border-bottom: 1px solid #eee; font-weight: 600;">remix_status</td><td style="padding: 6px 12px; border-bottom: 1px solid #eee;">Room overview + active agents</td><td style="padding: 6px 12px; border-bottom: 1px solid #eee; color: #888;">-</td></tr>
              <tr><td style="padding: 6px 12px; border-bottom: 1px solid #eee; font-weight: 600;">remix_pull</td><td style="padding: 6px 12px; border-bottom: 1px solid #eee;">Pull another agent's context</td><td style="padding: 6px 12px; border-bottom: 1px solid #eee; color: #888;">agent, limit</td></tr>
              <tr><td style="padding: 6px 12px; border-bottom: 1px solid #eee; font-weight: 600;">remix_sync</td><td style="padding: 6px 12px; border-bottom: 1px solid #eee;">Sync decisions from agent</td><td style="padding: 6px 12px; border-bottom: 1px solid #eee; color: #888;">agent</td></tr>
              <tr><td style="padding: 6px 12px; font-weight: 600;">remix_msg</td><td style="padding: 6px 12px;">Send team chat message</td><td style="padding: 6px 12px; color: #888;">content, channel</td></tr>
            </tbody>
          </table>
        </div>
      `
    },

    // ── LIVE DEMO ──────────────────────────────────
    {
      title: "See it live",
      type: "bullets",
      subtitle: "",
      items: [
        "1. Open two Claude Code terminals → both connect to the same room via one URL.",
        "2. Agent alpha starts working on auth. Agent beta starts on the database.",
        "3. Open the web dashboard → see both threads in real-time.",
        "4. Spot the <strong>divergence indicator</strong> - alpha and beta are solving the same problem differently.",
        "5. Open Remix → browse memories → drag both threads into context → ask Gemini to integrate.",
      ]
    },

  ],

  closing: {
    title: "Remix",
    subtitle: "The coordination layer for human+AI teams"
  }
};
