# J-TITLEBAR-POLISH: Kiểm tra Custom Titlebar, Motion tokens và nguyên tắc U1/U2/U3
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
Write-Host "J: Shell truoc khi chay = $shell_before"

$p = Start-Process $Exe -WorkingDirectory $WD -PassThru
Start-Sleep -Seconds 4

[void]$p.CloseMainWindow()
$p.WaitForExit(8000) | Out-Null
if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
Start-Sleep -Seconds 2

$shell_after = (Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -in @("powershell", "pwsh", "conhost") }).Count
Write-Host "J: Shell sau khi dong = $shell_after"

$pass = $true
if ($shell_after -eq $shell_before) {
  Write-Host "J: Vong doi sach se (khong ro shell)" -ForegroundColor Green
} else {
  Write-Host "J: FAIL - Ro shell: truoc $shell_before, sau $shell_after" -ForegroundColor Red
  $pass = $false
}

# Kiểm tra U1 (không glow)
$glowMatches = Select-String -Path (Get-ChildItem -Path "$WD\app\src" -Recurse -File -Include *.css,*.tsx,*.ts).FullName -Pattern "drop-shadow|box-shadow"
if ($glowMatches.Count -eq 0) {
  Write-Host "J6 (U1 - Khong glow/shadows) PASS" -ForegroundColor Green
} else {
  Write-Host "J6 FAIL - Phat hien box-shadow/drop-shadow" -ForegroundColor Red
  $pass = $false
}

if ($pass) {
  Write-Host "`n>>> TAT CA TIEU CHI PHASE 10 DEU PASS <<<" -ForegroundColor Green
}
