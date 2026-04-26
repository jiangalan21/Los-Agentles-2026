# Dayger Design System

## Design Philosophy

**House Party Energy, Not Corporate Dashboard**

Dayger is a morning dashboard that treats waking up like something worth getting excited about. The design avoids wellness-app sterility and productivity-tool boredom in favor of bold, confident, high-energy aesthetics borrowed from party culture—without tipping into rave intensity.

### Core Principles

1. **Information density with visual confidence** — Show everything in 4 seconds, but make it look good
2. **Clickable affordance** — Cards should signal interactivity before you touch them
3. **Color as structure** — Accent colors aren't decoration; they're wayfinding
4. **Typography does heavy lifting** — Large type, bold weights, intentional contrast
5. **Desktop-first, wide layouts** — Use horizontal space aggressively; no mobile stacking

---

## Color System

### Base Colors
- **Background**: `#151418` — Deep charcoal, not pure black
- **Foreground**: `#f8f8f8` — Soft white
- **Card**: `#1d1b21` — Slightly elevated surface
- **Muted**: `#2a272e` — Secondary surfaces
- **Border**: `rgba(255, 255, 255, 0.12)` — Subtle separation

### Accent Colors (Party Lights)
These are vivid, saturated colors meant to glow against the dark base. Used for highlights, active states, borders, and semantic coding—not as background fills.

- **Primary (Orange)**: `#ff9500` — Weather, main CTAs, brand accent
- **Secondary (Hot Pink)**: `#ff375f` — Outfit, destructive actions
- **Tertiary (Green)**: `#30d158` — Music, success states
- **Accent Purple**: `#bf5af2` — Energy, special highlights
- **Accent Blue**: `#0a84ff` — Supplementary accent

### Usage Rules
- Use accent colors for borders, text, icons, and small UI elements
- Apply transparency (`/10`, `/20`, `/30`) for backgrounds and glows
- Each card/section gets one primary accent color
- Shadows use the accent color at low opacity (e.g., `shadow-primary/20`)

---

## Typography

### Font Stack
- **Display/Headings**: `Syne` — Geometric, editorial, bold without being tactical
- **Logo**: `Archivo` (900 weight) — Ultra-black condensed for wordmark
- **Body**: `DM Sans` — Clean, readable, modern sans-serif

### Type Scale
- **Hero text**: `text-[9rem]` to `text-[12rem]` — Logo, landing page
- **H1 (Names)**: `clamp(4rem, 8vw, 8rem)` — Dashboard greeting
- **H2**: `text-5xl` to `text-6xl` — Card values, expanded panel headers
- **Body Large**: `text-xl` to `text-2xl` — Descriptions, subheadings
- **Body**: `text-base` to `text-lg` — Default content
- **Small/Labels**: `text-xs` — Metadata, category labels

### Typographic Hierarchy
1. **Display type** (logo, hero headlines): Use `font-display` (Syne), extrabold/black weights, tight line-height (0.9–0.95), negative letter-spacing
2. **Body copy**: Use `font-body` (DM Sans), regular to medium weights, relaxed line-height (1.5–1.6)
3. **Labels**: Use `font-body`, bold weight, uppercase, wide tracking

### Typography Rules
- Headlines should be embarrassingly large—they're design elements, not just text
- Contrast weight heavily: bold headlines with medium body copy
- Use uppercase sparingly, only for small labels and metadata
- Background typography (giant ghosted letters) adds depth without clutter

---

## Components

### Logo
**Structure**: Wordmark "Dayger" in Archivo Black with two horizontal bars underneath

**Variants**:
- `small`: 3xl text, for navigation
- `medium`: 5xl text, for dashboard header
- `large`: 7xl text
- `xlarge`: 9rem text, for landing page
- `hero`: 12rem text

**Color treatment**: "Day" in primary orange, "ger" in foreground white. Bars are primary and secondary colors.

---

### Cards (Dashboard)

**Anatomy**:
- 2px border (default: border color, hover: accent color)
- Left accent bar (2px wide, full height, accent color)
- Top-left icon in colored rounded square with glow
- Top-right chevron (hidden, appears on hover)
- Label (small, bold, accent colored)
- Value (5xl, bold, display font)
- Detail text (base, medium weight)
- Preview data (hidden, slides up on hover)
- Bottom accent bar (1px, appears on hover)

**Hover States**:
- Border transitions to accent color
- Card lifts (`-translate-y-2`)
- Shadow appears (2xl, accent/20)
- Icon scales up (110%)
- Colored glow orb expands in bottom-right
- Preview data fades in with slide-up
- Left accent bar widens slightly
- "Click to expand" hint appears

**Layout**:
- 2-column grid with 6-unit gap
- Alternating vertical offsets (cards 2 and 3 translate down 20px)
- Rounded corners (2xl)

### Energy Card Addendum (Current)
- Energy card includes an inline SVG curve with a visible time axis and peak/dip markers.
- Quote is rendered as a highlighted motivation callout for stronger hierarchy.
- Like/dislike controls are intentionally hidden on the energy card to reduce noise.
- Expanded energy panel prioritizes graph -> quote -> wellness checklist -> timing fields.

---

### Stat Boxes (Dashboard)

**Structure**:
- Gradient background (accent/10 to accent/5)
- 2px border (accent/30, hover: accent/60)
- Animated pulse dot
- Label (xs, bold, accent colored)
- Value (4xl, bold, display font)

**Hover States**:
- Scale up (105%)
- Border intensifies
- Value text transitions to accent color
- Shadow appears (lg, accent/20)

---

### Expanded Panel (Right Sidebar)

**Dimensions**: 40% viewport width, full height

**Structure**:
- 4px left border in accent color
- 1px top accent bar
- Sticky header with close button
- Scrollable content area
- Footer with timestamp

**Content Blocks**:
- Large icon display (aspect-square, accent/10 background, 2px accent border)
- Data fields (muted background, hover state with accent border)
- Action buttons (full-width, accent background, rounded-xl)

**Animation**: Slides in from right (0.4s cubic-bezier easing)

---

### Buttons

**Primary (CTA)**:
- Background: Primary accent
- Text: Display font, bold, xl–2xl
- Padding: `px-10 py-6`
- Rounded: xl
- Shadow: xl with accent/40
- Hover: Scale 105%, gradient overlay transition

**Icon Actions** (Music panel):
- Background: Muted
- Rounded: lg
- Padding: `py-4`
- Hover: Darken slightly

---

## Layout Patterns

### Landing Page
- Max-width: 1600px, centered
- 12-column grid
- Left: 7 columns (hero content)
- Right: 5 columns (preview cards)
- Giant background typography (time, letters) at 5% opacity
- Bottom marquee ticker with alternating accent colors

### Dashboard
- Left panel: 60% width (when sidebar open) or full width
- Right panel: 40% width (when card selected)
- Smooth width transition (500ms ease-out)
- 12-unit padding
- Background: Floating color orbs (blurred, low opacity)
- Background: Giant ghosted typography (time, initials)

---

## Interactions & Animation

### Duration Standards
- Fast: `150ms` — Hover color transitions
- Standard: `300ms` — Most transitions (scale, translate, opacity)
- Slow: `500ms` — Width changes, large movements

### Easing
- General: `ease-out` or `cubic-bezier(0.16, 1, 0.3, 1)`
- Linear: Marquee scrolling only

### Common Patterns
- **Card hover**: Lift + shadow + border color + internal scale
- **Button hover**: Scale 105% + overlay fade
- **Panel entry**: Slide from right
- **Pulse dots**: `animate-pulse` on accent colors
- **Glows**: Blur-2xl or blur-3xl at 10–30% opacity

### Accessibility
- All interactive elements have clear hover states
- Color is not the only signifier (text labels present)
- Sufficient contrast maintained (WCAG AA minimum)

---

## Spacing System

### Padding/Margin Scale
- **xs**: 4px (0.25rem)
- **sm**: 8px (0.5rem)
- **base**: 16px (1rem)
- **lg**: 24px (1.5rem)
- **xl**: 32px (2rem)
- **2xl**: 48px (3rem)
- **3xl**: 64px (4rem)

### Component Spacing
- Card internal padding: `p-8` (32px)
- Section margins: `mb-12` (48px)
- Grid gaps: `gap-6` (24px)
- Page padding: `p-12` (48px)

---

## Texture & Depth

### Noise Overlay
- Fixed position, full viewport
- SVG fractal noise (0.8 frequency, 4 octaves, 4% opacity)
- Adds analog warmth to digital surfaces

### Gradient Orbs
- Large radial gradients (300–600px diameter)
- Blurred (100–140px)
- Low opacity (5–10%)
- Positioned in corners or behind content
- Colors: Primary, secondary, purple

### Shadows
- Cards (hover): `shadow-2xl` + `shadow-{accent}/20`
- Buttons: `shadow-xl` + `shadow-{accent}/30–40`
- Icons: `shadow-lg` + `shadow-{accent}/30`

### Background Typography
- Positioned absolute, behind content (z-0)
- 5–10% opacity
- Font: Display or Logo font at extreme sizes (14–24rem)
- Adds dimensionality without competing for attention

---

## Responsive Considerations

While desktop-first, the system should gracefully degrade:
- Use `clamp()` for fluid typography
- Cards stack to 1-column on narrow viewports
- Expanded panel becomes full-screen overlay on mobile
- Marquee continues to scroll, maintains readability

---

## Do's and Don'ts

### Do
✅ Use bold, confident type sizes
✅ Let accent colors guide the eye
✅ Add generous hover states and animations
✅ Overlap elements intentionally (background type)
✅ Show all key info at a glance

### Don't
❌ Use accent colors as large background fills
❌ Add rounded corners larger than 2xl
❌ Make text uppercase unless it's a label
❌ Reduce animation/hover states for "cleanliness"
❌ Hide information behind nested menus

---

## Brand Voice (Visual)

If Dayger were described in three words:
- **Bold** — Large type, strong colors, confident layouts
- **Energetic** — Party lighting, motion, pulse effects
- **Direct** — No scrolling, no bullshit, just what you need

This is a dashboard you *want* to check, not one you *have* to check.
