---
name: SafeDay
description: Answer-first outdoor planning with familiar weather-app clarity.
colors:
  page-light: "#f7f8fa"
  surface-light: "#ffffff"
  surface-muted-light: "#eef1f5"
  ink-light: "#162033"
  ink-secondary-light: "#4f5d72"
  muted-light: "#66758c"
  rule-light: "#d8dee8"
  accent-light: "#3976c8"
  accent-soft-light: "#eaf3ff"
  page-dark: "#10141b"
  surface-dark: "#171d27"
  surface-muted-dark: "#202734"
  ink-dark: "#f1f5fb"
  ink-secondary-dark: "#bcc7d8"
  muted-dark: "#9eabc0"
  rule-dark: "#303a49"
  accent-dark: "#77a9ed"
  accent-soft-dark: "#18283d"
  on-accent: "#ffffff"
  error-light: "#a52f3d"
  error-dark: "#ff9fab"
typography:
  display:
    fontFamily: "var(--font-geist), system-ui, sans-serif"
    fontSize: "clamp(2.75rem, 6.2vw, 5.5rem)"
    fontWeight: 650
    lineHeight: 1.04
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "var(--font-geist), system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 650
    lineHeight: 1.04
    letterSpacing: "-0.035em"
  body:
    fontFamily: "var(--font-geist), system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "var(--font-geist), system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.25
rounded:
  control: "10px"
  main: "16px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section: "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent-light}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    padding: "11px 18px"
    height: "44px"
  input:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.control}"
    padding: "10px 13px"
    height: "44px"
  hero:
    backgroundColor: "{colors.accent-soft-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.main}"
  day-selected:
    backgroundColor: "{colors.accent-light}"
    textColor: "{colors.on-accent}"
---

# Design System: SafeDay

## Overview

**Creative North Star: "The Familiar Forecast, Answered"**

SafeDay should feel immediately legible to anyone who has used a consumer weather app, but its hierarchy is outing-first: show the recommended day and time before asking the user to tune inputs. The page is calm, practical, and continuous, with one visually dominant hero surface followed by evidence in the normal document flow.

Impeccable seed: `f9dbe9d4`.

**Key Characteristics:**

- One confident recommendation first, with compact location and activity controls.
- Familiar weather typography, rows, dividers, and horizontal forecast browsing.
- One blue accent family; neutral surfaces carry everything else.
- Detail increases progressively from answer, to seven-day comparison, to hourly evidence and method.

## Colors

The palette is neutral and cool, using blue only for selection, action, focus, and the hero's quiet tint. Semantic CSS variables in `tokens.css` swap their light and dark values under `prefers-color-scheme`; components consume roles such as page, surface, ink, rule, and accent rather than fixed colors.

**The One Blue Rule.** Blue is the only expressive accent. Error red is reserved for actual error states, never decoration or status variety. Do not assign different hues to weather metrics, days, or panels.

Dark mode preserves the same hierarchy rather than introducing a new visual world. Photography is dimmed and slightly desaturated, while text, rules, and focus colors use their dark semantic counterparts.

## Typography

Geist is both the display and body family, with `system-ui` as fallback. Large recommendation type is bold, compact, and slightly tightened; body copy remains plain and conversational. Numeric weather values use tabular numerals for stable scanning.

- **Display:** reserved for the recommended day and time; keep it to roughly 9 to 11 characters per line.
- **Headline:** section titles and footer statement.
- **Body:** explanations, tradeoffs, and guidance; keep long copy near 70 characters per line.
- **Label:** metrics, controls, freshness, and secondary metadata. Use sentence case.

**The Plain Language Rule.** Type hierarchy supplies emphasis. Do not compensate with repeated uppercase eyebrows, ornamental labels, or multiple introductory kickers. One short contextual eyebrow may precede the hero answer; do not repeat it elsewhere.

## Layout

Use a centered page shell up to 76rem with a fluid 1rem to 3rem gutter. The planner is one continuous page, not a bento or card dashboard. Only the recommendation hero is a large contained surface; later sections rely on whitespace, rules, rows, and restrained muted callouts.

The desktop hero pairs answer copy with one image. Below it, keep the seven-day rail horizontal, then place alternatives and hourly evidence in a two-column region. At 760px and below, stack the hero, collapse evidence to one column, retain horizontal scrolling for days and hours, and let the week rail reach the screen gutters. At 320px, preserve readable copy and avoid clipped controls.

All interactive targets are at least 44px. Controls stay compact: a search pill, a small activity select, normal fields, and text links. Do not scale ordinary actions into hero-sized buttons. Support safe-area gutters, keyboard focus, reduced motion, and layouts that do not rely on color alone.

## Elevation & Depth

The system is flat by default. Structure comes from tonal layering and 1px semantic rules. Use a soft shadow only where separation is functional: the location search, an opened preferences surface, or a dialog. The single hero uses tint, radius, and photography rather than a floating card stack.

**The One Hero Surface Rule.** The recommendation may read as a large surface; the week, alternatives, hourly conditions, method, disclaimer, and footer remain part of the continuous page.

## Shapes

The main surface radius is 16px. Inputs and ordinary buttons use a tighter 10px radius; compact search and select affordances may use a full pill. Rows and rails use square internal edges with shared dividers, reserving rounding for the outer boundary or selected endpoint.

Avoid mixed novelty shapes. Radius communicates containment, not decoration.

## Components

### Recommendation hero

Lead with the answer, one everyday-language reason, one honest tradeoff, four compact facts, and restrained actions. Pair it with a single calm outdoor scene. The image supports the planning context; it must not imply guaranteed conditions, medical safety, endorsements, or a specific person using the product.

### Controls

Location and activity controls remain near the answer but visually secondary. Use 44px minimum targets, persistent focus-visible outlines, and native form behavior. Saved places belong inside location selection. Put preference fields behind the “Adjust activity, time, or units” disclosure.

### Seven-day rail

Always show seven comparable day choices in one horizontal rail. Each item carries day/date, a plain suitability phrase, and its best window. The selected day uses the blue accent plus text, not color alone. Preserve horizontal scrolling and snap behavior on narrow screens.

### Progressive details

Show nearby alternatives before hourly conditions. Hourly evidence is a horizontal row with one selected hour and a compact metric detail region. Keep ranking method, data caveats, and forecast freshness available below the core decision rather than competing with it.

### Photography

Use one place-based outdoor photograph in the hero or first-run welcome surface, cropped with `object-fit: cover`. Favor open paths, daylight, and believable weather atmosphere. Do not create photo grids, decorative thumbnails, testimonial imagery, or imagery that acts as evidence for forecast accuracy.

### Navigation and privacy

Keep the app bar compact, with SafeDay and location search. Privacy is a quiet footer link and may also appear as supporting copy within location selection; it is never a prominent top-bar button.

## Do's and Don'ts

### Do:

- **Do** give the recommended day and time before controls or explanation.
- **Do** use Geist, semantic light/dark tokens, 16px main radii, 44px minimum targets, and one blue accent family.
- **Do** preserve a continuous page, a seven-day rail, progressive hourly detail, and honest forecast caveats.
- **Do** write calm, direct copy such as “More favorable” or “Check again before you go.”
- **Do** implement from `tokens.css` and `src/styles.css`; treat `.impeccable/surfaces/src-app-safe-day-app-tsx.md` and the approved `canon.png` comp as the surface authority.

### Don't:

- **Don't** turn the planner into a bento grid, equal-weight card dashboard, or generic three-card layout.
- **Don't** add a top Privacy button, giant controls, giant buttons, decorative dashboard chrome, or repeated eyebrows.
- **Don't** introduce rainbow surfaces, per-metric colors, purple gradients, neon, or glassmorphism.
- **Don't** claim an hour is “safe,” hide uncertainty, or invent medical, child, pet, emergency, accuracy, or endorsement language.
- **Don't** add photography outside the single contextual hero or welcome role without a concrete product need.
