# Baseline — WaveTerm trên cùng máy

Đo cùng cách với spike. Không có baseline thì "180 MB" chỉ là con số bịa.

**Máy**: Windows 11 Pro 26200 · WebView2 151.0.4129.93 · Node 26.4.0 · rustc 1.97.0
**WaveTerm**: `C:\Users\Wjbu\AppData\Local\Programs\waveterm\Wave.exe` — 212,7 MB
**Ngày đo**: 2026-08-20

## Cách đo

`measure.ps1` dựng cây tiến trình con từ PID vừa khởi chạy rồi cộng **`WorkingSetPrivate`**.
Không lọc theo tên process, không cộng `WorkingSet64` — xem `phase-01-spike.md` → D4.

## Kết quả

| Chỉ số | WaveTerm | spike (Tauri) | Chênh |
|---|---|---|---|
| **Cold start** → cửa sổ hiện | **2 979 ms** | **367 ms** | spike nhanh **8,1×** |
| RAM private, tổng cây | 514 MB | 196 MB | |
| — phần shell (`powershell`+`conhost`) | 124 MB (4 shell) | 29 MB (1 shell) | |
| — **phần app** (không kể shell) | **390 MB** | **167 MB** | spike nhẹ **2,3×** |
| Số process | 15 | 9 | |
| Ligature | **có** (Electron có Node) | **không** (D3) | WaveTerm thắng |

⚠️ **Không so trực tiếp cột RAM tổng**: WaveTerm khôi phục phiên cũ với **4 terminal**, spike chỉ
có **1**. Vì thế dòng "phần app" mới là so sánh công bằng — 390 MB vs 167 MB, tức **2,3×**,
đúng khoảng "2–3× nhẹ hơn" mà `PROJECT_CONTEXT.md` §4 đã ước tính.

## Chưa đo được

| Hạng mục | Vì sao |
|---|---|
| A3 throughput của WaveTerm | ⛔ MANUAL — phải gõ lệnh vào cửa sổ WaveTerm, không tự động hoá được |
| RAM đỉnh của WaveTerm lúc đổ 47,7 MB | ⛔ MANUAL — cùng lý do |

Cách làm thủ công: mở WaveTerm, gõ `Get-Content (Join-Path $env:TEMP 'big.txt') -Raw`, bấm giờ,
và chạy song song đoạn poll `WorkingSetPrivate` trong `measure.ps1` để lấy đỉnh.
Đây là số **quyết định** cho A3 — 725 MB đỉnh của spike chưa biết là tốt hay tệ khi thiếu nó.
