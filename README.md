<div align="center">
  <img src="assets/logo.png" alt="Tethys logo" width="120" />

  # Tethys

  **A dedicated Linux-style tiling workspace on Windows, built for modern developers and AI agents.**

  [![Release](https://img.shields.io/github/v/release/QuangquyNguyenvo/Tethys?style=flat-square&color=818cf8)](https://github.com/QuangquyNguyenvo/Tethys/releases/latest)
  [![Platform](https://img.shields.io/badge/Platform-Windows%2011%20%7C%2010-38bdf8?style=flat-square)](https://github.com/QuangquyNguyenvo/Tethys)
  [![License](https://img.shields.io/badge/License-MIT-a855f7?style=flat-square)](LICENSE)

  <br />
</div>

## Why Tethys

Running CLI coding agents like Claude Code, Codex, or Aider means constant file edits, specs being generated, and background tasks executing simultaneously. On a traditional Windows setup, you often find yourself endlessly switching windows between terminals, editors, file explorers, and diff viewers just to track what changed. Managing multiple active tasks quickly turns into a cluttered screen of overlapping windows, leaving you wishing for the fluid tiling canvas and multi-workspace organization of a modern Linux environment.

Tethys brings that missing experience directly to Windows. Everything lives on a unified tiling canvas where your shell, live file viewers, markdown documentation, and git diffs render immediately side by side. You stay in your flow and monitor agent progress effortlessly without juggling windows.

<div align="center">
  <a href="assets/demo/tethys-demo.mp4">
    <img src="assets/demo/tethys-demo.webp" alt="Tethys workspace demo" width="100%" />
  </a>
</div>

## Highlights

<table>
  <tr>
    <td width="50%">
      <h3>Flexible Tiling Canvas</h3>
      <p>Split panels horizontally or vertically, drag to rearrange, and resize freely. Keep your agent output, editor, and tools in a single unified view.</p>
    </td>
    <td width="50%">
      <h3>Instant Live Previews</h3>
      <p>Inspect markdown documents, images, and file modifications the moment your agent creates or updates them, without manual refreshes.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>Multiple Workspaces</h3>
      <p>Keep independent project layouts running in parallel. Switch between dedicated workspaces smoothly using keyboard shortcuts.</p>
    </td>
    <td width="50%">
      <h3>Embedded Explorer & Web</h3>
      <p>Browse project directories, inspect local ports, and view web previews directly alongside your terminal sessions.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>Fast & Responsive Terminal</h3>
      <p>Hardware-accelerated rendering with crisp text, smooth scrollback, and instant command feedback.</p>
    </td>
    <td width="50%">
      <h3>Modern Adaptive Aesthetics</h3>
      <p>Native Windows acrylic and mica effects paired with dynamic themes extracted directly from your wallpaper.</p>
    </td>
  </tr>
</table>

## Interface

<table>
  <tr>
    <td width="50%" align="center">
      <img src="assets/screenshots/app-launch.webp" alt="Tethys launch workspace" width="100%" />
      <p><b>Launch Workspace</b><br />Start clean with terminal sessions and file navigation.</p>
    </td>
    <td width="50%" align="center">
      <img src="assets/screenshots/workspace-switch.webp" alt="Tethys workspace switching" width="100%" />
      <p><b>Workspace Management</b><br />Isolate different tasks across dedicated environments.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="assets/screenshots/settings.webp" alt="Tethys appearance settings" width="100%" />
      <p><b>Deep Customization</b><br />Adjust colors, surfaces, keyboard shortcuts, and behavior.</p>
    </td>
    <td width="50%" align="center">
      <img src="assets/screenshots/wallpaper-theme.webp" alt="Tethys dynamic wallpaper theming" width="100%" />
      <p><b>Dynamic Theming</b><br />Seamless color palettes generated from your active wallpaper.</p>
    </td>
  </tr>
</table>

## Getting Started

Grab the latest release from [GitHub Releases](https://github.com/QuangquyNguyenvo/Tethys/releases/latest). You can install Tethys using the standard Windows installer (`Tethys_x64.msi`) or download the portable package (`Tethys_portable.zip`) to extract and run anywhere without installation.

## Essential Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>K</kbd> / <kbd>F1</kbd> | Open Command Palette |
| <kbd>Ctrl</kbd> + <kbd>T</kbd> / <kbd>Ctrl</kbd> + <kbd>W</kbd> | Open terminal / Close active panel |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>E</kbd> / <kbd>O</kbd> | Split panel to the right / below |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd> | Duplicate active panel |
| <kbd>Ctrl</kbd> + <kbd>Tab</kbd> | Focus next tiled panel |
| <kbd>Win</kbd> + <kbd>Arrow Keys</kbd> | Snap active panel |
| <kbd>Ctrl</kbd> + <kbd>1</kbd> / <kbd>Ctrl</kbd> + <kbd>3</kbd> | Switch to previous / next workspace |
| <kbd>Alt</kbd> + <kbd>1...9</kbd> | Jump to workspace 1 to 9 |
| <kbd>Ctrl</kbd> + <kbd>,</kbd> | Open Settings |
| <kbd>F11</kbd> | Toggle Fullscreen |

<details>
<summary><b>Build from Source</b></summary>

<br />

Prerequisites: Node.js 20+, Rust, Visual Studio C++ Build Tools.

```bash
git clone https://github.com/QuangquyNguyenvo/Tethys.git
cd Tethys/app
npm install
npm run tauri dev
```

To build a release package:

```bash
npm run tauri build
```

</details>

---

<div align="center">
  MIT License · Created with passion by <a href="https://github.com/QuangquyNguyenvo">QuangquyNguyenvo</a>
</div>
