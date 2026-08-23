# D4: Kiem tra spawn 4 panel va don sach khi dong cua so (khong ro PTY/shell)
param([string]$Exe = "D:\Code\Project\noname\app\src-tauri\target\release\app.exe")

if (-not (Test-Path $Exe)) {
  if (Test-Path "D:\Code\Project\noname\app\src-tauri\target\debug\app.exe") {
    $Exe = "D:\Code\Project\noname\app\src-tauri\target\debug\app.exe"
  } else {
    Write-Error "Khong thay: $Exe"; exit 1
  }
}

function Count-Shells {
  (Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -in @("powershell", "pwsh", "conhost") }).Count
}

$before = Count-Shells
Write-Host "D4: shell truoc khi chay app = $before"

$env:NONAME_PANELS = "4"
$p = Start-Process $Exe -WorkingDirectory "D:\Code\Project\noname" -PassThru
Start-Sleep -Seconds 7

$during = Count-Shells
Write-Host "D4: shell khi mo 4 panel = $during"

# Đóng tử tế bằng CloseMainWindow để WindowEvent::Destroyed dọn dẹp
[void]$p.CloseMainWindow()
$p.WaitForExit(8000) | Out-Null
if (-not $p.HasExited) { Write-Warning "App khong tu thoat sau CloseMainWindow"; Stop-Process -Id $p.Id -Force }
Start-Sleep -Seconds 3
Remove-Item env:NONAME_PANELS -ErrorAction SilentlyContinue

$after = Count-Shells
Write-Host "D4: shell sau khi dong app = $after"

Write-Host "`n===== KET QUA D4 ====="
$diff_spawn = $during - $before
Write-Host ("D4 spawn  : +{0} shells" -f $diff_spawn)
if ($diff_spawn -ge 4) {
  Write-Host "D4 (spawn 4 panels) PASS" -ForegroundColor Green
} else {
  Write-Host "D4 (spawn 4 panels) FAIL - khong du 4 shell" -ForegroundColor Red
}

$diff_leak = $after - $before
if ($diff_leak -le 0) {
  Write-Host "D4 (cleanup/leak) PASS - khong ro shell nao" -ForegroundColor Green
} else {
  Write-Host ("D4 (cleanup/leak) FAIL - ro {0} shell" -f $diff_leak) -ForegroundColor Red
}
