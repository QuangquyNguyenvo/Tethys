# Phase 08 — Command Palette + Keybinding + Settings UI

> Prereq: phase 07 PASS | Rủi ro: 🟢 (Modal dialog, fuzzy filter, action dispatcher)
> Files: `src/palette/CommandPalette.tsx`, `src/palette/commands.ts`, `src/App.tsx`, `src/App.css`
> Rollback: `cp -r app/src app/src.bak`

## Mục tiêu

1. **Command Palette (`Ctrl+K` / `Ctrl+Shift+P` / `F1`)**:
   - Modal hiển thị ngay giữa màn hình theo ngôn ngữ Material 3 (surface-container-high, border outlineVariant, bo tròn 28px, U1/U2).
   - Ô nhập tìm kiếm lệnh hỗ trợ phím tắt điều hướng: `ArrowUp`, `ArrowDown`, `Enter` để chọn, `Esc` để đóng.
2. **Danh mục lệnh**:
   - Thao tác Layout: Chia ngang (`Ctrl+Shift+E`), Chia dọc (`Ctrl+Shift+O`), Đóng panel (`Ctrl+Shift+W`), Chuyển panel (`Ctrl+Shift+Tab`).
   - Thao tác Preview: Mở file preview...
   - Thao tác Shell OSC 133: Nhảy lên đầu lệnh trước (`Ctrl+↑`), Nhảy xuống lệnh sau (`Ctrl+↓`), Copy output lệnh gần nhất.
   - Thao tác Theme & Cài đặt: Trích xuất lại màu từ ảnh nền, Đổi scheme màu (TonalSpot / Vibrant / Expressive / ...), Bật/tắt Compact mode.
3. **Tuân thủ thiết kế U1 & U2**:
   - Tuyệt đối không dùng `box-shadow` phát sáng.
   - Phân lớp rõ rệt bằng `surface-container-high` và đường viền `outlineVariant`.

## Acceptance Criteria

| # | Tiêu chí | Cách kiểm | PASS khi | Kết quả |
|---|---|---|---|---|
| H1 | Build sạch | `npm run tauri build -- --no-bundle` | exit 0 | ✅ PASS |
| H2 | Mở & đóng Palette bằng phím tắt | Nhấn `Ctrl+K` hoặc `Ctrl+Shift+P` | Hiện bảng tìm kiếm; nhấn `Esc` đóng lại | ✅ PASS |
| H3 | Lọc lệnh và thực thi | Gõ "split" và nhấn Enter | Thực thi đúng hành động chia panel | ✅ PASS |
| H4 | Điều hướng phím mũi tên | Nhấn `ArrowDown`/`ArrowUp` | Focus di chuyển mượt mà giữa các mục | ✅ PASS |
| H5 | Đổi theme qua palette | Chọn lệnh chuyển scheme | Áp dụng tức thì bảng màu mới | ✅ PASS |
| H6 | Không glow (U1) | `Select-String "drop-shadow\|box-shadow"` | 0 kết quả khớp | ✅ PASS (0 matches) |

## Deviations

| # | Plan nói | Thực tế | Xử lý |
|---|---|---|---|
| L1 | — | `useTheme` thiếu hàm trigger refresh và setOpts từ store | Expose trực tiếp `refresh()` và `setOpts()` từ `useTheme` hook |
