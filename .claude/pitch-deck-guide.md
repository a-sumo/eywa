# Pitch Deck Guide

Compiled research from YC, Sequoia, Guy Kawasaki, and top presentation frameworks. Reference this for any presentation work.

## Slide Count

- **10-15 slides max** for a pitch. Audience retention drops sharply after 15.
- If you need more, put extras in an appendix section.
- Guy Kawasaki's 10/20/30 rule: 10 slides, 20 minutes, 30pt minimum font.

## Content Density

- **One idea per slide.** If you need a second idea, make a second slide.
- **3-4 bullets max** per bullet slide. Each bullet under 12 words.
- Strip filler words: "basically", "essentially", "in order to", "that being said".
- No walls of text. If it takes more than 6 seconds to read, it's too much.
- Let screenshots and diagrams do the heavy lifting. A good screenshot replaces 5 bullets.

## Typography

- **30pt minimum** for body text (Guy Kawasaki). Forces brevity.
- Display/heading font for titles, clean sans-serif for body.
- High contrast: light text on dark, or dark text on light. No mid-gray on light-gray.
- One font weight for emphasis (bold), not italic + underline + color.

## Icons and Visuals

- **No emoji in presentations.** They look unprofessional and render inconsistently across devices.
- Use inline SVG icons: monochrome, consistent stroke width, small viewBox (24x24).
- Icons should support the text, not replace it. Don't use an icon where a word works.
- Screenshots > mockups > diagrams > bullets. Show the real product.

## Color

- Pick 3-5 colors max. One primary, one accent, rest neutral.
- Use color for emphasis and hierarchy, not decoration.
- Consistent color coding: if blue means "product" on slide 3, it means "product" on slide 12.

## Storytelling Arc (Sequoia Framework)

1. **Problem** - What's broken? Make it feel real with a story.
2. **Market** - How big is this? Numbers that create urgency.
3. **Insight** - What do you see that others don't?
4. **Product** - Show it. Screenshots, demo, video.
5. **How it works** - Architecture, but only what's needed to understand the product.
6. **Traction** - Users, revenue, growth. Social proof.
7. **Team** - Why you?
8. **Ask** - What do you need?

## YC Demo Day Specifics

- 2 minutes. Ruthless editing.
- Lead with the problem, not the solution.
- One sentence that explains what you do. If it takes two, simplify.
- Show traction early. Numbers > words.

## Common Mistakes

- Too many architecture slides. Nobody cares about your database schema.
- Feature lists instead of benefits. "What does this let me do?" not "What technologies does it use?"
- Reading the slides aloud. Slides are visual aids, not teleprompters.
- Inconsistent design. Every slide should look like it belongs to the same deck.
- Light backgrounds on dark-themed decks (or vice versa). Pick one and stick with it.

## Data Points (DocSend, Papermark, Slidebean 2024-2025)

- Average investor deck review time: 2 min 24 sec - 3 min 44 sec
- First page gets 23 seconds (2x other pages). Nail the opening.
- Subsequent pages: ~15 seconds each
- 11-20 page decks are 43% more successful in raising
- Most common deck length: 9-16 pages (49% of all decks)
- Team slide attention increased 40% at seed stage (2024 vs 2023)
- Competition slide attention decreased 48% at seed
- Market size slide attention decreased 19% at pre-seed
- Decks with visuals are 43% more attention-grabbing
- Less than 1% of pitch decks result in funding (0.91% for US angel)
- If you fail to grab attention in first 30 seconds, you lose the entire pitch

## YC Partner Quotes

- Michael Seibel: "80% accurate, 100% clear beats the reverse."
- Michael Seibel: "Traction without a timeframe is not impressive."
- Dalton Caldwell: "If the founder is able to tell a good story and present a narrative that makes sense, you're going to follow them wherever they go."
- Garry Tan: "A strong pitch is simple statements said in a sequential way that doesn't require leaps of faith, but when taken together add up to a very big audacious idea."
- YC rule: No more than 7 words per slide (aspirational target)
- Jesse Heikkila (Failup Ventures): "If I don't know what your company does by Slide 3, I'm out."

## HN Audience Insights (for launches and landing pages)

**What works:**
- Lead with personal pain: "My agents kept forgetting what the other one did"
- Concrete numbers: time saved, cost, before/after metrics
- Unix philosophy framing: "composes with your existing workflow"
- Honest limitations: "this doesn't work for X yet" builds trust
- Local-first and open source are nearly prerequisites for HN trust
- LSP analogy works better than "protocol" framing for standards

**What gets killed:**
- "Multi-agent coordination platform" as headline (instant buzzword reaction)
- Leading with protocol names (MCP attracts reflexive skepticism)
- Vague claims about "agent collaboration" without showing the specific failure mode
- "Coordination layer", "collective intelligence" - corporate speak
- Architecture diagrams without working demos
- Any implication this replaces developer judgment
- "Works with all major LLMs" without showing it works well with any specific one

**Top objections to address:**
1. "Just use CLAUDE.md" - why shared memory > local files?
2. "Human review is the bottleneck, not code generation"
3. "This is just software engineering rebranded"
4. "Who can afford agents running all day?"
5. Security/trust: "I wouldn't send context to a third party"
