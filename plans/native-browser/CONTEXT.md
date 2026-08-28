# Native browser — Context

> File này là **SỰ THẬT BẤT BIẾN**. Chỉ sửa khi phát hiện điều đã ghi là sai.
> Trạng thái/tiến độ nằm ở `CHECKLIST.md`.

**Viết ngày**: 2026-08-28 · **Tại commit**: `fe006a8`

## 1. Mục tiêu & định nghĩa "xong"

Biến Browser panel thành bề mặt WebView2 native gần với browser thông thường, nhưng chỉ giữ chrome và tài nguyên mà Tethys thực sự cần.

- Trang có `X-Frame-Options`/CSP như GitHub và MDN mở ngay trong panel.
- Thanh địa chỉ, back/forward/reload điều khiển đúng trang native đang hiển thị.
- Browser surface bám đúng tile khi resize/move và ẩn khi modal của Tethys mở.
- Không có cửa sổ Browser riêng trong taskbar/Alt+Tab.
- Browser không khả dụng thì tự quay về iframe/external-browser hiện tại.
- RAM được đo trước/sau với 1 và nhiều panel; panel ẩn được hạ ưu tiên hoặc đóng theo LRU.

## 2. Ràng buộc không được vi phạm

- Không bật lại `tauri/unstable` để dùng `Window::add_child`: cùng Tauri 2.11.5/Wry 0.55.1 đã đo và đứng `about:blank`.
- Giữ iframe làm fallback trong suốt quá trình chuyển đổi.
- Không proxy/gỡ header bảo mật của website.
- Không đổi cơ chế terminal, explorer, workspace hoặc palette màu.
- Không commit trừ khi user yêu cầu.

## 3. Kiến trúc liên quan

- `app/src/web/WebPanel.tsx`: chrome browser hiện tại, URL/history/loading, iframe fallback.
- `app/src/web/navigation.ts`: chuẩn hoá input và lịch sử thuần, đã có test Node.
- `app/src/App.tsx`: sở hữu Command Palette và Settings modal; phase sau phải phát visibility để native surface không phủ modal.
- `app/src-tauri/src/lib.rs`: nơi đăng ký command và truy cập WebView2 COM cho navigation/memory/events.
- `app/src-tauri/capabilities/default.json`: quyền tạo/quản lý `WebviewWindow` từ frontend.

Thiết kế đã chốt: dùng `WebviewWindow` không viền, `skipTaskbar`, có main window làm parent/owner; đồng bộ vị trí của nó với DOM placeholder. Đây là top-level native overlay giả lập một tile, không phải `add_child`.

## 4. Sự thật đã verify

| Điều | Sự thật | Kiểm bằng |
|---|---|---|
| HEAD khi lập plan | `fe006a8` | `git rev-parse --short HEAD` |
| Tauri/Wry | `tauri 2.11.5`, `wry 0.55.1` | Cargo registry/lock |
| WebView2 runtime đã đo | `151.0.4129.93` | `plans/terminal-workspace/_baseline/d18-webview-child.md` |
| JS `new Webview` | Gọi `plugin:webview|create_webview`, bên Rust vẫn là `window.add_child` và cần `unstable` | local `@tauri-apps/api/webview.js` + Tauri `webview/plugin.rs` |
| Native child Webview | Tạo target nhưng không render/navigate; không dùng lại | `plans/terminal-workspace/_baseline/d18-webview-child.md` |
| `WebviewWindow` | API có URL remote, parent, decorations, skipTaskbar, position/size/hide/show/close | local Tauri JS typings + generated capability schema |
| `RTK.md`, `PLANNING.md` | Không tồn tại trong repo | `Test-Path` đều `False` |

## 5. Vùng đã kiểm và sạch

- URL normalization/history đã tách khỏi React và có bounded-history test.
- F5 đã được backend chặn và chuyển thành `app-shortcut: reload-web`.
- Main window không có decorations, nên outer-position + DOM rect không cần bù titlebar hệ thống.
- Capability schema hiện có đầy đủ permission cần cho `WebviewWindow`.

## 6. Ngoài phạm vi

- Extension, sync tài khoản, profile, devtools người dùng.
- Tab bar riêng bên trong một Browser panel; workspace/panel đã là cấp điều hướng của Tethys.
- Ad blocker hoặc can thiệp network traffic.
- Chromium/CEF nhúng riêng; WebView2 có sẵn trên Windows nhẹ hơn và đã là runtime của Tethys.

## 7. Thuật ngữ / quy ước

- **native overlay**: `WebviewWindow` không viền bám lên vùng content của Browser tile.
- **main shell**: WebView2 đang render toàn bộ UI Tethys.
- **fallback**: iframe cho trang cho phép embed, external browser cho trang chặn embed.

