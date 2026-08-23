# Phase 10 — Custom Titlebar, Workspace Tabs, Motion Polish & Styling

> Prereq: phase 09 PASS | Rủi ro: 🟠 (Window controls, drag region, tab switching, motion curves)
> Files: `src/titlebar/Titlebar.tsx`, `src/App.tsx`, `src/App.css`
> Rollback: `cp -r app/src app/src.bak`

## Mục tiêu

1. **Custom Titlebar (`src/titlebar/Titlebar.tsx`)**:
   - Header kéo thả cửa sổ (`data-tauri-drag-region`).
   - Workspace Tabs: Cho phép tạo nhiều không gian làm việc (mỗi tab lưu một cây tiling riêng biệt).
   - Nút mở nhanh Command Palette (`Ctrl+K`).
   - Bộ nút điều khiển cửa sổ tiêu chuẩn Windows: Thu nhỏ (Minimize), Phóng to/Khôi phục (Maximize), Đóng (Close) qua `@tauri-apps/api/window`.
2. **Motion Polish (Material 3 Motion Tokens)**:
   - Áp dụng các đường cong chuyển động Material 3:
     - Emphasized: `cubic-bezier(0.2, 0.0, 0, 1.0)`
     - Decelerate: `cubic-bezier(0.05, 0.7, 0.1, 1.0)`
   - Chuyển động chuyển tab, mở modal, co giãn gutter mượt mà ở 60–120 FPS.
3. **Hoàn thiện nguyên tắc U1, U2, U3**:
   - `U1`: Tuyệt đối không dùng glow effect.
   - `U2`: Bo góc lớn (28px cho canvas/panels, 999px cho tabs/pills), màu sắc êm dịu từ TonalSpot.
   - `U3`: Terminal chữ to rõ, ANSI rực rỡ (1.70× chroma boost).

## Acceptance Criteria

| # | Tiêu chí | Cách kiểm | PASS khi | Kết quả |
|---|---|---|---|---|
| J1 | Build sạch | `npm run tauri build -- --no-bundle` | exit 0 | ✅ PASS |
| J2 | Titlebar tích hợp drag-region | Kéo chuột tại thanh titlebar | Cửa sổ di chuyển theo thao tác chuột (`data-tauri-drag-region`) | ✅ PASS |
| J3 | Nút điều khiển cửa sổ | Bấm Minimize, Maximize, Close | Cửa sổ phản hồi chính xác tương ứng qua `@tauri-apps/api/window` | ✅ PASS |
| J4 | Workspace Tabs hoạt động độc lập | Thêm Tab 2, chia panel ở Tab 2, chuyển về Tab 1 | Hỗ trợ thêm/đóng/chuyển tab trực quan | ✅ PASS |
| J5 | Motion curves mượt mà | Kiểm tra CSS token motion | Khai báo chuẩn cubic-bezier M3, không giật lag | ✅ PASS |
| J6 | Không glow (U1) | `Select-String "drop-shadow\|box-shadow"` | 0 kết quả khớp | ✅ PASS (0 matches) |

## Deviations

| # | Plan nói | Thực tế | Xử lý |
|---|---|---|---|
| N1 | — | Tích hợp tabs và window controls trên một hàng nhỏ gọn | Sử dụng flex layout với các vùng drag-region xen kẽ |
