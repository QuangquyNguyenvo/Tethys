# Phase 6 — QA motion trên Tauri/WebView2 thật

> **Prereq**: phase 5 | **Rủi ro**: 🔴 | **Rollback**: N/A; phase này mặc định không sửa code.
> **Files đụng tới**: chỉ `plans/material-you-expressive-motion/CHECKLIST.md` để ghi kết quả.

## Context recovery

Đọc `CONTEXT.md`, `CHECKLIST.md` và kết quả phase 1–5. Vite preview không chứng minh
được độ sắc xterm, Windows vibrancy, native fullscreen hoặc PTY lifecycle.

## Goal

Chứng minh first pass chạy mượt trên WebView2 native ở workload terminal thật. Phase này là
QA gate. Nếu thấy bug, ghi reproduction + selector/file nghi ngờ vào Deviations và tạo phase
fix riêng; không tiện tay sửa rải rác trong lúc test.

## KHÔNG đụng vào

- Không đổi Windows system settings bằng automation.
- Không debug lỗi PTY/backend không liên quan motion trong phase này.
- Không dùng kết quả screenshot tĩnh để tick tiêu chí “smooth/no reflow”.
- Không commit/release.

## Bước 6-A — Khởi động và baseline

```powershell
cd app
npm run tauri dev
```

Ghi vào session log:

- Kích thước cửa sổ và scale DPI.
- Wallpaper source, scheme, flat/glass, blur on/off.
- Terminal có spawn được hay không. First-pass QA từng thấy một chip lỗi spawn PowerShell trong
  môi trường dev; nếu lặp lại, ghi là blocker riêng, không quy lỗi cho CSS.

## Bước 6-B — Titlebar không reflow terminal

1. Mở 4 terminal panel, mỗi panel chạy output chậm liên tục.
2. Bật Top bar auto-hide.
3. Rê lên/rời mép trên 10 lần khi đang gõ vào terminal.
4. Quan sát dòng/cột xterm, caret và panel geometry.

PASS khi titlebar overlay trượt nhưng terminal không fit lại từng frame, caret không nhảy và
glyph không mờ. Một lần fit khi resize cửa sổ thật là hợp lệ.

## Bước 6-C — Workspace shared-axis motion

1. Tạo 3 workspace với tên có width khác nhau.
2. Đặt 1/2/4 panel tương ứng; giữ ít nhất hai PTY đang chạy ở workspace ẩn.
3. Switch bằng click, `Alt+1…3`, previous/next; đổi hướng trái/phải.
4. Resize cửa sổ đúng lúc transition đang chạy.
5. Chờ 700 ms rồi switch tiếp.

PASS khi:

- tonal pill trượt + đổi width liên tục, không teleport;
- terminal chỉ translate/fade, chữ không scale blur;
- không còn `.workspace-leaving` nhìn thấy sau transition;
- resize giữa animation không làm old workspace stuck;
- PTY workspace ẩn vẫn sống và nhận output.

## Bước 6-D — Dock, panel drag và overlays

### Dock

- Rê chậm qua toàn bộ icon rồi rê nhanh qua lại 20 lần.
- Item chính nâng lớn, hai hàng xóm phản ứng nhẹ, không replay jiggle/rotate.
- Dock auto-hide không chớp; tooltip không bị cắt; focus keyboard vẫn reveal dock.

### Panel lifecycle

- Split, close, duplicate, drag/swap/root-drop và resize gutter.
- Dùng chuột polling cao nếu có; drag ghost phải bám con trỏ, không rung do render > FPS.
- Bắt đầu drag rồi đóng panel bằng shortcut: ghost/body class/listener phải cleanup, drag sau
  vẫn dùng được.
- Sau khi layout đứng yên, panel không tiếp tục giữ cảm giác layer/compositor nặng.

### Overlay

- Settings: open, đổi đủ 5 page, close bằng X/Escape/outside click.
- Command palette: open/close nhanh bằng Ctrl+K, arrow selection, Escape.
- Tab/Shift+Tab không thoát dialog; đóng xong focus quay về control đã mở.
- Exit phải nhìn thấy nhưng input bị inert trong lúc closing; click không xuyên xuống panel;
  reopen nhanh không flash.

## Bước 6-E — Matrix chất liệu và accessibility

| Mode | Dark | Blur | Kích thước |
|---|---|---|---|
| Glass | on | on | `1280×800` |
| Glass | on | off | `1280×800` |
| Flat | on | n/a | `1280×800` |
| Glass | off | on | `640×400` |
| Flat | off | n/a | `640×400` |

Ghi `PASS` / `FAIL` / `⛔ MANUAL` vào bảng **Phase 6 — Native QA record** trong
`CHECKLIST.md`; không sửa file phase để ghi tiến độ.

Reduced motion: chỉ tick nếu môi trường đã bật sẵn hoặc user tự bật. Không tự động thay đổi
Windows accessibility settings. Khi bật, animation gần như tức thì nhưng UI vẫn đúng state.

## Verify cuối phase

```powershell
cd app
npm run build
npm run check
cargo check --manifest-path src-tauri/Cargo.toml
git diff --check
```

## Acceptance criteria

- [ ] Titlebar reveal không làm terminal resize theo từng frame.
- [ ] Workspace switch không scale/mờ glyph và không stuck khi resize giữa transition.
- [ ] Hidden terminal PTY vẫn sống sau ít nhất 20 lần switch.
- [ ] Dock wave, auto-hide và tooltip PASS.
- [ ] Settings/Palette enter + exit + rapid reopen PASS.
- [ ] Settings/Palette focus trap, restore focus và click-blocking trong exit PASS.
- [ ] Matrix chất liệu/kích thước trong `CHECKLIST.md` đã điền.
- [ ] ⛔ MANUAL — Reduced motion đã kiểm, hoặc ghi rõ “chưa kiểm vì OS setting”.
- [ ] Build/check/cargo/diff-check PASS.
- [ ] Không sửa code sản phẩm trong phase; nếu có bug, follow-up phase đã được tạo.

## Gotchas

- Computer-use/native automation có thể dừng khi user giành focus; không được tiếp tục dùng
  coordinate/index cũ. Ghi manual và dừng.
- Screenshot tĩnh không phát hiện velocity discontinuity hoặc xterm reflow.
- Dev mode có thể khác release về DevTools, nhưng motion/compositor path vẫn là WebView2 thật.

## Deviations

> _(để trống nếu không có)_

## After finishing

- Cập nhật `CHECKLIST.md`: matrix, trạng thái phase, session log và deviations.
