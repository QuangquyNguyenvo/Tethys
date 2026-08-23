# Đo A1 (RAM idle) và A2 (cold start) cho spike hoặc WaveTerm — cùng một phép đo cho cả hai,
# nếu không thì so sánh vô nghĩa.
#
#   .\measure.ps1 -Exe "D:\Code\Project\noname\spike\src-tauri\target\release\spike.exe"
#   .\measure.ps1 -Exe "$env:LOCALAPPDATA\Programs\waveterm\Wave.exe"
#
# RAM tính theo **cây tiến trình con** của đúng PID vừa khởi chạy, không lọc theo tên.
# Lọc theo tên 'msedgewebview2' sẽ gom nhầm WebView2 của app khác trên máy (Widgets, Office…)
# và sẽ giết nhầm chúng khi dọn dẹp.
#
# A2 đo tới lúc **cửa sổ xuất hiện**, không phải tới lúc shell in prompt — prompt phụ thuộc
# tốc độ khởi động của pwsh, không phải của app. Ghi rõ để không so nhầm.

param(
  [Parameter(Mandatory)][string]$Exe,
  [int]$SettleSeconds = 12,
  [switch]$KeepOpen
)

if (-not (Test-Path $Exe)) { Write-Error "Khong thay: $Exe"; exit 1 }

$busy = (Get-Process cargo,rustc,node -ErrorAction SilentlyContinue | Measure-Object).Count
if ($busy -gt 0) { Write-Warning "Co $busy process cargo/rustc/node dang chay - so do se sai lech." }

function Get-Tree([int]$RootPid) {
  $all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId
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
  $ids
}

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$p  = Start-Process $Exe -PassThru
$shown = $null
while ($sw.ElapsedMilliseconds -lt 20000) {
  $p.Refresh()
  if ($p.MainWindowHandle -ne 0) { $shown = $sw.ElapsedMilliseconds; break }
  Start-Sleep -Milliseconds 5
}
$sw.Stop()
Write-Host ("A2 cold start (toi khi cua so hien): {0} ms" -f $(if ($null -ne $shown) { $shown } else { 'TIMEOUT >20s' }))

Write-Host "Cho $SettleSeconds giay cho app on dinh..."
Start-Sleep -Seconds $SettleSeconds

$ids = Get-Tree $p.Id
# WorkingSet64 dem trung shared memory giua cac process WebView2 (691 MB ao vs 196 MB that
# — xem D4). Phai dung WorkingSetPrivate. Va tach RAM shell ra khoi RAM app.
$perf = Get-CimInstance Win32_PerfRawData_PerfProc_Process -Property IDProcess, Name, WorkingSetPrivate |
        Where-Object { $ids.Contains([int]$_.IDProcess) }
$shellB = ($perf | Where-Object { $_.Name -match '^(powershell|pwsh|cmd|conhost)' } |
           Measure-Object WorkingSetPrivate -Sum).Sum
$allB   = ($perf | Measure-Object WorkingSetPrivate -Sum).Sum
Write-Host ("A1 RAM idle: {0} MB tong = app {1} MB + shell {2} MB  ({3} process trong cay)" -f `
  [math]::Round($allB/1MB), [math]::Round(($allB-$shellB)/1MB), [math]::Round($shellB/1MB), $perf.Count)
$perf | Sort-Object WorkingSetPrivate -Descending |
  Select-Object @{n='process';e={$_.Name}}, @{n='pid';e={$_.IDProcess}},
                @{n='MB_private';e={[math]::Round($_.WorkingSetPrivate/1MB,1)}} |
  Format-Table -AutoSize

if ($KeepOpen) {
  Write-Host ("PID goc: {0}  - cua so van mo de do A3/A4 thu cong. Dong bang:" -f $p.Id)
  Write-Host ("  Stop-Process -Id {0} -Force" -f $p.Id)
} else {
  # Khong don thi lan do sau bi nhieu boi chinh app cua lan truoc.
  [void]$p.CloseMainWindow()
  $p.WaitForExit(6000) | Out-Null
  if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
  Write-Host "Da dong app. (chay lai voi -KeepOpen neu muon giu cua so)"
}
