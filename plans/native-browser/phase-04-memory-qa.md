# Phase 4 — Giới hạn tài nguyên và đo QA

> **Prereq**: phase 3 ✅ | **Rủi ro**: 🔴 | **Rollback**: checkout các file phase
> **Files đụng tới**: `app/src-tauri/src/browser.rs`, `app/src/web/nativeBrowser.ts`, `app/src/web/NativeBrowserSurface.tsx`, `app/scripts/check-memory.mjs`, `plans/native-browser/CHECKLIST.md`.

## Context recovery

Đọc context/checklist, memory hooks hiện có trong `lib.rs`, và baseline terminal-workspace. Không trộn `MemoryUsageTargetLevel.Low` với `TrySuspend` trên cùng webview.

## Goal

Giữ browser gần native nhưng có trần RAM dự đoán được: visible = Normal, hidden = Low; pool/LRU đóng surface cũ khi vượt giới hạn. Ghi số đo thực tế, không ước lượng.

## KHÔNG đụng vào

- Thay engine, proxy network, adblock/extensions.

## Change

- Một registry theo panel/label; không tạo trùng trong StrictMode/HMR.
- Panel visible dùng Normal; hidden dùng Low. Sau ngưỡng idle và vượt pool cap, đóng LRU thay vì giữ vô hạn.
- Thêm counters/log hook chỉ bật qua env để test số native windows và lifecycle.
- Đo cold start, 1 browser Wikipedia/GitHub, 3 browser, hide/show, close-all; ghi working set và process count vào checklist.

## Verify

```powershell
cd app
npm run build
npm run check
cd src-tauri
cargo check
```

## Acceptance criteria

- [ ] Không quá một native window cho mỗi panel.
- [ ] Close panel/workspace đưa count về đúng mức.
- [ ] Hidden panel hạ memory target; visible panel khôi phục Normal.
- [ ] Số RAM trước/sau và cách đo được ghi trong session log/deviation.
- [ ] ⛔ MANUAL — 30 phút browse/resize/switch workspace không có ghost window, blank surface hoặc focus trap.

## Gotchas

- WebView2 chia sẻ browser process nhưng mỗi controller vẫn có renderer/cost riêng.
- Không báo con số RAM nếu chưa đo cả process tree.

## Deviations

1. **Không có idle-timeout.** `Tiles` unmount panel web ngay khi workspace ẩn
   (`shouldRenderPanel = visible || isTerminal`), nên panel "hidden" chỉ tồn tại trong
   vài giây một modal đang mở. Ngưỡng idle ở đó sẽ là code không bao giờ chạy. Thay vào
   đó pool đặt trần tổng số overlay (`MAX_NATIVE_SURFACES = 4`) và park panel ít dùng
   nhất khi vượt trần; panel bị park quay về iframe và có nút bật lại.
2. **Chưa có số RAM.** Cần chạy app thật rồi đo cả process tree; không ghi ước lượng.
   Bật `TETHYS_BROWSER_STATS` để `browser_stats` trả về danh sách cửa sổ overlay thật,
   và `localStorage['tethys:browser-debug']='1'` để thấy log claim/park/release của pool.
3. Mục ⛔ MANUAL 30 phút chưa chạy.

