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

// Native browser overlay: trần số renderer và mục tiêu bộ nhớ theo trạng thái hiển thị.
const pool = read("src/web/surfacePool.ts");
const webPanel = read("src/web/WebPanel.tsx");
const browserBackend = read("src-tauri/src/browser.rs");

assert.match(pool, /export const MAX_NATIVE_SURFACES = \d+;/, "The native browser pool must have a stated cap");
assert.match(pool, /entries\.size > MAX_NATIVE_SURFACES/, "Exceeding the cap must park a surface");
assert.match(pool, /if \(key === panelKey\) continue;/, "A panel must never evict itself");
assert.match(webPanel, /claimSurfaceSlot\(panelKey/, "Every native surface must take a pool slot");
assert.match(webPanel, /releaseSurfaceSlot\(panelKey\)/, "Closing a panel must give the slot back");
assert.match(
  webPanel,
  /setNativeMemoryTarget\(nativeLabel, hideSurface\)/,
  "A hidden browser panel must drop to the low memory target",
);
assert.match(
  browserBackend,
  /COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW/,
  "The overlay must support the low memory target",
);
assert.doesNotMatch(
  browserBackend,
  /\.TrySuspend\(/,
  "TrySuspend must not be mixed with memory targeting on the same webview",
);
assert.match(
  browserBackend,
  /TETHYS_BROWSER_STATS/,
  "Lifecycle counters must stay behind an environment flag",
);

console.log(
  "PASS: hidden-panel lifecycle, scrollback bounds, WebView2 memory targeting, and the native browser pool are guarded.",
);
