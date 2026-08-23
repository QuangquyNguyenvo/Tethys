# B3a: lấy mẫu kích thước PTY mỗi giây trong 15 s, resize cửa sổ ở giây 4 và 9.
# Lấy mẫu liên tục nên không phụ thuộc thời điểm — bản đọc một lần trong b2-b4.ps1 flaky.
# Xác nhận cả hai phía: cửa sổ có thật sự đổi (GetWindowRect lại) và PTY có nhận không.
param([string]$Exe = "D:\Code\Project\noname\app\src-tauri\target\release\app.exe")
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W2 {
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h,int x,int y,int w,int t,bool r);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
}
"@
$f = Join-Path $env:TEMP "b3diag.txt"
Remove-Item $f -ErrorAction SilentlyContinue
$env:NONAME_BOOT_CMD = '1..15 | ForEach-Object { "$_ $($Host.UI.RawUI.WindowSize.Width)x$($Host.UI.RawUI.WindowSize.Height)" | Out-File -Append -Encoding utf8 $env:TEMP\b3diag.txt; Start-Sleep 1 }'

$p = Start-Process $Exe -PassThru
Start-Sleep -Seconds 4
$p.Refresh(); $h = $p.MainWindowHandle
$r = New-Object W2+RECT
[void][W2]::GetWindowRect($h, [ref]$r)
Write-Host ("truoc  : {0}x{1}  handle={2}" -f ($r.R-$r.L), ($r.B-$r.T), $h)

$ok = [W2]::MoveWindow($h, $r.L, $r.T, 700, 520, $true)
Start-Sleep -Milliseconds 1500
[void][W2]::GetWindowRect($h, [ref]$r)
Write-Host ("sau #1 : {0}x{1}  MoveWindow tra ve {2}" -f ($r.R-$r.L), ($r.B-$r.T), $ok)

Start-Sleep -Seconds 4
$ok = [W2]::MoveWindow($h, $r.L, $r.T, 1500, 900, $true)
Start-Sleep -Milliseconds 1500
[void][W2]::GetWindowRect($h, [ref]$r)
Write-Host ("sau #2 : {0}x{1}  MoveWindow tra ve {2}" -f ($r.R-$r.L), ($r.B-$r.T), $ok)

Start-Sleep -Seconds 7
[void]$p.CloseMainWindow(); $p.WaitForExit(6000) | Out-Null
if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
Remove-Item env:NONAME_BOOT_CMD -ErrorAction SilentlyContinue
Write-Host "`n--- mau kich thuoc PTY ---"
if (-not (Test-Path $f)) { Write-Host "B3a FAIL - <khong co file>" -ForegroundColor Red; exit 1 }
$lines = Get-Content $f
$lines
$sizes = $lines | ForEach-Object { ($_ -split ' ')[1] } | Select-Object -Unique
Write-Host ("`nSo kich thuoc khac nhau: {0} ({1})" -f $sizes.Count, ($sizes -join ', '))
if ($sizes.Count -ge 3) { Write-Host "B3a PASS - PTY theo kip ca hai lan resize" -ForegroundColor Green }
elseif ($sizes.Count -eq 2) { Write-Host "B3a MOT PHAN - chi bat duoc mot lan resize" -ForegroundColor Yellow }
else { Write-Host "B3a FAIL - PTY khong doi kich thuoc" -ForegroundColor Red }
