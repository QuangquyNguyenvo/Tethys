# Phase 2 — Nối navigation và page state native

> **Prereq**: phase 1 ✅ | **Rủi ro**: 🔴 | **Rollback**: checkout các file phase
> **Files đụng tới**: `app/src-tauri/src/browser.rs`, `app/src-tauri/src/lib.rs`, `app/src/web/nativeBrowser.ts`, `app/src/web/WebPanel.tsx`, `app/scripts/check-web.mjs`.

## Context recovery

Đọc context/checklist, implementation phase 1 và API `WebviewWindow::with_webview` của Tauri 2.11.5.

## Goal

Back/forward/reload/address navigation không recreate window. Backend phát URL/title/loading/can-go-back/can-go-forward từ WebView2 để chrome React phản ánh trang thật, kể cả link được click trong trang.

## KHÔNG đụng vào

- Modal visibility, popup/download policy: phase 3.
- Pool/memory: phase 4.

## Change

- Thêm command Rust theo `label`: navigate/reload/go_back/go_forward/get_state.
- Trên Windows dùng CoreWebView2; mọi call từ command async, tránh giữ main-thread lock.
- Gắn NavigationStarting/Completed, SourceChanged, DocumentTitleChanged, HistoryChanged đúng một lần mỗi window và emit event có label.
- Frontend controller subscribe/unsubscribe theo label; `WebPanel` lấy state native thay cho history mô phỏng khi native ready.
- Non-Windows trả lỗi có cấu trúc để fallback.

## Verify

```powershell
cd app
npm run build
npm run check
cd src-tauri
cargo check
```

## Acceptance criteria

- [ ] Lệnh trên pass.
- [ ] ⛔ MANUAL — Click link trong GitHub cập nhật address/title.
- [ ] ⛔ MANUAL — Back/forward/reload không tạo WebviewWindow mới.
- [ ] Nhập `javascript:` không được chuyển đến backend.

## Gotchas

- Không gọi API sync có thể deadlock trong event handler.
- COM event tokens phải được giữ và tháo khi window đóng.
- Event cũ từ label đã đóng phải bị bỏ qua phía frontend.

## Deviations

1. Token của COM event handler không được `remove_*` thủ công: `ICoreWebView2` không
   `Send`, không giữ được ngoài main thread. WebView2 giải phóng toàn bộ handler khi
   controller của cửa sổ bị huỷ, nên `BrowserRegistry` chỉ quên label.
2. Phải sửa `on_window_event` trong `lib.rs` ngoài phần đã dự kiến: nó gọi `kill_all()`
   cho mọi cửa sổ, nên đóng một overlay sẽ giết sạch PTY. Nay mọi nhánh hỏi `label`.
3. Thêm `browser_stop` (chưa dùng ở UI) vì huỷ một lần nạp dở là thao tác WebView2 duy
   nhất còn thiếu trong bộ điều khiển; để lại cho nút Stop sau này.

