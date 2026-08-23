# D9: mở N panel cùng lúc thì cả N shell phải thật sự chạy.
#
# Bug đã bắt được: ConPTY mở với cờ PSUEDOCONSOLE_INHERIT_CURSOR sẽ gửi `ESC[6n` và **chặn**
# tiến trình con cho tới khi terminal trả lời vị trí con trỏ. `usePty` bản cũ gắn
# `term.onData` bên trong `.then()` của `pty_spawn`, nên câu trả lời sinh ra lúc chưa có ai
# nghe và rơi mất — shell đứng im ở bước nối console (1 thread, 0 ms CPU) trong khi
# `pty_alive` vẫn báo còn sống. Mở nhiều panel một lúc thì mọi panel trừ cái cuối đều chết.
#
# Cách đo: mỗi shell tự tạo một file mang tên PID của nó ngay trong script khởi động.
# Shell bị chặn ở bước nối console thì không bao giờ chạy tới đó, nên đếm file là đủ.
# Kiểm thêm CPU: shell chết đứng dùng 0 ms CPU và chỉ có 1 thread.
param(
  [string]$Exe = "D:\Code\Project\noname\app\src-tauri\target\release\app.exe",
  [int]$Panels = 4
)

if (-not (Test-Path $Exe)) { Write-Error "Khong thay: $Exe"; exit 1 }

$WD = "D:\Code\Project\noname"
$dir = Join-Path $env:TEMP "d9_shells"
Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $dir | Out-Null

$env:NONAME_PANELS = "$Panels"
$env:NONAME_BOOT_CMD = "New-Item -ItemType File -Force -Path (Join-Path '$dir' (`"`$pid.tag`")) | Out-Null"

$p = Start-Process $Exe -WorkingDirectory $WD -PassThru
Start-Sleep -Seconds 12

$tags = @(Get-ChildItem $dir -Filter *.tag -ErrorAction SilentlyContinue)
$shells = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($p.Id)" |
            Where-Object { $_.Name -like '*powershell*' -or $_.Name -eq 'pwsh.exe' })
$stuck = @($shells | ForEach-Object { Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue } |
           Where-Object { $_.TotalProcessorTime.TotalMilliseconds -lt 1 })

[void]$p.CloseMainWindow()
$p.WaitForExit(8000) | Out-Null
if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
Remove-Item env:NONAME_PANELS, env:NONAME_BOOT_CMD -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "===== KET QUA D9 ====="
Write-Host "Panel yeu cau        : $Panels"
Write-Host "Shell dang song      : $($shells.Count)"
Write-Host "Shell chay toi prompt: $($tags.Count)"
Write-Host "Shell chet dung (0ms): $($stuck.Count)"

if ($tags.Count -eq $Panels -and $shells.Count -eq $Panels -and $stuck.Count -eq 0) {
  Write-Host "D9 PASS - ca $Panels shell deu chay that su" -ForegroundColor Green
  exit 0
} else {
  Write-Host "D9 FAIL - co shell bi chan o buoc noi console" -ForegroundColor Red
  exit 1
}
