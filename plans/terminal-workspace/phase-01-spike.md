# Phase 01 — Spike: đo 4 ẩn số

> Prereq: không | Rủi ro: 🟠 | Files: `spike/**` (code vứt đi) | Rollback: `rm -rf spike/`

## Mục tiêu

**Không phải viết app.** Là trả lời 4 câu hỏi ở `PROJECT_CONTEXT.md` §8 bằng số đo thật, rồi
quyết định giữ hay đổi stack. Code trong `spike/` là **đồ vứt đi** — xấu cũng được, không refactor,
không test, không đưa vào codebase chính.

**KHÔNG đụng**: tiling layout, M3 color, preview panel, OSC 133, SQLite. Đó là phase 02+.

## Việc làm

### 1. Dựng spike

```bash
cd D:/Code/Project/noname
npm create tauri-app@latest spike -- --template react-ts
cd spike/src-tauri
cargo add portable-pty
cargo add window-vibrancy
cd .. && npm i @xterm/xterm @xterm/addon-webgl @xterm/addon-fit
```

> Ghi version thật của `portable-pty` và `tauri` vào `CHECKLIST.md` sau khi cài.

### 2. Rust: spawn pwsh qua ConPTY, stream ra frontend

Trong `spike/src-tauri/src/lib.rs`:

- `portable_pty::native_pty_system()` → `openpty()` → spawn `pwsh.exe`
- Thread đọc từ PTY reader vào buffer
- **Gom buffer, flush mỗi 8–16ms**, gửi qua `tauri::ipc::Channel` dạng **binary** (`Vec<u8>`)
  — không `emit()` JSON. Đây là điểm cả spike xoay quanh (§8.2).
- Command `pty_write(data: Vec<u8>)` cho chiều ngược lại
- Command `pty_resize(rows, cols)`

### 3. Frontend: xterm.js + WebGL

- Mount `Terminal` với `WebglAddon` + `FitAddon`
- `allowProposedApi: true`, `fontFamily: 'JetBrainsMono Nerd Font'`, `fontLigatures` bật
- Channel nhận binary → `term.write(uint8array)`
- `term.onData` → gọi `pty_write`
- `ResizeObserver` → `fit()` → `pty_resize`

### 4. Bật Mica + tắt decoration

`tauri.conf.json`: `"decorations": false`, `"transparent": true`.
Trong setup: `window_vibrancy::apply_mica(&window, None)`.

Thêm một nút toggle bật/tắt `backdrop-filter: blur(20px)` trên một overlay phủ terminal —
để đo 8.3 có/không blur.

## Đo

### Chuẩn bị file 50MB

```powershell
$line = ("x" * 99) + "`n"
[System.IO.File]::WriteAllText("$env:TEMP\big.txt", $line * 500000)
```

### Lệnh đo RAM (chạy khi app đang mở)

```powershell
Get-Process | Where-Object { $_.ProcessName -match 'spike|msedgewebview2' } |
  Measure-Object WorkingSet64 -Sum |
  ForEach-Object { "RAM tong: {0} MB" -f [math]::Round($_.Sum/1MB) }
```

### Cách chạy spike

```powershell
cd D:\Code\Project\noname\spike
npm run tauri dev                              # để sửa nhanh
.\src-tauri\target\release\spike.exe           # để đo A1/A2 (release, không devserver)
```

Trong app: chọn `flush_ms` + `min_bytes` → **start pty** → chạy `Get-Content $env:TEMP\big.txt -Raw`.
Thanh trạng thái hiện `fps`, `MB/s`, tổng byte, số flush và **cỡ chunk trung bình thật** —
số lấy từ Rust (`pty_stats`), không lấy từ JS, vì JS đơ thì số của JS cũng sai theo.

### Baseline

Chạy **WaveTerm** cùng workload trên máy này, đo cùng cách. Ghi vào `_baseline/waveterm.md`.

## Acceptance criteria

| # | Tiêu chí | Cách kiểm | PASS khi |
|---|---|---|---|
| A1 | RAM idle, 1 terminal | Lệnh đo RAM ở trên | **≤ 180 MB** |
| A2 | Cold start | Bấm giờ từ lúc chạy `.exe` tới lúc thấy prompt (build `--release`) | **≤ 800 ms** |
| A3 | Throughput | Trong terminal: `Get-Content $env:TEMP\big.txt -Raw`. Trong lúc chạy, gõ phím vào terminal | UI **không đơ**, gõ phím vẫn ăn, xong **≤ 30s**, RAM đỉnh **≤ 600 MB** |
| A4 | Claude Code TUI | Chạy `claude` trong spike terminal, làm 1 lượt hỏi–đáp đầy đủ, resize cửa sổ giữa chừng | ⛔ MANUAL — vẽ đúng, không rác ký tự, mouse ăn, resize không vỡ |
| A5 | Blur cost | Task Manager tab GPU. Chạy A3 hai lần: bật blur và tắt blur | Ghi lại **chênh lệch GPU %**. Không có ngưỡng cứng — cần con số để quyết ở P10 |
| A6 | Không ligature | Mở cùng một file code trong spike và trong Windows Terminal, cùng font | ⛔ MANUAL — xterm.js **không** ligature được (D3). Câu hỏi: chấp nhận / đổi stack |
| A7 | Ảnh hưởng `min_bytes` | Chạy A3 bốn lần với `min_bytes` = 256 / 1024 / 4096 / 65536, ghi MB/s và fps mỗi lần | Ghi bảng. Kỳ vọng: 256 tệ hẳn (đường `eval`), ≥1024 tốt lên rõ. Nếu **không** khác biệt → giả thuyết D2 sai, phải đọc lại |

**A1, A2, A3 fail** → xem cổng chặn ở `CHECKLIST.md`.

### D4 — Phép đo RAM trong plan sai phương pháp 🔴

Plan viết:

```powershell
Get-Process | Where-Object { $_.ProcessName -match 'spike|msedgewebview2' } |
  Measure-Object WorkingSet64 -Sum
```

Hai lỗi, cả hai đều làm sai kết luận:

1. **Lọc theo tên** gom nhầm mọi `msedgewebview2` trên máy — Widgets, Office, app khác dùng
   WebView2 đều bị cộng vào. Và bản đầu của `measure.ps1` còn `Stop-Process` chúng trước khi đo,
   tức là giết WebView2 của app người khác đang dùng.
2. **Cộng `WorkingSet64`** là đếm trùng. Các process WebView2 chia sẻ phần lớn DLL ánh xạ;
   mỗi process kể lại cùng một vùng nhớ đó.

Số thật đo trên máy này, cùng một thời điểm, cùng cây tiến trình:

| Cách tính | Kết quả |
|---|---|
| Σ `WorkingSet64` (như plan) | **691 MB** |
| Σ `WorkingSetPrivate` | **196 MB** |
| Σ `PrivateBytes` (commit) | 291 MB |

Chênh **3,5×**. Nếu tin con số 691 MB thì A1 "fail thảm hại" và cổng chặn sẽ bắt đổi stack —
một quyết định lớn dựa trên phép đo sai.

**Sửa**: `_baseline/measure.ps1` giờ dựng **cây tiến trình con** từ PID vừa khởi chạy
(`Win32_Process.ParentProcessId`, lặp tới điểm bất động) và cộng `WorkingSetPrivate`
(`Win32_PerfRawData_PerfProc_Process`). Không lọc theo tên, không giết gì theo tên.

**Ngưỡng A1 = 180 MB** đặt trước khi biết cách đo nào. Với 196 MB (đã gồm `powershell` 28 MB +
`conhost` 1 MB của chính shell) thì **fail sát ngưỡng**. Chưa kết luận được cho tới khi có
baseline WaveTerm đo bằng đúng cách này — xem `_baseline/waveterm.md`.

## Ghi kết quả

Điền bảng này vào `CHECKLIST.md` mục "Kết luận phase 01":

```
A1 RAM idle:      ___ MB   (ngưỡng 180)   PASS/FAIL
A2 Cold start:    ___ ms   (ngưỡng 800)   PASS/FAIL
A3 Throughput:    ___ s, đỉnh ___ MB, fps thấp nhất ___   PASS/FAIL
A4 Claude Code:                            PASS/FAIL  + ghi chú
A5 GPU blur/không blur: ___% / ___%
A6 Không ligature:                         CHẤP NHẬN/KHÔNG
A7 min_bytes sweep:
     256B → ___ MB/s, fps ___
    1024B → ___ MB/s, fps ___
    4096B → ___ MB/s, fps ___
   65536B → ___ MB/s, fps ___
Baseline WaveTerm: RAM ___ MB, start ___ ms
→ KẾT LUẬN: giữ stack / đổi stack vì ___
```

## Deviations

_(Code thật khác plan → ghi vào đây, KHÔNG tự chế.)_

### D1 — `pwsh` không có trên máy 🟠

Plan viết spawn `pwsh.exe`. Máy này **chưa cài PowerShell 7** (`Get-Command pwsh` → không có).
Spike dùng `pick_shell()`: tìm `pwsh.exe` trên PATH, không có thì `powershell.exe` (5.1).

**Hệ quả cho phase 07**: plan OSC 133 viết cho pwsh 7 (`$PROFILE` của pwsh). Với 5.1 thì
`$PROFILE` khác đường dẫn và thiếu một số API. Trước P07 phải chốt: cài pwsh 7 hay hạ xuống 5.1.

### D2 — Ngưỡng 1024 byte của Tauri Channel 🔴

Plan nói "gửi binary qua `Channel`" nhưng **không** nói tới ngưỡng. Đọc source thật
`tauri-2.11.5/src/ipc/channel.rs:163` và `:37,39`:

```
MAX_JSON_DIRECT_EXECUTE_THRESHOLD = 8192
MAX_RAW_DIRECT_EXECUTE_THRESHOLD  = 1024
```

- `InvokeResponseBody::Raw(bytes)` **dưới 1024 byte** → `serde_json::to_string(&bytes)` rồi
  `webview.eval("... new Uint8Array([114,105,...]).buffer ...")`.
  Tức là mỗi byte hoá thành 2–4 ký tự text + một lần `eval`. **Tệ hơn gửi String.**
- **Từ 1024 byte trở lên** → đẩy vào `ChannelDataIpcQueue`, JS `fetch` về qua custom protocol.
  Đây mới là đường nhị phân thật.

**Hệ quả**: bất biến #5 của `CONTEXT.md` chưa đủ. Phải bổ sung: buffer flush **phải vượt
1024 byte**, nếu không "binary" phản tác dụng. Spike do đó có tham số `min_bytes` chọn được
(256 / 1024 / 4096 / 16384 / 65536) để đo chính hiệu ứng này — đây thành phép đo trung tâm của A3.

Cơ chế flush trong spike: thread đọc flush khi `buf.len() >= min_bytes`; thread hẹn giờ riêng
flush phần dư mỗi `flush_ms`. Không gộp hai việc vào một vòng lặp — `read()` blocking sẽ làm
phần dư kẹt lại cho tới khi có byte mới.

### D3 — xterm.js không có ligature trong WebView2 🟠

Plan ghi `fontLigatures` bật. **Option này không tồn tại** trong `@xterm/xterm@6.0.0`
(`tsc` báo TS2353). Ligature phải qua `@xterm/addon-ligatures@0.10.0`, mà addon này phụ thuộc
`font-finder` + `font-ligatures` — cả hai **đọc file font bằng Node `fs`**. WebView2 không có Node.

**Hệ quả**: đây là chỗ Tauri **thua** Electron thật sự, không phải chuyện gu thẩm mỹ.
WaveTerm/VS Code có ligature vì chúng chạy trên Electron (có Node trong renderer).
Đường đi nếu vẫn muốn ligature: đọc bảng GSUB của font ở **Rust** rồi đưa danh sách cặp ký tự
sang JS để `registerCharacterJoiner`. Là một dự án con, không phải một dòng config.

**A6 viết lại**: không còn là "chất lượng ligature chấp nhận được không" mà là
"**không có ligature** — chấp nhận được không". Đây là câu hỏi cho user, không phải phép đo.
