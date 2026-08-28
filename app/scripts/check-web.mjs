import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "web-check-"));
const out = join(dir, "navigation.mjs");
await build({
  entryPoints: ["src/web/navigation.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: out,
  logLevel: "warning",
});
const N = await import(pathToFileURL(out).href);

assert.equal(N.normalizeWebInput("example.com/docs"), "https://example.com/docs");
assert.equal(N.normalizeWebInput("localhost:1420/test"), "http://localhost:1420/test");
assert.match(N.normalizeWebInput("rust ownership"), /^https:\/\/duckduckgo\.com\/\?q=rust%20ownership$/);
assert.doesNotMatch(N.normalizeWebInput("javascript:alert(1)"), /^javascript:/i);
assert.equal(N.normalizeWebInput("https://"), "");
assert.equal(N.requiresExternalBrowser("https://github.com/openai"), true);
assert.equal(N.requiresExternalBrowser("https://developer.mozilla.org/en-US/"), true);
assert.equal(N.requiresExternalBrowser(N.normalizeWebInput("rust ownership")), true);
assert.equal(N.requiresExternalBrowser("https://en.wikipedia.org/"), false);

let history = N.createWebHistory("https://one.test/");
history = N.pushWebHistory(history, "https://two.test/");
history = N.pushWebHistory(history, "https://two.test/");
assert.deepEqual(history, {
  entries: ["https://one.test/", "https://two.test/"],
  index: 1,
});
const back = N.moveWebHistory(history, -1);
assert.equal(back?.target, "https://one.test/");
history = N.pushWebHistory(back.history, "https://three.test/");
assert.deepEqual(history.entries, ["https://one.test/", "https://three.test/"]);
assert.equal(N.moveWebHistory(history, 1), null);

for (let i = 0; i < 70; i++) history = N.pushWebHistory(history, `https://${i}.test/`);
assert.equal(history.entries.length, 50, "Web history must remain bounded");

const panel = readFileSync(new URL("../src/web/WebPanel.tsx", import.meta.url), "utf8");
const nativeSurface = readFileSync(
  new URL("../src/web/NativeBrowserSurface.tsx", import.meta.url),
  "utf8",
);
const capability = readFileSync(
  new URL("../src-tauri/capabilities/default.json", import.meta.url),
  "utf8",
);
const bridge = readFileSync(new URL("../src/web/nativeBrowser.ts", import.meta.url), "utf8");
const backend = readFileSync(new URL("../src-tauri/src/browser.rs", import.meta.url), "utf8");
const rootLib = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");

assert.match(panel, /SLOW_LOAD_MS/, "Web panel must surface stalled loads");
assert.match(panel, /onLoad=\{\(\) =>/, "Successful iframe loads must clear the recovery timer");
assert.match(panel, /normalized === current\) reloadCurrent\(\)/, "Submitting the current URL must reload it");
assert.match(panel, /allow-downloads/, "Embedded pages must support user-initiated downloads");
assert.match(panel, /NativeBrowserSurface/, "Tauri builds must attempt a native browser surface");

// Phase 1 — overlay là WebviewWindow owned, không phải child Webview đã đo là hỏng.
assert.match(nativeSurface, /new WebviewWindow/, "Native browser must use a stable WebviewWindow");
assert.match(nativeSurface, /skipTaskbar: true/, "Browser overlay must stay out of the taskbar");
assert.match(nativeSurface, /parent: mainWindow/, "Browser overlay must be owned by the main window");
assert.doesNotMatch(nativeSurface, /new Webview\(/, "Broken child Webviews must not be restored");
assert.match(capability, /core:webview:allow-create-webview-window/);
assert.doesNotMatch(capability, /core:webview:allow-create-webview\"/);

// Phase 2 — điều hướng đi qua WebView2 thật, không dựng lại cửa sổ cho mỗi URL.
assert.doesNotMatch(
  nativeSurface,
  /useEffect\([^]*?\}, \[panelKey, (?:url|initialUrl)\]\)/,
  "Changing the URL must navigate in place, not recreate the overlay window",
);
assert.match(nativeSurface, /attachNativeBrowser\(label\)/, "Overlay must attach page-state events");
for (const command of [
  "browser_attach",
  "browser_navigate",
  "browser_reload",
  "browser_go",
  "browser_state",
  "browser_set_memory_target",
]) {
  assert.match(bridge, new RegExp(`"${command}"`), `Frontend bridge must expose ${command}`);
  assert.match(rootLib, new RegExp(`browser::${command}`), `${command} must be registered in lib.rs`);
}
assert.match(panel, /goNative\(nativeLabel, step === 1\)/, "Back/forward must drive the native page");
assert.match(panel, /reloadNative\(nativeLabel\)/, "Reload must reuse the existing native window");
assert.match(
  backend,
  /starts_with\("http:\/\/"\) \|\| lowered\.starts_with\("https:\/\/"\)/,
  "Backend must reject non-web schemes such as javascript:",
);
assert.match(
  backend,
  /add_(?:NavigationStarting|SourceChanged|DocumentTitleChanged|HistoryChanged)/,
  "Backend must observe real page navigation",
);
assert.match(
  rootLib,
  /let is_main = window\.label\(\) == "main";/,
  "Window events must not treat a browser overlay as the main window",
);

// Phase 3 — overlay hoà vào shell: modal luôn ở trên, phím tắt vẫn về đúng chỗ.
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const tiles = readFileSync(new URL("../src/layout/Tiles.tsx", import.meta.url), "utf8");
const visibility = readFileSync(
  new URL("../src/web/surfaceVisibility.ts", import.meta.url),
  "utf8",
);

assert.match(app, /setSurfaceBlocker\("palette", paletteOpen\)/, "Command palette must hide the overlay");
assert.match(app, /setSurfaceBlocker\("settings", settingsOpen\)/, "Settings must hide the overlay");
assert.match(app, /"browser-key"/, "Shortcuts pressed inside a page must reach the shell");
assert.match(app, /new KeyboardEvent\("keydown"/, "Forwarded keys must replay through the one shortcut table");
assert.match(tiles, /suppressed=\{!visible \|\| !!workspaceMotion\}/, "A tile off-screen must not leave a native window behind");
assert.match(panel, /hidden=\{hideSurface\}/, "Overlay visibility must follow both tile and shell state");
assert.match(panel, /"browser-failed"/, "A crashed page must fall back instead of showing an empty tile");
assert.match(visibility, /useSyncExternalStore/, "Overlay blockers must be a real subscription, not a poll");
assert.match(nativeSurface, /browserWindow\.hide\(\)/, "Overlays must hide, since an owned window always paints above its owner");
assert.doesNotMatch(nativeSurface, /\.setFocus\(/, "Overlay must never steal focus back from the address bar");
assert.match(
  nativeSurface,
  /mainWindow\.innerPosition\(\)/,
  "Overlay bounds must start from the client-area origin, not the window rect",
);
assert.doesNotMatch(
  nativeSurface,
  /mainWindow\.outerPosition\(\)/,
  "outerPosition includes the invisible resize border and pushes the overlay off the tile",
);
assert.match(
  nativeSurface,
  /requestAnimationFrame\(tick\)/,
  "A tile that moves without resizing must still drag the overlay with it",
);
assert.match(
  nativeSurface,
  /setNativeShape\(/,
  "The overlay must be clipped to the panel corner radius",
);
// Dock và thanh trên nổi trên canvas; cửa sổ owned luôn vẽ trên owner, nên chúng chỉ lộ ra
// nếu overlay bị khoét đúng vùng đó.
assert.match(
  nativeSurface,
  /shellFloatRects\(\)/,
  "Floating shell islands must be cut out of the overlay, not covered by it",
);
const dock = readFileSync(new URL("../src/dock/Dock.tsx", import.meta.url), "utf8");
const titlebar = readFileSync(new URL("../src/titlebar/Titlebar.tsx", import.meta.url), "utf8");
assert.match(dock, /ref=\{shellFloatRef\}/, "The dock must register itself as a floating island");
assert.match(
  dock,
  /data-native-float-part="transform"/,
  "A raised dock item must extend the native overlay cutout",
);
assert.match(
  dock,
  /className="dock-tip" data-native-float-part="visible"/,
  "A visible dock tooltip must extend the native overlay cutout",
);
assert.match(
  nativeSurface,
  /x: Math\.floor\(\(float\.left - rect\.left\) \* scale\)/,
  "A partially intersecting dock must preserve its original rounded geometry",
);
assert.match(titlebar, /ref=\{shellFloatRef\}/, "The auto-hiding title bar must register itself too");
assert.match(backend, /RGN_DIFF/, "Holes must be subtracted from the overlay region");
assert.match(backend, /DeleteObject/, "Temporary GDI regions must be released every frame");
assert.match(backend, /add_NewWindowRequested/, "window.open must not spawn an unmanaged native window");
assert.match(backend, /add_ProcessFailed/, "A dead renderer must be reported to the shell");
assert.match(backend, /fn shell_shortcut/, "Only shortcuts Tethys binds may be taken from the page");
assert.doesNotMatch(
  backend,
  /"KeyC" \| "KeyV"|"KeyF" \|/,
  "Page shortcuts such as Ctrl+C/Ctrl+F must stay with the page",
);

rmSync(dir, { recursive: true, force: true });
console.log("PASS: browser URL handling, bounded history, reload, and slow-load recovery are guarded.");
