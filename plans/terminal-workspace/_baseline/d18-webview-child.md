# D18 — Webview con native cho panel web: **hỏng**, không dùng được

> Ngày đo: 2026-08-22 · Máy: Win 11 Pro 26200 · tauri **2.11.5** (bản mới nhất trên crates.io
> tại thời điểm đo) · tauri-runtime-wry **2.11.4** · wry **0.55.1** · WebView2 151.0.4129.93

## Vì sao thử

Panel web đang là `<iframe>`. Iframe chỉ mở được trang **cho phép** mình nhúng: Google, GitHub,
YouTube gửi `X-Frame-Options: DENY` hoặc `frame-ancestors 'none'`, trình duyệt bắt buộc phải
nghe — không có cờ nào tắt được, đó là cơ chế chống clickjacking, không phải cấu hình.

Lối thoát duy nhất giữ được panel *trong lưới* là **webview con native**: `Window::add_child`
của Tauri, mở khoá bằng feature `unstable`.

## Đã dựng đủ, và nó không chạy

Đã viết xong toàn bộ: module `web_panel.rs` (open / set_bounds / set_visible / navigate /
history / close), vòng đo khung bằng `requestAnimationFrame` bên frontend, sổ đăng ký lớp phủ
để ẩn webview khi bảng lệnh mở, cắt khung chừa chỗ cho dock. Kết quả:

| Phép thử | Kết quả |
|---|---|
| `add_child` có tạo được webview không | **Có** — CDP thấy nó như một page target riêng |
| Nạp `https://github.com/` | ❌ đứng ở `about:blank` |
| Nạp `https://example.com/` | ❌ đứng ở `about:blank` |
| Nạp `http://localhost:1420/` (chính app) | ❌ đứng ở `about:blank` |
| Gọi `navigate()` lần hai sau khi webview đã tồn tại | ❌ không đổi |
| Gắn vào `Window` thuần thay vì `WebviewWindow` | ❌ vẫn `about:blank` |
| Chạy **không** có `--remote-debugging-port` | ❌ vẫn trống |
| `set_background_color` đỏ để tìm xem nó nằm đâu | ❌ **không có vệt đỏ nào** trên cửa sổ |

Phép cuối là phép quyết định: webview con **không render gì cả**, không phải "render sai chỗ"
cũng không phải "ảnh chụp không bắt được bề mặt native". Ảnh chụp dùng cả `PrintWindow` lẫn
chụp thẳng từ màn hình khi cửa sổ ở foreground — hai đường, cùng một kết quả.

Hai API liên quan cũng hỏng theo, cùng một dáng vẻ:

- `Webview::url()` cho webview con: **treo vĩnh viễn**, cả ở dạng lệnh đồng bộ lẫn `async`.
- `WebviewWindowBuilder::build()` gọi ngay sau `add_child` trong cùng một lệnh: **treo**.

Nâng cấp không cứu được: `tauri 2.11.5` đã là bản mới nhất khi đo.

## Kết luận

Panel web **giữ nguyên `<iframe>`**. Feature `unstable` đã gỡ khỏi `Cargo.toml`, code webview
con đã xoá — giữ lại một đống code không chạy được chỉ để "sau này biết đâu" là cách chắc chắn
nhất khiến người sau tưởng nó từng hoạt động.

Ba đường còn lại, chưa làm:

1. **Cửa sổ webview riêng** (`WebviewWindow`) cho các trang chặn nhúng. Chắc chắn chạy, mở được
   mọi trang, nhưng **không phải một ô trong lưới** — nó là cửa sổ thứ hai. Rẻ nhất.
2. **Proxy trong Rust** gỡ `X-Frame-Options` / `frame-ancestors` rồi phục vụ qua custom
   protocol. Giữ được panel trong lưới, nhưng gần như chắc chắn vỡ với SPA cần đăng nhập,
   OAuth, WebSocket — chỉ hợp trang tài liệu tĩnh.
3. **Chờ Tauri sửa** `add_child` trên Windows, rồi làm lại. Code đã viết một lần nên biết
   chính xác phải làm gì; cái thiếu là một bản Tauri chạy được.
