import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const app = read("src/App.tsx");
const web = read("src/web/WebPanel.tsx");
const css = read("src/App.css");
const backend = read("src-tauri/src/lib.rs");
const windowCommands = read("src-tauri/src/window_cmd.rs");
const tiles = read("src/layout/Tiles.tsx");
const panelDrag = read("src/layout/usePanelDrag.ts");
const settings = read("src/settings/SettingsModal.tsx");
const palette = read("src/palette/CommandPalette.tsx");

assert.match(app, /e\.key === "F5"/, "F5 must never fall through to a full app reload");
assert.match(
  app,
  /if \(!WINDOWS_NATIVE_FKEYS\) toggleFullscreen\(\)/,
  "Windows F11 must not toggle from both native and DOM handlers",
);
assert.match(
  app,
  /if \(fullscreenTogglePending\.current\) return/,
  "Concurrent fullscreen toggles must be rejected",
);
assert.match(
  app,
  /invoke<boolean>\("app_window_set_fullscreen", \{ fullscreen \}\)/,
  "Fullscreen must send an explicit target state instead of a race-prone toggle",
);
assert.match(web, /event\.payload === "reload-web"/, "The focused web panel must receive native reloads");
assert.match(web, /useSessions\.getState\(\)\.focused === panelKey/, "Only the focused web panel may reload");

assert.match(css, /\.dock-wrap\.auto:hover \.dock/, "The bottom edge must reveal an auto-hidden dock");
assert.doesNotMatch(
  css,
  /\.dock-wrap\.auto:hover \.dock-hot\s*\{[^}]*pointer-events:\s*none/s,
  "The dock trigger must not disable itself while hovered",
);

const autoHideTitlebar = css.match(/\.app\.nav-auto \.titlebar\s*\{([^}]*)\}/)?.[1] ?? "";
assert.match(autoHideTitlebar, /transform:\s*translate3d\(/, "Auto-hide titlebar must use compositor transform");
assert.doesNotMatch(autoHideTitlebar, /margin-top/, "Auto-hide titlebar must not resize the terminal canvas");

const terminalMotionStart = css.indexOf("@keyframes terminal-workspace-enter-right");
const terminalMotionEnd = css.indexOf('.panel-host[data-panel-type="terminal"]', terminalMotionStart);
assert.ok(terminalMotionStart >= 0 && terminalMotionEnd > terminalMotionStart, "Terminal workspace keyframes must exist");
const terminalMotion = css.slice(terminalMotionStart, terminalMotionEnd);
assert.doesNotMatch(terminalMotion, /scale\(/, "Terminal workspace motion must not scale glyph canvases");

assert.match(css, /\.settings-backdrop\.is-closing/, "Settings must keep an exit presence state");
assert.match(css, /\.palette-backdrop\.is-closing/, "Command palette must keep an exit presence state");
const settingsClosing = css.match(/\.settings-backdrop\.is-closing\s*\{([^}]*)\}/)?.[1] ?? "";
const paletteClosing = css.match(/\.palette-backdrop\.is-closing\s*\{([^}]*)\}/)?.[1] ?? "";
assert.doesNotMatch(settingsClosing, /pointer-events:\s*none/, "Settings backdrop must block click-through during exit");
assert.doesNotMatch(paletteClosing, /pointer-events:\s*none/, "Palette backdrop must block click-through during exit");
assert.match(css, /\.settings-backdrop\.is-closing \.settings-modal\s*\{[^}]*pointer-events:\s*none/s, "Closing settings controls must be inert to pointer input");
assert.match(css, /\.palette-backdrop\.is-closing \.palette-modal\s*\{[^}]*pointer-events:\s*none/s, "Closing palette controls must be inert to pointer input");
assert.match(settings, /returnFocusRef/, "Settings must restore focus to its opener");
assert.match(settings, /inert=\{closing|setAttribute\("inert"/, "Settings dialog must become inert while leaving");
assert.match(settings, /prefers-reduced-motion:\s*reduce/, "Settings presence wait must honor reduced motion");
assert.match(palette, /returnFocusRef/, "Palette must restore focus to its opener");
assert.match(palette, /inert=\{closing|setAttribute\("inert"/, "Palette dialog must become inert while leaving");
assert.match(palette, /prefers-reduced-motion:\s*reduce/, "Palette presence wait must honor reduced motion");
assert.match(css, /animation:\s*palette-item-in[^;]*backwards/, "Palette entrance must release transform after it finishes");
assert.doesNotMatch(css, /@keyframes\s+dock-jiggle/, "Dock must use a continuous proximity wave, not replayed jiggle keyframes");
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, "Expressive motion must honor reduced motion");
// App.css also has an earlier component-specific reduced-motion block. The global
// motion policy lives in the final block and is the one that must clear stagger delays.
const reducedMotionStart = css.lastIndexOf("@media (prefers-reduced-motion: reduce)");
const reducedMotion = css.slice(reducedMotionStart, reducedMotionStart + 500);
assert.match(reducedMotion, /animation-delay:\s*0ms\s*!important/, "Reduced motion must remove stagger delays");
assert.match(reducedMotion, /transition-delay:\s*0ms\s*!important/, "Reduced motion must remove transition delays");

assert.match(tiles, /motionTimerRef/, "Panel FLIP layers must release will-change after transition");
assert.match(tiles, /Math\.min\(6,\s*Math\.max\(0,\s*workspaceOrder\)\)/, "Workspace stagger must remain capped");
assert.match(panelDrag, /requestAnimationFrame\(flushPoint\)/, "Panel drag updates must be throttled to paint frames");
assert.match(panelDrag, /activeCleanupRef/, "Panel drag must cleanup when its owner unmounts");
assert.match(panelDrag, /useEffect\(\(\)\s*=>\s*\(\)\s*=>/, "Panel drag must register unmount cleanup");
assert.match(tiles, /resizeCleanupRef/, "Gutter resize must cleanup when it unmounts");
const panelRule = css.match(/\.panel\s*\{([^}]*)\}/)?.[1] ?? "";
assert.doesNotMatch(panelRule, /box-shadow/, "Large panel surfaces must not transition box-shadow");
assert.match(css, /\.panel-dot::before\s*\{[^}]*transform:/s, "Panel dot morph must use a transform layer");
assert.match(css, /\.panel-dot::after\s*\{[^}]*transform:/s, "Panel pill morph must use a transform layer");
const tabIndicatorRule = css.match(/\.tab-active-indicator\s*\{([^}]*)\}/)?.[1] ?? "";
assert.doesNotMatch(tabIndicatorRule, /will-change:[^;}]*width/s, "Shared pill must not reserve width layout work");
assert.match(tabIndicatorRule, /contain:\s*layout paint/, "Shared pill width morph must be contained to chrome");

assert.match(app, /preview-workspace-1[\s\S]*preview-workspace-2/, "Vite motion fixture must expose two workspaces");
assert.match(
  app,
  /onAddTab=\{\(\) =>\s*addWorkspace\(\s*undefined,\s*"__TAURI_INTERNALS__"\s+in\s+window\s*\?\s*undefined\s*:\s*\{\s*type:\s*"explorer"\s*\},?\s*\)\s*\}/s,
  "Vite Add workspace must avoid TerminalPanel IPC",
);

assert.match(backend, /0x74 => Some\("reload-web"\)/, "WebView2 must intercept F5");
assert.match(backend, /0x7A => Some\("toggle-fullscreen"\)/, "WebView2 must intercept F11");
assert.match(backend, /if key == 0x7B/, "Release builds must intercept F12");
assert.match(backend, /SetAreDevToolsEnabled\(false\)/, "Release WebView2 DevTools must be disabled");
assert.match(
  windowCommands,
  /window\s*\.set_fullscreen\(fullscreen\)/,
  "Fullscreen must use Tauri/Tao so Windows Shell receives MarkFullscreenWindow",
);
assert.doesNotMatch(
  windowCommands,
  /!window\.is_fullscreen/,
  "Fullscreen backend must be idempotent instead of deriving a toggled state",
);

console.log("PASS: terminal selection, web reload, dock reveal, fullscreen, release DevTools, motion, and accessibility guards are present.");
