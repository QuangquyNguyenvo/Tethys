# B2 (cwd), B3a (PTY nhận kích thước mới khi resize), B4 (không rò session).
# Ba tiêu chí này đều tự động được — không cần ai ngồi gõ.
param([string]$Exe = "D:\Code\Project\noname\app\src-tauri\target\release\app.exe")

if (-not (Test-Path $Exe)) { Write-Error "Khong thay: $Exe"; exit 1 }
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h,int x,int y,int w,int t,bool r);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
}
"@
$WD = "D:\Code\Project\noname"
$b2 = Join-Path $env:TEMP "b2.txt"
$b3 = Join-Path $env:TEMP "b3.txt"
Remove-Item $b2,$b3 -ErrorAction SilentlyContinue

function Count-Shells { (Get-Process powershell,pwsh,conhost -ErrorAction SilentlyContinue | Measure-Object).Count }

$before = Count-Shells
Write-Host "B4: shell truoc khi chay app = $before"

# Lệnh ghi cwd ngay, rồi ghi kích thước trước/sau khoảng thời gian script resize cửa sổ.
$env:NONAME_BOOT_CMD = "(Get-Location).Path | Out-File -Encoding utf8 '$b2'; `$a=`"`$(`$Host.UI.RawUI.WindowSize.Width)x`$(`$Host.UI.RawUI.WindowSize.Height)`"; Start-Sleep 8; `"`$a => `$(`$Host.UI.RawUI.WindowSize.Width)x`$(`$Host.UI.RawUI.WindowSize.Height)`" | Out-File -Encoding utf8 '$b3'"

$p = Start-Process $Exe -WorkingDirectory $WD -PassThru
Start-Sleep -Seconds 5
$h = $p.MainWindowHandle
if ($h -eq [IntPtr]::Zero) { $p.Refresh(); $h = $p.MainWindowHandle }
if ($h -ne [IntPtr]::Zero) {
  $r = New-Object W+RECT
  [void][W]::GetWindowRect($h, [ref]$r)
  Write-Host ("B3a: cua so hien {0}x{1}, thu nho con 700x520" -f ($r.R-$r.L), ($r.B-$r.T))
  [void][W]::MoveWindow($h, $r.L, $r.T, 700, 520, $true)
} else {
  Write-Warning "B3a: khong lay duoc handle cua so"
}
Start-Sleep -Seconds 8

# Đóng tử tế (không Stop-Process) để WindowEvent::Destroyed kịp chạy — giết cứng thì
# bài kiểm B4 vô nghĩa vì Drop không bao giờ được gọi.
[void]$p.CloseMainWindow()
$p.WaitForExit(8000) | Out-Null
if (-not $p.HasExited) { Write-Warning "App khong tu thoat sau CloseMainWindow"; Stop-Process -Id $p.Id -Force }
Start-Sleep -Seconds 2
Remove-Item env:NONAME_BOOT_CMD -ErrorAction SilentlyContinue

$after = Count-Shells
Write-Host "`n===== KET QUA ====="
$cwd = if (Test-Path $b2) { (Get-Content $b2 -Raw).Trim() } else { "<khong co file>" }
Write-Host ("B2  cwd  : {0}" -f $cwd)
if ($cwd -eq $WD) { Write-Host "B2  PASS" -ForegroundColor Green }
else { Write-Host "B2  FAIL - mong doi $WD" -ForegroundColor Red }

$sz = if (Test-Path $b3) { (Get-Content $b3 -Raw).Trim() } else { "<khong co file>" }
Write-Host ("B3a kich thuoc: {0}" -f $sz)
$parts = $sz -split '\s*=>\s*'
if ($parts.Count -eq 2 -and $parts[0] -ne $parts[1]) { Write-Host "B3a PASS - PTY nhan kich thuoc moi" -ForegroundColor Green }
else { Write-Host "B3a FAIL - kich thuoc khong doi" -ForegroundColor Red }

Write-Host ("B4  shell sau = {0} (truoc {1})" -f $after, $before)
if ($after -le $before) { Write-Host "B4  PASS" -ForegroundColor Green }
else { Write-Host ("B4  FAIL - con {0} shell mo coi" -f ($after-$before)) -ForegroundColor Red }
