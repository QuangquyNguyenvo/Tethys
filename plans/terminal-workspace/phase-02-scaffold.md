# Phase 02 — Scaffold: dự án thật, 1 terminal chạy được

> Prereq: phase 01 PASS và đã ghi kết luận vào `CHECKLIST.md` | Rủi ro: 🟢
> Files: `app/**` (mới) | Rollback: `rm -rf app/`

## Mục tiêu

Dựng codebase **thật** (khác `spike/` — cái đó vứt đi), có cấu trúc để phase sau cắm vào.
Một terminal duy nhất, chiếm toàn màn hình, chạy pwsh 7 ngon lành.

**KHÔNG đụng**:
- Tiling layout → phase 04
- Màu sắc / theme / M3 → phase 03. Phase này dùng **màu xám tạm**, cố tình xấu.
- Preview panel → phase 05
- OSC 133 → phase 07
- SQLite → phase 09
- Mica/blur → phase 10

Cố tình xấu là đúng. Đừng làm đẹp ở phase này.

## Việc làm

### 1. Khởi tạo

```bash
cd D:/Code/Project/noname
npm create tauri-app@latest app -- --template react-ts
cd app
npm i @xterm/xterm @xterm/addon-webgl @xterm/addon-fit @xterm/addon-search @xterm/addon-unicode11 zustand
npm i -D tailwindcss @tailwindcss/vite
cd src-tauri && cargo add portable-pty && cargo add anyhow
```

### 2. Cấu trúc thư mục cần tạo

```
app/
├── src/
│   ├── terminal/
│   │   ├── TerminalPanel.tsx     # component xterm.js
│   │   └── usePty.ts             # hook nối Channel ↔ xterm
│   ├── store/
│   │   └── sessions.ts           # Zustand: danh sách session
│   └── App.tsx
└── src-tauri/src/
    ├── lib.rs
    └── pty/
        ├── mod.rs                # PtyManager: HashMap<SessionId, PtySession>
        └── session.rs            # spawn, read loop, write, resize, kill
```

Tách `pty/` thành module riêng ngay từ đầu — phase 04 sẽ có nhiều session cùng lúc,
đừng để logic PTY nằm trong `lib.rs`.

### 3. Rust — `pty/session.rs`

Port từ spike, nhưng có `session_id` và quản lý nhiều session:

- `spawn(shell, cwd, rows, cols) -> SessionId`
- Read thread gom buffer + thread hẹn giờ flush phần dư. **Hai thread riêng** — `read()` blocking
  sẽ giữ phần dư lại cho tới khi có byte mới nếu gộp chung một vòng lặp.
- `write(session_id, data)`, `resize(session_id, rows, cols)`, `kill(session_id)`
- Shell mặc định: `pwsh.exe` nếu có trên PATH, fallback `powershell.exe`

**Ba điều spike đã dạy — đừng làm lại từ đầu:**

1. **`min_bytes` chỉ có tác dụng khi > 16 KB.** ConPTY trả dữ liệu theo đợt ~16 KB nên mọi ngưỡng
   nhỏ hơn đều bị vượt ngay. Đặt 8–16 KB là vô nghĩa; hoặc để mặc định, hoặc đặt hẳn 64 KB.
2. **Phải có backpressure Rust → xterm.** Đây là việc **mới** so với spike, và là lý do A3 fail.
   Spike bơm dữ liệu không cần biết frontend xử lý tới đâu → RAM đỉnh **725 MB**, sau 25 s vẫn
   **632 MB**. Dùng `term.write(data, callback)`: chỉ xin chunk tiếp theo khi callback đã gọi.
   Cần một command `pty_ack(session_id)` hoặc cửa sổ trượt giới hạn số chunk đang bay.
3. **Không đặt `fontLigatures`** — option không tồn tại (D3).

### 3b. Đo lại RAM sau khi có backpressure

Chạy `_baseline/bench.ps1` với binary của `app/`. Mục tiêu: RAM đỉnh **≤ 600 MB** (ngưỡng A3
mà spike đã fail). Nếu backpressure không kéo được xuống thì thủ phạm không phải hàng đợi —
lúc đó mới đi tìm ở `scrollback` và texture atlas của WebGL.

### 4. Frontend

- `TerminalPanel.tsx` nhận prop `sessionId`, tự mount xterm + WebGL + Fit + Unicode11
- `usePty.ts`: mở Channel, nối 2 chiều, dọn dẹp khi unmount
- `App.tsx`: render đúng **một** `TerminalPanel` full màn hình
- Tailwind: chỉ cần chạy được. Không đặt design token — đó là phase 03.

### 5. Dọn dẹp

Xoá `spike/` sau khi phase này chạy được (kết quả đo đã nằm trong `CHECKLIST.md` rồi).

## Acceptance criteria

Đo ngày 2026-08-20. Script trong `_baseline/`.

| # | Tiêu chí | Ngưỡng | Đo được | Kết quả |
|---|---|---|---|---|
| B1 | Build sạch | exit 0 | `npm run tauri build -- --no-bundle` exit 0 | ✅ PASS |
| B2 | cwd đúng | = thư mục chạy app | `D:\Code\Project\noname` | ✅ PASS (`b2-b4.ps1`) |
| B3a | PTY nhận resize | kích thước đổi theo cửa sổ | 155×41 → 81×23 → 181×44, khớp 1296 → 700 → 1500 px | ✅ PASS (`b3-resize.ps1`) |
| B3b | Layout TUI không vỡ khi resize | không rác ký tự | — | ⛔ MANUAL — phải nhìn mắt, gộp với A4 |
| B4 | Không rò session | số shell sau ≤ trước | 7 → 7 | ✅ PASS (`b2-b4.ps1`) |
| B5 | Unicode + Nerd Font | không lệch cột | — | ⛔ MANUAL — máy chưa có Nerd Font, xem E1 |
| B6 | Không hồi quy > 15 % | so phase 01 | cold start 43 ms vs spike 52 ms; RAM app idle 151 MB vs 179 MB; đổ 47,7 MB 6,39 s vs 5,6 s (+14 %) | ✅ PASS (`b6-perf.ps1`, `measure.ps1`) |
| B7 | Backpressure có tác dụng | RAM đỉnh ≤ 600 MB | **257 MB** (spike đối chứng: **422 MB**, −39 %) | ✅ PASS (`b7-backpressure.ps1` + `b7-control-spike.ps1`) |

### Ghi chú về hai con số dễ đọc sai

**B7 — "713–754 MB" của phase 01 phần lớn không phải RAM của app.** Đo lại có tách app/shell:
`powershell.exe` một mình chiếm 440–506 MB, vì `Get-Content -Raw` nạp trọn 47,7 MB thành một
string .NET UTF-16 rồi ConPTY nhân bản khi ghi. Đối chứng chạy spike bằng **đúng** phép đo mới:

| | APP đỉnh (trung vị 3 vòng) | app sau khi lắng |
|---|---|---|
| spike — không backpressure | 422 MB | 239–296 MB |
| app — cửa sổ trượt 16 chunk | **257 MB** | 168–181 MB |

Không có cột đối chứng này thì "257 MB, PASS" chỉ chứng minh phép đo đã đổi, không chứng minh
backpressure có tác dụng.

**B6 — A3 chậm hơn 14 %, và hai phép đo không hoàn toàn tương đương.** Spike bấm giờ ở JS
(nhận đủ byte); app bấm giờ trong shell (`Stopwatch` quanh `Get-Content`), nên gồm cả thời gian
chờ ack. Đổi 14 % thời gian lấy 39 % RAM là đáng, nhưng đừng trích "+14 %" như số đo sạch.

## Deviations

_(Code thật khác plan → ghi vào đây, KHÔNG tự chế.)_

| # | Plan nói | Thực tế | Xử lý |
|---|---|---|---|
| E1 | Font `JetBrainsMono Nerd Font` | Máy không có font đó, cũng không có Nerd Font nào | Đổi `Cascadia Mono`. Icon powerline trong prompt agent sẽ ra ô vuông → **cần user quyết** |
| E2 | — | Không gõ được vào cửa sổ GUI để chạy bài kiểm | Thêm hook env `NONAME_BOOT_CMD` trong `pty_spawn` |
| E3 | Dùng guard `booted.current` chống mount hai lần | StrictMode mount → cleanup → mount lại; guard chặn lần hai, để lại `Terminal` đã dispose | Bỏ guard, dọn đủ trong cleanup |
| E4 | D4 ghi "đã đo bằng `WorkingSetPrivate`" | `measure.ps1` mới sửa phần cây tiến trình, phần tính RAM **vẫn** cộng `WorkingSet64` | Sửa nốt 2026-08-20 + cho tự đóng app sau khi đo. Số A1 cũ đọc từ script này đều bị đếm trùng |
| E5 | A2 cold start 367 ms là mốc so sánh | Đó là lần chạy ngay sau build (file cache lạnh + Defender quét binary mới). Warm: spike 52 ms, app 43 ms | So warm với warm. Giữ 367 ms làm số **cold**, ghi rõ nhãn |
| E6 | B3 kiểm bằng cách đọc kích thước trước/sau | Đọc đúng hai lần nên phụ thuộc thời điểm: lần 1 FAIL, lần 2 PASS, cùng binary | Thay bằng `b3-resize.ps1` lấy mẫu mỗi giây + xác nhận `GetWindowRect` sau `MoveWindow` |
| E7 | — | `Get-Content -Raw` của chính bài benchmark ăn 440–506 MB | Mọi phép đo RAM phải tách nhóm `^(powershell|pwsh|cmd|conhost)` ra khỏi RAM app |
