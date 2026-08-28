# Native browser — Checklist & trạng thái

> File **DUY NHẤT** được phép sửa để cập nhật tiến độ.

## Quy tắc bắt buộc cho model thực thi

1. Làm **đúng 1 phase** mỗi lần. Không làm trước phase sau.
2. Đọc code thật trước khi edit. Code thật khác plan → dừng và ghi deviation.
3. Không refactor ngoài scope; không xoá code chưa hiểu.
4. Không bật `tauri/unstable` hoặc dùng lại child Webview.
5. Không commit trừ khi user yêu cầu.

## Thứ tự thực thi

`1 → 2 → 3 → 4`. Phase 1 là cổng khả thi: nếu URL remote không render, dừng thiết kế overlay trước khi viết bridge.

## Bảng phase

| # | Phase | Rủi ro | Prereq | Trạng thái |
|---|---|---|---|---|
| 1 | Native overlay viability | 🔴 | — | ⚠️ |
| 2 | Navigation bridge & page state | 🔴 | 1 | ⚠️ |
| 3 | Shell integration & overlays | 🔴 | 2 | ⚠️ |
| 4 | Pool, memory policy & QA | 🔴 | 3 | ⚠️ |

⚠️ ở đây có **một nghĩa duy nhất**: code đã viết xong và mọi tiêu chí kiểm được bằng máy
đều pass, nhưng các tiêu chí đánh ⛔ MANUAL chưa ai ngồi trước màn hình xác nhận. Xem
"Việc còn lại" bên dưới.

⬜ chưa làm · 🟡 đang làm · ✅ xong & verify · ⚠️ xong nhưng có deviation

## Định nghĩa "xong 1 phase"

- [ ] Acceptance criteria đã tick, hoặc ghi rõ mục không kiểm được và vì sao.
- [ ] Smoke test dự án vẫn chạy.
- [ ] Deviations của phase đã điền.
- [ ] Bảng và session log đã cập nhật.

## Session log

| Ngày | Phase | Model | Kết quả |
|---|---|---|---|
| 2026-08-28 | 1 | Opus 5 | Code phase 1 đã có sẵn từ trước; chạy lại `npm run build` + `npm run check` — pass. Không sửa gì. |
| 2026-08-28 | 2 | Opus 5 | Thêm `src-tauri/src/browser.rs` (7 command + 5 event WebView2), `src/web/nativeBrowser.ts`, sửa `WebPanel`/`NativeBrowserSurface` để điều hướng tại chỗ. `cargo check`, `npm run build`, `npm run check` — pass. |
| 2026-08-28 | 3 | Opus 5 | Thêm `src/web/surfaceVisibility.ts`, blocker cho palette/settings, forward phím tắt từ trang qua AcceleratorKeyPressed, popup ra trình duyệt ngoài, ProcessFailed → fallback. Pass. |
| 2026-08-28 | 4 | Opus 5 | Thêm `src/web/surfacePool.ts` (trần 4 overlay, LRU park), memory target theo trạng thái che, command `browser_stats` sau env flag. Pass. **Chưa đo RAM thật.** |

## Việc còn lại (không kiểm được bằng máy)

Phải chạy `npm run tauri dev` và ngồi xác nhận bằng mắt:

1. GitHub/MDN hiển thị trong tile, không có entry mới ở taskbar/Alt+Tab.
2. Move/resize cửa sổ chính → nội dung native bám đúng tile; đóng tile → cửa sổ native biến mất.
3. Bấm link trong trang → thanh địa chỉ và tiêu đề đổi theo; back/forward/reload không tạo cửa sổ mới.
4. Mở Command Palette / Settings → modal nằm **trên** trang web.
5. Ctrl+K và Alt+<số> hoạt động khi con trỏ đang ở trong trang.
6. Đo working set + số process trước/sau: cold start, 1 browser, 3 browser, hide/show, close-all.
7. 30 phút browse/resize/switch workspace: không ghost window, không surface trắng, không kẹt focus.

Bật hook đếm cửa sổ cho mục 6–7:
`$env:TETHYS_BROWSER_STATS=1; $env:TETHYS_BROWSER_STATS_LOG="$env:TEMP\tethys-browser.log"`
rồi gọi `browser_stats` từ console, và `localStorage.setItem("tethys:browser-debug","1")`
để thấy log lifecycle của pool.

## Sửa sau khi chạy thật (2026-08-28)

Ảnh chụp lần chạy đầu cho thấy overlay tràn ra ngoài tile. Hai lỗi chồng nhau:

1. **Sai gốc toạ độ.** Dùng `outerPosition()` — hình chữ nhật của *cả cửa sổ*, trên Windows
   còn tính cả viền kéo giãn vô hình — trong khi `getBoundingClientRect()` lấy mốc là góc
   vùng client. Lệch vài pixel theo cả hai chiều. Nay dùng `innerPosition()`.
   `CONTEXT.md` mục 5 chỉ lập luận rằng không cần bù *titlebar*; điều đó vẫn đúng, nhưng
   viền kéo giãn thì vẫn phải bù, và cách bù đúng là đổi API chứ không phải cộng trừ tay.
2. **Chỉ theo dõi đổi kích thước, không theo dõi dời chỗ.** `ResizeObserver` mù với việc
   panel trượt sang chỗ khác lúc split, đóng panel hàng xóm hay đổi workspace. Nay đo lại
   mỗi khung hình bằng `requestAnimationFrame`, và chỉ phát IPC khi số đo thật sự khác lần
   trước — đứng yên thì vòng lặp chỉ tốn một `getBoundingClientRect()`.

Kèm theo: overlay là cửa sổ vuông dán vào thẻ panel bo 18px nên thò ra hai tai vuông ở đáy.
Thêm command `browser_round_corners` cắt cửa sổ bằng GDI region — bo hai góc dưới, để vuông
hai góc trên vì chúng nằm sát thanh địa chỉ. Region tính theo kích thước cửa sổ nên được
dựng lại mỗi lần overlay đổi cỡ.

### Dock và thanh trên bị overlay che

Cửa sổ owned luôn được Windows vẽ trên owner của nó, nên mọi UI của shell nổi trên canvas
đều bị trang web che. Với modal (palette, settings) thì giấu cả overlay là đúng — chúng
chiếm hết màn hình và người dùng không đọc trang lúc đó. Với dock và thanh trên tự ẩn thì
sai: chúng nhỏ, xuất hiện theo con trỏ, và giấu cả trang mỗi lần rê chuột xuống đáy thì
trang chớp tắt liên tục.

Cách làm: **khoét lỗ**. Hòn đảo tự đăng ký phần tử của nó (`shellFloatRef`), surface đo
giao của nó với tile mỗi khung hình, và `browser_set_shape` trừ vùng đó khỏi GDI region của
cửa sổ. Đảo lộ ra, bấm được, trang không phải vẽ lại — đổi region không gây reflow.

Đánh đổi phải biết: chỗ bị khoét là *mất hẳn* nội dung trang, nên nền kính của dock lấy mẫu
từ nền panel chứ không phải từ trang. Với dock toàn ô màu đặc thì không nhận ra.

## Deviations tổng hợp

1. **Token COM không được tháo thủ công** (phase 2). `ICoreWebView2` không `Send` nên không
   giữ được ngoài main thread. WebView2 tự giải phóng handler khi controller của cửa sổ bị
   huỷ; registry chỉ quên label để label dùng lại vẫn attach được.
2. **`lib.rs` phải sửa ngoài dự kiến** (phase 2). `on_window_event` trước đây gọi
   `mgr.kill_all()` cho *mọi* cửa sổ — có overlay rồi thì đóng một Browser panel sẽ giết
   sạch PTY. Nhánh `Focused` cũng hạ mục tiêu bộ nhớ nhầm cửa sổ. Cả hai nay hỏi `label`.
3. **Không ẩn overlay khi main window mất focus** (phase 3). Overlay được main window sở
   hữu nên Windows tự ẩn/hiện nó theo owner khi minimize, và nó không bao giờ nổi trên app
   khác. Ẩn theo blur sẽ tạo vòng lặp: bấm vào trang → main mất focus → ẩn trang.
4. **`Tiles.tsx` nằm ngoài danh sách file của phase 3** nhưng phải sửa: `suppressed` chỉ có
   thể tính từ chỗ biết `visible` và `workspaceMotion`.
5. **Phím tắt forward bằng allowlist trong Rust** (phase 3), rồi main shell dựng lại
   `KeyboardEvent` — thay vì nhân bản bảng phím tắt sang Rust. Bảng trong `App.tsx` vẫn là
   nguồn sự thật duy nhất. Đổi phím tắt ở `App.tsx` mà quên `shell_shortcut` thì phím đó
   sẽ không hoạt động khi focus nằm trong trang.
6. **LRU là trần tổng số, không phải idle-timeout** (phase 4). `Tiles` đã unmount panel web
   khi workspace ẩn (`shouldRenderPanel = visible || isTerminal`), nên "hidden panel" chỉ
   còn nghĩa là bị modal che — một trạng thái tính bằng giây. Idle-timeout ở đó là code
   chết. Trần `MAX_NATIVE_SURFACES = 4` mới là thứ thật sự chặn được nhiều renderer.
7. **Chưa có số RAM** (phase 4). Cần chạy app thật; không ghi con số ước lượng.

