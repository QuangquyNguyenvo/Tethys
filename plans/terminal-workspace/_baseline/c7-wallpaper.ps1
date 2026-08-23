# C7 — đổi ảnh nền thì bảng màu có đổi không?
#
# Dùng override NONAME_WALLPAPER thay vì sửa ảnh nền thật của máy.
# Ảnh so sánh phải KHÁC HẲN nhau: `TranscodedWallpaper` là bản transcode của chính ảnh nền
# hiện tại nên so hai cái đó chỉ chứng minh được quantizer có nhiễu, không chứng minh gì khác.
param([string]$Exe = "D:\Code\Project\noname\app\src-tauri\target\release\app.exe")

if (-not (Test-Path $Exe)) { Write-Error "Khong thay: $Exe"; exit 1 }
Add-Type -AssemblyName System.Drawing

function New-SolidImage([string]$Path, [int]$R, [int]$G, [int]$B) {
  $bmp = New-Object System.Drawing.Bitmap 400, 250
  $gfx = [System.Drawing.Graphics]::FromImage($bmp)
  $gfx.Clear([System.Drawing.Color]::FromArgb($R, $G, $B))
  $gfx.Dispose()
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

$red   = Join-Path $env:TEMP "c7-red.png"
$green = Join-Path $env:TEMP "c7-green.png"
New-SolidImage $red   198 62 62
New-SolidImage $green 46 150 96

$real = (Get-ItemProperty "HKCU:\Control Panel\Desktop" -Name WallPaper).WallPaper
$cases = @(
  @{ ten = "anh nen that"; path = $real }
  @{ ten = "do thuan";     path = $red }
  @{ ten = "xanh la";      path = $green }
)

$env:NONAME_THEME_EXIT = "1"
$results = @()
$i = 0
foreach ($c in $cases) {
  $i++
  if (-not (Test-Path $c.path)) { Write-Host ("  {0}: KHONG co file" -f $c.ten) -ForegroundColor Red; continue }
  $dump = Join-Path $env:TEMP "theme-c7-$i.json"
  Remove-Item $dump -ErrorAction SilentlyContinue
  $env:NONAME_WALLPAPER = $c.path
  $env:NONAME_THEME_DUMP = $dump

  $p = Start-Process $Exe -PassThru
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt 30 -and -not (Test-Path $dump)) { Start-Sleep -Milliseconds 300 }
  Start-Sleep -Milliseconds 700
  if (-not $p.HasExited) { [void]$p.CloseMainWindow(); $p.WaitForExit(5000) | Out-Null }
  if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }

  if (-not (Test-Path $dump)) { Write-Host ("  {0}: KHONG co bao cao" -f $c.ten) -ForegroundColor Red; continue }
  $r = Get-Content $dump -Raw | ConvertFrom-Json
  $results += [pscustomobject]@{
    ten = $c.ten; seed = $r.seed; source = $r.source
    surface = $r.vars.'--ui-surface'; primary = $r.vars.'--ui-primary'; red = $r.vars.'--term-red'
  }
}
Remove-Item env:NONAME_WALLPAPER, env:NONAME_THEME_DUMP, env:NONAME_THEME_EXIT -ErrorAction SilentlyContinue
Remove-Item $red, $green -ErrorAction SilentlyContinue

Write-Host "`n===== C7 ====="
$results | Format-Table -AutoSize
if ($results.Count -lt 3) { Write-Host "C7 FAIL - thieu bao cao" -ForegroundColor Red; exit 1 }
$khongFallback = ($results | Where-Object { $_.source -eq 'wallpaper' }).Count -eq 3
$seedRieng     = ($results.seed    | Select-Object -Unique).Count -eq 3
$primaryRieng  = ($results.primary | Select-Object -Unique).Count -eq 3
Write-Host ("ca ba deu lay tu anh (khong fallback): {0}" -f $khongFallback)
Write-Host ("ba seed khac nhau                    : {0}" -f $seedRieng)
Write-Host ("ba mau primary khac nhau             : {0}" -f $primaryRieng)
if ($khongFallback -and $seedRieng -and $primaryRieng) { Write-Host "C7 PASS" -ForegroundColor Green }
else { Write-Host "C7 FAIL" -ForegroundColor Red }
