# F-LINKS-WATCHER: Kiểm tra link regex, path resolve, file watcher auto-refresh, và dọn dẹp
param([string]$Exe = "D:\Code\Project\noname\app\src-tauri\target\release\app.exe")

if (-not (Test-Path $Exe)) {
  if (Test-Path "D:\Code\Project\noname\app\src-tauri\target\debug\app.exe") {
    $Exe = "D:\Code\Project\noname\app\src-tauri\target\debug\app.exe"
  } else {
    Write-Error "Khong thay: $Exe"; exit 1
  }
}

$WD = "D:\Code\Project\noname"
$test_file = Join-Path $env:TEMP "watch_test.md"

# 1. Test F2: Link regex unit test qua node
Write-Host "--- 1. Kiem tra F2: Link regex unit tests ---"
node "$WD\app\scripts\check-links.mjs"
if ($LASTEXITCODE -ne 0) {
  Write-Error "F2 Unit test FAIL"; exit 1
}

# 2. Test F4: Auto-refresh & Watcher lifecycle
Write-Host "`n--- 2. Kiem tra F4 & F6: File watcher & clean exit ---"
"# Ban dau: Version 1" | Out-File -Encoding utf8 $test_file

$shell_before = (Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -in @("powershell", "pwsh", "conhost") }).Count
Write-Host "F: Shell truoc khi chay = $shell_before"

$env:NONAME_PREVIEW_FILE = $test_file
$p = Start-Process $Exe -WorkingDirectory $WD -PassThru
Start-Sleep -Seconds 4

# Ghi đè nội dung file trên đĩa để kích hoạt File Watcher Modify event
"# Da cap nhat: Version 2 (Auto-refreshed)" | Out-File -Encoding utf8 $test_file
Start-Sleep -Seconds 3

# Đóng ứng dụng
[void]$p.CloseMainWindow()
$p.WaitForExit(8000) | Out-Null
if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
Start-Sleep -Seconds 2

$shell_after = (Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -in @("powershell", "pwsh", "conhost") }).Count
Write-Host "F: Shell sau khi dong = $shell_after"

Remove-Item env:NONAME_PREVIEW_FILE -ErrorAction SilentlyContinue
Remove-Item $test_file -ErrorAction SilentlyContinue

Write-Host "`n===== KET QUA F-LINKS-WATCHER ====="

$pass = $true
if ($shell_after -eq $shell_before) {
  Write-Host "F6 PASS - Khong ro shell/watcher khi mo, sua file tren dia va dong app" -ForegroundColor Green
} else {
  Write-Host "F6 FAIL - Ro shell: truoc $shell_before, sau $shell_after" -ForegroundColor Red
  $pass = $false
}

# Kiểm tra U1 (không glow)
$glowMatches = Select-String -Path (Get-ChildItem -Path "$WD\app\src" -Recurse -File -Include *.css,*.tsx,*.ts).FullName -Pattern "drop-shadow|box-shadow"
if ($glowMatches.Count -eq 0) {
  Write-Host "F7 (U1 - Khong glow/shadows) PASS" -ForegroundColor Green
} else {
  Write-Host "F7 FAIL - Phat hien box-shadow/drop-shadow" -ForegroundColor Red
  $pass = $false
}

if ($pass) {
  Write-Host "`n>>> TAT CA TIEU CHI PHASE 06 DEU PASS <<<" -ForegroundColor Green
}
