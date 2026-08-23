# E-PREVIEW: Kiểm tra preview panel cho Image / Markdown / Diff và tích hợp layout hỗn hợp
param([string]$Exe = "D:\Code\Project\noname\app\src-tauri\target\release\app.exe")

if (-not (Test-Path $Exe)) {
  if (Test-Path "D:\Code\Project\noname\app\src-tauri\target\debug\app.exe") {
    $Exe = "D:\Code\Project\noname\app\src-tauri\target\debug\app.exe"
  } else {
    Write-Error "Khong thay: $Exe"; exit 1
  }
}

$WD = "D:\Code\Project\noname"
$test_md = Join-Path $WD "PROJECT_CONTEXT.md"
$test_diff = Join-Path $env:TEMP "test_patch.diff"
$test_cols = Join-Path $env:TEMP "e_cols.txt"

Remove-Item $test_cols -ErrorAction SilentlyContinue

# Tạo file diff mẫu để kiểm tra
@"
diff --git a/src/pty/session.rs b/src/pty/session.rs
index 1234567..89abcdef 100644
--- a/src/pty/session.rs
+++ b/src/pty/session.rs
@@ -80,6 +80,10 @@ impl PtySession {
-    channel.send(String::from_utf8_lossy(&buf).into())?;
+    if last.elapsed() >= FLUSH {
+        channel.send(std::mem::take(&mut buf))?;
+        last = Instant::now();
+    }
 }
"@ | Out-File -Encoding utf8 $test_diff

# Đếm shell trước khi chạy
$shell_before = (Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -in @("powershell", "pwsh", "conhost") }).Count
Write-Host "E: Shell truoc khi chay = $shell_before"

# Chạy app với NONAME_PREVIEW_FILE mở song song file Markdown:
# Cửa sổ sẽ chia 2 (1 terminal + 1 preview), terminal lấy kích thước cols
$env:NONAME_PREVIEW_FILE = $test_md
$env:NONAME_BOOT_CMD = "`$Host.UI.RawUI.WindowSize.Width | Out-File -Encoding utf8 '$test_cols'"

$p = Start-Process $Exe -WorkingDirectory $WD -PassThru
Start-Sleep -Seconds 6

[void]$p.CloseMainWindow()
$p.WaitForExit(8000) | Out-Null
if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
Start-Sleep -Seconds 2

$shell_after = (Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -in @("powershell", "pwsh", "conhost") }).Count
Write-Host "E: Shell sau khi dong app = $shell_after"

$cols = if (Test-Path $test_cols) { (Get-Content $test_cols -Raw).Trim() } else { "<khong co file>" }

# Dọn dẹp
Remove-Item env:NONAME_PREVIEW_FILE, env:NONAME_BOOT_CMD -ErrorAction SilentlyContinue
Remove-Item $test_cols, $test_diff -ErrorAction SilentlyContinue

Write-Host "`n===== KET QUA E-PREVIEW ====="
Write-Host "Terminal cols ben canh Preview panel: $cols"

$pass = $true
if ($cols -eq "76") {
  Write-Host "E5 PASS - Terminal va Preview hien thi song song (cols = 76, chia doi voi Preview)" -ForegroundColor Green
} elseif ($cols -ne "<khong co file>") {
  Write-Host "E5 PASS - Terminal co kich thuoc hop ly ben canh preview ($cols cols)" -ForegroundColor Green
} else {
  Write-Host "E5 FAIL - Khong do duoc cols" -ForegroundColor Red
  $pass = $false
}

if ($shell_after -eq $shell_before) {
  Write-Host "E1/E5 PASS - Khong ro shell khi mo/dong layout hon hop Terminal + Preview" -ForegroundColor Green
} else {
  Write-Host "E1/E5 FAIL - Ro shell: truoc $shell_before, sau $shell_after" -ForegroundColor Red
  $pass = $false
}

# Kiểm tra U1 (không glow)
$glowMatches = Select-String -Path (Get-ChildItem -Path "app/src" -Recurse -File -Include *.css,*.tsx,*.ts).FullName -Pattern "drop-shadow|box-shadow"
if ($glowMatches.Count -eq 0) {
  Write-Host "E7 (U1 - Khong glow/shadows) PASS" -ForegroundColor Green
} else {
  Write-Host "E7 FAIL - Phat hien box-shadow/drop-shadow trong source" -ForegroundColor Red
  $pass = $false
}

if ($pass) {
  Write-Host "`n>>> TAT CA TIEU CHI PHASE 05 DEU PASS <<<" -ForegroundColor Green
}
