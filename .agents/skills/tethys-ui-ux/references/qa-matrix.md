# Tethys UI/UX QA matrix

Select every row affected by the change. Separate `PASS`, `FAIL`, and `⛔ MANUAL`; never convert an unperformed manual case into PASS.

## Browser preview

| Viewport | Check |
|---|---|
| `1280×720` | No horizontal overflow; chrome, panel, Settings, Command Palette, and dock spacing remain balanced. |
| `640×400` | No clipped controls; Settings navigation and palette results remain usable. |
| `360×760` | Workspace tabs scroll both ways; shared pill follows the active tab; overlay content remains reachable. |

- Confirm the Vite fixture exposes at least two workspaces without constructing a terminal or calling Tauri IPC.
- Switch workspaces rapidly in both directions. After 700 ms, no entering/leaving workspace may remain stuck.
- Resize during a workspace transition and confirm the old workspace disappears.
- Add a browser workspace and confirm it opens an Explorer fixture rather than `TerminalPanel`.
- Open and close Settings and Command Palette repeatedly, including rapid reopen.
- Move across the full dock slowly, then rapidly. Confirm a continuous proximity wave, visible tooltips, and no replayed jiggle.

## Native Tauri/WebView2

| Size | Material cases |
|---|---|
| `1280×800` | Glass dark with blur on; glass dark with blur off; flat dark. |
| `640×400` | Glass light with blur on; flat light. |

- Record Windows DPI scale, wallpaper/color source, scheme, surface mode, blur state, and whether a terminal spawned.
- Run four active PTYs with slow output. Reveal an auto-hidden titlebar ten times and confirm xterm columns, caret, geometry, and glyph sharpness do not reflow per frame.
- Create three differently named workspaces with 1, 2, and 4 panels. Keep at least two hidden PTYs active.
- Switch by click, direct workspace shortcuts, and previous/next in both directions at least 20 times.
- Resize during transition. Confirm the shared pill moves and changes width continuously, terminal glyphs do not scale, no leaving workspace sticks, and hidden PTYs keep receiving output.
- Exercise dock auto-hide, keyboard reveal, tooltips, split, duplicate, close, panel drag/swap/root-drop, gutter resize, and drag cancellation/unmount cleanup.
- Open all five Settings pages. Close Settings by button, Escape, and backdrop; rapidly open/close Command Palette and move selection with arrows.
- Do not infer these native interaction results from a screenshot or browser preview.

## Accessibility and reduced motion

- Verify initial focus, Tab/Shift+Tab trap, Escape, and focus restoration for Settings and Command Palette.
- During exit, verify controls are inert and backdrop clicks cannot reach the panel beneath.
- Verify visible focus rings and keyboard dock reveal.
- Run theme contrast checks for every supported scheme in dark and light modes.
- When the OS already has reduced motion enabled, confirm CSS animation/transition delays are removed and JavaScript presence waits finish immediately.
- Do not change Windows accessibility settings through automation. Record reduced motion as `⛔ MANUAL` when the environment is not already configured.

## Standard verification

```powershell
cd app
npm run build
npm run check
cargo check --manifest-path src-tauri/Cargo.toml
git diff --check
```

Record the existing large-chunk build warning separately; it is not a motion failure. Include reproduction details and suspected selectors/files for every FAIL.
