# Phase 1 — Chứng minh native overlay nạp được trang

> **Prereq**: — | **Rủi ro**: 🔴 | **Rollback**: `git checkout -- app/src-tauri/capabilities/default.json app/src/web/WebPanel.tsx app/scripts/check-web.mjs` rồi xoá `app/src/web/NativeBrowserSurface.tsx`
> **Files đụng tới**: `app/src-tauri/capabilities/default.json`, `app/src/web/NativeBrowserSurface.tsx`, `app/src/web/WebPanel.tsx`, `app/scripts/check-web.mjs` — không file implementation nào khác.

## Context recovery

Đọc `CONTEXT.md`, `CHECKLIST.md`, `WebPanel.tsx` và local typings `@tauri-apps/api/webviewWindow.d.ts` trước.

## Goal

Khi chạy trong Tauri, một Browser panel có URL sẽ thử tạo WebView2 remote trong cửa sổ không viền có main window làm owner, bám đúng DOM rect. Tạo lỗi thì iframe hiện lại; browser dev/Vite vẫn chỉ dùng iframe.

## KHÔNG đụng vào

- `Cargo.toml`, `lib.rs`: navigation bridge thuộc phase 2.
- `App.tsx`: xử lý modal/overlay thuộc phase 3.
- Pool/LRU/memory target: phase 4.

## Bước 1-A — Cấp đúng quyền tối thiểu

### Current code (`app/src-tauri/capabilities/default.json`)

```json
"core:webview:default",
"opener:default"
```

### Change

Thêm create-webview-window và các quyền window position/size/show/hide/close/focus cần cho overlay. Không thêm create-webview child.

## Bước 1-B — Tạo surface controller

Tạo component dùng `WebviewWindow`, `parent: getCurrentWindow()`, `decorations: false`, `skipTaskbar: true`, `shadow: false`. Dùng `ResizeObserver`, main-window moved/resized, `PhysicalPosition/PhysicalSize` để đồng bộ đúng DPI. Cleanup phải đóng window và mọi listener.

## Bước 1-C — Fallback trong `WebPanel`

Chỉ bỏ rule mở external bắt buộc khi native runtime hiện diện. Trong khi native đang tạo hoặc thất bại, giữ iframe/loading/recovery. URL/reload phase này được thực hiện bằng recreate; phase 2 mới điều khiển webview tại chỗ.

## Verify

```powershell
cd app
npm run build
npm run check
npm run tauri dev
```

## Acceptance criteria

- [ ] Build/check pass.
- [ ] Browser/Vite không gọi Tauri native API và iframe vẫn chạy.
- [ ] Permission không chứa `core:webview:allow-create-webview`.
- [ ] ⛔ MANUAL — Trong app Tauri, GitHub hoặc MDN hiển thị trong tile, không có entry mới ở taskbar/Alt+Tab.
- [ ] ⛔ MANUAL — Move/resize main window làm native content bám tile; đóng tile dọn native window.

## Gotchas

- `getBoundingClientRect()` là logical CSS pixel; `outerPosition()` là physical pixel. Nhân rect với `scaleFactor()` rồi dùng `PhysicalPosition/PhysicalSize`.
- Event `tauri://created` chỉ nói controller đã tạo, chưa chứng minh trang đã load; manual render test là cổng phase.
- Owned top-level window sẽ phủ modal của main shell; chưa mở Settings/Command Palette trong acceptance phase này.

## Deviations

Không có. Code phase này đã có sẵn trong working tree trước session 2026-08-28; session chỉ chạy lại `npm run build` và `npm run check` để xác nhận, cả hai pass.
Hai mục ⛔ MANUAL vẫn chưa ai xác nhận bằng mắt.

## After finishing

- Cập nhật bảng, session log và deviations trong `CHECKLIST.md`.
- Nếu native URL không render: đánh ⚠️ và dừng, không làm phase 2.

