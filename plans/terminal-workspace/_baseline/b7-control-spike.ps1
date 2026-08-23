# Doi chung cho B7 — spike KHONG co backpressure, do bang dung phuong phap tach app/shell.
# Khong co so nay thi cau "backpressure keo RAM xuong" chi la phong doan.
param(
  [string]$Exe = "D:\Code\Project\noname\spike\src-tauri\target\release\spike.exe",
  [int]$Rounds = 3,
  [int]$WatchSec = 45
)
if (-not (Test-Path $Exe)) { Write-Error "Khong thay: $Exe"; exit 1 }

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

# Spike tu go lenh nho SPIKE_AUTOBENCH (App.tsx dong 156 — dung cung lenh voi b7-backpressure.ps1).
$env:SPIKE_AUTOBENCH = "1"
$env:SPIKE_HOLD_SEC  = "25"
$env:SPIKE_OUT       = Join-Path $env:TEMP "spike-control"
$rows = @()
for ($i = 1; $i -le $Rounds; $i++) {
  $p = Start-Process $Exe -PassThru
  Start-Sleep -Seconds 2
  $ids = Get-TreeIds $p.Id
  $peakApp = 0; $peakShell = 0; $peakTotal = 0; $lastApp = 0; $n = 0
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $WatchSec -and -not $p.HasExited) {
    Start-Sleep -Milliseconds 500
    if ($n % 10 -eq 0) { $ids = Get-TreeIds $p.Id }
    $cur = Get-PrivateSplit $ids
    if ($cur.app -gt 0) { $lastApp = $cur.app }
    if ($cur.app   -gt $peakApp)   { $peakApp   = $cur.app }
    if ($cur.shell -gt $peakShell) { $peakShell = $cur.shell }
    if ($cur.total -gt $peakTotal) { $peakTotal = $cur.total }
    $n++; $p.Refresh()
  }
  Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 800
  $rows += [pscustomobject]@{ vong=$i; app_dinh=$peakApp; shell_dinh=$peakShell; tong_dinh=$peakTotal; app_cuoi=$lastApp }
  Write-Host ("  vong {0}: APP dinh {1} MB | SHELL dinh {2} MB | tong {3} MB | app cuoi {4} MB" -f $i,$peakApp,$peakShell,$peakTotal,$lastApp)
}
Remove-Item env:SPIKE_AUTOBENCH,env:SPIKE_HOLD_SEC,env:SPIKE_OUT -ErrorAction SilentlyContinue
$peaks = @($rows.app_dinh | Sort-Object)
Write-Host ("`n=== DOI CHUNG (spike, khong backpressure) === APP dinh trung vi: {0} MB" -f $peaks[[math]::Floor($peaks.Count/2)]) -ForegroundColor Cyan
$rows | Format-Table -AutoSize
