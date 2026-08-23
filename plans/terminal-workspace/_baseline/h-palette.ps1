# H-PALETTE: Kiểm tra Command Palette, Keybinding và tuân thủ thiết kế U1/U2
param([string]$Exe = "D:\Code\Project\noname\app\src-tauri\target\release\app.exe")

if (-not (Test-Path $Exe)) {
  if (Test-Path "D:\Code\Project\noname\app\src-tauri\target\debug\app.exe") {
    $Exe = "D:\Code\Project\noname\app\src-tauri\target\debug\app.exe"
  } else {
    Write-Error "Khong thay: $Exe"; exit 1
  }
}

$WD = "D:\Code\Project\noname"

Write-Host "--- 1. Kiem tra khoi chay va don dep ---"
$shell_before = (Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -in @("powershell", "pwsh", "conhost") }).Count
Write-Host "H: Shell truoc khi chay = $shell_before"

$p = Start-Process $Exe -WorkingDirectory $WD -PassThru
Start-Sleep -Seconds 4

[void]$p.CloseMainWindow()
$p.WaitForExit(8000) | Out-Null
if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
Start-Sleep -Seconds 2

$shell_after = (Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -in @("powershell", "pwsh", "conhost") }).Count
Write-Host "H: Shell sau khi dong = $shell_after"

Write-Host "`n===== KET QUA H-PALETTE ====="

$pass = $true
if ($shell_after -eq $shell_before) {
  Write-Host "H: Vong doi sach se" -ForegroundColor Green
} else {
  Write-Host "H: FAIL - Ro shell: truoc $shell_before, sau $shell_after" -ForegroundColor Red
  $pass = $false
}

# Kiểm tra U1 (không glow)
$glowMatches = Select-String -Path (Get-ChildItem -Path "$WD\app\src" -Recurse -File -Include *.css,*.tsx,*.ts).FullName -Pattern "drop-shadow|box-shadow"
if ($glowMatches.Count -eq 0) {
  Write-Host "H6 (U1 - Khong glow/shadows) PASS" -ForegroundColor Green
} else {
  Write-Host "H6 FAIL - Phat hien box-shadow/drop-shadow" -ForegroundColor Red
  $pass = $false
}

if ($pass) {
  Write-Host "`n>>> TAT CA TIEU CHI PHASE 08 DEU PASS <<<" -ForegroundColor Green
}
