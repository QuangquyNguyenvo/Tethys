# Phase 06 — Click file path mở preview + file watcher auto-refresh

> Prereq: phase 05 PASS | Rủi ro: 🟠 (bắt link xterm.js, file watcher vòng đời, drag-drop)
> Files: `src/terminal/usePty.ts`, `src/terminal/links.ts`, `src/preview/PreviewPanel.tsx`, `src/App.tsx`, `src-tauri/src/watcher.rs`, `src-tauri/src/fs_cmd.rs`
> Rollback: `cp -r app/src app/src.bak`

## Mục tiêu

1. **Click mở preview từ Terminal**:
   - Khi terminal in ra đường dẫn file (ví dụ `bench/throughput.png`, `src/pty/session.rs`, `D:\Code\Project\noname\README.md`):
     - Rê chuột vào hoặc giữ `Ctrl`: hiện gạch chân, biến con trỏ thành bàn tay.
     - Click chuột (hoặc `Ctrl+Click`): Tự động resolve đường dẫn tuyệt đối theo `cwd` của terminal và mở/focus trong `PreviewPanel`.
2. **File Watcher Auto-refresh**:
   - Khi một file đang mở trong `PreviewPanel` bị thay đổi trên đĩa (ví dụ do lệnh build, lệnh `cargo test`, script bench hoặc AI agent sinh ảnh mới):
     - Rust backend theo dõi file qua `watcher` và phát event `preview:file-changed` kèm `path`.
     - `PreviewPanel` tự động tải lại nội dung / ảnh mà không làm chớp giật hay mất scroll.
3. **Kéo thả file vào app (Drag & Drop)**:
   - Kéo file từ File Explorer thả vào cửa sổ -> Mở ngay file đó trong `PreviewPanel`.

## Thiết kế Kỹ thuật

### 1. Link Provider trong `src/terminal/links.ts`

- Đăng ký `term.registerLinkProvider({ provideLinks(bufferLineNumber, callback) })`.
- Regex bắt:
  - Đường dẫn tuyệt đối Windows: `[a-zA-Z]:\\[^\s:()<>"]+`
  - Đường dẫn tương đối Unix/Windows có đuôi file nhận diện: `(?:\.{1,2}[/\\]|[a-zA-Z0-9_-]+[/\\])*[a-zA-Z0-9_.-]+\.(?:png|jpg|jpeg|svg|webp|gif|ico|bmp|md|markdown|diff|patch|rs|ts|tsx|js|jsx|json|toml|yaml|yml|txt|css|html|go|py|c|cpp|h)`
  - Bỏ qua ký tự phân cách ở cuối như `:`, `,`, `)`, `]`.
- Khi kích hoạt (click):
  - Gọi `invoke<string>("fs_resolve_path", { base: cwd, target })` để kiểm tra file có thật trên đĩa không.
  - Nếu file tồn tại, gọi `useSessions.getState().openPreview(resolvedPath, "row")`.

### 2. Rust File Watcher Backend (`src-tauri/src/watcher.rs`)

- Quản lý tập các file đang được watch (`WatcherManager` trong state Tauri).
- Commands:
  - `watch_file(path: String) -> Result<(), String>`: Bắt đầu theo dõi file.
  - `unwatch_file(path: String) -> Result<(), String>`: Dừng theo dõi file khi panel đóng.
- Khi có sự kiện `Modify`: emit Tauri event `preview:file-changed` với payload `{ path }` (có debounce 100ms để tránh spam event khi file được ghi nhiều chunk).

### 3. Drag & Drop File trong `src/App.tsx`

- Lắng nghe event `tauri://drag-drop` qua `@tauri-apps/api/webview` hoặc HTML5 drag-and-drop.
- Khi thả file, trích xuất `paths` và gọi `openPreview(paths[0])`.

## Acceptance Criteria

| # | Tiêu chí | Cách kiểm | PASS khi | Kết quả |
|---|---|---|---|---|
| F1 | Build sạch | `npm run tauri build -- --no-bundle` | exit 0 | ✅ PASS |
| F2 | Link Provider bắt đúng file path | Unit test regex & resolve đường dẫn (`check-links.mjs`) | Bắt chính xác relative, absolute, không dính dấu câu cuối | ✅ PASS |
| F3 | Click file mở preview | Test link provider trong xterm | Mở đúng PreviewPanel chứa file tương ứng | ✅ PASS |
| F4 | Auto-refresh khi file thay đổi | Sửa nội dung file test trên đĩa | PreviewPanel tự cập nhật nội dung mới trong <500ms | ✅ PASS |
| F5 | Drag & drop mở file | Kéo thả file vào cửa sổ qua `onDragDropEvent` | Mở đúng file preview | ✅ PASS |
| F6 | Vòng đời Watcher sạch | Mở và đóng preview panel (`f-links-watcher.ps1`) | Watcher huỷ đăng ký thành công, không rò resource/shell | ✅ PASS |
| F7 | Không glow (U1) | `Select-String "drop-shadow\|box-shadow"` | 0 kết quả khớp | ✅ PASS (0 matches) |

## Deviations

| # | Plan nói | Thực tế | Xử lý |
|---|---|---|---|
| J1 | Windows extended-length prefix (`\\?\`) | Canonicalize trên Windows tự chèn prefix `\\?\` gây lệch so sánh path | Bóc tách prefix `\\?\` trong cả `fs_resolve_path` và `watcher.rs` trước khi gửi lên frontend |
