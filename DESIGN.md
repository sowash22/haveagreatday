---
name: Have a Great Day
description: A cinematic, one-answer outdoor planner.
---

# Design System: Have a Great Day

## Creative north star

**A window into your next hour outside.** Have a Great Day is one immersive decision card, not a weather dashboard. A real outdoor photograph makes the forecast feel tangible while a strong scrim keeps the recommendation calm and legible.

## Hierarchy

The whole planner fits in one normal viewport. The card contains, in order: the brand with one quiet purpose line, place search with an adjacent temperature-unit toggle, a compact seven-day ribbon with day names only, one selected day, one adaptive personal note, and two adjacent disclosures for the evidence and founder story. The note has three possible shapes: an all-day message with whole-day evidence plus two or three practical daylight windows, two or three ranked daylight windows with inline evidence, or an honest recommendation to choose another day. Any recommended window at UV 3 or above adds one concise protection action directly to its sentence. A brief closing note explains why other dayparts ranked lower or were omitted. Window ranking remains strongest first and reads as natural prose rather than segmented results. Deterministic guardrails decide which shapes and windows the forecast can support; the inference service chooses the most practical allowed shape and connective language. The application always injects the measurements. There is no app bar, page footer, activity control, alternatives section, preferences form, AI badge, chart, or chat-interface chrome on the primary surface. The evidence disclosure answers “Why this plan?” with a human headline, four plainly categorized conditions, an actionable protection window, and a short explanation of the guardrails. It never shows an abstract fit score or internal weights. The founder disclosure uses the same glass sheet and keeps the personal story optional. The current photo credit rests quietly at the bottom right of the image.

Location search opens a focused dialog. Recent places appear first, followed by search and approximate device location. Temperature units follow the selected location until the user taps the adjacent toggle, which becomes their persistent override. A quiet week switch swaps the ribbon between the current and following Monday-through-Sunday calendar weeks; the ribbon keeps all seven visible days comparable and lets one tap replace the main answer. Recommended windows are read-only results, not controls. After-dark windows are labeled plainly, and the evidence panel explains all displayed windows together.

## Visual language

- Full-bleed photography with one dark natural scrim and white type.
- Geist throughout, with a large but bounded recommendation and compact supporting copy.
- A 16px card radius and rounded controls only where the shape communicates interaction.
- Translucency is reserved for functional controls, the recommendation lens, and the open method panel. These surfaces use a borderless web approximation of liquid glass with tonal highlights, soft depth, and a solid reduced-transparency fallback.
- No decorative icons, gradients on type, status colors, nested cards, or dashboard chrome.

## Photography

Use curated Unsplash scene pools for each weather family, mixing bundled fallbacks with responsive direct Unsplash image loads. Each location receives a stable subset and starting point from the catalog, so changing cities feels fresh without adding a photo API or delaying the forecast. Clear or fair conditions use active outdoor scenes. Cloud, rain, and snow forecasts override them with matching weather scenes. Advance the location's pool only on refresh and day selection so a full week of similar weather still feels varied. Crop with `object-fit: cover`, tune subject position per scene, fall back to the bundled scene after a remote error, and keep the current photographer credit visible at the bottom right of the image.

## Motion

The background softly resolves from blur and a slight scale whenever its scene advances. The next scene preloads so day-to-day exploration feels immediate. Native view transitions hand off recommendation copy. The method disclosure refracts open from the bottom and closes on its visible control, an outside press, or Escape. Its compact measurements and methodology remain visible inside the more opaque panel. All spatial motion becomes effectively instant with reduced motion enabled.

## Responsive and accessible behavior

The card fills the mobile viewport with a slim outer margin and remains one card. The week ribbon uses the full card width so all seven days remain visible; the page itself should not scroll. Focus rings are high contrast, background images are decorative, dialog behavior remains native, and meaning never depends on color.

## Voice

Be warm, direct, and honest. The note should sound like a thoughtful friend helping someone fit outside time into a real day. Say “best window” or “best balance,” never promise universal safety. Explain the ranking in ordinary language and keep caveats available without putting them in the main decision path. Never call a day flexible when UV reaches the protection threshold of 3; prefer earlier or later windows when UV reaches 8 and state the protection action plainly.
