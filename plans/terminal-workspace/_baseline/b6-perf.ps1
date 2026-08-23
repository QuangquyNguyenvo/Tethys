# B6 — app/ có hồi quy so với spike (phase 01) không? Ngưỡng: không tệ hơn 15 %.
# Mốc phase 01: A2 cold start 367 ms | A1 RAM app idle 167 MB | A3 đổ 47,7 MB trong 5,3–5,9 s
param(
  [string]$Exe = "D:\Code\Project\noname\app\src-tauri\target\release\app.exe",
  [int]$Rounds = 3
)
if (-not (Test-Path $Exe)) { Write-Error "Khong thay: $Exe"; exit 1 }
$big = Join-Path $env:TEMP "big.txt"
if (-not (Test-Path $big)) { Write-Error "Thieu $big"; exit 1 }

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
function Get-AppPrivate($ids) {
  $perf = Get-CimInstance Win32_PerfRawData_PerfProc_Process -Property IDProcess, Name, WorkingSetPrivate |
          Where-Object { $ids.Contains([int]$_.IDProcess) }
  $shell = ($perf | Where-Object { $_.Name -match '^(powershell|pwsh|cmd|conhost)' } |
            Measure-Object WorkingSetPrivate -Sum).Sum
  $all = ($perf | Measure-Object WorkingSetPrivate -Sum).Sum
  [math]::Round(($all - $shell) / 1MB)
}

# ── A2 + A1: chạy sạch, không có lệnh boot ────────────────────────────────
$starts = @(); $idles = @()
for ($i = 1; $i -le $Rounds; $i++) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $p = Start-Process $Exe -PassThru
  $shown = $null
  while ($sw.ElapsedMilliseconds -lt 20000) {
    Start-Sleep -Milliseconds 10
    $p.Refresh()
    if ($p.MainWindowHandle -ne 0) { $shown = $sw.ElapsedMilliseconds; break }
  }
  Start-Sleep -Seconds 8
  $idle = Get-AppPrivate (Get-TreeIds $p.Id)
  [void]$p.CloseMainWindow(); $p.WaitForExit(6000) | Out-Null
  if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
  Start-Sleep -Milliseconds 600
  $starts += $shown; $idles += $idle
  Write-Host ("  vong {0}: cold start {1} ms | RAM app idle {2} MB" -f $i, $shown, $idle)
}

# ── A3: shell tự bấm giờ. Có backpressure nên thời gian này gồm cả lúc xterm vẽ ──
$a3 = Join-Path $env:TEMP "a3app.txt"
Remove-Item $a3 -ErrorAction SilentlyContinue
$env:NONAME_BOOT_CMD = '$sw=[Diagnostics.Stopwatch]::StartNew(); Get-Content (Join-Path $env:TEMP ''big.txt'') -Raw; $sw.Elapsed.TotalSeconds | Out-File -Append -Encoding utf8 $env:TEMP\a3app.txt'
$secs = @()
for ($i = 1; $i -le $Rounds; $i++) {
  $p = Start-Process $Exe -PassThru
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt 60) {
    Start-Sleep -Milliseconds 500
    if ((Test-Path $a3) -and ((Get-Content $a3 | Measure-Object).Count -ge $i)) { break }
  }
  [void]$p.CloseMainWindow(); $p.WaitForExit(6000) | Out-Null
  if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
  Start-Sleep -Milliseconds 600
  $v = @(Get-Content $a3)[$i-1]
  $secs += [double]$v
  Write-Host ("  vong {0}: do 47,7 MB trong {1:N2} s" -f $i, [double]$v)
}
Remove-Item env:NONAME_BOOT_CMD -ErrorAction SilentlyContinue

function Med($a) { $s = @($a | Sort-Object); $s[[math]::Floor($s.Count/2)] }
$mStart = Med $starts; $mIdle = Med $idles; $mSec = Med $secs

Write-Host "`n===== B6 (app/ so voi spike phase 01) ====="
$rows = @(
  [pscustomobject]@{ chi_tieu='A2 cold start (ms)'; spike=367; app=$mStart; nguong='<= 422' ; dat=($mStart -le 367*1.15) }
  [pscustomobject]@{ chi_tieu='A1 RAM app idle (MB)'; spike=167; app=$mIdle; nguong='<= 192'; dat=($mIdle -le 167*1.15) }
  [pscustomobject]@{ chi_tieu='A3 do 47,7 MB (s)'; spike=5.6; app=[math]::Round($mSec,2); nguong='<= 6.44'; dat=($mSec -le 5.6*1.15) }
)
$rows | Format-Table -AutoSize
if (($rows | Where-Object { -not $_.dat } | Measure-Object).Count -eq 0) {
  Write-Host "B6 PASS - khong hoi quy qua 15%" -ForegroundColor Green
} else {
  Write-Host "B6 FAIL - xem cot dat" -ForegroundColor Red
}
