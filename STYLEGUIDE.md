# Eywa Design System - "Nightly Aurora"

A comprehensive design system inspired by bioluminescent particles converging toward a shared consciousness. Dark cosmic backgrounds with vibrant aurora accents that flow like the northern lights.

## Philosophy

Eywa connects AI agents like neurons in a shared mind. The visual language reflects this:
- **Dark space** - the void where agents operate
- **Aurora colors** - the connections, data, and energy flowing between them
- **Converging particles** - agents drawn together toward shared understanding
- **Heartbeat pulses** - the rhythm of coordination, knowledge spreading outward

---

## Color Palette

### Backgrounds
Deep space blues - almost black but with subtle blue undertones.

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-base` | `#08090f` | Main app background |
| `--bg-elevated` | `#0c0e16` | Elevated surfaces (header, sidebar) |
| `--bg-surface` | `#10121c` | Cards, panels, inputs |
| `--bg-surface-hover` | `#151824` | Hover states |
| `--bg-surface-active` | `#1a1e2e` | Active/selected states |

### Aurora Accents
The core identity colors - vibrant, flowing, alive.

| Token | Value | Meaning |
|-------|-------|---------|
| `--aurora-cyan` | `#4eeaff` | Fresh, energetic, data flowing |
| `--aurora-blue` | `#6b8cff` | Trust, stability, primary brand |
| `--aurora-purple` | `#a855f7` | Creative, AI, intelligence |
| `--aurora-pink` | `#f472b6` | Human, warmth, connection |
| `--aurora-green` | `#4ade80` | Success, growth, harmony |

### Text
High contrast for readability on dark backgrounds.

| Token | Value | Usage |
|-------|-------|-------|
| `--text-primary` | `#f0f2f8` | Primary text |
| `--text-secondary` | `rgba(240,242,248,0.7)` | Secondary text |
| `--text-tertiary` | `rgba(240,242,248,0.5)` | Tertiary/helper text |
| `--text-muted` | `rgba(240,242,248,0.35)` | Muted/disabled text |

---

## Gradients

The aurora gradient is Eywa's signature - use it for emphasis.

### Primary Aurora Gradient
Purple → Pink → Cyan

```css
--gradient-aurora: linear-gradient(
  135deg,
  var(--aurora-purple) 0%,
  var(--aurora-pink) 50%,
  var(--aurora-cyan) 100%
);
```

**Use for:**
- Primary buttons
- Hero text
- Featured badges
- Logo treatments
- Key CTAs

### Cool Gradient
Blue → Cyan

```css
--gradient-cool: linear-gradient(135deg, var(--aurora-blue) 0%, var(--aurora-cyan) 100%);
```

**Use for:**
- Info states
- Data visualizations
- Secondary emphasis

### Warm Gradient
Purple → Pink

```css
--gradient-warm: linear-gradient(135deg, var(--aurora-purple) 0%, var(--aurora-pink) 100%);
```

**Use for:**
- AI/agent related elements
- Creative features
- Accents

---

## Typography

### Font Stack
```css
--font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
--font-mono: "JetBrains Mono", "SF Mono", "Fira Code", monospace;
```

### Scale
| Token | Size | Usage |
|-------|------|-------|
| `--text-xs` | 0.75rem | Badges, metadata |
| `--text-sm` | 0.875rem | Body text, UI elements |
| `--text-base` | 1rem | Default body |
| `--text-lg` | 1.125rem | Subheadings |
| `--text-xl` | 1.25rem | Section headings |
| `--text-2xl` | 1.5rem | Page headings |
| `--text-3xl` | 2rem | Hero subtext |
| `--text-4xl` | 2.5rem | Hero headlines |

---

## Spacing

Consistent rhythm using a 4px base.

| Token | Value |
|-------|-------|
| `--space-1` | 0.25rem (4px) |
| `--space-2` | 0.5rem (8px) |
| `--space-3` | 0.75rem (12px) |
| `--space-4` | 1rem (16px) |
| `--space-6` | 1.5rem (24px) |
| `--space-8` | 2rem (32px) |
| `--space-12` | 3rem (48px) |
| `--space-16` | 4rem (64px) |

---

## Border Radius

Soft, friendly corners.

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 4px | Small elements, badges |
| `--radius-md` | 6px | Buttons, inputs |
| `--radius-lg` | 10px | Cards |
| `--radius-xl` | 14px | Panels, modals |
| `--radius-2xl` | 20px | Large containers |
| `--radius-full` | 9999px | Pills, avatars |

---

## Shadows & Glows

### Shadows
For depth and elevation.

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.5);
--shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.6);
```

### Aurora Glows
For emphasis and interactivity.

```css
--glow-cyan: 0 0 20px var(--aurora-cyan-glow), 0 0 40px var(--aurora-cyan-glow);
--glow-purple: 0 0 20px var(--aurora-purple-glow), 0 0 40px var(--aurora-purple-glow);
--glow-pink: 0 0 20px var(--aurora-pink-glow), 0 0 40px var(--aurora-pink-glow);
```

**Use glows for:**
- Hover states on interactive elements
- Active/focused states
- Status indicators (active agents)
- Important notifications

---

## Components

### Buttons

**Primary** - Aurora gradient, dark text
```css
.eywa-btn-primary {
  background: var(--gradient-aurora);
  color: var(--bg-base);
}
```

**Secondary** - Surface with border
```css
.eywa-btn-secondary {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  color: var(--text-primary);
}
```

**Ghost** - Transparent, subtle
```css
.eywa-btn-ghost {
  background: transparent;
  color: var(--text-secondary);
}
```

### Cards

Cards should have subtle borders and hover states with aurora glows.

```css
.eywa-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}

.eywa-card:hover {
  border-color: var(--aurora-purple);
  box-shadow: 0 0 30px var(--aurora-purple-glow);
}
```

### Badges

Use aurora colors for semantic meaning.

| Badge | Color | Meaning |
|-------|-------|---------|
| User | `--aurora-blue` | Human input |
| Assistant | `--aurora-green` | AI response |
| Tool | `--aurora-purple` | Tool/function call |
| Resource | `--aurora-cyan` | File/data |

### Status Indicators

| Status | Color | Glow |
|--------|-------|------|
| Active | `--aurora-green` | Yes, pulsing |
| Working | `--aurora-cyan` | Yes, pulsing |
| Idle | `--aurora-purple-dim` | No |
| Offline | `--text-muted` | No |

---

## Logo

The Eywa logo represents particles converging toward a shared center:

- **Center core**: Bright white/cyan - the shared consciousness
- **Particles**: Aurora colors (purple, pink, cyan, blue, green) - individual agents
- **Orbital paths**: Subtle gradient lines - the connections between agents
- **Background**: Dark space - the environment where agents operate

### Logo Files
- `/public/logo.svg` - Full logo with particles and orbitals
- `/public/icon.svg` - Simplified icon for favicons

### Logo Usage
- Always use on dark backgrounds
- Maintain minimum clear space equal to the core radius
- Don't alter the gradient colors
- Don't rotate or distort

---

## Animation

### Transitions
```css
--transition-fast: 100ms ease;    /* Micro-interactions */
--transition-normal: 150ms ease;  /* Default UI transitions */
--transition-slow: 250ms ease;    /* Larger animations */
--transition-slower: 400ms ease;  /* Page transitions */
```

### Key Animations

**Pulse Glow** - For active status indicators
```css
@keyframes pulse-glow {
  0%, 100% { opacity: 1; box-shadow: 0 0 8px var(--status-working); }
  50% { opacity: 0.6; box-shadow: 0 0 16px var(--status-working); }
}
```

**Heartbeat Wave** - Core Eywa animation
- Particles pulled toward center as wave passes
- Color shifts from base hue toward cyan/white
- Opacity increases in the wave front
- Interval: ~2.8 seconds

---

## Accessibility

- All text maintains WCAG AA contrast ratios on dark backgrounds
- Interactive elements have clear focus states (cyan outline)
- Status indicators use both color and animation (not color alone)
- Selection uses purple glow for visibility

---

## Do's and Don'ts

### Do
- Use the aurora gradient for primary CTAs and emphasis
- Apply glows on hover states
- Maintain dark backgrounds for the cosmic feel
- Let particles and animations draw attention

### Don't
- Use light backgrounds (breaks the cosmic theme)
- Overuse gradients (they lose impact)
- Apply glows to static elements
- Use harsh white - prefer off-white (#f0f2f8)
