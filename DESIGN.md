---
name: Have a Great Day
description: A cinematic, one-answer outdoor planner.
---

# Design System: Have a Great Day

## Creative north star

**A window into your next hour outside.** Have a Great Day is one immersive decision card, not a weather dashboard. A real outdoor photograph makes the forecast feel tangible while a strong scrim keeps the recommendation calm and legible.

## Hierarchy

The whole planner fits in one normal viewport. The card contains, in order: brand, place search with an adjacent temperature-unit toggle, a compact seven-day ribbon with day names only, one selected day, the three strongest schedule-friendly windows, one short explanation, and a collapsed method disclosure. Each window keeps its time dominant, followed by two quiet evidence lines for weather and light, then temperature, AQI, and UV. The app evaluates Morning, Noon, Evening, and Night, then keeps three; Morning, Evening, and Night win ties so Noon appears only when its forecast fit is better. There is no app bar, page footer, activity control, alternatives section, or preferences form on the primary surface. One compact hourly-fit chart belongs inside the disclosure, never on the main decision surface.

Location search opens a focused dialog. Recent places appear first, followed by search and approximate device location. The week ribbon keeps all seven days comparable and lets one tap replace the main answer. Recommended windows are read-only results, not controls. After-dark windows are labeled plainly, and the evidence panel explains all displayed windows together.

## Visual language

- Full-bleed photography with one dark natural scrim and white type.
- Geist throughout, with a large but bounded recommendation and compact supporting copy.
- A 16px card radius and rounded controls only where the shape communicates interaction.
- Translucency is reserved for functional controls, the recommendation lens, and the open method panel. These surfaces use a borderless web approximation of liquid glass with tonal highlights, soft depth, and a solid reduced-transparency fallback.
- No decorative icons, gradients on type, status colors, nested cards, or dashboard chrome.

## Photography

Use the local, curated Unsplash set as weather-aware scene pools. Clear or fair conditions use active outdoor scenes. Cloud, rain, and snow forecasts override them with matching weather scenes. Advance the pool only on refresh and day selection, crop with `object-fit: cover`, tune subject position per scene, and keep photographer credit inside the method disclosure.

## Motion

The background softly resolves from blur and a slight scale whenever its scene advances. The next scene preloads so day-to-day exploration feels immediate. Native view transitions hand off recommendation copy. The method disclosure refracts open from the bottom and closes on an outside press or Escape. Its compact methodology, normalized hourly-fit lines, and sources remain visible inside the more opaque panel. All spatial motion becomes effectively instant with reduced motion enabled.

## Responsive and accessible behavior

The card fills the mobile viewport with a slim outer margin and remains one card. The week ribbon uses the full card width so all seven days remain visible; the page itself should not scroll. Focus rings are high contrast, background images are decorative, dialog behavior remains native, and meaning never depends on color.

## Voice

Be warm, direct, and honest. Say “best window” or “best balance,” never promise universal safety. Explain the ranking in ordinary language and keep caveats available without putting them in the main decision path.
