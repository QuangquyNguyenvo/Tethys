# Tethys

> A unified, tiling developer workspace for AI coding agents and developers. Built with Tauri v2, Rust (`portable-pty` / ConPTY), React 19, Tailwind CSS, and `xterm.js` (WebGL).

## Overview

Tethys integrates terminal panels, live file/web preview, and workspace context into a single tiling workspace, eliminating the need to alt-tab while running AI coding agents and development workflows.

- **Architecture**: Single-process Tauri v2 desktop application.
- **Core Engine**: ConPTY via `portable-pty`, flush 8–16ms binary channel.
- **Renderer**: `xterm.js` + `@xterm/addon-webgl`.
- **Command Block**: OSC 133 integration.
- **Persistence**: SQLite (history, layout, theme).
- **Design System**: Material 3 / Material You with dynamic color theming.

## Project Structure

- `app/`: Main Tauri v2 application (React frontend + Rust backend).
- `plans/`: Project specifications, checklists, architectural decision records, and baselines.
- `spike/`: Early prototypes and performance validation tests.
- `PROJECT_CONTEXT.md`: Source of truth for architectural requirements.

## Getting Started

```bash
cd app
npm install
npm run tauri dev
```
