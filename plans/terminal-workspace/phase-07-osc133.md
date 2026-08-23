# Phase 07 — OSC 133 Shell Integration (Gutter marks, Ctrl+↑/↓, Copy output, Exit badge)

> Prereq: phase 06 PASS | Rủi ro: 🔴 (OSC 133 parser xterm, pwsh prompt hooking, buffer coordinate mapping)
> Files: `src/terminal/osc133.ts`, `src/terminal/usePty.ts`, `src/terminal/TerminalPanel.tsx`, `src/terminal/CommandDecorations.tsx`, `src/App.css`, `src-tauri/src/pty/session.rs`
> Rollback: `cp -r app/src app/src.bak`

## Mục tiêu

Tích hợp giao thức tiêu chuẩn **OSC 133** (FinalTerm / VS Code / Windows Terminal shell integration):
1. **OSC 133 Markers**:
   - `OSC 133 ; A ST` (`\x1b]133;A\x07`): Bắt đầu dòng nhắc lệnh (Prompt start).
   - `OSC 133 ; B ST` (`\x1b]133;B\x07`): Bắt đầu gõ lệnh (Command start).
   - `OSC 133 ; C ST` (`\x1b]133;C\x07`): Lệnh bắt đầu chạy / output bắt đầu (Command executed).
   - `OSC 133 ; D [; exit_code] ST` (`\x1b]133;D;0\x07`): Lệnh hoàn thành, trả về mã thoát và thời gian chạy.
2. **Gutter Mark & Block Styling**:
   - Gutter mark bên trái (dải màu mỏng 3px bo tròn `r-full` kiểu VS Code):
     - Xanh lá (`--ui-ansi-green`) nếu exit code = 0.
     - Đỏ (`--ui-error`) nếu exit code != 0.
     - Vàng / Tertiary (`--ui-tertiary`) khi lệnh đang chạy.
   - Badge hiển thị: `exit {code} · {duration}s`.
3. **Phím tắt di chuyển block**:
   - `Ctrl+Up`: Cuộn terminal nhảy lên đầu lệnh trước đó.
   - `Ctrl+Down`: Cuộn terminal nhảy xuống đầu lệnh kế tiếp.
4. **Action Menu trên Block**:
   - Nút `Copy command` và `Copy output` khi rê chuột vào vùng lệnh.
5. **Tự động tiêm OSC 133 vào PowerShell**:
   - Khi khởi tạo PTY PowerShell, tự động nạp prompt hook OSC 133 tương thích cả PowerShell 5.1 (Windows PowerShell) và PowerShell 7 (pwsh).

## Thiết kế Kỹ thuật

### 1. PowerShell OSC 133 Injection Script

Đoạn script nạp vào phiên shell khi spawn:
```powershell
$global:__prompt_orig = $function:prompt
function prompt {
  $exit = $LASTEXITCODE
  $e = [char]27
  # OSC 133;D;{exit}
  Write-Host -NoNewline "$e]133;D;$exit`a"
  # OSC 133;A (Prompt start)
  Write-Host -NoNewline "$e]133;A`a"
  $p = if ($global:__prompt_orig) { & $global:__prompt_orig } else { "PS $($executionContext.SessionState.Path.CurrentLocation)> " }
  # OSC 133;B (Command start)
  Write-Host -NoNewline "$e]133;B`a"
  return $p
}
```

### 2. OSC 133 Parser trong `src/terminal/osc133.ts`

- Đăng ký `term.parser.registerOscHandler(133, handler)`.
- Cấu trúc Block:
```ts
export type CommandBlock = {
  id: string;
  promptLine: number;
  commandLine: number;
  outputStartLine: number;
  endLine?: number;
  exitCode?: number;
  startTime?: number;
  endTime?: number;
  status: "running" | "success" | "error";
  commandText?: string;
};
```
- Lắng nghe các cờ:
  - `A`: Khởi tạo block mới với `promptLine = term.buffer.active.cursorY + term.buffer.active.baseY`.
  - `B`: Ghi nhận `commandLine`.
  - `C`: Ghi nhận `outputStartLine`, `startTime = Date.now()`, `status = "running"`. Trích xuất dòng lệnh từ buffer.
  - `D`: Ghi nhận `endLine`, `exitCode`, `endTime = Date.now()`, `status = exitCode === 0 ? "success" : "error"`.

### 3. Giao diện Overlay / Decorator (`CommandDecorations.tsx`)

- Render gutter marks và badges theo vị trí dòng thực trong buffer của xterm.
- Hỗ trợ cuộn mượt bằng `term.scrollToLine(block.commandLine)`.

## Acceptance Criteria

| # | Tiêu chí | Cách kiểm | PASS khi | Kết quả |
|---|---|---|---|---|
| G1 | Build sạch | `npm run tauri build -- --no-bundle` | exit 0 | ✅ PASS |
| G2 | OSC 133 Parser xử lý đúng 4 sự kiện A/B/C/D | Unit test parser (`check-osc133.mjs`) | Tạo đúng block, exitCode, line numbers | ✅ PASS |
| G3 | Gutter Mark đổi màu theo kết quả | Block chips trong header/terminal | Lệnh thành công ra secondary/green, lỗi ra error/red | ✅ PASS |
| G4 | Nhảy lệnh bằng Ctrl+↑ / Ctrl+↓ | Nhấn `Ctrl+Up` / `Ctrl+Down` trong terminal | Terminal cuộn chính xác tới các mốc prompt | ✅ PASS |
| G5 | Copy output của từng block | Nút copy output / `copyLastOutput()` | Clipboard nhận chính xác toàn bộ text output của block đó | ✅ PASS |
| G6 | Không glow (U1) | `Select-String "drop-shadow\|box-shadow"` | 0 kết quả khớp | ✅ PASS (0 matches) |

## Deviations

| # | Plan nói | Thực tế | Xử lý |
|---|---|---|---|
| K1 | Tiêm hook qua file script profile | Cần cấu hình `$PROFILE` có thể bị overwrite hoặc ảnh hưởng shell ngoài | Truyền trực tiếp qua cờ `-Command` lúc khởi tạo PTY để đảm bảo 100% phiên spawn đều có hook mà không đụng tới file cấu hình của người dùng |
