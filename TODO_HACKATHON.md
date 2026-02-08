# Eywa Hackathon TODOs (deadline: Feb 10, 2026)

## 1. Spectacles Connectivity
- Enable remote access to the demo room so anyone anywhere can log in
- Currently requires local setup; needs public demo URL or auth-free join flow

## 2. E-ink Display Content
- Design and implement visual content for the e-ink display
- Rendering pipeline and wiring are done and tested
- Need: agent status layout, activity feed design, tracking marker placement
- Enclosure template at ~/Downloads/enclosure_template_1to1.pdf

## 3. Mini TFT Display Content
- Visuals are good but Raspberry Pi setup not yet tested
- Test the full pipeline: Pi boot > TFT driver > content render > touch input
- See pi-display/TFT_GUIDE.md and pi-display/ili9341-lcd-touch-setup.md

## 4. Waveshare Display (stretch goal)
- Black and white, higher refresh rate
- Only if time permits after e-ink and TFT are solid
- See pi-display/raspberry-pi-waveshare-setup.md

## 5. Eywa Mascot
- Design mascot for Eywa brand
- Integrate into: e-ink display, TFT display, VS Code extension sidebar
- Logo exists at pi-display/eywalogo.png and web/public/eywa-logo-no-bg.svg

## 6. VS Code Extension Polish
- Tag terminals (associate terminal sessions with agent identities)
- Refine WHAT gets logged, to WHAT precision, and how far back in history
- Onboarding flow for first-time users (setup wizard or welcome panel)
- Current extension: agent tree sidebar, activity feed, context injection, knowledge lens

## 7. Spectacles Project Cleanup
- Clean up eywa-specs/ Lens Studio project
- Publish the lens to Snap's lens directory
- Ensure AR panel anchoring to physical displays works reliably

## 8. Display Enclosures
- Wrap e-ink and all other displays using cardboard paper
- Follow schemas in ~/Downloads/enclosure_template_1to1.pdf
- Goal: better user friendliness, increased virality on socials (polished physical product)

## 9. Global Knowledge Hub MVP (new)
- New Supabase table: global_insights (anonymized insight text, domain tags, timestamp, source workspace hash)
- 2 new MCP tools: eywa_publish_insight, eywa_query_network
- New API endpoint on existing Cloudflare Workers
- New dashboard section: global feed showing insights flowing across the network
- Demo clip: "my agent just learned from a stranger's agent"
