# Eywa

Observability and coordination layer for human + AI teams. Each person on a team directs AI agents that code, decide, and ship autonomously. Eywa gives the team visibility across every agent session so the humans stay aligned.

## Positioning and Copy

- **Eywa is for humans, not agents.** The product helps people coordinate when everyone on the team runs AI. The agents are the amplifier, humans are the steerers.
- **Always lead with the solution, never the problem.** Say what Eywa does. Two sentences, plain language. No cleverness, no negativity, no rhetorical questions. Be 80% accurate and 100% clear. (YC principle: "Socialcam is a mobile app that makes it easy to take videos and share them." No problem setup needed.)
- **No marketing speak.** No superlatives (fastest, first, best). No vague abstractions ("gap in intent"). Describe the product in words a teammate would use.
- **The core insight:** when every team member controls AI agents, small misalignments between people get amplified at machine speed. Eywa makes all agent work visible so humans know what to sync on.

## Project Structure

- `worker/` - Cloudflare Worker MCP server (Streamable HTTP). Supabase PostgREST wrapper, tool registration.
- `web/` - React/Vite web dashboard. Supabase JS SDK, realtime subscriptions.
- `discord-bot/` - Discord bot (discord.js + direct Supabase). 12 slash commands for team observability from chat.
- `eywa-specs/` - Lens Studio project for Snap Spectacles AR panel.
- `vscode-extension/` - VS Code extension: agent tree sidebar, activity feed, context injection, knowledge lens.
- `cli/` - `npx eywa-ai` CLI for zero-auth room setup and agent management.
- `pi-display/` - Raspberry Pi display scripts (e-ink, TFT touch).
- `schema.sql` - Supabase schema (rooms, memories, messages tables).

## Style

- **No em dashes.** Use hyphens, commas, or periods instead. Everywhere: code, comments, user-facing text, docs.
- Write naturally. No corporate/formal AI speak. No filler words, no "leverage", no "streamline", no "ensure".
- Keep it short. Say what you mean.

## Visual Design

See `DESIGN.md` for the full visual design system ("Nightly Aurora" theme).

Key rules for any UI work:
- **Never constant speed.** Always `ease-in-out` or multi-keyframe curves. Things accelerate and decelerate.
- **Each element dances independently.** Different durations (2-7s), different phases. No global sync. Life comes from interplay.
- **Deform, don't just move.** Combine `skewX/Y`, `rotate`, `scale` with `translate`. Lines bend, shapes warp.
- **Layer animations.** Flowing dashes + swaying transform on the same element, different periods.
- **Icons**: Inline SVGs, CSS keyframes, `stroke-dasharray`/`stroke-dashoffset` (ease-in-out, not linear), aurora colors, 2.5px strokes.
- **Fonts**: Plus Jakarta Sans for display/headings (`--font-display`), Inter for body (`--font-sans`).
- **Colors**: Aurora palette (purple/pink/cyan/blue/green) on dark space background. Use CSS vars from `web/src/styles/theme.css`.
- **Landing vs Dashboard**: Landing page is fluid/dancing/alive. Dashboard is interactive/minimal animation.

## Discord Bot

- Lives in `discord-bot/`. Run with `npm start`, deploy commands with `npm run deploy -- <guild_id>`.
- Uses direct Supabase queries, not MCP. Messages from Discord show as `discord/<username>`.
- Slash commands: help, room, status, agents, context, search, recall, inject, inbox, knowledge, learn, msg.

## Worker (MCP Server)

- Deployed on Cloudflare Workers. Entry: `worker/src/index.ts`.
- Thin fetch wrapper for Supabase PostgREST (no SDK, just HTTP).
- Agent identity: `{base_name}/{adjective}-{noun}` (e.g. `armand/quiet-oak`).
- Tools: session lifecycle, memory logging, file storage, context queries, collaboration, injection, knowledge base.

## Supabase

- URL and key in `worker/wrangler.toml` (vars) and `discord-bot/.env`.
- Three tables: `rooms`, `memories`, `messages`.
- `memories.metadata` JSONB stores event type, tags, injection targets, etc.
- `memories.message_type`: resource, user, assistant, tool_call, tool_result, injection, knowledge.
- MCP tool names use `eywa_*` prefix (e.g. `eywa_log`, `eywa_start`, `eywa_context`).
