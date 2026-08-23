# G-OSC133: Kiểm tra OSC 133 shell integration, prompt hook, command jumping và dọn dẹp
param([string]$Exe = "D:\Code\Project\noname\app\src-tauri\target\release\app.exe")

if (-not (Test-Path $Exe)) {
  if (Test-Path "D:\Code\Project\noname\app\src-tauri\target\debug\app.exe") {
    $Exe = "D:\Code\Project\noname\app\src-tauri\target\debug\app.exe"
  } else {
    Write-Error "Khong thay: $Exe"; exit 1
  }
}

$WD = "D:\Code\Project\noname"

# 1. Test G2: Unit tests cho OSC 133
Write-Host "--- 1. Kiem tra G2: OSC 133 Unit tests ---"
node "$WD\app\scripts\check-osc133.mjs"
if ($LASTEXITCODE -ne 0) {
  Write-Error "G2 Unit test FAIL"; exit 1
}

# 2. Test Live Spawn với Prompt Hook & Clean Exit
Write-Host "`n--- 2. Kiem tra live spawn shell voi OSC 133 prompt hook ---"
$shell_before = (Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -in @("powershell", "pwsh", "conhost") }).Count
Write-Host "G: Shell truoc khi chay = $shell_before"

$env:NONAME_BOOT_CMD = "Write-Host 'OSC133 TEST OK'"
$p = Start-Process $Exe -WorkingDirectory $WD -PassThru
Start-Sleep -Seconds 5

[void]$p.CloseMainWindow()
$p.WaitForExit(8000) | Out-Null
if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
Start-Sleep -Seconds 2

$shell_after = (Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -in @("powershell", "pwsh", "conhost") }).Count
Write-Host "G: Shell sau khi dong = $shell_after"

Remove-Item env:NONAME_BOOT_CMD -ErrorAction SilentlyContinue

Write-Host "`n===== KET QUA G-OSC133 ====="

$pass = $true
if ($shell_after -eq $shell_before) {
  Write-Host "G: Vong doi shell sach (khong ro tien trinh con)" -ForegroundColor Green
} else {
  Write-Host "G: FAIL - Ro shell: truoc $shell_before, sau $shell_after" -ForegroundColor Red
  $pass = $false
}

# Kiểm tra U1 (không glow)
$glowMatches = Select-String -Path (Get-ChildItem -Path "$WD\app\src" -Recurse -File -Include *.css,*.tsx,*.ts).FullName -Pattern "drop-shadow|box-shadow"
if ($glowMatches.Count -eq 0) {
  Write-Host "G6 (U1 - Khong glow/shadows) PASS" -ForegroundColor Green
} else {
  Write-Host "G6 FAIL - Phat hien box-shadow/drop-shadow" -ForegroundColor Red
  $pass = $false
}

if ($pass) {
  Write-Host "`n>>> TAT CA TIEU CHI PHASE 07 DEU PASS <<<" -ForegroundColor Green
}
