import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const tiles = read("src/layout/Tiles.tsx");
const pty = read("src/terminal/usePty.ts");
const palette = read("src/theme/palette.ts");
const settings = read("src/settings/SettingsModal.tsx");
const backend = read("src-tauri/src/lib.rs");

assert.match(
  tiles,
  /const isTerminal = panel\.type === undefined \|\| panel\.type === "terminal";/,
  "Terminal panels must remain mounted in hidden workspaces",
);
assert.match(
  tiles,
  /const shouldRenderPanel = visible \|\| isTerminal;/,
  "Auxiliary panels must unmount when their workspace is hidden",
);
assert.match(tiles, /\{shouldRenderPanel && \(/, "Panel rendering must use the lifecycle guard");

assert.match(pty, /Math\.max\(1000, Math\.min\(20000,/, "Scrollback must be bounded");
assert.match(pty, /value \?\? 5000/, "Scrollback must default to 5,000 lines");
assert.match(
  pty,
  /termRef\.current\.options\.scrollback = normalizeScrollback\(opts\.scrollback\)/,
  "Running terminals must accept scrollback changes",
);
assert.match(palette, /terminalScrollback: 5000/, "Theme defaults must persist the 5,000-line limit");
assert.match(settings, /id="set-scrollback"/, "Settings must expose the scrollback limit");

assert.match(backend, /WindowEvent::Focused\(focused\)/, "Window focus must update WebView2 memory priority");
assert.match(
  backend,
  /SetMemoryUsageTargetLevel\(target\)/,
  "The native WebView2 memory target must be applied",
);

console.log("PASS: hidden-panel lifecycle, scrollback bounds, and WebView2 memory targeting are guarded.");
