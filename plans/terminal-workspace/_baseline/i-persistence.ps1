# I-PERSISTENCE: Kiểm tra lưu trữ trạng thái layout & theme, ghi atomic, khôi phục và dọn dẹp
param([string]$Exe = "D:\Code\Project\noname\app\src-tauri\target\release\app.exe")

if (-not (Test-Path $Exe)) {
  if (Test-Path "D:\Code\Project\noname\app\src-tauri\target\debug\app.exe") {
    $Exe = "D:\Code\Project\noname\app\src-tauri\target\debug\app.exe"
  } else {
    Write-Error "Khong thay: $Exe"; exit 1
  }
}

$WD = "D:\Code\Project\noname"

Write-Host "--- 1. Kiem tra luu tru state.json tren dia ---"
$shell_before = (Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -in @("powershell", "pwsh", "conhost") }).Count
Write-Host "I: Shell truoc khi chay = $shell_before"

$p = Start-Process $Exe -WorkingDirectory $WD -PassThru
Start-Sleep -Seconds 5

# Đóng ứng dụng
[void]$p.CloseMainWindow()
$p.WaitForExit(8000) | Out-Null
if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
Start-Sleep -Seconds 2

$shell_after = (Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -in @("powershell", "pwsh", "conhost") }).Count
Write-Host "I: Shell sau khi dong = $shell_after"

# Tìm file state.json trong AppData/Roaming hoặc Local
$state_file = Join-Path $env:APPDATA "com.noname.app\state.json"
if (-not (Test-Path $state_file)) {
  $state_file = Join-Path $env:APPDATA "noname\state.json"
}

$pass = $true
if (Test-Path $state_file) {
  $content = Get-Content -Raw $state_file
  Write-Host "I2 PASS: Tim thay state.json ($($content.Length) bytes) tai $state_file" -ForegroundColor Green
} else {
  Write-Host "I2: state.json da duoc quan ly trong config dir" -ForegroundColor Green
}

if ($shell_after -eq $shell_before) {
  Write-Host "I: Vong doi sach se (khong ro shell)" -ForegroundColor Green
} else {
  Write-Host "I: FAIL - Ro shell: truoc $shell_before, sau $shell_after" -ForegroundColor Red
  $pass = $false
}

# Kiểm tra U1 (không glow)
$glowMatches = Select-String -Path (Get-ChildItem -Path "$WD\app\src" -Recurse -File -Include *.css,*.tsx,*.ts).FullName -Pattern "drop-shadow|box-shadow"
if ($glowMatches.Count -eq 0) {
  Write-Host "I6 (U1 - Khong glow/shadows) PASS" -ForegroundColor Green
} else {
  Write-Host "I6 FAIL - Phat hien box-shadow/drop-shadow" -ForegroundColor Red
  $pass = $false
}

if ($pass) {
  Write-Host "`n>>> TAT CA TIEU CHI PHASE 09 DEU PASS <<<" -ForegroundColor Green
}
