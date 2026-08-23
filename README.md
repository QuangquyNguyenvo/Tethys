<div align="center">
  <img src="assets/logo.png" alt="Tethys Logo" width="130" />

  # Tethys

  **A fluid, hardware-accelerated tiling workspace designed for AI coding agents & modern developer workflows.**

  [![Release](https://img.shields.io/github/v/release/QuangquyNguyenvo/Tethys?style=flat-square&color=818cf8)](https://github.com/QuangquyNguyenvo/Tethys/releases/latest)
  [![Platform](https://img.shields.io/badge/Platform-Windows%2011%20%7C%2010-38bdf8?style=flat-square)](https://github.com/QuangquyNguyenvo/Tethys)
  [![Tauri v2](https://img.shields.io/badge/Tauri-v2-24c8db?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app)
  [![Rust](https://img.shields.io/badge/Rust-ConPTY-dea584?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org)
  [![License](https://img.shields.io/badge/License-MIT-a855f7?style=flat-square)](LICENSE)

  <br />
  <img src="assets/divider.svg" width="70%" alt="divider" />
</div>

## Overview

AI coding agents (`claude`, `aider`, `codex`) work fast, but jumping between terminals, file viewers, image inspectors, and browsers destroys focus.

**Tethys** eliminates the Alt-Tab cycle by bringing your terminal, live previews, and development tools into a **single, responsive tiling canvas**. Built as a lightweight, single-process Tauri v2 application, it delivers near-instant ConPTY throughput without background daemon bloat.

<div align="center">
  <img src="assets/screenshots/preview.png" alt="Tethys Workspace Preview" width="100%" />
</div>

---

## Highlights

<table>
  <tr>
    <td width="50%">
      <h4>⚡ Native ConPTY Engine</h4>
      <p>Direct <code>portable-pty</code> integration with an adaptive 8–16ms binary flush channel for zero-lag shell responsiveness.</p>
    </td>
    <td width="50%">
      <h4>🪟 Fluid Tiling Architecture</h4>
      <p>Split horizontally/vertically, resize gutters, or drag-and-drop panels freely without overlapping window clutter.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h4>👁️ Live Agent Watcher</h4>
      <p>Instant side-by-side rendering for generated Markdown, charts, images (PNG/SVG), and Git diffs as agents modify files.</p>
    </td>
    <td width="50%">
      <h4>🎨 Material You & Mica Blur</h4>
      <p>Dynamic color harmony extracted directly from your wallpaper, paired with native Windows 11 Acrylic & Mica transparency.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h4>🏎️ WebGL-Accelerated Terminal</h4>
      <p>GPU-accelerated <code>xterm.js</code> engine rendering crisp typography at full 60+ FPS.</p>
    </td>
    <td width="50%">
      <h4>🔍 OSC 133 Shell Blocks</h4>
      <p>Semantic command execution blocks with exit-status indicators and one-click output capture for PowerShell 7.</p>
    </td>
  </tr>
</table>

---

## Gallery

<div align="center">
  <img src="assets/screenshots/glass.png" alt="Mica Glass UI" width="49%" />
  <img src="assets/screenshots/tiling.png" alt="Tiling Workspace" width="49%" />
</div>

---

## Installation

### Pre-built Binaries (Windows)

Download the latest release from **[GitHub Releases](https://github.com/QuangquyNguyenvo/Tethys/releases/latest)**:

| Distribution | Package | Description |
| :--- | :--- | :--- |
| **Installer** | `Tethys_x64.msi` | Standard Windows installer with start menu & file associations |
| **Portable** | `Tethys_portable.zip` | Standalone archive — extract and launch `Tethys.exe` |

> **Recommended Shell**: For full OSC 133 command block support, install [PowerShell 7](https://github.com/PowerShell/PowerShell):
> ```powershell
> winget install Microsoft.PowerShell
> ```

---

## Key Shortcuts

| Keybinding | Action |
| :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> / <kbd>Ctrl</kbd> + <kbd>P</kbd> | Open Command Palette |
| <kbd>Ctrl</kbd> + <kbd>\</kbd> | Split panel horizontally |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd> | Split panel vertically |
| <kbd>Ctrl</kbd> + <kbd>W</kbd> | Close active panel |
| <kbd>Alt</kbd> + <kbd>Arrow Keys</kbd> / <kbd>Ctrl</kbd> + <kbd>Tab</kbd> | Navigate between panels |
| <kbd>F11</kbd> | Toggle Fullscreen |

---

<details>
<summary><b>🛠️ Build from Source (Developers)</b></summary>

<br />

**Prerequisites**: Node.js 18+, Rust 1.75+ (`rustup`), and Visual Studio C++ Build Tools.

```bash
# Clone & install
git clone https://github.com/QuangquyNguyenvo/Tethys.git
cd Tethys/app
npm install

# Run dev mode
npm run tauri dev

# Build release bundle
npm run tauri build
```
</details>

---

<div align="center">
  <sub>MIT Licensed · Built with 💜 by <a href="https://github.com/QuangquyNguyenvo">QuangquyNguyenvo</a></sub>
</div>
