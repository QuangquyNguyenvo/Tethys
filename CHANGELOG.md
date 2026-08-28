# Changelog

All notable changes to Tethys are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Panels now interpolate their size as well as their position when the layout changes.
  Splitting used to slide a panel to its new place while snapping it to its new width in
  the same instant, so one movement ran at two speeds. The divider travels with them.
- Terminals no longer refit on every frame of a layout animation. Any change to a terminal's
  column or row count reflows its whole scrollback and reallocates its WebGL texture, and
  doing that thirty times in a row made the animation stutter; the fit is deferred to a
  single measurement once the layout settles.
- Shortened the layout and workspace transitions. A panel is the only thing moving on
  screen, so half a second only read as sluggish: layout changes take 320ms, a workspace
  arrives in 380ms and leaves in 200ms.
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

### Fixed

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

## [0.0.2] - 2026-08-26

> Beta release for Windows 10 and Windows 11.

### Added

- Added native drive discovery, drive switching, back/forward history, and mouse navigation buttons to Explorer.
- Added lazy image thumbnails and file-type icons to Explorer.
- Replaced the tiled Settings panel with a lazy-loaded modal and added dock, navigation, window, and terminal controls.
- Added native window edge resizing, maximize-state tracking, fullscreen handling, and the Windows system menu on titlebar right-click.
- Added a configurable terminal scrollback limit from 1,000 to 20,000 lines.

### Changed

- Hidden auxiliary panels are now unmounted after workspace transitions, releasing iframe, decoded image, preview DOM, watcher, and audio resources. Terminal panels remain mounted so PTY and agent sessions continue running.
- WebView2 now receives the native low-memory target when Tethys loses focus and returns to the normal target when focus comes back, without suspending terminal processing.
- Reduced the default xterm scrollback limit from 10,000 to 5,000 lines; changes apply to running terminals immediately.
- Fullscreen mode now auto-hides the titlebar and dock while keeping both reachable by pointer.
- Simplified the README around Tethys' current capabilities and removed competitor comparisons.

### Fixed

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

[Unreleased]: https://github.com/QuangquyNguyenvo/Tethys/compare/v0.0.2...HEAD
[0.0.2]: https://github.com/QuangquyNguyenvo/Tethys/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/QuangquyNguyenvo/Tethys/releases/tag/v0.0.1
