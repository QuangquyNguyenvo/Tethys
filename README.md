<div align="center">
  <img src="assets/logo.png" alt="Tethys logo, a tiling terminal workspace for AI coding agents on Windows" width="124" />

  # Tethys

  **The all-in-one terminal workspace for AI coding agents.** ⋆｡°✩

  Terminal, live file previews, and Git diffs all in one tiling window, so you're not alt-tabbing to see what your agent just did.

  [![Release](https://img.shields.io/github/v/release/QuangquyNguyenvo/Tethys?style=flat-square&color=818cf8)](https://github.com/QuangquyNguyenvo/Tethys/releases/latest)
  [![Platform](https://img.shields.io/badge/Platform-Windows%2011%20%7C%2010-38bdf8?style=flat-square)](https://github.com/QuangquyNguyenvo/Tethys)
  [![Tauri v2](https://img.shields.io/badge/Tauri-v2-24c8db?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app)
  [![Rust](https://img.shields.io/badge/Rust-ConPTY-dea584?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org)
  [![License](https://img.shields.io/badge/License-MIT-a855f7?style=flat-square)](LICENSE)

  <br />
  <img src="assets/divider.svg" width="65%" alt="" />
</div>

## What it does

Running `claude`, `codex`, `aider` (or any CLI agent) all day means it's constantly writing files, editing code, and dropping diffs, and you need to see the result *now*. Tethys watches your working directory and renders Markdown, images, and diffs the moment they land, right next to the terminal that produced them.

Everything lives on one tiling canvas: split panels, drag them around, resize freely. The terminal is a tile in your workspace, not the whole app.

<div align="center">
  <img src="assets/screenshots/preview.png" alt="Tethys tiling terminal workspace showing multiple panels and Material You theme settings" width="100%" />
</div>

---

## Features

<table>
  <tr>
    <td width="50%">
      <h4>Live Agent Watcher</h4>
      <p>The instant a file changes, Tethys renders the Markdown spec, image, or Git diff side by side. No manual refresh.</p>
    </td>
    <td width="50%">
      <h4>Native ConPTY Terminal</h4>
      <p>Direct <code>portable-pty</code> integration with an optimized binary channel for near-zero input latency.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h4>Frictionless Tiling</h4>
      <p>Split horizontally or vertically, drag to reorder, resize dynamically. Snap panels like native Windows tiling.</p>
    </td>
    <td width="50%">
      <h4>Material You & Mica Glass</h4>
      <p>Accent colors extracted from your wallpaper, paired with native Windows 11 Acrylic & Mica transparency.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h4>WebGL-Accelerated Terminal</h4>
      <p>Built on <code>xterm.js</code> + <code>@xterm/addon-webgl</code> for crisp text and smooth, high-FPS scrollback.</p>
    </td>
    <td width="50%">
      <h4>OSC 133 Command Blocks</h4>
      <p>Semantic command isolation with exit-status badges and one-click output capture (PowerShell 7).</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h4>Animated Workspaces</h4>
      <p>Keep multiple terminal layouts alive and switch between them with number keys or a soft transition.</p>
    </td>
    <td width="50%">
      <h4>Explorer & Embedded Web</h4>
      <p>Browse files, copy paths, or open a URL and local previews without leaving the tiling canvas.</p>
    </td>
  </tr>
</table>

<details>
<summary>Runs light, stays smooth</summary>
<br />

Hidden workspaces keep their PTY sessions alive but release WebGL textures until you switch back. SIXEL/iTerm image support loads on demand. PTY output uses bounded back-pressure, and file watchers are dropped once the last preview closes.

Local regression snapshot on Windows (debug build, four idle terminals, measured after 10 seconds; app + WebView2 + console process tree):

| Build | Working set | Private memory |
| :--- | ---: | ---: |
| Clean checkpoint `7c1194d` | 419.8 MB | 191.5 MB |
| Optimized build, typical clean run | ~408 MB | ~187 MB |

This is a repeatable development snapshot, not a universal guarantee. Wallpaper, GPU driver, WebView2 version, and open previews all affect the final number.
</details>

---

## Interface

<div align="center">
  <img src="assets/screenshots/glass.png" alt="Tethys Mica glass terminal panel with file explorer" width="32%" />
  <img src="assets/screenshots/tiling.png" alt="Tethys split-panel tiling terminal workspace" width="32%" />
  <img src="assets/screenshots/widgets.png" alt="Tethys terminal workspace with explorer, embedded web panel, and dock" width="32%" />
</div>

---

## Download & Setup

Grab the latest build from **[GitHub Releases](https://github.com/QuangquyNguyenvo/Tethys/releases/latest)**:

- **Installer (`.msi`)**: `Tethys_x64.msi`, standard Windows install.
- **Portable (`.zip`)**: `Tethys_portable.zip`, extract and run `Tethys.exe`.

> **Shell tip**: for the best OSC 133 command-block detection, run PowerShell 7:
> ```powershell
> winget install Microsoft.PowerShell
> ```

---

## Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>K</kbd> / <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> / <kbd>F1</kbd> | Open Command Palette |
| <kbd>Ctrl</kbd> + <kbd>T</kbd> / <kbd>Ctrl</kbd> + <kbd>W</kbd> | Open a terminal / close the active panel (configurable) |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>E</kbd> / <kbd>O</kbd> | Place the active panel to the right / below |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd> | Duplicate the active panel in its current directory |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Tab</kbd> | Focus the next tiled panel |
| <kbd>Win</kbd> + <kbd>Arrow Keys</kbd> / <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Arrow Keys</kbd> | Snap the active panel |
| <kbd>Ctrl</kbd> + <kbd>1</kbd> / <kbd>Ctrl</kbd> + <kbd>3</kbd> | Previous / next workspace |
| <kbd>Alt</kbd> + <kbd>1…9</kbd> | Jump directly to a workspace |
| <kbd>Ctrl</kbd> + <kbd>,</kbd> | Open Settings |
| <kbd>F11</kbd> / <kbd>Alt</kbd> + <kbd>Enter</kbd> | Toggle native fullscreen |

---

<details>
<summary><b>Build from Source (Developers)</b></summary>

<br />

**Prerequisites**: Node.js 20.19+, stable Rust (`rustup`), Visual Studio C++ Build Tools.

```bash
# Clone & install dependencies
git clone https://github.com/QuangquyNguyenvo/Tethys.git
cd Tethys/app
npm install

# Start development mode
npm run tauri dev

# Build release bundle
npm run tauri build
```
</details>

---

<div align="center">
  <sub>MIT Licensed · Built with 💜 by <a href="https://github.com/QuangquyNguyenvo">QuangquyNguyenvo</a></sub>
</div>
