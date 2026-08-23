# A3 + A7 tự động: chạy spike một lần cho mỗi giá trị min_bytes, mỗi lần app tự đổ 47.7 MB
# vào terminal, tự ghi báo cáo JSON rồi tự thoát. Script này chỉ điều phối và đo RAM từ ngoài.
#
#   .\bench.ps1
#   .\bench.ps1 -MinBytes 4096 -FlushMs 8
#
# RAM đo bằng **private working set** của cả cây tiến trình. Cộng WorkingSet64 là đếm trùng
# phần bộ nhớ chia sẻ giữa các process WebView2 — chênh tới 3,5× (691 MB ảo vs 196 MB thật).

param(
  [string]$Exe = "D:\Code\Project\noname\spike\src-tauri\target\release\spike.exe",
  [int[]]$MinBytes = @(256, 1024, 4096, 65536),
  [int]$FlushMs = 12,
  [int]$HoldSec = 0,
  [string]$Out = "D:\Code\Project\noname\plans\terminal-workspace\_baseline\bench-results",
  [int]$TimeoutSec = 240
)

if (-not (Test-Path $Exe)) { Write-Error "Khong thay: $Exe"; exit 1 }
if (-not (Test-Path "$env:TEMP\big.txt")) { Write-Error "Thieu $env:TEMP\big.txt - tao truoc."; exit 1 }
New-Item -ItemType Directory -Force $Out | Out-Null

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

function Get-PrivateMB($ids) {
  $perf = Get-CimInstance Win32_PerfRawData_PerfProc_Process -Property IDProcess, WorkingSetPrivate |
          Where-Object { $ids.Contains([int]$_.IDProcess) }
  [math]::Round((($perf | Measure-Object WorkingSetPrivate -Sum).Sum) / 1MB)
}

$env:SPIKE_AUTOBENCH = "1"
$env:SPIKE_FLUSH_MS  = "$FlushMs"
$env:SPIKE_HOLD_SEC  = "$HoldSec"
$env:SPIKE_OUT       = $Out

foreach ($mb in $MinBytes) {
  $file = Join-Path $Out "bench-$mb.json"
  Remove-Item $file -ErrorAction SilentlyContinue
  $env:SPIKE_MIN_BYTES = "$mb"

  Write-Host ("`n=== min_bytes = {0}, flush_ms = {1} ===" -f $mb, $FlushMs) -ForegroundColor Cyan
  $p = Start-Process $Exe -PassThru
  Start-Sleep -Seconds 3

  $ids  = Get-TreeIds $p.Id
  $peak = 0
  $last = 0
  $sw   = [System.Diagnostics.Stopwatch]::StartNew()
  $n    = 0
  while (-not $p.HasExited -and $sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
    Start-Sleep -Milliseconds 500
    if ($n % 10 -eq 0) { $ids = Get-TreeIds $p.Id }   # cây có thể mọc thêm process
    $cur = Get-PrivateMB $ids
    if ($cur -gt 0) { $last = $cur }
    if ($cur -gt $peak) { $peak = $cur }
    $n++
    $p.Refresh()
  }

  if (-not $p.HasExited) {
    Write-Warning "Timeout ${TimeoutSec}s - giet process."
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  }

  if (Test-Path $file) {
    $r = Get-Content $file -Raw | ConvertFrom-Json
    $r | Add-Member -NotePropertyName peak_private_mb -NotePropertyValue $peak -Force
    $r | Add-Member -NotePropertyName settled_private_mb -NotePropertyValue $last -Force
    $r | ConvertTo-Json -Depth 5 | Set-Content $file -Encoding utf8
    Write-Host ("  {0} s | {1} MB/s | fps min {2} / tb {3} | chunk tb {4} B | RAM dinh {5} MB | RAM cuoi {6} MB" -f `
      $r.seconds, $r.mb_per_s, $r.fps_min, $r.fps_avg, $r.avg_chunk, $peak, $last) -ForegroundColor Green
  } else {
    Write-Warning "  Khong co bao cao - app thoat truoc khi bench xong?"
  }
}

Write-Host "`n=== TONG HOP A7 ===" -ForegroundColor Cyan
Get-ChildItem $Out -Filter 'bench-*.json' |
  ForEach-Object { Get-Content $_.FullName -Raw | ConvertFrom-Json } |
  Sort-Object min_bytes |
  Select-Object @{n='min_bytes';e={$_.min_bytes}}, @{n='giay';e={$_.seconds}},
                @{n='MB/s';e={$_.mb_per_s}}, @{n='fps_min';e={$_.fps_min}},
                @{n='fps_tb';e={$_.fps_avg}}, @{n='chunk_B';e={$_.avg_chunk}},
                @{n='flush';e={$_.flushes}}, @{n='RAM_dinh_MB';e={$_.peak_private_mb}},
                @{n='RAM_cuoi_MB';e={$_.settled_private_mb}} |
  Format-Table -AutoSize
