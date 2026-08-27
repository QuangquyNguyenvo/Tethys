# Phase 5 — Khóa các invariant motion bằng check script

> **Prereq**: phase 4 | **Rủi ro**: 🟢 | **Rollback**: đảo đúng hunk thêm assertion;
> không xoá assertion cũ.
> **Files đụng tới**: `app/scripts/check-ux.mjs` — không file nào khác.

## Context recovery

Đọc `CONTEXT.md`, `CHECKLIST.md` và kết quả phase 1–4. File `check-ux.mjs` hiện untracked trong
working tree nhưng đã được `package.json` gọi; coi nó là code của user và chỉ append guard.

## Goal

`npm run check` phải fail nếu ai đó đưa titlebar về layout animation, scale terminal, mang
`dock-jiggle` trở lại, bỏ modal focus/presence, bỏ drag cleanup hoặc làm browser fixture mất
workspace.

## KHÔNG đụng vào

- Không sửa `package.json`: `check-ux.mjs` đã nằm trong chain.
- Không sửa code sản phẩm để chiều regex.
- Không xoá hoặc nới assertion F5/F11/fullscreen/release hiện có.

## Bước 5-A — Đọc thêm source liên quan

### Current code (`app/scripts/check-ux.mjs` đầu file), nguyên văn

```js
const app = read("src/App.tsx");
const web = read("src/web/WebPanel.tsx");
const css = read("src/App.css");
const backend = read("src-tauri/src/lib.rs");
const windowCommands = read("src-tauri/src/window_cmd.rs");
```

### Change

Append bốn source:

```js
const tiles = read("src/layout/Tiles.tsx");
const panelDrag = read("src/layout/usePanelDrag.ts");
const settings = read("src/settings/SettingsModal.tsx");
const palette = read("src/palette/CommandPalette.tsx");
```

## Bước 5-B — Thêm guard sau cụm dock hiện tại

### Current code (`app/scripts/check-ux.mjs` cụm dock), nguyên văn

```js
assert.match(css, /\.dock-wrap\.auto:hover \.dock/, "The bottom edge must reveal an auto-hidden dock");
assert.doesNotMatch(
  css,
  /\.dock-wrap\.auto:hover \.dock-hot\s*\{[^}]*pointer-events:\s*none/s,
  "The dock trigger must not disable itself while hovered",
);
```

### Change

Append nguyên khối sau. Không thay assertion cũ:

```js
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
const reducedMotionStart = css.indexOf("@media (prefers-reduced-motion: reduce)");
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
```

Đổi `console.log` cuối file để nhắc thêm motion guards, nhưng giữ thông tin cũ.

### Verify

```powershell
cd app
npm run check
```

Review output để chắc message cuối nhắc cả motion/accessibility guards. Không mutation-test
trực tiếp `App.css`: file đang bẩn và phase này không được tạo rủi ro mất hunk.

## Acceptance criteria

- [ ] `npm run check` PASS trên source đúng.
- [ ] `npm run build` PASS trên source cuối phase.
- [ ] Guard mới cover overlay click/focus/inert, reduced delay/wait, drag + gutter cleanup,
  panel paint/dot, shared-pill containment và browser fixture.
- [ ] Assertion F5/F11/fullscreen/release cũ vẫn còn nguyên.
- [ ] `git diff --check` không báo whitespace error.

## Gotchas

- Không regex toàn bộ keyframe bằng `.*?}` vì `from/to` có brace lồng; dùng cặp index marker
  như snippet.
- Static guard chỉ khóa invariant, không thay visual QA.
- File đang untracked từ trước; không được hiểu nhầm là có thể xoá/recreate tùy ý.

## Deviations

> _(để trống nếu không có)_

## After finishing

- Cập nhật `CHECKLIST.md`: trạng thái phase, session log và deviations.
