---
name: SafeDay
description: A cinematic, one-answer outdoor planner.
---

# Design System: SafeDay

## Creative north star

**A window into your next hour outside.** SafeDay is one immersive decision card, not a weather dashboard. A real outdoor photograph makes the forecast feel tangible while a strong scrim keeps the recommendation calm and legible.

## Hierarchy

The whole planner fits in one normal viewport. The card contains, in order: brand and place search, a compact seven-day best-times ribbon, one recommended day and time, one short explanation, and a collapsed method disclosure. There is no app bar, page footer, activity control, graph, alternatives section, or preferences form on the primary surface.

Location search opens a focused dialog. Recent places appear first, followed by search and approximate device location. The week ribbon keeps all seven windows comparable and lets one tap replace the main answer.

## Visual language

- Full-bleed photography with one dark natural scrim and white type.
- Geist throughout, with a large but bounded recommendation and compact supporting copy.
- A 16px card radius and rounded controls only where the shape communicates interaction.
- Translucency is reserved for functional controls and the open method panel.
- No decorative icons, gradients on type, status colors, nested cards, or dashboard chrome.

## Photography

Use the local, curated Unsplash set. Clear or fair conditions use the selected activity scene. Cloud, rain, and snow forecasts override it with a matching weather scene. Crop with `object-fit: cover`, tune subject position per scene, and keep photographer credit inside the method disclosure.

## Motion

The background softly resolves from blur and a slight scale when its scene changes. Native view transitions hand off recommendation copy. The method disclosure reveals from the bottom. All motion becomes effectively instant with reduced motion enabled.

## Responsive and accessible behavior

The card fills the mobile viewport with a slim outer margin and remains one card. The week ribbon uses the full card width so all seven days remain visible; the page itself should not scroll. Focus rings are high contrast, background images are decorative, dialog behavior remains native, and meaning never depends on color.

## Voice

Be warm, direct, and honest. Say “best window” or “best balance,” never promise universal safety. Explain the ranking in ordinary language and keep caveats available without putting them in the main decision path.
