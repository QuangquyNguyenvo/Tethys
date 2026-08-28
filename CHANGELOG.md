# Changelog

All notable changes to Tethys are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.2-beta.1] - 2026-08-28

> Prerelease for Windows 10 and Windows 11. Native browser interaction and long-running
> WebView2 memory behavior still need extended manual soak testing.
> GitHub uses tag `v0.0.2-beta.1`; Windows installers carry version `0.0.2-1` because MSI
> requires a numeric-only prerelease identifier.

### Changed — interaction, material, and motion

- Panels change size instantly and only their position travels. Interpolating size was the
  one thing in the interface that re-ran layout on every frame, and every frame of it made
  the terminal reflow its whole scrollback and reallocate its WebGL texture.
- Shortened the layout and workspace transitions. A panel is the only thing moving on
  screen, so half a second only read as sluggish: a panel reaches its new place in 320ms,
  a workspace arrives in 380ms and leaves in 200ms.
- Rebuilt the empty-workspace card as a landscape one: the icon holds a column of its own
  and everything else reads as rows beside it, instead of a narrow centred stack that wrapped
  four times. It follows Material 3's type scale rather than compensating for small type with
  bold weight, the icon stands on its own instead of on a tonal disc, buttons are only as wide
  as their labels, and the keyboard hints are separated by space instead of a middle dot. The
  border is gone: a filled surface and an outline draw the same edge twice. A container query
  returns it to the stacked layout inside a narrow panel.
- The top bar follows Material You the way Settings already does. Workspace, window and
  add-workspace icons come from Material Symbols and the active workspace switches to the
  filled variant, so which tab is open reads from the icon's shape rather than from a tint.
  Targets are 32px, hover uses an 8% state layer instead of growing the button, and the type
  scale is M3 label-large.
- The active-workspace pill stretches as it travels. Its left edge settles in 400ms and its
  right edge in 500ms, which is Material's shape morph; two equal durations only slid a
  rectangle sideways.
- sysfetch stopped measuring things nobody reads. Every second it opened up to eight
  physical-drive handles and built the whole network-interface table to produce four numbers
  the panel has never printed; those are opt-in now. Static system facts are read once per
  run instead of on every mount, the panel stops polling entirely while the window is not
  focused, and a tick that would render identical numbers no longer re-renders at all.
- Switching workspaces is now a proper shared-axis slide: the outgoing workspace leaves in
  240ms on an accelerating curve while the incoming one arrives over 480ms on a decelerating
  one. Both used to take 440ms on the same curve, so for most of the switch two workspaces
  sat on screen at half opacity. Neither scales any more.
- Panel travel no longer overshoots. A 12% overshoot reads as a bounce on a 32px chip and
  as a wobble on a 700px terminal; large surfaces use M3 emphasized easing instead.
- Replaced every `backdrop-filter` with a wallpaper that is blurred once when it is read.
  The filter re-blurred a static image on every frame, and re-ran whenever the panel's own
  content changed, so each line of terminal output blurred the whole panel.
- Settings now uses Material Symbols with the `FILL` axis, so an option reads as on or off
  by its shape rather than by colour alone. Icons no longer sit on tinted plates, the type
  scale follows Material 3, and spacing within a group comes from one `gap`.
- Softened the squash-and-stretch on settings controls and removed it from text chips.
- The dock no longer lifts an icon's neighbours when one is hovered.
- Widened the selected panel's accent border so it reads at a normal sitting distance.
- Modal overlays use a Material 3 scrim instead of a full-screen blur.

### Fixed — interaction and layout

- Fullscreen left a strip of desktop uncovered along the taskbar edge. Windows pins an
  undecorated *maximized* window to the work area, and that flag survived the switch into
  fullscreen, so the window kept being pulled back off the taskbar.
- Panel buttons in the top row could not be clicked while the titlebar was set to auto-hide,
  which fullscreen turns on for you. The strip that keeps the bar revealed while it slides
  covered them.
- Settings' scroll bar was unstyled: the rule targeted `.set-content`, a class the component
  had stopped rendering.
- Long labels in the shortcut list were truncated mid-word instead of wrapping.

### Removed

- `Ctrl+Shift+Tab` for the next panel, replaced by `Ctrl+Tab`.

### Added — native browser

- Replaced the limited cross-origin iframe path with native WebView2 overlay surfaces for
  remote pages, while retaining the iframe and external-browser fallbacks.
- Added native back, forward, reload, stop, URL/title/loading state, in-page navigation,
  process-failure recovery, and slow-load recovery without recreating the browser window.
- Added shell-aware surface shaping: native pages follow panel moves and resizes, keep the
  panel's rounded lower corners, hide behind Settings and Command Palette, and cut out the
  floating dock and auto-hidden titlebar instead of covering them.
- Forwarded Tethys' allowlisted shortcuts from focused web content back to the shell, so
  workspace navigation, fullscreen, palette, settings, close, split, and reload remain usable.
- Added an LRU pool capped at four native surfaces. Extra browser panels park safely and can
  resume or open externally; covered surfaces request WebView2's low-memory target.
- Added lifecycle counters behind `TETHYS_BROWSER_STATS`, plus regression checks for URL
  normalization, history bounds, renderer limits, memory policy, overlay cleanup, and failure
  recovery.
- Added a compressed 25-second README demo and four interface stills covering launch,
  workspace switching, Settings, and wallpaper-derived theming.

### Performance

Measured in the repeatable Windows debug snapshot recorded during `0.0.2` development
(four idle terminals, app + WebView2 + console process tree, sampled after 10 seconds):

- Working set fell from `419.8 MB` to about `408 MB`: approximately **2.8% lower**.
- Private memory fell from `191.5 MB` to about `187 MB`: approximately **2.3% lower**.

Deterministic workload reductions visible in the implementation:

- Removed **100% of per-frame panel-size interpolation**. Layout travel dropped from 520ms
  to 320ms (**38.5% shorter**), while terminal dimensions now change once instead of forcing
  scrollback reflow and WebGL texture reallocation on every animation frame.
- Shortened the outgoing workspace transition from 440ms to 240ms (**45.5% shorter**), so
  the old and new workspaces spend substantially less time composited together.
- Removed the default sysfetch drive/network polling path: up to eight physical-drive handle
  opens per second and the unused network-interface table are now **100% eliminated** unless
  that data is explicitly requested.
- Removed live `backdrop-filter` work from the large, frequently redrawn surfaces and blur the
  wallpaper once when it is loaded. This eliminates the repeated full-panel blur pass from
  every terminal-output repaint.
- Hidden auxiliary panels are unmounted after workspace transitions, releasing their iframe,
  decoded image, preview DOM, watcher, and audio resources. Terminals remain mounted so PTY
  sessions stay alive.
- Native browser renderers are capped at four. Compared with an unbounded design, eight open
  browser panels therefore use at most four native surfaces (**50% fewer native surfaces**),
  with parked panels retaining their URL and fallback UI.

Estimated beta impact (engineering estimate, not a native benchmark):

- The one-time wallpaper blur is expected to reduce compositor/GPU work by roughly **15–35%**
  during sustained terminal output in glass mode, depending on GPU, resolution, and wallpaper.
- WebView2's low-memory target is expected to reduce the working set of a temporarily covered
  native page by roughly **10–30%**; actual savings depend heavily on the page and runtime.
  The four-surface cap is enforced, but native browser RAM still needs the manual benchmark
  matrix recorded in `plans/native-browser/CHECKLIST.md`.

### Added — platform and lifecycle

- Added native drive discovery, drive switching, back/forward history, and mouse navigation buttons to Explorer.
- Added lazy image thumbnails and file-type icons to Explorer.
- Replaced the tiled Settings panel with a lazy-loaded modal and added dock, navigation, window, and terminal controls.
- Added native window edge resizing, maximize-state tracking, fullscreen handling, and the Windows system menu on titlebar right-click.
- Added a configurable terminal scrollback limit from 1,000 to 20,000 lines.

### Changed — platform and lifecycle

- Hidden auxiliary panels are now unmounted after workspace transitions, releasing iframe, decoded image, preview DOM, watcher, and audio resources. Terminal panels remain mounted so PTY and agent sessions continue running.
- WebView2 now receives the native low-memory target when Tethys loses focus and returns to the normal target when focus comes back, without suspending terminal processing.
- Reduced the default xterm scrollback limit from 10,000 to 5,000 lines; changes apply to running terminals immediately.
- Fullscreen mode now auto-hides the titlebar and dock while keeping both reachable by pointer.
- Simplified the README around Tethys' current capabilities and removed competitor comparisons.

### Fixed — platform and lifecycle

- Made terminal selections clearly visible in both active and inactive panels.
- Reloading with F5 now refreshes only the focused embedded web panel instead of restarting Tethys.
- Fixed the dock auto-hide edge trigger so hovering at the bottom reliably reveals the dock.
- Routed F11 through the native app window so fullscreen covers the complete monitor rather than being consumed by embedded content.
- Explicitly disabled WebView2 DevTools and its F12 shortcut in release builds.
- Prevented double-clicks on workspace tabs from accidentally maximizing the window.
- Restored colored `ls` and `dir` output when Tethys falls back to Windows PowerShell 5.1.
- Fixed unsupported README glyphs and malformed markup.

## [0.0.1] - 2026-08-24

> First public beta for Windows 10 and Windows 11.

### Added

- Shipped the initial Tauri 2 desktop application with a native Windows ConPTY backend and xterm.js WebGL rendering.
- Added split, resize, drag-and-drop tiling; multiple persistent workspaces; keyboard navigation; and animated workspace switching.
- Added Markdown, image, SVG, text, and Git diff previews with live file watching.
- Added Explorer, embedded web, system information, media, and settings panels.
- Added wallpaper-derived Material You themes, Acrylic/Mica window effects, ANSI color generation, and persistent UI state.
- Added OSC 133 command blocks, command status, output copying, and block navigation for PowerShell.
- Added signed GitHub release automation and in-app updater support.

### Performance

- Added bounded PTY backpressure and batched binary channel output to keep terminal throughput from growing memory without limit.
- Released WebGL resources for hidden terminals and restored them when their workspace becomes visible.
- Lazy-loaded terminal image support and stopped inactive file watchers, media polling, and audio work.
- Ensured child shells are terminated when their panel or the app closes.

[Unreleased]: https://github.com/QuangquyNguyenvo/Tethys/compare/v0.0.2-beta.1...HEAD
[0.0.2-beta.1]: https://github.com/QuangquyNguyenvo/Tethys/compare/v0.0.1...v0.0.2-beta.1
[0.0.1]: https://github.com/QuangquyNguyenvo/Tethys/releases/tag/v0.0.1
