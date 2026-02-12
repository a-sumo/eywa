# DevPost Submission Requirements

## Required Materials

1. **Gemini Integration Description (~200 words)**
   - Which Gemini 3 features were used
   - How they are central to the application

2. **Public Project Link**
   - URL to working product or interactive demo
   - AI Studio apps recommended for fastest prototyping
   - Must be publicly accessible, no login or paywall

3. **Public Code Repository URL**
   - Required if no AI Studio link

4. **Demo Video (~3 minutes)**
   - Judges may not watch beyond 3 minutes

## Our Links

- Public demo: https://remix-memory.vercel.app
- Code repo: https://github.com/a-sumo/remix
- Video: TBD

## Gemini Integration

Eywa uses Gemini across three layers of the stack: the web dashboard, the avatar pipeline, and the Spectacles AR interface. All agent memories and sessions are stored in Supabase hosted on Snap Cloud, which also handles realtime streaming so every interface (dashboard, CLI, Discord, Spectacles) stays in sync as agents work.

### Gemini Chat (`gemini-3-flash-preview`)

The dashboard has a context-aware chat panel where users drag agent memories into a drop zone, then query across them with Gemini. The model receives all selected memories as system context, so users can ask things like *"what did agent A decide about the API?"* or *"are there conflicts between these two sessions?"* This is the primary way humans make sense of a multi-agent swarm. The hook falls back through `gemini-2.5-flash` and `gemini-2.0-flash-lite` if rate limited.

### Image Generation (`gemini-2.5-flash-image`, `gemini-3-flash-preview`, `gemini-3-pro-image-preview`)

Each agent gets a unique animal avatar generated through Gemini's multimodal image generation. The pipeline prompts for cartoon-style mascots with consistent styling, falling back through multiple Gemini models before trying Imagen $4.0$.

### Spectacles AR (Gemini via RemoteServiceGateway)

On Snap Spectacles, Gemini powers the spatial tile layout. Agent memories are rendered as physical tiles in AR, and Gemini can reposition them at runtime based on content relevance, giving users a spatial view of their agent swarm in augmented reality.

---

> Gemini is the reasoning and creative backbone across every interface Eywa ships.
