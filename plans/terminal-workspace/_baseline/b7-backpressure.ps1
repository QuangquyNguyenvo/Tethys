# B7 — backpressure có kéo được RAM đỉnh xuống dưới 600 MB không?
#
# spike (không có backpressure): đỉnh 713–754 MB, sau 25 s vẫn 632 MB.
# app  (có cửa sổ trượt 16 chunk + ack): đo ở đây.
#
# App tự gõ lệnh nhờ biến môi trường NONAME_BOOT_CMD (hook đo đạc trong pty_spawn).

param(
  [string]$Exe = "D:\Code\Project\noname\app\src-tauri\target\release\app.exe",
  [int]$Rounds = 3,
  [int]$WatchSec = 45
)

if (-not (Test-Path $Exe)) { Write-Error "Khong thay: $Exe"; exit 1 }
if (-not (Test-Path "$env:TEMP\big.txt")) { Write-Error "Thieu $env:TEMP\big.txt"; exit 1 }

$busy = (Get-Process cargo,rustc -ErrorAction SilentlyContinue | Measure-Object).Count
if ($busy -gt 0) { Write-Warning "Co $busy process cargo/rustc dang chay - so do se sai lech." }

function Get-TreeIds([int]$RootPid) {
  $all = Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId
  $ids = [System.Collections.Generic.HashSet[int]]::new()
  [void]$ids.Add($RootPid)
  $grew = $true
  while ($grew) {
    $grew = $false
    foreach ($p in $all) {
      if ($ids.Contains([int]$p.ParentProcessId) -and -not $ids.Contains([int]$p.ProcessId)) {
        [void]$ids.Add([int]$p.ProcessId); $grew = $true
      }
    }
  }
  , $ids
}
# Tach RAM cua APP va RAM cua SHELL. Gop chung la sai: "Get-Content -Raw" doc tron
# 47,7 MB thanh mot string .NET (UTF-16 -> ~95 MB) nen powershell.exe mot minh da an
# hang tram MB. Do la RAM cua lenh benchmark, khong phai cua app.
function Get-PrivateSplit($ids) {
  $perf = Get-CimInstance Win32_PerfRawData_PerfProc_Process -Property IDProcess, Name, WorkingSetPrivate |
          Where-Object { $ids.Contains([int]$_.IDProcess) }
  $shell = ($perf | Where-Object { $_.Name -match '^(powershell|pwsh|cmd|conhost)' } |
            Measure-Object WorkingSetPrivate -Sum).Sum
  $all   = ($perf | Measure-Object WorkingSetPrivate -Sum).Sum
  [pscustomobject]@{
    app   = [math]::Round(($all - $shell) / 1MB)
    shell = [math]::Round($shell / 1MB)
    total = [math]::Round($all / 1MB)
  }
}

$env:NONAME_BOOT_CMD = "Get-Content (Join-Path `$env:TEMP 'big.txt') -Raw"
$rows = @()

for ($i = 1; $i -le $Rounds; $i++) {
  $p = Start-Process $Exe -PassThru
  Start-Sleep -Seconds 2
  $ids = Get-TreeIds $p.Id
  $peakApp = 0; $peakShell = 0; $peakTotal = 0; $lastApp = 0
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $n = 0
  while ($sw.Elapsed.TotalSeconds -lt $WatchSec -and -not $p.HasExited) {
    Start-Sleep -Milliseconds 500
    if ($n % 10 -eq 0) { $ids = Get-TreeIds $p.Id }
    $cur = Get-PrivateSplit $ids
    if ($cur.app -gt 0) { $lastApp = $cur.app }
    if ($cur.app   -gt $peakApp)   { $peakApp   = $cur.app }
    if ($cur.shell -gt $peakShell) { $peakShell = $cur.shell }
    if ($cur.total -gt $peakTotal) { $peakTotal = $cur.total }
    $n++
    $p.Refresh()
  }
  Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 800

  $rows += [pscustomobject]@{
    vong = $i; app_dinh = $peakApp; shell_dinh = $peakShell
    tong_dinh = $peakTotal; app_cuoi = $lastApp
  }
  Write-Host ("  vong {0}: APP dinh {1} MB | SHELL dinh {2} MB | tong {3} MB | app sau {4}s: {5} MB" -f `
    $i, $peakApp, $peakShell, $peakTotal, $WatchSec, $lastApp)
}
Remove-Item env:NONAME_BOOT_CMD -ErrorAction SilentlyContinue

$peaks = @($rows.app_dinh | Sort-Object)
$med = $peaks[[math]::Floor($peaks.Count / 2)]
Write-Host ("`n=== B7 ===  RAM dinh cua APP (khong ke shell), trung vi: {0} MB   (nguong 600)" -f $med) -ForegroundColor Cyan
if ($med -le 600) { Write-Host "PASS" -ForegroundColor Green } else { Write-Host "FAIL" -ForegroundColor Red }
$rows | Format-Table -AutoSize
