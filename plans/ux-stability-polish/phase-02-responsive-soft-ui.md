# Phase 2 — Sysfetch ổn định, motion và soft UI

> **Prereq**: phase 1 | **Rủi ro**: 🟠 | **Rollback**: không có git; sao lưu đúng 3 file trước edit
> **Files**: `app/src/system/SystemPanel.tsx`, `app/src/explorer/ExplorerPanel.tsx`, `app/src/App.css`.

## Context recovery

Đọc `CONTEXT.md`, `CHECKLIST.md`; chạy app với ít nhất 3 block và logo custom.

## Goal

Hoàn tất mục 3, 4, 6, 7 mà không thêm reflow/blur animation nặng.

## 2A — Sysfetch không đổi density vì chiều cao dao động

### Current code

~~~ts
width < 560 || height < 460
  ? "compact"
  : width >= 620 && height >= 620
    ? "expanded"
    : "standard"
~~~

### Change

- Compact chỉ theo chiều rộng (`width < 520`); thiếu chiều cao thì container scroll.
- Expanded cần `width >= 680 && height >= 620`; còn lại standard.
- Coalesce ResizeObserver bằng requestAnimationFrame, chỉ set khi density thật sự đổi.
- Workspace bar không được làm mất Kernel/Shell/GPU/Uptime.

## 2B — Motion mở terminal

Selector hiện tại `.panel-host > .panel` không khớp DOM.

- Gắn animation vào wrapper đúng: fade + translateY 10px + scale 0.965,
  overshoot tối đa 1.008 rồi settle trong 380–440ms.
- Chỉ animate transform/opacity; không animate width/height/filter/backdrop-filter.
- Giữ `prefers-reduced-motion` và input phải dùng được ngay.

## 2C — Explorer location/copy

- Thêm nút copy path inline và feedback “Copied”.
- Breadcrumb chuyển thành input bằng nút edit hoặc `Ctrl+L`.
- Enter load draft; Escape huỷ; lỗi path giữ listing cũ và báo nhỏ.
- Copy item trong context menu vẫn giữ nguyên.

## 2D — Kawaii soft-round + scrollbar

- Explorer row thành card radius 12–14px, icon tile pastel từ `--ui-accent-*`,
  hover nâng một bậc surface, focus rõ nhưng không glow.
- Location/filter thành pill, spacing thoáng, metadata dịu.
- Settings: sidebar pill, group card 18–22px, toggle/slider mềm, responsive 1 cột.
- Scrollbar chung cho `.set-content`, `.ex-list`, `.sysfetch-container`,
  `.preview-body`, `.palette-list`: thumb tròn M3; hỗ trợ WebView2 + Firefox.
- Không hard-code hex, không `transition: all`.

## Verify & acceptance

~~~powershell
npm run build
npm run check
~~~

- [ ] ⛔ MANUAL — hover workspace bar nhiều lần: sysfetch không mất dòng.
- [ ] ⛔ MANUAL — mở 4 terminal: motion rõ, không ghost, input nhận ngay.
- [ ] ⛔ MANUAL — Explorer nhập path hợp lệ/sai qua backend Tauri và Ctrl+L.
- [x] Browser QA: nút edit, Escape và feedback copy path hoạt động.
- [x] Browser QA: Settings/Explorer usable ở viewport 360px và 900px.
- [x] Browser QA: scrollbar đồng nhất, không che nội dung ở 360px/900px.
- [x] `npm run build` và `npm run check` PASS (2026-08-23).

## Gotchas

Không remount panel để chạy animation; toast copy không được làm breadcrumb nhảy layout.

## Deviations

> `PreviewPanel.tsx` dùng scroll container `.pv`, không có `.preview-body` như phần 2D ghi.
> CSS scrollbar sẽ target `.pv`; không đổi DOM chỉ để khớp tên trong plan.
> Preview trình duyệt không có IPC Tauri, nên test path thật/sysfetch/fullscreen được giữ
> `⛔ MANUAL`; kiểm tra responsive và tương tác DOM còn lại đã chạy ở 360px/900px.

## After finishing

Cập nhật `CHECKLIST.md`.
