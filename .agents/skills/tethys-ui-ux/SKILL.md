---
name: tethys-ui-ux
description: Use when designing, reviewing, or changing Tethys UI, Material You colors, expressive motion, floating chrome, responsive states, or visual QA. Enforces terminal-safe motion and the repo's flat/glass invariants.
---

# Tethys UI/UX

1. Read [references/design-language.md](references/design-language.md) before editing UI.
2. Identify every affected surface mode and interaction state.
3. Read the real source and dirty diff; preserve user changes and never reset them.
4. Reuse the existing `--ui-*` roles, shape scale, and motion tokens.
5. Keep terminal-safe motion to translate and opacity. Never scale or resize xterm, and never animate filter or blur around it.
6. Run build and checks, then select the relevant browser and native cases from [references/qa-matrix.md](references/qa-matrix.md).
7. Never claim native QA passed from a browser preview. Report unperformed cases as `⛔ MANUAL`.
