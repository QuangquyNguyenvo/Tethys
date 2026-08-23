# CONTEXT — Terminal Workspace

> **Nguồn sự thật chính là [`../../PROJECT_CONTEXT.md`](../../PROJECT_CONTEXT.md).**
> File này chỉ ghi thêm phần thuộc về *kế hoạch thi công*, không lặp lại spec.
> Bất biến — chỉ sửa khi phát hiện điều đã ghi là **sai**, và phải nói rõ.

**Ngày lập**: 2026-08-20 · **Commit gốc**: chưa có (greenfield, không phải git repo)

---

## Tóm tắt một dòng

Workspace tiling cho AI agent trên Windows: Tauri v2 + Rust ConPTY + xterm.js, giao diện
Material 3 kiểu Caelestia. Một process, không daemon, local-only.

## Bất biến khi thi công

1. **Một process.** Không tách daemon, không mở socket, không sinh binary thứ hai.
   Vi phạm điều này là đã đánh mất toàn bộ lý do chọn Tauri (`PROJECT_CONTEXT.md` §4).
2. **Không hard-code cho Claude Code.** Mọi cơ chế phải generic với mọi CLI agent (§6).
3. **Không embed `wt.exe`, không nhét HWND native vào cửa sổ.** Airspace problem sẽ giết
   toàn bộ lớp UI (§3).
4. **Màu không hard-code.** Kể cả 16 màu ANSI của terminal — tất cả sinh từ tonal palette (§7.2).
5. **PTY output phải gom buffer ở Rust rồi gửi binary qua `Channel`, mỗi lần flush ≥ 1024 byte.**
   Không `emit()` JSON mỗi chunk — đó là bottleneck đã biết trước (§4).

   > ✏️ **Sửa 2026-08-20** (điều ghi ban đầu chưa đủ, và thiếu tới mức gây hại). Bản đầu chỉ nói
   > "gửi binary" mà không nói ngưỡng. Đọc `tauri-2.11.5/src/ipc/channel.rs:163`:
   > `InvokeResponseBody::Raw` **dưới 1024 byte** bị `serde_json` hoá thành mảng số rồi `eval` —
   > **chậm hơn gửi String**. Từ 1024 byte trở lên mới đi đường `fetch` nhị phân thật.
   > Tức là tuân thủ bản cũ mà flush chunk nhỏ thì còn tệ hơn không tuân thủ.
   > Chi tiết: `phase-01-spike.md` → Deviations → D2.

## Phần chưa chốt

- **Chi tiết UI/UX**: user sẽ gửi thêm trong lúc thi công. Phase liên quan (P03–P05, P10)
  chỉ được viết chi tiết **sau khi** nhận input đó.

## Ghi số liệu

Kết quả đo của phase 01 ghi vào `_baseline/`. Baseline đối chiếu: WaveTerm chạy cùng
workload trên cùng máy.
