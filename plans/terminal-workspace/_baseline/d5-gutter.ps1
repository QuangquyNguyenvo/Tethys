# D5: Chia panel / kéo đường ngăn -> PTY cập nhật kích thước (cols/rows)
param([string]$Exe = "D:\Code\Project\noname\app\src-tauri\target\release\app.exe")

if (-not (Test-Path $Exe)) {
  if (Test-Path "D:\Code\Project\noname\app\src-tauri\target\debug\app.exe") {
    $Exe = "D:\Code\Project\noname\app\src-tauri\target\debug\app.exe"
  } else {
    Write-Error "Khong thay: $Exe"; exit 1
  }
}

$WD = "D:\Code\Project\noname"
$d5_file1 = Join-Path $env:TEMP "d5_cols1.txt"
$d5_file2 = Join-Path $env:TEMP "d5_cols2.txt"
Remove-Item $d5_file1, $d5_file2 -ErrorAction SilentlyContinue

# Đoạn 1: Mở 1 panel đơn, lấy cols ban đầu
$env:NONAME_PANELS = "1"
$env:NONAME_BOOT_CMD = "`$Host.UI.RawUI.WindowSize.Width | Out-File -Encoding utf8 '$d5_file1'"
$p1 = Start-Process $Exe -WorkingDirectory $WD -PassThru
Start-Sleep -Seconds 5
[void]$p1.CloseMainWindow()
$p1.WaitForExit(8000) | Out-Null
if (-not $p1.HasExited) { Stop-Process -Id $p1.Id -Force }
Start-Sleep -Seconds 2

# Đoạn 2: Mở 2 panel chia đôi (split row), lấy cols của panel trái
$env:NONAME_PANELS = "2"
$env:NONAME_BOOT_CMD = "`$Host.UI.RawUI.WindowSize.Width | Out-File -Encoding utf8 '$d5_file2'"
$p2 = Start-Process $Exe -WorkingDirectory $WD -PassThru
Start-Sleep -Seconds 5
[void]$p2.CloseMainWindow()
$p2.WaitForExit(8000) | Out-Null
if (-not $p2.HasExited) { Stop-Process -Id $p2.Id -Force }
Start-Sleep -Seconds 2

Remove-Item env:NONAME_PANELS, env:NONAME_BOOT_CMD -ErrorAction SilentlyContinue

$c1_str = if (Test-Path $d5_file1) { (Get-Content $d5_file1 -Raw).Trim() } else { "<khong co file>" }
$c2_str = if (Test-Path $d5_file2) { (Get-Content $d5_file2 -Raw).Trim() } else { "<khong co file>" }
Remove-Item $d5_file1, $d5_file2 -ErrorAction SilentlyContinue

Write-Host "`n===== KET QUA D5 ====="
Write-Host "D5 Cols 1 panel: $c1_str"
Write-Host "D5 Cols 2 panels: $c2_str"

if ($c1_str -ne "<khong co file>" -and $c2_str -ne "<khong co file>") {
  $c1 = [int]$c1_str
  $c2 = [int]$c2_str
  if ($c2 -lt $c1) {
    Write-Host ("D5 PASS - So cot cua panel trai giam tu {0} xuong {1} khi chia doi (PTY nhan resize dung theo layout)" -f $c1, $c2) -ForegroundColor Green
  } else {
    Write-Host "D5 FAIL - So cot khong giam sau khi split" -ForegroundColor Red
  }
} else {
  Write-Host "D5 FAIL - Khong lay duoc du lieu resize" -ForegroundColor Red
}
