<div align="center">
  <img src="assets/logo.png" alt="Tethys Logo" width="124" />

  # Tethys

  **Stop Alt-Tabbing. A high-performance tiling workspace designed for AI coding agents.**

  [![Release](https://img.shields.io/github/v/release/QuangquyNguyenvo/Tethys?style=flat-square&color=818cf8)](https://github.com/QuangquyNguyenvo/Tethys/releases/latest)
  [![Platform](https://img.shields.io/badge/Platform-Windows%2011%20%7C%2010-38bdf8?style=flat-square)](https://github.com/QuangquyNguyenvo/Tethys)
  [![Tauri v2](https://img.shields.io/badge/Tauri-v2-24c8db?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app)
  [![Rust](https://img.shields.io/badge/Rust-ConPTY-dea584?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org)
  [![License](https://img.shields.io/badge/License-MIT-a855f7?style=flat-square)](LICENSE)

  <br />
  <img src="assets/divider.svg" width="65%" alt="divider" />
</div>

## 💥 The Problem: The Alt-Tab Tax

Running CLI coding agents (`claude`, `aider`, `codex`) all day has created a new developer bottleneck: **context switching**.

```
The Daily Alt-Tab Chaos:
[ Terminal ] ──(Alt-Tab)──> [ VS Code Diff ] ──(Alt-Tab)──> [ Image Viewer ] ──(Alt-Tab)──> [ Browser ]
```

When an agent refactors code, generates a markdown spec, or outputs an architectural chart, you have to constantly flip between separate windows just to verify the work. 

- **Traditional Terminals** (*Windows Terminal, Alacritty*): Fast, but blind to artifacts. No live previews, no diffs, no web view.
- **Heavy Electron Workspaces** (*WaveTerm*): Sluggish 500MB+ RAM hogs with background daemons and flaky Windows ConPTY support.

**Tethys fixes this.** It embeds your terminal, real-time file watcher, diff inspector, and web preview into **one lightweight, GPU-accelerated tiling workspace**.

<div align="center">
  <img src="assets/screenshots/preview.png" alt="Tethys Workspace Preview" width="100%" />
</div>

---

## ⚡ Core Capabilities

<table>
  <tr>
    <td width="50%">
      <h4>👁️ Live Agent Watcher</h4>
      <p>The instant your AI agent writes a file, Tethys renders the Markdown spec, visual chart (PNG/SVG), or Git diff side-by-side. Zero manual refreshing.</p>
    </td>
    <td width="50%">
      <h4>🚀 Sub-16ms ConPTY Engine</h4>
      <p>Direct <code>portable-pty</code> integration with an optimized binary channel flush. Pure native Windows ConPTY with near-zero latency.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h4>🪟 Frictionless Tiling</h4>
      <p>Split horizontally or vertically, drag to reorder, and resize panels dynamically. Terminal is a tile, not an isolated world.</p>
    </td>
    <td width="50%">
      <h4>🎨 Material You & Mica Glass</h4>
      <p>Extracts dynamic accent palettes from your active wallpaper, paired with native Windows 11 Acrylic & Mica transparency.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h4>🏎️ WebGL-Accelerated Typography</h4>
      <p>Rendered with <code>xterm.js</code> + <code>@xterm/addon-webgl</code> for crisp text and rock-solid 60+ FPS terminal throughput.</p>
    </td>
    <td width="50%">
      <h4>🔍 OSC 133 Shell Blocks</h4>
      <p>Semantic command isolation with exit status badges and one-click output capture (PowerShell 7 optimized).</p>
    </td>
  </tr>
</table>

---

## 📸 Interface

<div align="center">
  <img src="assets/screenshots/glass.png" alt="Mica Glass UI" width="49%" />
  <img src="assets/screenshots/tiling.png" alt="Tiling Workspace" width="49%" />
</div>

---

## 📥 Download & Setup

Download the latest build from **[GitHub Releases](https://github.com/QuangquyNguyenvo/Tethys/releases/latest)**:

- **Installer (`.msi`)**: `Tethys_x64.msi` — Standard Windows installation.
- **Portable (`.zip`)**: `Tethys_portable.zip` — Extract and run `Tethys.exe` directly.

> **💡 Shell Tip**: For optimal OSC 133 command block detection, run **PowerShell 7**:
> ```powershell
> winget install Microsoft.PowerShell
> ```

---

## ⌨️ Essential Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> | Open Omni Command Palette |
| <kbd>Ctrl</kbd> + <kbd>\</kbd> | Split Active Panel Horizontally |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd> | Split Active Panel Vertically |
| <kbd>Ctrl</kbd> + <kbd>W</kbd> | Close Active Panel |
| <kbd>Alt</kbd> + <kbd>Arrow Keys</kbd> / <kbd>Ctrl</kbd> + <kbd>Tab</kbd> | Navigate Between Tiled Panels |
| <kbd>F11</kbd> | Toggle Fullscreen Mode |

---

<details>
<summary><b>🛠️ Build from Source (Developers)</b></summary>

<br />

**Prerequisites**: Node.js 18+, Rust 1.75+ (`rustup`), Visual Studio C++ Build Tools.

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
