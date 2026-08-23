# A5 — chi phí của backdrop-filter phủ lên terminal đang vẽ liên tục.
#
# Một lần đo mỗi bên là vô nghĩa: lần chạy đầu tiên sau khi build cho fps min 10 khi KHÔNG blur
# và 71 khi CÓ blur — ngược hoàn toàn, tức là nhiễu lấn át tín hiệu. Script này chạy xen kẽ
# nhiều vòng rồi lấy **trung vị**, và xen kẽ để nhiễu theo thời gian rơi đều lên cả hai bên.

param(
  [int]$Rounds = 3,
  [int]$MinBytes = 16384,
  [string]$Exe = "D:\Code\Project\noname\spike\src-tauri\target\release\spike.exe",
  [string]$Base = "D:\Code\Project\noname\plans\terminal-workspace\_baseline"
)

$busy = (Get-Process cargo,rustc,node -ErrorAction SilentlyContinue | Measure-Object).Count
if ($busy -gt 0) { Write-Warning "Co $busy process cargo/rustc/node dang chay - dung lai va cho." }

$rows = @()
for ($i = 1; $i -le $Rounds; $i++) {
  foreach ($blur in @($false, $true)) {
    $tag = if ($blur) { 'blur' } else { 'noblur' }
    $out = Join-Path $Base "a5-$tag-$i"
    if ($blur) { $env:SPIKE_BLUR = "1" } else { Remove-Item env:SPIKE_BLUR -ErrorAction SilentlyContinue }

    & powershell -ExecutionPolicy Bypass -File (Join-Path $Base 'bench.ps1') `
        -MinBytes $MinBytes -Exe $Exe -Out $out | Out-Null

    $f = Join-Path $out "bench-$MinBytes.json"
    if (Test-Path $f) {
      $r = Get-Content $f -Raw | ConvertFrom-Json
      $rows += [pscustomobject]@{
        vong = $i; blur = $tag
        giay = $r.seconds; MBps = $r.mb_per_s
        fps_min = $r.fps_min; fps_tb = $r.fps_avg
        RAM_dinh = $r.peak_private_mb
      }
      Write-Host ("  vong {0} {1,-6}: {2} s | {3} MB/s | fps min {4} tb {5} | RAM {6} MB" -f `
        $i, $tag, $r.seconds, $r.mb_per_s, $r.fps_min, $r.fps_avg, $r.peak_private_mb)
    }
  }
}
Remove-Item env:SPIKE_BLUR -ErrorAction SilentlyContinue

function Med($v) {
  $s = @($v | Sort-Object)
  if ($s.Count -eq 0) { return $null }
  $s[[math]::Floor($s.Count / 2)]
}

Write-Host "`n=== A5 TRUNG VI ($Rounds vong) ===" -ForegroundColor Cyan
$rows | Group-Object blur | ForEach-Object {
  [pscustomobject]@{
    blur     = $_.Name
    giay     = Med ($_.Group.giay)
    MBps     = Med ($_.Group.MBps)
    fps_min  = Med ($_.Group.fps_min)
    fps_tb   = Med ($_.Group.fps_tb)
    RAM_dinh = Med ($_.Group.RAM_dinh)
  }
} | Format-Table -AutoSize

$rows | Export-Csv (Join-Path $Base 'a5-raw.csv') -NoTypeInformation -Encoding utf8
Write-Host ("So lieu tho: {0}" -f (Join-Path $Base 'a5-raw.csv'))
