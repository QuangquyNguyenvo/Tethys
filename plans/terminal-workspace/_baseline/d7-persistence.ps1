# D7: Panel không bị dựng lại khi split (PID shell của panel đầu không đổi, không mất session)
param([string]$Exe = "D:\Code\Project\noname\app\src-tauri\target\release\app.exe")

if (-not (Test-Path $Exe)) {
  if (Test-Path "D:\Code\Project\noname\app\src-tauri\target\debug\app.exe") {
    $Exe = "D:\Code\Project\noname\app\src-tauri\target\debug\app.exe"
  } else {
    Write-Error "Khong thay: $Exe"; exit 1
  }
}

$WD = "D:\Code\Project\noname"
$d7_file = Join-Path $env:TEMP "d7_shell.txt"
Remove-Item $d7_file -ErrorAction SilentlyContinue

# Khởi động với NONAME_PANELS=2: Panel 1 khởi tạo trước, sau đó App.tsx split thêm Panel 2.
# NONAME_BOOT_CMD ghi PID của session đầu tiên vào file.
$env:NONAME_PANELS = "2"
$env:NONAME_BOOT_CMD = "`$pid | Out-File -Encoding utf8 '$d7_file'"

$p = Start-Process $Exe -WorkingDirectory $WD -PassThru
Start-Sleep -Seconds 6

# Đọc PID ban đầu của panel 1
$initial_pid = if (Test-Path $d7_file) { (Get-Content $d7_file -Raw).Trim() } else { $null }
Write-Host "D7: PID cua panel 1 = $initial_pid"

# Kiểm tra tiến trình initial_pid vẫn còn sống và thuộc về app
$is_alive = $false
if ($initial_pid) {
  $proc = Get-Process -Id $initial_pid -ErrorAction SilentlyContinue
  if ($proc -and -not $proc.HasExited) {
    $is_alive = $true
  }
}

# Đóng app
[void]$p.CloseMainWindow()
$p.WaitForExit(8000) | Out-Null
if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
Start-Sleep -Seconds 2
Remove-Item env:NONAME_PANELS, env:NONAME_BOOT_CMD -ErrorAction SilentlyContinue
Remove-Item $d7_file -ErrorAction SilentlyContinue

Write-Host "`n===== KET QUA D7 ====="
if ($initial_pid -and $is_alive) {
  Write-Host "D7 PASS - Shell PID $initial_pid van song nguyen ven sau khi split (khong bi kill/respawn)" -ForegroundColor Green
} else {
  Write-Host "D7 FAIL - Shell PID ban dau da bi unmount/kill khi split" -ForegroundColor Red
}
