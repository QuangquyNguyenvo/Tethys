# UX stability & soft polish — Context

> File này là sự thật nền cho đợt sửa 8 mục UX. Tiến độ chỉ cập nhật trong `CHECKLIST.md`.

**Viết ngày**: 2026-08-23 · **Tại commit**: `NO_GIT_REPOSITORY`

## 1. Mục tiêu & định nghĩa xong

- Logo sysfetch được nhập vào vùng dữ liệu app và còn nguyên sau restart.
- `F11`/`Alt+Enter` bật tắt fullscreen thật.
- Sysfetch không ẩn dòng vì workspace bar làm chiều cao đổi nhẹ.
- Mở terminal có motion mềm, rõ, không ghost/backdrop lag.
- Đóng block chọn hàng xóm, không nhảy về block đầu.
- Explorer có location input, copy path lộ rõ và `Ctrl+L`.
- Explorer/Settings/scrollbar theo soft-round Material You/kawaii.
- `Ctrl+1` chuyển workspace trước, `Ctrl+3` chuyển workspace kế tiếp.

## 2. Ràng buộc

- Không unmount terminal khi đổi layout/workspace.
- Không ghi logo vào source tree; copy vào `app_config_dir`.
- Không animate width/height/backdrop-filter của terminal.
- Không phá `Alt+1…9`; không commit vì workspace không có `.git`.

## 3. Kiến trúc liên quan

| Vùng | File chịu trách nhiệm |
|---|---|
| Persist theme/logo | `app/src/App.tsx`, `theme/palette.ts`, Rust `storage.rs` |
| Chọn/import logo | `settings/SettingsPanel.tsx`, `src-tauri/src/wallpaper.rs` |
| Fullscreen | `App.tsx`, native command trong `src-tauri/src/lib.rs` |
| Focus/workspace | `store/sessions.ts` |
| Sysfetch density | `system/SystemPanel.tsx` |
| Motion/soft UI | `App.css` |
| Explorer | `explorer/ExplorerPanel.tsx` |

## 4. Sự thật đã verify

| Điều | Sự thật |
|---|---|
| Logo | `sysfetchLogoPath` có persist nhưng chỉ là path ngoài app, file bị di chuyển là mất |
| Save lúc boot | save effect chưa chặn bằng `hydrated` |
| Fullscreen | capability có `allow-is-fullscreen` nhưng thiếu `allow-set-fullscreen`; lỗi bị catch rỗng |
| Sysfetch | compact khi `height < 460` và compact bỏ Kernel/Shell/Terminal/GPU/Uptime |
| Focus sau close | đang dùng `rest[0]` |
| Explorer | copy path chỉ nằm trong context menu; breadcrumb không nhập được |
| Terminal pop | selector `.panel-host > .panel` không khớp DOM do có hai wrapper |

## 5. Vùng đã kiểm và sạch

- Storage Rust đã atomic replace đúng trên Windows.
- Explorer backend đã có `fs_list_dir`, không cần API filesystem mới.
- `switchWorkspace(id)` đã giữ session sống; chỉ thiếu relative navigation.

## 6. Ngoài phạm vi

- Rename/delete/move file trong Explorer.
- “Tab” ở mục 8 được hiểu là workspace trên titlebar.
- Thay terminal renderer hoặc thiết kế lại toàn bộ titlebar.

## 7. Quy ước

“Block” = panel tiling. “Location” = đường dẫn filesystem. Fullscreen = native fullscreen và ẩn custom chrome.
