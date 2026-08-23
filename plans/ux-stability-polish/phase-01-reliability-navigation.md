# Phase 1 — Persistence, fullscreen, focus và workspace keys

> **Prereq**: — | **Rủi ro**: 🔴 | **Rollback**: không có git; sao lưu đúng 5 file trước edit
> **Files**: `app/src/App.tsx`, `app/src/store/sessions.ts`, `app/src/settings/SettingsPanel.tsx`, `app/src-tauri/src/wallpaper.rs`, `app/src-tauri/src/lib.rs`.

## Context recovery

Đọc `CONTEXT.md`, `CHECKLIST.md` và 5 file ở header.

## Goal

Hoàn tất mục 1, 2, 5, 8 bằng native command và persist ổn định.

## Không đụng vào

`App.css`, `SystemPanel.tsx`, `ExplorerPanel.tsx`; không đổi lifetime PTY/layout tree.

## 1A — Import logo và chặn save trước hydration

### Current code

~~~rust
#[tauri::command]
pub fn sysfetch_logo_pick() -> Option<String> {
    rfd::FileDialog::new().pick_file()
        .map(|path| path.to_string_lossy().into_owned())
}
~~~

### Change

- Command nhận `AppHandle`, copy ảnh đã chọn vào
  `app_config_dir/assets/sysfetch-logo.<ext>` bằng temp + replace.
- Trả path managed; Settings lưu path này vào `sysfetchLogoPath`.
- Save effect trong `App.tsx` phải `if (!hydrated) return;`.
- Restore gặp file mất thì báo rõ trong Settings, không âm thầm quên.

## 1B — Fullscreen qua Rust

### Current code

~~~ts
window.isFullscreen()
  .then((fullscreen) => window.setFullscreen(!fullscreen))
  .catch(() => {});
~~~

### Change

- Thêm `app_window_toggle_fullscreen(window) -> Result<bool, String>` trong `lib.rs`;
  đọc state, gọi `set_fullscreen`, trả state mới và đăng ký command.
- `App.tsx` dùng `invoke<boolean>` cho `F11`/`Alt+Enter`, cập nhật class
  `is-fullscreen` từ kết quả; lỗi gửi `frontend_error`.

## 1C — Close chọn hàng xóm

### Current code

~~~ts
const tree = removeLeaf(s.tree, key);
const rest = leaves(tree);
const nextFocused = s.focused === key ? (rest[0] ?? null) : s.focused;
~~~

### Change

- Lấy thứ tự leaf trước khi remove.
- Nếu đóng block đang focus: ưu tiên block bên phải tại cùng index, nếu không có chọn bên trái.
- Manual matrix bắt buộc: đóng block giữa, đóng block cuối và đóng block không focus.

## 1D — Ctrl+1/Ctrl+3

- Thêm `cycleWorkspace(step: -1 | 1)` có wrap-around và save workspace hiện tại.
- Capture `Ctrl+Digit1` → trước, `Ctrl+Digit3` → kế; không đụng `Alt+1…9`.
- Cập nhật danh sách shortcut trong Settings.

## Verify & acceptance

~~~powershell
npm run build
npm run check
cargo check --manifest-path src-tauri/Cargo.toml
~~~

- [ ] ⛔ MANUAL — Chọn logo rồi restart: ảnh còn và path nằm dưới app config.
- [ ] ⛔ MANUAL — F11 và Alt+Enter toggle fullscreen khi focus trong xterm.
- [x] Logic đóng block ưu tiên leaf cùng index (bên phải), rồi mới clamp sang trái.
- [x] Logic Ctrl+1/Ctrl+3 dùng modulo để wrap qua đầu/cuối workspace.
- [x] `npm run build`, `npm run check`, `cargo check --manifest-path src-tauri/Cargo.toml` PASS (2026-08-23).

## Gotchas

- Không gọi frontend `setFullscreen` vì capability hiện thiếu quyền set.
- Ctrl+1/3 phải preventDefault + stopPropagation.

## Deviations

> Không có code deviation. Hai tiêu chí cần cửa sổ Tauri thật được giữ nguyên trạng thái
> `⛔ MANUAL`; native command và frontend wiring đều đã qua TypeScript/Rust check.

## After finishing

Cập nhật `CHECKLIST.md`.
