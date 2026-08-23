# Phase 09 — Persistence (Layout tree, Theme settings, Session state)

> Prereq: phase 08 PASS | Rủi ro: 🟢 (State serialization, app data storage, restore logic)
> Files: `src-tauri/src/storage.rs`, `src-tauri/src/lib.rs`, `src/store/sessions.ts`, `src/theme/useTheme.ts`, `src/App.tsx`
> Rollback: `cp -r app/src app/src.bak`

## Mục tiêu

1. **Lưu trữ trạng thái ứng dụng (AppState Persistence)**:
   - Cấu trúc layout tree (vị trí panel, tỷ lệ split, loại panel terminal / preview).
   - Tùy chọn giao diện (ThemeOptions: scheme variant, dark mode, contrast, termChroma).
2. **Backend Rust File Storage (`src-tauri/src/storage.rs`)**:
   - Lưu trữ dạng JSON tại thư mục cấu hình chuẩn của hệ điều hành (`AppData/Roaming/noname/state.json`).
   - Ghi file an toàn dạng atomic write (ghi file tạm rồi đổi tên) tránh hỏng dữ liệu khi tắt đột ngột.
   - Commands:
     - `storage_save_state(state: AppSavedState) -> Result<(), String>`
     - `storage_load_state() -> Result<Option<AppSavedState>, String>`
3. **Khôi phục tự động khi khởi động (Auto Restore)**:
   - Khi app mở lên: nạp layout tree và theme options từ file lưu.
   - Nếu có biến môi trường đo đạc (`NONAME_BOOT_PANELS`, `NONAME_PREVIEW_FILE`), ưu tiên biến môi trường phục vụ kiểm thử.

## Acceptance Criteria

| # | Tiêu chí | Cách kiểm | PASS khi | Kết quả |
|---|---|---|---|---|
| I1 | Build sạch | `npm run tauri build -- --no-bundle` | exit 0 | ✅ PASS |
| I2 | Lưu và đọc state thành công | Kiểm tra file `state.json` trên đĩa (`i-persistence.ps1`) | Tạo đúng file trong AppData/Roaming, chứa JSON cấu hình | ✅ PASS |
| I3 | Tự động khôi phục layout tree | Mở nhiều panel, đóng app, mở lại | App khôi phục lại đúng số panel và tỷ lệ | ✅ PASS |
| I4 | Tự động khôi phục theme settings | Đổi sang scheme qua palette, đóng app, mở lại | Scheme được lưu trong `state.json` và khôi phục khi mở | ✅ PASS |
| I5 | Không rò rỉ hay lỗi ghi file atomic | Lưu liên tục khi split panel | Ghi atomic qua temp file rồi rename thành công | ✅ PASS |
| I6 | Không glow (U1) | `Select-String "drop-shadow\|box-shadow"` | 0 kết quả khớp | ✅ PASS (0 matches) |

## Deviations

| # | Plan nói | Thực tế | Xử lý |
|---|---|---|---|
| M1 | Ưu tiên biến môi trường test | Khi chạy test tự động với `NONAME_BOOT_PANELS` hoặc `NONAME_PREVIEW_FILE`, không ghi đè layout test bằng saved state | Kiểm tra boot hook trước trong `App.tsx`, nếu không có hook test mới load state từ `state.json` |
