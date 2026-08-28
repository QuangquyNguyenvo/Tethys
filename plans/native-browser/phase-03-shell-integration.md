# Phase 3 — Hoà native browser vào shell

> **Prereq**: phase 2 ✅ | **Rủi ro**: 🔴 | **Rollback**: checkout các file phase
> **Files đụng tới**: `app/src/App.tsx`, `app/src/web/nativeBrowser.ts`, `app/src/web/NativeBrowserSurface.tsx`, `app/src/web/WebPanel.tsx`, `app/scripts/check-web.mjs`.

## Context recovery

Đọc context/checklist và các state `paletteOpen`, `settingsOpen`, fullscreen/workspace lifecycle trong `App.tsx`.

## Goal

Native surface không phủ Tethys chrome/modal, giữ focus đúng khi chuyển panel/workspace, xử lý popup/download theo policy rõ ràng.

## KHÔNG đụng vào

- LRU/memory benchmarks: phase 4.
- Thêm tab bar browser hoặc extension.

## Change

- App phát một visibility state tập trung cho command palette, settings, workspace transition và app blur/minimize.
- Surface hide/show thay vì close khi overlay tạm thời; sync bounds trước show.
- Focus native content cập nhật focused panel; focus address bar không bị native surface giành lại.
- `window.open`/new-window mở external mặc định; download dùng WebView2 download UI/path an toàn, không inject trang.
- Khi native window lỗi/crash, đóng nó và chuyển fallback có thông báo ngắn.

## Verify

```powershell
cd app
npm run build
npm run check
```

## Acceptance criteria

- [ ] Modal/palette luôn nằm trên nội dung browser.
- [ ] Chuyển workspace không để lại native surface ma.
- [ ] Ctrl+K/Alt+number vẫn hoạt động khi focus trong trang.
- [ ] Popup không tạo cửa sổ mất kiểm soát; download không làm crash shell.

## Gotchas

- Top-level owned window luôn đứng trên owner; CSS z-index không thể thắng, bắt buộc hide.
- Phải tránh show/hide liên tục trong animation frame.

## Deviations

1. Không ẩn overlay theo blur/minimize của main window: Windows đã tự ẩn cửa sổ owned
   theo owner, và ẩn theo blur sẽ thành vòng lặp (bấm vào trang → main mất focus → ẩn).
   Blocker chỉ gồm palette, settings và trạng thái tile.
2. `Tiles.tsx` phải sửa dù không nằm trong danh sách file: chỉ ở đó mới biết `visible`
   và `workspaceMotion` để tính `suppressed`.
3. Phím tắt không được chép sang Rust. Backend giữ một allowlist VK (`shell_shortcut`)
   rồi emit mô tả phím; `App.tsx` dựng lại `KeyboardEvent` và cho chạy qua đúng bảng cũ.
   Hệ quả cần nhớ: thêm phím tắt mới vào `App.tsx` mà quên `shell_shortcut` thì phím đó
   không hoạt động khi focus đang trong trang.
4. Download giữ nguyên UI mặc định của WebView2 — không thêm handler nào. Đó chính là
   đường an toàn; viết thêm chỉ tạo bề mặt lỗi mới.

