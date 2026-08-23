# Phase 05 — Preview panel (Ảnh / Markdown / Diff)

> Prereq: phase 04 PASS | Rủi ro: 🟠 (đọc file local, MIME detection, layout lồng ghép)
> Files: `src/preview/PreviewPanel.tsx`, `src/preview/ImagePreview.tsx`, `src/preview/MarkdownPreview.tsx`, `src/preview/DiffPreview.tsx`, `src/store/sessions.ts`, `src/layout/Tiles.tsx`, `src-tauri/src/fs_cmd.rs`
> Rollback: `cp -r app/src app/src.bak`

## Mục tiêu

Thêm panel loại `preview` vào không gian tiling của workspace. Panel này có thể hiển thị:
1. **Ảnh** (`.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`, `.gif`, `.ico`, `.bmp`): hiển thị tỉ lệ thực, kèm badge thông tin (kích thước pixel, dung lượng, định dạng).
2. **Markdown** (`.md`, `.markdown`): render tiêu đề, danh sách, đoạn văn, inline code, fenced code block.
3. **Diff / Code** (`.diff`, `.patch`, source code): highlight dòng thêm (`+` / xanh lá), dòng xoá (`-` / đỏ), số dòng.

Người dùng có thể mở preview bên cạnh terminal mà không cần Alt-Tab ra ngoài.

## Kiến trúc State

```ts
export type PanelType = "terminal" | "preview";

export type TerminalProps = {
  shell?: string;
  cwd?: string;
};

export type PreviewProps = {
  path: string;
  mode?: "auto" | "image" | "markdown" | "diff" | "text";
};

export type Panel = {
  key: string;
  type: PanelType;
  terminal?: TerminalProps;
  preview?: PreviewProps;
};
```

- Mặc định khi split: tạo terminal panel mới (hoặc mở preview file nếu truyền `preview`).
- `openPreview(path, targetKey?)`: Nếu targetKey được chỉ định, thay thế hoặc split bên cạnh panel đó.

## Rust Backend API (`src-tauri/src/fs_cmd.rs`)

| Command | Tham số | Trả về | Mục đích |
|---|---|---|---|
| `fs_read_text` | `path: String` | `Result<String, String>` | Đọc nội dung file text/markdown/diff UTF-8 (giới hạn an toàn 5MB) |
| `fs_stat` | `path: String` | `Result<FileStat, String>` | Trả về dung lượng byte, thời gian sửa đổi gần nhất |
| `fs_open_external` | `path: String` | `Result<(), String>` | Mở file bằng ứng dụng mặc định của hệ điều hành qua `opener` |

## Giao diện & Trải nghiệm (Tuân thủ U1 / U2 / U3)

- **Header Preview**:
  - Icon phân loại (ảnh / markdown / code / diff).
  - Tên file nổi bật (`onSurface`), đường dẫn thư mục mờ (`onSurfaceVariant`).
  - Chips thông tin: badge trạng thái / dung lượng / kích thước.
  - Nút hành động: "Mở bằng app ngoài" (`open_external`), "Đổi chế độ xem" (raw text / rendered), nút "Đóng panel".
- **Không glow** (U1): viền và phân cấp hoàn toàn dựa trên `outlineVariant`, `surfaceContainerLowest` và `surfaceContainerLow`.
- **Bo góc 16px** (U2): đồng bộ với `TerminalPanel`.

## Acceptance Criteria

| # | Tiêu chí | Cách kiểm | PASS khi | Kết quả |
|---|---|---|---|---|
| E1 | Build sạch | `npm run tauri build -- --no-bundle` | exit 0 | ✅ PASS |
| E2 | Đọc file text an toàn | Test backend `fs_read_text` | Nội dung đúng, báo lỗi rõ ràng nếu file không tồn tại hoặc >5MB | ✅ PASS |
| E3 | Render ảnh preview | Mở file `.png` / `.svg` trong preview panel | Thấy ảnh render, metadata hiển thị đúng kích thước | ✅ PASS |
| E4 | Render markdown & diff | Mở file `.md` và `.diff` | Render đúng heading/code block, diff tô màu xanh/đỏ đúng cú pháp | ✅ PASS |
| E5 | Tiling hỗ trợ hỗn hợp | Split gồm cả `terminal` và `preview` trên cùng 1 cây layout | Cả hai panel cùng hiển thị, resize co giãn mượt mà | ✅ PASS (cols = 76 chia đôi với preview) |
| E6 | Mở app ngoài | Bấm nút open external | Gọi lệnh OS opener thành công qua `tauri_plugin_opener` | ✅ PASS |
| E7 | Không glow (U1) | `Select-String "drop-shadow\|box-shadow"` | 0 kết quả khớp | ✅ PASS (0 matches) |

## Deviations

| # | Plan nói | Thực tế | Xử lý |
|---|---|---|---|
| H1 | Cần thư viện ngoài để parse markdown/diff | Đủ sức tự parse lightweight AST, giữ bundle siêu nhẹ | Viết `MarkdownPreview` và `DiffPreview` thuần túy bằng TypeScript & JSX |
| H2 | — | Cần hook đo đạc để test tự động E2–E5 | Thêm command `boot_preview()` đọc biến môi trường `NONAME_PREVIEW_FILE` |
