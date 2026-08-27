# Tethys design language

**Material 3 Expressive desktop shell with pastel tonal colors, soft rounded surfaces, floating islands and restrained frosted glass.**

## Color and material

- Treat `app/src/theme/palette.ts` as the color source of truth.
- Use semantic `--ui-*` roles in components and `app/src/App.css`. Do not hardcode UI hex colors.
- Preserve both color sources: brand and wallpaper extraction. Check every changed state in dark and light themes.
- Keep glass as the default layered material and `.surface-flat` as a complete opaque override.
- Keep `.effects-off` valid for glass without blur. Do not make layout or contrast depend on backdrop blur.
- Compose elevation from tonal surface containers, outline roles, and restrained black shadows. Never add colored glow or neon shadow.

## Shape

- Reuse the scale from `--r-xs` through `--r-xxl`.
- Use fully rounded pills for chips, workspace tabs, dock controls, and compact state indicators.
- Use `--r-panel` for panel shells. Do not turn large work surfaces into oversized pills.
- Morph shape only when it communicates a state change, such as the active panel dot becoming a pill.

## Motion hierarchy

### Workspace and panel motion

- Keep terminal motion on `.workspace-motion` and `.panel-motion` to translate plus opacity.
- Never scale xterm glyph canvases or animate panel width, height, filter, or backdrop-filter.
- Keep hidden terminal panels mounted so PTY sessions survive workspace switches. Auxiliary panels may unmount.
- Keep panel DOM parents stable in `app/src/layout/Tiles.tsx`.
- Cap workspace stagger and clear transition timers, RAF callbacks, `will-change`, listeners, pointer capture, and body classes after motion ends or owners unmount.

### Small chrome

- Use existing spring curves and motion durations for the titlebar, shared tab pill, dock items, chips, and icon buttons.
- Auto-hide the titlebar with `translate3d`; never animate `margin-top` or resize the terminal canvas per frame.
- Keep the active workspace indicator as one shared `.tab-active-indicator`. Width morph is allowed only for this contained chrome surface.
- Use a continuous proximity wave for the dock. Do not restore replayed `dock-jiggle` keyframes or decorative rotation.

### Modal presence and accessibility

- Keep Settings and Command Palette mounted through their visible exit animation.
- Let the backdrop block pointer input while closing; make the closing modal subtree inert.
- Trap Tab and Shift+Tab inside the dialog, support Escape, set useful initial focus, and restore focus to the opener.
- Honor `prefers-reduced-motion` in CSS delays and JavaScript presence waits. Reduced motion must still land in the correct final state.

### Direct manipulation

- Drag and gutter resize must follow the pointer without CSS transition.
- Throttle high-frequency pointer updates with `requestAnimationFrame`.
- Make pointer-up, pointer-cancel, new gesture, and unmount cleanup idempotent.

## File and selector map

| Area | Source of truth | Key selectors or responsibility |
|---|---|---|
| Theme roles | `app/src/theme/palette.ts` | Generates `--ui-*` roles for Material schemes and sources. |
| Global surfaces and motion | `app/src/App.css` | Tokens, `.surface-flat`, `.effects-off`, `.nav-auto`, `.dock-auto`, reduced motion. |
| Workspace chrome | `app/src/titlebar/Titlebar.tsx` | Measures and moves `.tab-active-indicator`. |
| Layout and workspace motion | `app/src/layout/Tiles.tsx` | Flat panel DOM, `.panel-host`, `.workspace-motion`, `.panel-motion`, gutter cleanup. |
| Panel drag | `app/src/layout/usePanelDrag.ts` | RAF throttling and drag lifecycle cleanup. |
| Settings | `app/src/settings/SettingsModal.tsx` | Presence, pages, focus trap, inert exit, focus restore. |
| Command Palette | `app/src/palette/CommandPalette.tsx` | Presence, listbox navigation, stagger, focus lifecycle. |
| Workspace lifecycle | `app/src/store/sessions.ts` | Workspace and panel creation, hidden terminal persistence. |
| Browser fixture and composition | `app/src/App.tsx` | Two-workspace Vite fixture and native/browser Add behavior. |
| Regression guards | `app/scripts/check-ux.mjs` | Locks terminal-safe motion, overlays, cleanup, fixture, and native shortcut invariants. |

## Anti-patterns

- Animating `margin-top` for titlebar reveal.
- Scaling xterm or animating terminal/panel blur, filter, width, or height.
- Replaying jiggle/rotate keyframes on dock hover.
- Allowing clicks through a closing overlay or leaving focus inside hidden content.
- Hardcoding hex UI colors instead of semantic roles.
- Adding colored shadows, glow, animated wallpaper blobs, or liquid-glass distortion.
- Adding a motion/UI framework when CSS, React state, and RAF already cover the behavior.
- Treating a static screenshot or Vite preview as proof of native smoothness, PTY lifetime, or WebView2 vibrancy.

## Verified boundary

- Browser fixture, responsive layouts, overlay focus/presence, interrupted workspace switching, tab scrolling, and static motion guards have passed automated or browser QA.
- Native Tauri/WebView2 boot and the TonalSpot dark glass surface with blur/vibrancy enabled were observed at about `1280×800` and 100% DPI.
- Native workload motion, hidden PTY switching, the remaining material matrix, and OS reduced motion remain `⛔ MANUAL` until directly exercised. Do not promote them to PASS from source inspection.
