# CHECKLIST — Terminal Workspace

> Trạng thái, thay đổi liên tục. Spec bất biến ở `CONTEXT.md` và `../../PROJECT_CONTEXT.md`.

## Phase

| # | Phase | Rủi ro | Trạng thái | File plan |
|---|---|---|---|---|
| 01 | Spike — đo 4 ẩn số, quyết định giữ hay đổi stack | 🟠 | ✅ xong (còn 4 việc manual) | `phase-01-spike.md` |
| 02 | Scaffold — Tauri v2 + Vite + Tailwind, 1 terminal chạy được | 🟢 | ✅ xong (B3b/B5 manual) | `phase-02-scaffold.md` |
| 03 | Dynamic color — wallpaper → M3 palette → CSS vars → ANSI 16 | 🟠 | ✅ xong (C1–C7 tự động) | `phase-03-dynamic-color.md` |
| 04 | Tiling layout engine — panel grid, split, kéo thả sắp xếp | 🔴 | ✅ xong (D1–D7 tự động) | `phase-04-tiling.md` |
| 05 | Preview panel — ảnh / markdown / diff | 🟠 | ✅ xong (E1–E7 tự động) | `phase-05-preview.md` |
| 06 | Click file path mở preview + file watcher auto-refresh | 🟠 | ✅ xong (F1–F7 tự động) | `phase-06-links-and-watcher.md` |
| 07 | OSC 133 pwsh — gutter mark, Ctrl+↑/↓, copy output, exit badge | 🔴 | ✅ xong (G1–G6 tự động) | `phase-07-osc133.md` |
| 08 | Command palette + keybinding + settings UI | 🟢 | ✅ xong (H1–H6 tự động) | `phase-08-command-palette.md` |
| 09 | Persistence SQLite — layout, history, theme | 🟢 | ✅ xong (I1–I6 tự động) | `phase-09-persistence.md` |
| 10 | Mica/Acrylic + custom titlebar + motion polish | 🟠 | ✅ xong (J1–J6 tự động) | `phase-10-titlebar-polish.md` |
| 11 | Thanh trên kiểu tab · Alt+số · menu chuột phải explorer · panel web | 🟠 | ✅ 3/4 xong · panel web **bị chặn** | không có file plan — xem mục dưới |

**🔒 chờ input UI** = user sẽ gửi chi tiết UI/UX trong lúc thi công. Không viết plan chi tiết
cho các phase này trước khi nhận. Viết trước = đoán mò = plan sai.

**Chỉ viết plan chi tiết cho phase kế tiếp**, sau khi phase trước xong và đã đọc code thật
(luật 6 của `PLANNING.md`).

---

## Cổng chặn sau Phase 01

Phase 01 **có quyền kết luận đổi stack**. Không được sang phase 02 khi chưa ghi kết luận vào đây.

- Nếu 4 tiêu chí §8 đạt → tiếp phase 02 như kế hoạch.
- Nếu 8.2 (IPC throughput) fail và tối ưu không cứu được → cân nhắc Electron lean.
- Nếu 8.1 (Claude Code TUI) fail → dừng, phân tích lại trước khi làm gì tiếp.

### Kết quả đo (2026-08-20)

Máy: Win 11 Pro 26200 · WebView2 151.0.4129.93 · rustc 1.97.0 · tauri 2.11.5 ·
portable-pty 0.9.0 · window-vibrancy 0.8.0 · @xterm/xterm 6.0.0 · @tauri-apps/api 2.11.1

| # | Tiêu chí | Ngưỡng | Đo được | Kết quả |
|---|---|---|---|---|
| A1 | RAM idle, 1 terminal | ≤ 180 MB | spike **208 MB** (app 179 + shell 29) · app/ **181 MB** (app 151 + shell 29) | ⚠️ FAIL sát ngưỡng — hụt 1 MB, cần user quyết |
| A2 | Cold start | ≤ 800 ms | **367 ms cold** / 52 ms warm | ✅ PASS — 367 ms là lần chạy ngay sau build (E5) |
| A3 | Throughput 47,7 MB | ≤ 30 s | **5,3–5,9 s** | ✅ PASS |
| A3 | UI không đơ | — | fps min 88–144 | ✅ PASS |
| A3 | RAM đỉnh | ≤ 600 MB | ~~713–754 MB~~ → **422 MB** phần app (còn lại là RAM của `powershell.exe` chạy benchmark) | ✅ PASS sau khi đo đúng (E7) |
| A4 | Claude Code TUI | — | chưa chạy | ⛔ MANUAL |
| A5 | Chi phí blur | ghi số | **−11 % MB/s, −33 % fps min** | ✅ đã đo |
| A6 | Ligature | — | **không có** (D3) | ⛔ MANUAL — câu hỏi cho user |
| A7 | Sweep `min_bytes` | ghi bảng | xem dưới | ✅ đã đo |

**A7 — `min_bytes` gần như không ảnh hưởng gì:**

| min_bytes | giây | MB/s | fps min | chunk **thật** | flush | RAM đỉnh |
|---|---|---|---|---|---|---|
| 256 | 5,79 | 8,7 | 144 | 16 254 B | 3 107 | 754 MB |
| 1 024 | 5,59 | 9,0 | 88 | 16 269 B | 3 104 | 748 MB |
| 4 096 | 5,92 | 8,5 | 140 | 16 259 B | 3 106 | 752 MB |
| 65 536 | 5,29 | 9,5 | 104 | 55 987 B | 902 | 713 MB |

Chênh lệch 8,5–9,5 MB/s nằm trong nhiễu. Lý do: **ConPTY trả dữ liệu theo đợt ~16 KB**, nên
buffer vượt mọi ngưỡng ta đặt ngay lập tức. `min_bytes` chỉ có tác dụng khi đặt **trên** 16 KB.

Hệ quả cho D2: ngưỡng 1024 B của Tauri **đúng về cơ chế nhưng ít ảnh hưởng thực tế** — với
output lớn, chunk tự nhiên đã vượt ngưỡng nên luôn đi đường `fetch` nhị phân. Đường `eval`
chỉ chạm tới output nhỏ lẻ (prompt, echo phím), nơi độ trễ mới quan trọng chứ không phải thông lượng.

**Baseline WaveTerm** (`_baseline/waveterm.md`): cold start **2 979 ms**, RAM phần app **390 MB**.
spike khởi động nhanh **8,1×** và nhẹ **2,3×**.

**Ghi chú A1**: ngưỡng 180 MB đặt trước khi biết đo bằng cách nào (xem D4 — cách đo trong plan
sai, lệch 3,5×). 196 MB gồm cả `powershell` 28 MB của chính shell; phần app là 167 MB so với
390 MB của WaveTerm. **Không tự ý nới ngưỡng** — cần user quyết: giữ 180 MB (thì FAIL) hay
đổi tiêu chí thành "phần app ≤ 200 MB và nhẹ hơn WaveTerm ≥ 2×" (thì PASS).

**A5 — chi phí `backdrop-filter`** (trung vị 3 vòng xen kẽ, `_baseline/a5-raw.csv`):

| | giây | MB/s | fps min | fps tb | RAM đỉnh |
|---|---|---|---|---|---|
| không blur | 6,19 | 8,2 | 78 | 123 | 772 MB |
| có blur | 6,96 | 7,3 | 52 | 109 | 794 MB |

⚠️ **Đọc con số này một cách dè dặt.** Nhiễu gần bằng biên độ hiệu ứng: vòng 3 "không blur" cho
fps min = 4, tệ hơn mọi vòng có blur. Xu hướng nhất quán (blur tệ hơn ở 4/6 cặp) và đủ để giữ
nguyên yêu cầu §7.7 — **phải có nút tắt blur** — nhưng đừng trích "−11 %" như một hằng số.
Muốn con số chắc thì cần ≥ 10 vòng trên máy rảnh.

---

## Kết luận phase 01 — **GIỮ STACK**

Cổng chặn đã qua:

- **8.2 IPC throughput không fail** → không cần cân nhắc Electron lean. 47,7 MB đổ hết trong
  ~6 s ở 8–9 MB/s, UI vẫn vẽ. Ngưỡng cũ là 30 s.
- **8.1 Claude Code TUI**: ⛔ **chưa đo** — xem "Việc còn nợ" bên dưới. Cổng chặn nói nếu 8.1
  fail thì dừng, nên **kết luận này còn treo một điều kiện**.
- Tauri thắng WaveTerm rõ ở hai chỉ số then chốt: khởi động **8,1×** nhanh hơn, phần app
  **2,3×** nhẹ hơn.

Cái giá phải trả, đã biết rõ:

| Vấn đề | Mức độ | Xử lý ở đâu |
|---|---|---|
| ~~RAM đỉnh 713–754 MB khi đổ output lớn~~ | ✅ | Xong ở phase 02: số thật là 422 MB, backpressure kéo còn 257 MB |
| Không có ligature | 🟠 | Cần user quyết. Đây là điểm Electron thắng thật |
| Chưa thử Claude Code thật | 🔴 | Manual, cần user |
| pwsh 7 chưa cài | 🟠 | Chốt trước phase 07 |

### Việc còn nợ — chỉ user làm được

| # | Việc | Cách làm |
|---|---|---|
| A4 | Claude Code trong spike | Chạy `spike.exe`, gõ `claude`, làm một lượt hỏi–đáp, resize cửa sổ giữa chừng. Xem: vẽ đúng không, có rác ký tự không, mouse ăn không, resize có vỡ không |
| A6 | Chấp nhận không ligature? | Mở cùng một file code trong spike và Windows Terminal, so bằng mắt |
| A3-baseline | WaveTerm đổ 47,7 MB | Mở WaveTerm, gõ `Get-Content (Join-Path $env:TEMP 'big.txt') -Raw`, bấm giờ. Không có số này thì "725 MB đỉnh" chưa biết là tệ hay bình thường |
| A1-ngưỡng | Giữ 180 MB hay đổi tiêu chí? | Sau phase 02 còn **181 MB** → vẫn FAIL đúng 1 MB. Phần app 151 MB vs WaveTerm 390 MB → nhẹ hơn 2,6×. **Không tự nới ngưỡng** |

---

## Kết quả phase 02 (2026-08-20)

| # | Tiêu chí | Kết quả |
|---|---|---|
| B1 build sạch | exit 0 | ✅ |
| B2 cwd | `D:\Code\Project\noname` | ✅ |
| B3a PTY nhận resize | 155×41 → 81×23 → 181×44 | ✅ |
| B3b layout TUI khi resize | — | ⛔ MANUAL (gộp với A4) |
| B4 không rò shell | 7 → 7 | ✅ |
| B5 Unicode/Nerd Font | — | ⛔ MANUAL (xem E1) |
| B6 không hồi quy | cold start 43 ms vs 52 ms; RAM idle 151 MB vs 179 MB; A3 +14 % | ✅ |
| B7 backpressure | **257 MB** vs đối chứng spike **422 MB** (−39 %) | ✅ |

**Backpressure đã được chứng minh, không phải phỏng đoán**: chạy lại spike bằng *đúng* phép đo
mới (tách RAM shell) cho 422 MB, app có cửa sổ trượt cho 257 MB. Giá phải trả là A3 chậm 14 %.

**Hai con số của phase 01 hoá ra đọc sai**, cả hai đều do phương pháp đo chứ không do code:
RAM đỉnh 713–754 MB (gộp cả `powershell.exe` đang giữ 47,7 MB dưới dạng string .NET) và
cold start 367 ms (đo lúc file cache lạnh, ngay sau build). Chi tiết ở E4–E7 trong
`phase-02-scaffold.md`.

**RAM idle app 151 MB + shell 29 MB = 181 MB** — vẫn nhỉnh hơn ngưỡng A1 (180 MB) đúng 1 MB.
Quyết định giữ hay đổi ngưỡng vẫn thuộc về user, xem mục "Việc còn nợ".

## Kết quả phase 03 (2026-08-20)

| # | Tiêu chí | Kết quả |
|---|---|---|
| C1 build sạch | exit 0 | ✅ |
| C2 không hex chôn cứng | chỉ còn `FALLBACK_SEED` | ✅ |
| C3 đọc ảnh nền thật | 1,8 MB, qua `cargo test` | ✅ |
| C4 tương phản ≥ 4,5:1 | thấp nhất 4,54 (Content) | ✅ |
| C5 terminal rực hơn chrome ≥ 1,5× | 1,57–2,57× | ✅ |
| C6 không glow (U1) | không khớp gì | ✅ |
| C7 đổi ảnh → đổi màu | ảnh đỏ ra nền ám đỏ, xanh lá ra nền ám xanh | ✅ |

**Cả bảy tiêu chí đều kiểm bằng máy.** C7 vốn ghi là `⛔ MANUAL`; thêm override
`NONAME_WALLPAPER` + hook `theme_report` là tự động được mà không phải đụng vào ảnh nền thật.

Hai chỗ suýt sai lặng lẽ, đều đã ghi ở F1–F6:
- `core:asset:default` **không tồn tại** — plan viết sai, build fail ngay.
- Canvas bị taint vì `asset:` khác origin; nếu không đọc thông điệp lỗi thật mà chỉ thấy
  "fallback" thì rất dễ kết luận nhầm là quantizer hỏng. Chỉ cần `crossOrigin="anonymous"`.
- Bài kiểm C7 bản đầu so ảnh nền với `TranscodedWallpaper` — **cùng một ảnh** — nên FAIL oan.

## Kết quả phase 04 (2026-08-20)

| # | Tiêu chí | Kết quả |
|---|---|---|
| D1 | Build sạch | exit 0 | ✅ |
| D2 | Cây đúng | split → close → về đúng cây ban đầu, ratio kẹp | ✅ |
| D3 | Đóng lá thì nhánh sụp | nhánh tự sụp, đóng lá cuối trả `null` | ✅ |
| D4 | Không rò PTY | mở 4 panel (+8 shells), đóng app về đúng số ban đầu | ✅ |
| D5 | Kéo đường ngăn → PTY đổi kích thước | 155 cols → 76 cols khi chia đôi | ✅ |
| D6 | Không glow (U1) | 0 matches `drop-shadow/box-shadow` | ✅ |
| D7 | Panel không bị dựng lại khi split | ~~PID shell 20784 giữ nguyên vẹn~~ → **FAIL, bài kiểm sai** | ❌ |

**D1–D6 PASS. D7 là dương tính giả — xem "Đính chính D7" ở phase 11.**

`d7-persistence.ps1` cho `NONAME_BOOT_CMD` **ghi đè** file PID. Panel bị unmount rồi mount lại
thì shell mới ghi đè PID của shell cũ, script đọc được một PID đang sống nên báo PASS. Nó không
phân biệt được "shell cũ còn sống" với "shell cũ chết, shell mới lên thay" — đúng cái nó phải đo.

## Kết quả phase 05 (2026-08-20)

| # | Tiêu chí | Kết quả |
|---|---|---|
| E1 | Build sạch | exit 0 | ✅ |
| E2 | Đọc file text an toàn | Đọc UTF-8, giới hạn 5MB, báo lỗi rõ ràng | ✅ |
| E3 | Render ảnh preview | Render ảnh, tính kích thước tự nhiên, badge metadata | ✅ |
| E4 | Render markdown & diff | Render heading, inline code, pre code, unified diff +/-, line numbers | ✅ |
| E5 | Tiling hỗ trợ hỗn hợp | Terminal (76 cols) và Preview panel cùng co giãn trong cây layout | ✅ |
| E6 | Mở app ngoài | Tích hợp `tauri_plugin_opener` thành công | ✅ |
| E7 | Không glow (U1) | 0 matches `drop-shadow/box-shadow` | ✅ |

**Cả bảy tiêu chí E1–E7 đều tự động hoá và PASS.**

## Kết quả phase 06 (2026-08-20)

| # | Tiêu chí | Kết quả |
|---|---|---|
| F1 | Build sạch | exit 0 | ✅ |
| F2 | Link Provider bắt đúng file path | Bắt chính xác relative, absolute, không dính dấu câu cuối (`check-links.mjs`) | ✅ |
| F3 | Click file mở preview | Link provider xterm resolve đường dẫn theo cwd và mở Preview | ✅ |
| F4 | Auto-refresh khi file thay đổi | `watcher.rs` bắt event Modify, PreviewPanel cập nhật tức thì | ✅ |
| F5 | Drag & drop mở file | Kéo thả file qua `onDragDropEvent` mở ngay preview | ✅ |
| F6 | Vòng đời Watcher sạch | Mở, sửa và đóng app không rò resource/shell | ✅ |
| F7 | Không glow (U1) | 0 matches `drop-shadow/box-shadow` | ✅ |

**Cả bảy tiêu chí F1–F7 đều tự động hoá và PASS.**

## Kết quả phase 07 (2026-08-20)

| # | Tiêu chí | Kết quả |
|---|---|---|
| G1 | Build sạch | exit 0 | ✅ |
| G2 | OSC 133 Parser xử lý đúng 4 sự kiện A/B/C/D | Bắt chính xác prompt, command, output, exit code (`check-osc133.mjs`) | ✅ |
| G3 | Gutter Mark đổi màu theo kết quả | Status chip trong terminal panel: 0 · ok (xanh), exit code (đỏ), running (vàng) | ✅ |
| G4 | Nhảy lệnh bằng Ctrl+↑ / Ctrl+↓ | Tích hợp custom key event handler và scroll theo buffer Y | ✅ |
| G5 | Copy output của từng block | Nút và hàm `copyLastOutput()` chép đúng output vào clipboard | ✅ |
| G6 | Không glow (U1) | 0 matches `drop-shadow/box-shadow` | ✅ |

**Cả sáu tiêu chí G1–G6 đều tự động hoá và PASS.**

## Kết quả phase 08 (2026-08-20)

| # | Tiêu chí | Kết quả |
|---|---|---|
| H1 | Build sạch | exit 0 | ✅ |
| H2 | Mở & đóng Palette bằng phím tắt | `Ctrl+K`, `Ctrl+Shift+P`, `F1` mở; `Esc` đóng mượt mà | ✅ |
| H3 | Lọc lệnh và thực thi | Lọc danh sách lệnh theo text và phím tắt, kích hoạt action chuẩn | ✅ |
| H4 | Điều hướng phím mũi tên | `ArrowDown`/`ArrowUp` di chuyển chọn mục và cuộn danh sách | ✅ |
| H5 | Đổi theme qua palette | Hỗ trợ chuyển đổi nhanh 4 scheme màu (TonalSpot, Vibrant, Expressive, Neutral) | ✅ |
| H6 | Không glow (U1) | 0 matches `drop-shadow/box-shadow` | ✅ |

**Cả sáu tiêu chí H1–H6 đều tự động hoá và PASS.**

## Kết quả phase 09 (2026-08-20)

| # | Tiêu chí | Kết quả |
|---|---|---|
| I1 | Build sạch | exit 0 | ✅ |
| I2 | Lưu và đọc state thành công | Tạo đúng file `state.json` trong AppData/Roaming, chứa layout + theme opts | ✅ |
| I3 | Tự động khôi phục layout tree | Đọc và khôi phục tree, panels, focused khi khởi động | ✅ |
| I4 | Tự động khôi phục theme settings | ThemeOptions được lưu và khôi phục không mất mát | ✅ |
| I5 | Không rò rỉ hay lỗi ghi file atomic | Ghi atomic qua temp file rồi rename thành công | ✅ |
| I6 | Không glow (U1) | 0 matches `drop-shadow/box-shadow` | ✅ |

**Cả sáu tiêu chí I1–I6 đều tự động hoá và PASS.**

## Kết quả phase 10 (2026-08-20)

| # | Tiêu chí | Kết quả |
|---|---|---|
| J1 | Build sạch | exit 0 | ✅ |
| J2 | Titlebar tích hợp drag-region | Kéo chuột tại thanh titlebar (`data-tauri-drag-region`) | ✅ |
| J3 | Nút điều khiển cửa sổ | Minimize, Maximize, Close tích hợp `@tauri-apps/api/window` | ✅ |
| J4 | Workspace Tabs hoạt động độc lập | Thêm, đóng và chuyển tab không gian làm việc | ✅ |
| J5 | Motion curves mượt mà | Motion tokens M3: standard, emphasized, decelerate | ✅ |
| J6 | Không glow (U1) | 0 matches `drop-shadow/box-shadow` | ✅ |

**Cả sáu tiêu chí J1–J6 đều tự động hoá và PASS.**

## Kết quả phase 11 — sửa tiling, kéo thả, và một bug PTY chết người (2026-08-21)

Không nằm trong plan gốc. Bắt nguồn từ ba phàn nàn của user: giao diện, kéo thả không ăn,
và "chia tab thì session hiện tại bị load lại".

| # | Tiêu chí | Ngưỡng | Kết quả | Bài kiểm |
|---|---|---|---|---|
| D7b | Split không dựng lại panel cũ | N panel ⇒ đúng N lần spawn PTY | 3/3 và 5/5 | `_baseline/d7-no-respawn.ps1` |
| D8.1 | Kéo thả vào mép panel → chia lại đúng phía | thứ tự đảo | PASS | `_baseline/d8-dragdrop.mjs` |
| D8.2 | Thả vào lõi → hoán đổi vị trí | 2 panel đổi chỗ | PASS | ″ |
| D8.3 | Thả xuống mép dưới → đổi chia dọc sang chia ngang | cùng x, khác y | PASS | ″ |
| D8.4 | Không nhân bản / mất panel sau 3 lượt kéo | vẫn 2 | PASS | ″ |
| D8.5 | Kéo thả không spawn thêm shell | vẫn 2 lần spawn | PASS | ″ |
| D9 | Mở N panel cùng lúc thì cả N shell chạy thật | N tag + 0 shell 0 ms CPU | 4/4 và 6/6 | `_baseline/d9-multi-pty.ps1` |
| D10 | Đổi workspace không giết session | 3 shell sống qua 2 lượt đổi tab | PASS | probe CDP |
| D11 | Đóng panel kill đúng shell của nó | 3 → 2, đúng id | PASS | probe CDP |

### Ba nguyên nhân gốc

**1. Split làm chết session — kiến trúc render, không phải bug vặt.**
`Tiles.tsx` bản cũ `createPortal` vào một DOM slot do `Leaf` tạo. Cây đổi hình (`leaf` →
`split`) thì React tháo `Leaf` cũ và dựng `Leaf` mới, container của portal đổi, React
**remount toàn bộ** con của portal ⇒ `usePty` cleanup gọi `pty_kill` + `term.dispose()`.
Sửa: bỏ portal, chuyển sang **absolute positioning**. Panel nằm phẳng một tầng, chỉ đổi
`transform` + kích thước. Hệ quả kèm theo: đổi workspace cũng không còn giết session (D10).

**2. Kéo thả im lặng không chạy — HTML5 drag-and-drop chết trong WebView2.**
Tauri bật `dragDropEnabled` (mặc định, và app cần nó để nhận file kéo từ Explorer). Trên
Windows, handler kéo-thả cấp OS của WebView2 nuốt sạch `dragstart`/`dragover`/`drop` bên
trong trang. Sửa: viết lại bằng **Pointer Events** + `setPointerCapture`, tự hit-test từ
ảnh chụp hình học (`layout/geometry.ts` + `layout/snapshot.ts`).

**3. Mở nhiều panel một lúc thì mọi shell trừ cái cuối đều chết đứng — bug nặng nhất, không ai biết.**
ConPTY mở với cờ `PSUEDOCONSOLE_INHERIT_CURSOR` nên việc đầu tiên nó làm là gửi `ESC[6n`
(Device Status Report) và **chặn tiến trình con** ở bước nối console cho tới khi terminal trả
lời vị trí con trỏ. `usePty` bản cũ gắn `term.onData` **bên trong** `.then()` của `pty_spawn`;
4 byte đó về trước khi promise resolve, xterm sinh câu trả lời lúc chưa có ai nghe, câu trả lời
rơi mất. Shell nằm im vĩnh viễn — `pty_alive` vẫn báo *còn sống*, nên không có bài kiểm nào
trong phase 01–10 bắt được.

Bằng chứng quyết định: shell chết đứng có **1 thread, 0 ms CPU, 3 MB** — process tạo ra nhưng
chưa bao giờ chạy một dòng code nào. Shell chạy được có 27 thread, 578 ms, 78 MB.

Sửa: gắn `term.onData` **trước** khi gọi `pty_spawn`, dồn input và ack vào hàng đợi cho tới
khi biết `sessionId`. Đây cũng là lý do thật đằng sau phàn nàn "split xong session load lại":
panel bị remount, PTY mới mất DSR, và terminal chết hẳn chứ không chỉ mất lịch sử.

### Hạ tầng đo mới

| File | Dùng để |
|---|---|
| `_baseline/d7-no-respawn.ps1` | Đếm **số lần** spawn PTY (`%TEMP%\pty_spawn.log` giờ ghi nối) |
| `_baseline/d9-multi-pty.ps1` | Bắt shell chết đứng bằng tag file + CPU time |
| `_baseline/d8-dragdrop.mjs` | Lái app qua CDP, bơm sự kiện chuột thật để kiểm kéo thả |
| `_baseline/ui-shot.mjs`, `drag-shot.mjs`, `inspect.mjs` | Chụp ảnh / soi DOM app đang chạy qua CDP |
| `frontend_error` (Rust) + hook ở `main.tsx` | Lỗi JS bản release ghi ra `%TEMP%
oname_frontend_error.log`; không có nó thì lỗi khởi động chỉ hiện ra là "cửa sổ trắng" |

⚠️ **`cargo build --release` trần KHÔNG dựng được binary chạy được.** `tauri-build` không được
gọi từ `tauri build` sẽ bật `cfg(dev)`, và app đi tải `http://localhost:1420` thay vì dist đã
nhúng — kết quả là cửa sổ trắng, không có shell nào. Luôn dùng `npx tauri build --no-bundle`.

## Kết quả phase 12 — dọn thanh trên, widget kiểu Wave Term, responsive (2026-08-21)

Không nằm trong plan gốc. Bắt nguồn từ năm phàn nàn của user sau khi dùng thật bản phase 11:
thanh trên có mấy chỗ vô dụng · thiếu trình duyệt tệp · dock thiếu web, nên tham khảo Wave Term ·
nút chia nên nằm ở góc trên block · thu nhỏ cửa sổ thì **mất** nút thay vì gọn lại ·
tên panel nên đổi theo app đang mở.

| # | Tiêu chí | Ngưỡng | Kết quả | Bài kiểm |
|---|---|---|---|---|
| D12.1 | Thanh trên bỏ trình phát nhạc giả và nút "+ Terminal" trùng chức năng | 0 phần tử, còn ô lệnh + 3 nút cửa sổ | PASS | `_baseline/d12-ui-widgets.mjs` |
| D12.2 | Explorer mở được, liệt kê thư mục thật, đường dẫn sạch tiền tố `\\?\` | rows > 0, chặng đầu là ổ đĩa | PASS | ″ |
| D12.3 | Bấm thư mục thì đi vào được | breadcrumb dài thêm | PASS | ″ |
| D12.4 | Panel Web mở được, có thanh địa chỉ | input + trang khởi đầu | PASS | ″ |
| D12.5 | Nút chia nằm ở góc trên panel, đã rút khỏi dock | 2 nút trong `.panel-head`, 0 dưới dock | PASS | ″ |
| D12.6 | Panel hẹp: nút gom vào menu tràn, không nút nào bị đẩy ra ngoài thanh | 0 tràn, panel ≥ 140px | PASS | ″ |
| D12.7 | Cửa sổ hẹp (620px): nút cửa sổ và tab vẫn còn | 3 `.win-btn`, ≥ 1 tab | PASS | ″ |
| D12.8 | Menu tràn mở được, đủ lệnh, không bị xén | 6 mục, nằm trọn trong khung nhìn | PASS | ″ |
| D13.1 | Terminal lúc rảnh mang tên shell | `pwsh` | PASS | `_baseline/d13-panel-title.mjs` |
| D13.2 | Đang chạy lệnh thì tiêu đề đổi thành tên lệnh | `Start-Sleep` | PASS | ″ |
| D13.3 | Có nhãn "đang chạy" | chip hiện | PASS | ″ |
| D13.4 | Lệnh xong thì tiêu đề trả về tên shell | `pwsh` | PASS | ″ |

### Những chỗ đã sửa và vì sao

**Thanh trên.** Bỏ hẳn "3AM — Aesthetic" cùng mấy vạch nhạc nhấp nháy: một trình phát nhạc giả,
không nối vào cái gì. Bỏ nút "+ Terminal" đứng sát nút "+" của tab — hai dấu cộng cạnh nhau,
hai việc khác hẳn nhau, không cách nào đoán được cái nào là cái nào. Mở terminal giờ ở dock.

**Dock = widget bar, không phải thanh thao tác layout.** Theo lối Wave Term: mỗi ô là một *loại
panel* mở được (Terminal · Tệp · Web · Xem tài liệu · Bảng lệnh). Hai nút "chia dọc / chia ngang"
đã chuyển lên góc trên của từng block — chia là việc của **một** panel cụ thể, để dưới dock thì
không nói được đang chia cái nào.

**`PanelHeader` dùng chung** (`src/panel/PanelHeader.tsx`) thay cho bốn thanh tiêu đề viết riêng.
Thu nhỏ theo bốn bậc đo bằng `ResizeObserver` trên chính thanh đó: 430px bỏ dòng phụ · 330px bỏ
chip · 270px dồn nút vào menu `⋯` · 150px chỉ còn chấm màu và `⋯` (nút đóng cũng vào trong menu).
CSS thuần không làm được việc này: nó *giấu* được nhưng không *gom* được.

**Menu tràn phải là portal ra `body`.** `.panel` có `overflow: hidden` để bo góc, nên menu xổ ra
từ một panel hẹp bị xén mất nửa chữ. Toạ độ do `PanelHeader` tự tính và kẹp vào khung nhìn.
(Portal ở đây vô hại — nó dựng/xoá theo lần mở menu, không phải nơi panel sinh sống; xem P11.)

**`MIN_PANEL = 140px` trong `geometry.ts`.** `MIN_RATIO` chỉ chặn theo tỉ lệ nên vô dụng khi
khung cha đã nhỏ: 8% của 200px vẫn là 16px. Có ngưỡng px thì kéo đường ngăn không bóp được panel
xuống còn không, và thanh tiêu đề luôn còn chỗ cho menu tràn.

**Tên panel theo app đang chạy.** Prompt hook nay phát thêm `OSC 133;C;<lệnh>`. Hai lần thử hỏng
trước khi ra được cách đúng, ghi lại ở Deviations bên dưới.

### Hạ tầng đo mới

| File | Dùng để |
|---|---|
| `_baseline/d12-ui-widgets.mjs` | Lái app qua CDP: bấm dock, đọc DOM, thu nhỏ bằng `Emulation.setDeviceMetricsOverride`, chụp `ui-widgets.png` + `ui-narrow.png` |
| `_baseline/d13-panel-title.mjs` | Gõ lệnh thật vào xterm qua `Input.insertText` rồi đọc lại tiêu đề panel |

⚠️ **Bài kiểm UI phải xoá `%APPDATA%\com.noname.app\state.json` trước khi chạy.** App tự lưu
layout, nên lần chạy trước để lại panel cho lần sau: phép thử "panel hẹp" ban đầu đo một bố cục
7 panel ngẫu nhiên và FAIL vì lý do chẳng liên quan gì tới thứ nó định đo.


---

## Kết quả phase 13 — terminal trong suốt chỉnh được, thanh trên kiểu caelestia (2026-08-21)

Hai yêu cầu: (1) nền terminal chưa chỉnh được độ trong; (2) thanh trên chưa ra kiểu
round-soft như caelestia shell trên Hyprland.

| # | Tiêu chí | Cách đo | Kết quả |
|---|---|---|---|
| D14.1 | Nền panel để trống, alpha nằm ở `--term-bg`, có lớp làm mờ ảnh nền | `getComputedStyle` | PASS — `#0c0e1399`, `blur(9px) saturate(1.35)` |
| D14.2 | Đục hoàn toàn thì nền terminal là một màu phẳng | Chụp màn hình, giải mã PNG, độ lệch chuẩn độ sáng | PASS — sd = 0,00 |
| D14.3 | `Ctrl+Shift+[` kéo được độ trong, ảnh nền hiện qua | Cùng phép đo, so sd | PASS — sd 0,00 → 13,23 |
| D14.4 | Độ trong bị chặn ở 0,3 | Bắn 20 lần phím tắt | PASS — dừng ở 0,3 |
| D14.5 | Thanh trên tách mép, bo tròn hết cỡ, nền kính mờ | Đo `getBoundingClientRect` của `.titlebar` vs `.tb-bar` | PASS — inset 8px mọi phía, r = 9999, không còn gạch chân |
| D14.6 | Nút cửa sổ thành nút tròn | `borderRadius` + `width` | PASS — r = 9999, w = 26 |
| D14.7 | Chữ đảo màu (`ESC[7m`) vẫn thấy nét | Gõ lệnh thật, đếm pixel sáng/tối | PASS — sáng 22,9% · tối 2,9% |
| D14.8 | Explorer vẫn đục | `backgroundColor` | PASS — alpha = 1 |

### Vì sao làm thế

| Chỗ | Trước | Sau | Lý do |
|---|---|---|---|
| Nền terminal | Hex 6 số, đục cứng | `#rrggbbaa` theo `termOpacity`, mặc định 0,6 | Chỉnh bằng `Ctrl+Shift+[` / `]` hoặc 3 lệnh sẵn trong bảng lệnh; lưu cùng `theme_opts` |
| Lớp mang alpha | — | Đúng **một** lớp: `background` của `.term` | Hai lớp thì nhân nhau: 0,6 hoá 0,84 |
| `xtermTheme.background` | Màu đục | `#00000000` | Xem trên. Rủi ro chữ đảo màu tàng hình đã đo (D14.7), không xảy ra |
| Sau nền terminal | Ảnh nền sắc nét | `backdrop-filter: blur((1−a)×22px)` | Chữ nằm trên chi tiết ảnh thì mất đọc. Đục hẳn → `none`, bỏ luôn lớp lọc khỏi cây vẽ |
| Thanh trên | Dải dính mép, vuông góc, có gạch chân | `.tb-bar` — hòn đảo lề 8px, bo `--r-full`, `blur(26px)` | Đó là thanh tiêu đề Windows, không phải bar của caelestia. Nay ăn khớp với dock ở đáy |
| Nút cửa sổ | Ô vuông 42×full-height | Nút tròn 26×26 | Thanh đã bo tròn thì ô vuông chạm góc thò ra ngoài đường cong |

### Hạ tầng đo mới

| File | Làm gì |
|---|---|
| `_baseline/d14-glass.mjs` | Giải mã PNG bằng `zlib.inflateSync` + bỏ lọc dòng quét (Node không có sẵn bộ giải mã ảnh), rồi đọc pixel thật bên trong terminal |

⚠️ Không kiểm trong suốt bằng cách đọc lại chính biến CSS mình vừa ghi — thế chỉ chứng minh
`setProperty` chạy. Phải đọc pixel của khung hình đã hợp thành.


---

## Kết quả phase 14 — dọn nút, panel cài đặt, hoạt ảnh, xoắn ốc (2026-08-21)

| # | Tiêu chí | Cách đo | Kết quả |
|---|---|---|---|
| D15.1 | Bỏ ô tìm kiếm giữa thanh, dock rút còn 4 ô | Đếm DOM | PASS — Terminal · Tệp · Web · Cài đặt |
| D15.2 | Chỉ block đang chọn hiện hàng nút | `opacity` tính toán của `.panel-actions` | PASS — 1 với block đang chọn, 0 với block còn lại |
| D15.3 | Ctrl+, mở cài đặt, thanh trượt đổi thật nền terminal | Bắn `input`, đọc `--term-opacity` | PASS — 0,42 |
| D15.4 | Đóng block để lại bóng co dần rồi tự dọn | Đếm `.panel-ghost` sau 60ms và sau 560ms | PASS — 1 → 0 |
| D15.5 | Ctrl+Shift+D nhân đôi đúng thư mục shell đang đứng | `cd app` rồi nhân đôi, đọc dòng phụ cả hai block | PASS — cả hai ở `…
onamepp` |
| D15.6 | Ctrl+C khi bôi đen thì copy, lệnh đang chạy không bị đụng | `hasSelection` + `clipboard.readText` + tiêu đề block | PASS — bôi đen true→false, clipboard 27 ký tự, lệnh vẫn chạy |
| D15.7 | Dock tự ẩn trượt khỏi màn hình, còn dải gọi ở mép dưới | `getBoundingClientRect` + `opacity` | PASS — top 810 ≥ vh 800 |
| D16.1 | Thêm 4 block liên tiếp thì hướng chia xen kẽ | Diff hình học trước/sau mỗi lần thêm | PASS — row → col → row → col |
| D16.2 | Mỗi nước cắt đúng đôi ô vừa mở | Tỉ lệ diện tích ô mới / ô bị cắt | PASS — 1,000 · 1,000 · 0,997 · 0,994 |
| D16.3 | Ctrl+Shift+E vẫn chia sang phải | Hình học hai ô mới nhất | PASS |
| D16.4 | Chọn "Luôn sang phải" thì hết xoắn | Thêm 2 block, đọc hướng | PASS — row → row |

### Vì sao làm thế

| Chỗ | Trước | Sau | Lý do |
|---|---|---|---|
| Ô tìm kiếm trên thanh | Hộp to chắn giữa thanh | Bỏ hẳn | Chỉ mở đúng thứ Ctrl+K đã mở, mà in sẵn "Ctrl+K" ngay bên trong nó |
| Dock | 5 ô, có "Xem tài liệu" mở README chôn cứng | 4 ô: Terminal · Tệp · Web · Cài đặt | Explorer đã thay được README; bảng lệnh đã có Ctrl+K |
| Hàng nút trên thanh block | Luôn hiện, mọi block | Chỉ rõ trên block đang chọn hoặc khi rê chuột | Mở 4 block là 4 hàng biểu tượng đập vào mắt, mà mỗi lúc chỉ thao tác trên một block |
| Thao tác phụ (nhảy lệnh, copy output) | Nút trên thanh | Vào menu `⋯` (cờ `inline` trên `HeadAction`) | Mặc định là "vào menu"; chỉ thứ dùng liên tục mới được ra thanh |
| Cài đặt | Không có | Panel `settings`, mở bằng Ctrl+, hoặc dock | Chỉnh độ trong mà không thấy terminal thì chỉnh mù → phải là panel, không phải hộp thoại nổi |
| Bố cục cài đặt | Mỗi hàng tự canh bằng `width` trên nhãn | Một lưới 3 cột dùng chung | Nhãn dài hơn là hàng đó lệch. Đo lại: 1 mốc nhãn, 1 mốc điều khiển, 1 mốc trị số cho cả 5 nhóm |
| Icon | SVG viết tay ở 9 file | `lucide-react` | Nét không đều, không có tên, sửa một icon phải đi tìm nó ở file nào. Nay 0 `<svg>` viết tay |
| Mở / đóng block | Hiện ra, biến mất | Nảy `cubic-bezier(.2,1.5,.35,1)`; đóng để lại bóng co dần, block còn lại trượt vào chỗ trống | — |
| `pty_resize` | Mỗi khung hình (rAF) | Hoãn 90ms | Hoạt ảnh trượt panel sẽ thành một tràng IPC đổi kích thước PTY nếu không hoãn |
| Thêm block | Luôn chia sang phải | Xoắn ốc (mặc định) · theo cạnh dài · luôn sang phải | Yêu cầu của user. Ctrl+Shift+E/O vẫn là chỉ định tay |
| Ctrl+C | Luôn gửi xuống shell | Có bôi đen thì copy | Quy ước của mọi terminal |
| Ctrl+T / Ctrl+W | Không có | Có, kèm công tắc trong cài đặt | Đánh đổi thật: bật thì shell mất `Ctrl+W` (xoá lùi một từ) và `Ctrl+T` (đảo ký tự) |
| Thư mục của block | `cwd` lúc mở, đứng yên mãi | Bám OSC 7, đổi theo mỗi lần `cd` | Ctrl+Shift+D phải mở ở chỗ shell **đang** đứng |

### Hạ tầng đo mới

| File | Làm gì |
|---|---|
| `_baseline/d15-clean-ui.mjs` | Dọn nút, cài đặt, hoạt ảnh, Ctrl+C, Ctrl+Shift+D, dock tự ẩn |
| `_baseline/d16-spiral.mjs` | Dựng lại hướng chia từng nước bằng cách **diff hình học trước/sau** mỗi lần thêm block |
| Móc `host.__term` trong `usePty` | Bài kiểm đọc được `hasSelection` / buffer thật của xterm. WebGL renderer không để lại dấu vết nào trong DOM |

⚠️ **Không suy hướng chia bằng cách so hai panel liên tiếp theo thứ tự tạo.** Sau vài nước
nữa chúng chẳng còn kề nhau, và phép so sẽ ra "không xác định" dù layout hoàn toàn đúng.
Phải diff trước/sau từng bước.

⚠️ **CDP không gửi được Ctrl+C tới trang** — WebView2 nuốt nó làm phím Copy của chính nó
(Enter và các phím khác thì qua bình thường). Phải dựng `KeyboardEvent` trong trang, và
`keyCode` **không đặt được qua hàm dựng** — phải `Object.defineProperty`, nếu không
`evaluateKeyboardEvent` của xterm nhận `keyCode` 0 và không phát byte nào.


---

## Deviations

_(Code thật khác plan → ghi vào đây, KHÔNG tự chế. Trống nghĩa là chưa có.)_

| Phase | Plan nói | Thực tế | Xử lý |
|---|---|---|---|
| 01 | Spawn `pwsh.exe` | Máy chưa cài PowerShell 7 | `pick_shell()` fallback `powershell.exe`. Chốt trước P07 (OSC 133 viết cho pwsh 7) |
| 01 | "Gửi binary qua `Channel`" | Raw < 1024B bị JSON-hoá + `eval`, tệ hơn String | Sửa bất biến #5 của `CONTEXT.md`: flush ≥ 1024B. Spike thêm tham số `min_bytes` để đo |
| 01 | `fontLigatures: true` | Option không tồn tại; addon cần Node `fs` → chết trong WebView2 | Bỏ ligature. A6 đổi thành câu hỏi "không ligature — chấp nhận được không" |
| 02 | Font mặc định `JetBrainsMono Nerd Font` | Máy không có font đó, cũng không có Nerd Font nào | Đổi sang `Cascadia Mono`. Nerd Font icon trong prompt sẽ ra ô vuông — cần user quyết (E1) |
| 02 | — | Không gõ được vào cửa sổ GUI để đo B7 | Thêm hook env `NONAME_BOOT_CMD` (E2) |
| 13 | Mặc định `termOpacity` 0,85 | Nền terminal là `surfaceContainerLowest`, trong theme tối luma chỉ 13,9 — 15% ảnh nền lọt qua nâng lên ~17, mắt không thấy | Hạ mặc định xuống 0,6. User báo "có transparency đâu?" là đúng |
| 13 | Để xterm tự tô nền có alpha | Chỗ lưới ký tự chia không hết (dải thừa đáy + mép phải) không có canvas nên hụt lớp tô → khung tối viền quanh terminal | Dồn alpha về CSS `.term`, `xtermTheme.background` = `#00000000` |
| 14 | User yêu cầu sửa Ctrl+C ngắt lệnh | **Không sửa được — bốn đường đều đo và đều hỏng.** (1) Ghi `0x03` vào PTY: xterm phát đúng byte (đọc qua `term.onData`), byte tới `pty_write`, lệnh chạy tiếp — đúng thế cả với `powershell -NoLogo -NoProfile` lồng bên trong, nên không do script prompt. (2) `SetConsoleCtrlHandler(NULL,TRUE)` + `AttachConsole` + `GenerateConsoleCtrlEvent`: **app tự chết**, exit `0xC000013A` STATUS_CONTROL_C_EXIT — cờ bỏ-qua-Ctrl+C nằm trong tham số tiến trình và bị xoá khi gắn console khác. (3) Đăng ký handler thật (sống qua Attach/Free) rồi bắn tín hiệu: app sống, nhưng **không ai nhận** — kể cả chính app đang gắn trong console đó (`self_got=false`). ConPTY không phát tán ctrl event. Ép `ENABLE_PROCESSED_INPUT` vô ích: đọc ra nó vốn đã bật (`mode=0x01f7`). (4) Chuỗi win32-input-mode `ESC[67;46;3;1;8;1_` (`portable-pty` bật `PSEUDOCONSOLE_WIN32_INPUT_MODE`, nên `0x03` trần tới nơi mất trạng thái phím Ctrl): conhost không phân tích — thử cả chuỗi cho phím `a` cũng không hiện ký tự nào. | Đã **gỡ hết** mã không chạy được, giữ nguyên đường `0x03` như cũ nên không hồi quy. `d15-clean-ui.mjs` in dòng ĐÃ BIẾT/ĐÃ SỬA mỗi lần chạy. Hướng còn lại chưa thử: bỏ cờ `PSEUDOCONSOLE_WIN32_INPUT_MODE` (phải fork `portable-pty`), hoặc đổi sang `conpty-rs`/tự gọi `CreatePseudoConsole` |
| 14 | Bài kiểm D12.8 đo ở 620px | Layout xoắn ốc chia 620px thành ba cột 295px — không panel nào dưới ngưỡng 270 nên chẳng có gì để gom vào `⋯` | Bóp thêm xuống 430px cho D12.8 |
| 01 | Đo RAM bằng Σ`WorkingSet64` lọc theo tên | Đếm trùng shared memory (691 MB vs 196 MB thật) + gom/giết nhầm WebView2 của app khác | Đo theo cây tiến trình con + `WorkingSetPrivate`. Xem D4 |
| 12 | Lấy tên app từ `term.onTitleChange` (OSC 0/2) | ConPTY khởi động với tiêu đề console **thừa kế từ tiến trình cha**, panel vừa mở đã mang tên linh tinh (đo được: "shore") | Bỏ hẳn nguồn OSC 0/2. Tên app chỉ lấy từ `OSC 133;C` do prompt hook của ta phát |
| 12 | Phát `OSC 133;C` bằng `Set-PSReadLineOption -AddToHistoryHandler` | PSReadLine gọi handler đó thêm một lượt khi **nạp file lịch sử lúc khởi động** → terminal vừa mở đã tưởng đang chạy lệnh cuối của phiên trước | Chuyển sang `Set-PSReadLineKeyHandler -Chord Enter`, tự kiểm cú pháp bằng `Parser::ParseInput` để không báo nhầm ở dòng nối tiếp |
| 12 | `clean()` cắt tiền tố `\\?\` của `canonicalize()` | Viết nhầm thành `r"\?\"` (thiếu một dấu chéo) nên không khớp gì cả; mọi đường dẫn Explorer trả về mang thêm chặng rác `?` | Sửa literal + thêm khẳng định "chặng đầu phải là ổ đĩa" vào D12.2 |
| 04 | Global keydown thông thường | Xterm nuốt phím tắt nếu không dùng capture phase | Thêm `{ capture: true }` vào `window.addEventListener("keydown")` (G1) |
| 04 | `on_window_event` chỉ bắt `Destroyed` | Khi đóng qua `CloseMainWindow` / nút X, `CloseRequested` chạy trước | Bắt cả `Destroyed` và `CloseRequested` để `kill_all()` luôn dọn sạch PTY (G2) |
| 04 | D7 là MANUAL | Tự động hoá được bằng script kiểm tra PID qua `NONAME_BOOT_CMD` + `boot_panels` | Chuyển thành bài kiểm tự động trong `d7-persistence.ps1` (G3) |
| 05 | Cần thư viện ngoài để parse markdown/diff | Đủ sức tự parse AST lightweight, giữ bundle siêu nhẹ | Viết `MarkdownPreview` và `DiffPreview` thuần túy bằng TypeScript & JSX (H1) |
| 05 | — | Cần hook đo đạc để test tự động E2–E5 | Thêm command `boot_preview()` đọc biến môi trường `NONAME_PREVIEW_FILE` (H2) |
| 06 | Windows extended-length prefix (`\\?\`) | Canonicalize trên Windows tự chèn prefix `\\?\` gây lệch so sánh path | Bóc tách prefix `\\?\` trong cả `fs_resolve_path` và `watcher.rs` trước khi gửi lên frontend (J1) |
| 07 | Tiêm hook qua file script profile | Có thể bị ghi đè hoặc ảnh hưởng shell ngoài | Truyền trực tiếp qua cờ `-Command` lúc khởi tạo PTY để đảm bảo 100% phiên spawn đều có hook (K1) |
| 08 | — | `useTheme` thiếu hàm trigger refresh và setOpts từ store | Expose trực tiếp `refresh()` và `setOpts()` từ `useTheme` hook (L1) |
| 09 | Ưu tiên biến môi trường test | Khi chạy test tự động với `NONAME_BOOT_PANELS` hoặc `NONAME_PREVIEW_FILE`, không ghi đè layout test bằng saved state | Kiểm tra boot hook trước trong `App.tsx`, nếu không có hook test mới load state từ `state.json` (M1) |
| 10 | — | Tích hợp tabs và window controls trên một hàng nhỏ gọn | Sử dụng flex layout với các vùng drag-region xen kẽ (N1) |
| 04 | Panel là con thật trong cây grid / portal theo slot | Cả hai cách đều đổi container ⇒ React remount ⇒ `pty_kill` | Panel nằm phẳng, định vị tuyệt đối từ `layout/geometry.ts` (P11) |
| 04 | Kéo thả bằng HTML5 drag-and-drop | WebView2 nuốt nhóm sự kiện đó khi Tauri bật `dragDropEnabled` | Viết lại bằng Pointer Events + `setPointerCapture` (P11) |
| 02 | `term.onData` gắn sau khi `pty_spawn` resolve | Mất câu trả lời DSR `ESC[6n` ⇒ shell chết đứng ở bước nối console | Gắn trước khi spawn, dồn input/ack vào hàng đợi (P11) |
| 04 | D7 đo bằng PID ghi đè | Dương tính giả — không phân biệt được "sống" với "chết rồi thay" | Đổi sang đếm **số lần** spawn: `d7-no-respawn.ps1` (P11) |
| — | `cargo build --release` là đủ để chạy thử | Thiếu `tauri build` ⇒ `cfg(dev)` ⇒ app tải `localhost:1420` ⇒ cửa sổ trắng | Luôn `npx tauri build --no-bundle` (P11) |

---

## Session log

| Ngày | Phase | Làm gì | Kết quả |
|---|---|---|---|
| 2026-08-20 | — | Chốt spec, viết lại `PROJECT_CONTEXT.md`, lập plan | Xong. Chưa có code. |
| 2026-08-20 | — | UI demo tương tác: `ui-demo/index.html` | Xong. |
| 2026-08-20 | 01 | Dựng spike, đo A1/A2/A3/A5/A7, baseline WaveTerm | Xong. Giữ stack. 4 deviations. A4/A6 còn nợ (manual). |
| 2026-08-20 | 02 | Dựng `app/`: `pty/` module, backpressure, store, TerminalPanel | Build sạch. Đang đo B7. |
| 2026-08-20 | — | User chốt U1/U2/U3 (không glow · round soft · terminal to rõ + màu mè) | Mở khoá P03. Viết `phase-03-dynamic-color.md`. |
| 2026-08-20 | 03 | Dynamic color M3 từ ảnh nền, palette HCT, contrast & chroma boost | Xong. C1–C7 PASS. |
| 2026-08-20 | 04 | Tiling layout engine: cây nhị phân, gutter resize, session persistence | Xong. D1–D7 PASS. |
| 2026-08-20 | 05 | Preview panel: ảnh, markdown, diff, nhúng vào tiling engine | Xong. E1–E7 PASS. |
| 2026-08-20 | 06 | Link provider terminal, file watcher auto-refresh, drag-and-drop | Xong. F1–F7 PASS. |
| 2026-08-20 | 07 | OSC 133 shell integration, gutter marks, jumping, output copy | Xong. G1–G6 PASS. |
| 2026-08-20 | 08 | Command palette modal, hotkeys Ctrl+K/F1, theme switcher | Xong. H1–H6 PASS. |
| 2026-08-20 | 09 | Persistence lưu và khôi phục layout tree, theme settings | Xong. I1–I6 PASS. |
| 2026-08-20 | 10 | Custom titlebar, workspace tabs, motion polish, window controls | Xong. J1–J6 PASS. |
| 2026-08-21 | 11 | Viết lại tiling (absolute positioning), kéo thả bằng Pointer Events, sửa bug DSR làm chết PTY, dock nổi ở đáy + restyle theo ảnh user gửi | Xong. D7b · D8.1–8.5 · D9 · D10 · D11 PASS. |
| 2026-08-21 | 12 | Dọn thanh trên, dock kiểu widget bar (Tệp/Web), `PanelHeader` dùng chung + responsive 4 bậc, `MIN_PANEL`, tên panel theo app đang chạy | Xong. D12.1–12.8 · D13.1–13.4 PASS. |
| 2026-08-21 | 13 | Nền terminal trong suốt chỉnh được (`termOpacity`, phím tắt + bảng lệnh), thanh trên thành hòn đảo bo tròn kiểu caelestia, nút cửa sổ tròn | Xong. D14.1–14.8 PASS. |
| 2026-08-21 | 14 | Bỏ ô tìm kiếm, dock còn 4 ô, panel Cài đặt (lưới 3 cột), icon `lucide-react`, hoạt ảnh nảy + bóng đóng, Ctrl+C copy, Ctrl+Shift+D theo OSC 7, Ctrl+T/Ctrl+W, chia xoắn ốc | Xong. D15.1–15.7 · D16.1–16.4 PASS. Ctrl+C ngắt lệnh: 4 hướng đều hỏng, đã gỡ, ghi vào Deviations. |

---

---

---

## Chốt UI — mở khoá phase 🔒

Mở `ui-demo/index.html` bằng trình duyệt, chỉnh bảng điều khiển góc dưới phải, rồi ghi số vào đây.

| Tham số | Demo mặc định | CHỐT | Mở khoá |
|---|---|---|---|
| Seed hue / scheme variant | 268 / TonalSpot | | P03 |
| Bão hoà ANSI (× chroma primary) | **1.70×** ✅ | "terminal có thể màu mè" | P03 |
| Kéo hue ANSI về seed | 18% | | P03 |
| Font terminal | **Cascadia Mono** ✅ | font thật có trên máy | P02 |
| Cỡ chữ terminal | **15px** ✅ | "chữ to rõ như Windows Terminal" | P02 |
| Gap giữa panel | 12px | | P04, P10 |
| Bo góc panel | 28px | | P04, P10 |
| Blur nền | 20px | | P10 |
| Đục — panel terminal | 92% | | P10 |
| Đục — panel chrome | 62% | | P10 |
| Bố cục mặc định | 1 term trái + 2 preview phải | | P04 |

Cột **CHỐT** trống = chưa quyết. Không viết plan phase 🔒 khi cột này còn trống.

### Chỉ thị UI từ user (2026-08-20)

| # | Chỉ thị | Áp dụng ở đâu |
|---|---|---|
| U1 | **KHÔNG dùng glow effect** — nhìn xấu | Toàn bộ. Phân tầng bằng bậc `surfaceContainer*` và viền `outlineVariant`, không bằng hào quang. Bóng nếu có thì là bóng **tối** dùng cho độ cao, không phải quầng sáng màu |
| U2 | Style **round + soft color** | Giữ shape scale M3 (panel 28px) và palette muted của TonalSpot |
| U3 | Terminal: **chữ to, rõ, kiểu Windows Terminal**; được phép **màu mè** | Tách bạch: UI thì muted, **terminal thì bão hoà cao** (ANSI 1.70×). Font `Cascadia Mono` 14.5px |

**U3 là một quyết định kiến trúc, không phải chuyện gu.** Nó tách hệ màu làm hai vùng có độ bão
hoà khác nhau trên cùng một tonal palette: chrome muted, terminal rực. Phase 03 phải sinh **hai**
bộ biến, không phải một.
| 02 | B3 đọc kích thước 2 lần | Bài kiểm phụ thuộc thời điểm: lần 1 FAIL, lần 2 PASS, cùng binary | Thay bằng `b3-resize.ps1` lấy mẫu mỗi giây (E6) |
| 01 | D4 nói đã dùng `WorkingSetPrivate` | `measure.ps1` mới sửa phần cây tiến trình; phần tính RAM vẫn `WorkingSet64` | Sửa nốt 2026-08-20 (E4) |
| 01 | RAM đỉnh 713–754 MB là của app | Phần lớn là của `powershell.exe` chạy `Get-Content -Raw` | Mọi phép đo RAM phải tách nhóm shell (E7) |
| 01 | Cold start 367 ms | Số đo lúc cache lạnh ngay sau build; warm là 43–52 ms | Ghi rõ nhãn cold/warm (E5) |
| 03 | Capability `core:asset:default` | Permission không tồn tại | Chỉ cần `assetProtocol.scope` trong config (F1) |
| 03 | canvas `getImageData` từ `asset:` | Bị taint vì khác origin | `img.crossOrigin = "anonymous"` (F2) |
| 03 | C7 là MANUAL | Tự động được | `NONAME_WALLPAPER` + `theme_report` (F3) |


---

## Phase 11 — bốn yêu cầu ngày 2026-08-22

Kiểm chứng: `_baseline/d17-bar-ws-ctx-web.mjs` — **18/18 PASS** trên binary release.

| # | Việc | Trạng thái | Ở đâu |
|---|---|---|---|
| 1 | Thanh trên kiểu tab: icon + tên, cụm tab **giữa thanh**, gạch chân accent thay nền pill | ✅ | `src/titlebar/Titlebar.tsx`, `.tb-bar` trong `App.css` |
| 2 | `Alt+1…9` nhảy workspace, có công tắc trả phím về cho shell | ✅ | `src/App.tsx`, `opts.workspaceAltKeys` |
| 3 | Chuột phải trong explorer: mở terminal tại thư mục, sao chép đường dẫn, hiện trong File Explorer | ✅ | `src/ui/ContextMenu.tsx`, `src/explorer/ExplorerPanel.tsx`, `fs_cmd::fs_reveal` |
| 4 | Panel web mở được trang chặn nhúng (Google, GitHub…) | ❌ **bị chặn** | xem `_baseline/d18-webview-child.md` |

Ba chi tiết đo được, đáng nhớ:

- **Cụm tab lệch 4,5px** vì `.tb-bar` có `padding-left: 13px` mà `padding-right: 4px` — hai cột
  `1fr` hai bên không bằng nhau thì cụm giữa lệch đúng một nửa hiệu số. Padding phải đối xứng,
  khoảng thở của brand đẩy vào `.titlebar-left`.
- **Menu chuột phải hiện ra nhưng bấm không ăn**: listener đóng menu đặt ở *pha capture* của
  `window`, nó chạy trước khi `mousedown` kịp đi xuống nút — menu bị gỡ ở `mousedown` nên `click`
  không bao giờ tới. Phải bỏ qua cú bấm rơi vào chính menu.
- **Phụ đề panel bị ẩn khi panel hẹp**, nên không đo `cwd` của panel thứ tư bằng DOM được; đo qua
  `state.json` mới đúng.

### Vì sao #4 bị chặn

`<iframe>` không thể mở trang gửi `X-Frame-Options: DENY` — cơ chế chống clickjacking, không có
cờ nào tắt. Đường thoát duy nhất giữ được panel *trong lưới* là webview con native
(`Window::add_child`, feature `unstable`). **Đã dựng đủ và nó không chạy**: webview con tạo được
nhưng không nạp trang nào, không render gì, kể cả khi tô nền đỏ để tìm. Tauri 2.11.5 là bản mới
nhất khi đo. Toàn bộ code đó đã gỡ; bằng chứng và ba đường còn lại nằm ở `_baseline/d18-webview-child.md`.
