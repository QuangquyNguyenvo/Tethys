# D7b: split KHÔNG được dựng lại panel cũ.
#
# Vì sao cần bài kiểm mới: `d7-persistence.ps1` cho NONAME_BOOT_CMD **ghi đè** file PID.
# Nếu panel 1 bị unmount rồi mount lại, shell mới ghi đè PID của shell cũ — script đọc được
# một PID đang sống nên báo PASS. Nó không phân biệt được "shell cũ còn sống" với
# "shell cũ chết, shell mới lên thay". Đó chính là lý do D7 PASS trong khi bug vẫn còn.
#
# Đếm shell đang sống cũng không cứu được: kill rồi spawn lại vẫn ra đúng bằng số panel.
# Thứ duy nhất phân biệt được là **số lần spawn**, nên `pty_spawn` ghi nối mỗi lần spawn
# một dòng vào %TEMP%\pty_spawn.log. N panel phải đúng N lần spawn.
param(
  [string]$Exe = "D:\Code\Project\noname\app\src-tauri\target\release\app.exe",
  [int]$Panels = 3
)

if (-not (Test-Path $Exe)) { Write-Error "Khong thay: $Exe"; exit 1 }

$WD = "D:\Code\Project\noname"
$log = Join-Path $env:TEMP "pty_spawn.log"
Remove-Item $log -ErrorAction SilentlyContinue

$env:NONAME_PANELS = "$Panels"

$p = Start-Process $Exe -WorkingDirectory $WD -PassThru
Start-Sleep -Seconds 8

$spawns = @()
if (Test-Path $log) { $spawns = @(Get-Content $log | Where-Object { $_ -match '^spawned id=' }) }
$alive = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($p.Id)" |
           Where-Object { $_.Name -like '*powershell*' -or $_.Name -eq 'pwsh.exe' })

[void]$p.CloseMainWindow()
$p.WaitForExit(8000) | Out-Null
if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
Start-Sleep -Seconds 2
Remove-Item env:NONAME_PANELS -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "===== KET QUA D7b ====="
Write-Host "Panel yeu cau : $Panels"
Write-Host "Lan spawn PTY : $($spawns.Count)"
Write-Host "Shell con song: $($alive.Count)"

if ($spawns.Count -eq $Panels -and $alive.Count -eq $Panels) {
  Write-Host "D7b PASS - dung $Panels lan spawn cho $Panels panel: split khong dung lai panel cu" -ForegroundColor Green
  exit 0
} else {
  Write-Host "D7b FAIL - so lan spawn khong khop so panel: split dang dung lai panel cu" -ForegroundColor Red
  exit 1
}
