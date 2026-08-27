# Material You Expressive motion — Checklist & trạng thái

> Đây là file **DUY NHẤT** được phép sửa để cập nhật tiến độ plan.

## Quy tắc bắt buộc cho model thực thi

1. Làm **đúng 1 phase** mỗi lần. Không làm trước phase sau.
2. Đọc `CONTEXT.md`, file phase và code thật trước khi edit. Code khác plan thì **dừng phần
   bị lệch** và ghi vào `## Deviations` của phase.
3. Không reset/revert working tree. Không refactor ngoài scope. Không xoá code chưa hiểu.
4. Không thêm dependency. Không commit trừ khi user yêu cầu.
5. Không tuyên bố QA native đã đạt dựa trên Vite preview.
6. Sau phase có code: chạy `npm run build` và `npm run check`.
7. Khi manual test bị user giành focus/chuột, dừng automation; ghi mục đó là `⛔ MANUAL`.

## Thứ tự thực thi

`1 → 2 → 3 → 4 → 5 → 6 → 7`

Overlay correctness, gesture lifecycle và compositor cleanup đi trước vì audit đã tìm thấy
lỗi thật. Fixture browser sau đó cho model rẻ nhìn workspace motion mà không cần ConPTY.
Guard khóa invariant. Native QA xác nhận WebView2 thật. Skill cuối chỉ chứa điều đã qua QA.

## Bảng phase

| # | Phase | Rủi ro | Prereq | Trạng thái |
|---|---|---|---|---|
| 1 | `phase-01-overlay-accessibility.md` | 🟠 | — | ✅ |
| 2 | `phase-02-gesture-lifecycle.md` | 🟠 | 1 | ✅ |
| 3 | `phase-03-compositor-cleanup.md` | 🟠 | 2 | ✅ |
| 4 | `phase-04-browser-motion-fixture.md` | 🟠 | 3 | ✅ |
| 5 | `phase-05-motion-regression-guards.md` | 🟢 | 4 | ⚠️ |
| 6 | `phase-06-native-motion-qa.md` | 🔴 | 5 | ⚠️ |
| 7 | `phase-07-repo-ui-ux-skill.md` | 🟢 | 6 | ✅ |

⬜ chưa làm · 🟡 đang làm · ✅ xong & verify · ⚠️ xong nhưng có deviation

## Gợi ý chạy tiết kiệm

| Phase | Loại người/model phù hợp | Effort hợp lý |
|---|---|---|
| 1 | Coding model đọc tốt React accessibility | medium |
| 2 | Coding model đọc tốt pointer lifecycle | medium |
| 3 | Coding model CSS/compositor cơ bản | medium |
| 4 | Coding model TypeScript cơ bản | low–medium |
| 5 | Coding model nhẹ, làm static assertions | low |
| 6 | Người dùng hoặc agent có nhìn/điều khiển app native | manual; chỉ gọi model code khi có bug |
| 7 | Model nhẹ có `skill-creator` | low–medium |

Không cần giao toàn bộ plan cho một lượt Ultra. Mỗi lượt chỉ nạp `CONTEXT.md`,
`CHECKLIST.md` và đúng một file phase.

## Định nghĩa "xong 1 phase"

- [ ] Acceptance criteria đã tick, hoặc ghi rõ mục không kiểm được và lý do.
- [ ] Smoke test dự án vẫn chạy.
- [ ] `## Deviations` của phase ghi “không có” hoặc mô tả cụ thể.
- [ ] Bảng phase và session log bên dưới đã cập nhật.
- [ ] `git status --short` không mất bất kỳ file bẩn nào đã có trước phase.

## Baseline first pass (đã xong trước plan)

- [x] Shared workspace pill, dock wave, modal/palette presence structure.
- [x] Transform-only titlebar auto-hide; terminal-safe workspace motion.
- [x] RAF panel drag; FLIP/workspace cleanup hardening.
- [x] Browser QA `1280×720`, `640×400`, `360×760`.
- [x] `npm run build`, `npm run check`, `cargo check` PASS.

Audit phase 1–5 đã đóng bằng code, browser QA và regression guards. Native interaction còn
được giữ rõ là `⛔ MANUAL` trong phase 6, không suy ra từ browser QA.

## Phase 6 — Native QA record

> Chỉ điền khi thực thi phase 6. Dùng `PASS`, `FAIL` hoặc `⛔ MANUAL`; không sửa matrix trong
> file phase.

| Mode | Dark | Blur | Kích thước | Kết quả / ghi chú |
|---|---|---|---|---|
| Glass | on | on | `1280×800` | PASS native boot/render ở `1283×802`, 100% DPI; TonalSpot, wallpaper và WebView2 surface hiển thị đúng. Motion interaction: ⛔ MANUAL. |
| Glass | on | off | `1280×800` | ⛔ MANUAL — không được bơm input vào ứng dụng terminal bằng Computer Use. |
| Flat | on | n/a | `1280×800` | ⛔ MANUAL — không được bơm input vào ứng dụng terminal bằng Computer Use. |
| Glass | off | on | `640×400` | ⛔ MANUAL — cần resize và đổi appearance trực tiếp trong app native. |
| Flat | off | n/a | `640×400` | ⛔ MANUAL — cần resize và đổi appearance trực tiếp trong app native. |
| Reduced motion | theo OS | theo mode hiện tại | native | ⛔ MANUAL — không thay đổi Windows accessibility setting; môi trường chưa được xác nhận đang bật reduced motion. |

## Session log

| Ngày | Phase | Model | Kết quả |
|---|---|---|---|
| 2026-08-27 | Baseline first pass | Codex | Build/check/cargo PASS; browser responsive + dock/palette QA; native surface dựng được, interaction native còn manual. |
| 2026-08-27 | Phase 1 | Codex | Typecheck/build/check/diff PASS. Browser PASS: Settings + Palette focus trap/restore, inert exit, backdrop hit-test, palette 3px selected transform/focus ring và 10× rapid reopen. Reduced-motion CSS + JS branch đã kiểm bằng source; ⛔ MANUAL: chưa emulate OS reduced motion trong browser hiện tại. Không có deviation. |
| 2026-08-27 | Phase 2 | Codex | Typecheck/build/check/diff PASS. Panel drag và gutter resize có cleanup idempotent cho up/cancel/gesture mới/unmount; pointer-up giữ pending cuối, cancel không commit. Browser PASS: gutter unmount giữa gesture khi đổi workspace xoá `body.resizing-layout`; panel drag thường kết thúc không còn ghost/body class. ⛔ MANUAL native: ép panel unmount đúng giữa pointer hold và pointercancel phần cứng. Không có deviation. |
| 2026-08-27 | Phase 3 | Codex | Typecheck/build/check/diff PASS. Browser computed-style PASS: panel chỉ transition border, dot slot cố định 17px và title không xê dịch khi đổi focus, shared pill `contain: layout paint` + `will-change: transform`, reveal shadow neutral. ⛔ MANUAL/deferred phase 4+6: interrupted switch, tab bar scroll và reduced-motion pill với nhiều workspace. Không có deviation. |
| 2026-08-28 | Phase 4 | Codex | Typecheck/build/check/diff PASS. Vite fixture có `Workspace 1` + `Motion Lab`; switch ngắt quãng 10× không trắng/stuck, Add tạo Explorer thứ ba và 0 terminal. Viewport 360px với 8 tab: scroll hai chiều, pill bám đúng active offset. Native default terminal giữ bằng source invariant; ⛔ MANUAL xác nhận trực tiếp trong phase 6. Không có deviation. |
| 2026-08-28 | Phase 5 | Codex | `check-ux`, toàn bộ `npm run check`, build và diff-check PASS. Guard mới khóa overlay click/focus/inert, reduced-motion delay/wait, drag + gutter cleanup, panel/dot paint, shared-pill containment và fixture browser; assertion F5/F11/fullscreen/release cũ giữ nguyên. ⚠️ Deviation: dùng khối reduced-motion cuối thay vì khối đầu vì CSS có một media query cũ dành riêng cho sysfetch nằm trước policy motion toàn cục. |
| 2026-08-28 | Phase 6 | Codex | Native Tauri/WebView2 boot PASS; capture `1283×802`, Windows 100%/96 DPI, wallpaper hệ thống, TonalSpot dark + glass + blur/vibrancy on. State khởi động có workspace trống nên PTY spawn chưa được quan sát. Build/check/cargo/diff-check PASS; không sửa code sản phẩm. ⚠️ Titlebar/workspace/hidden PTY/dock/drag/overlay/focus và các mode còn lại là ⛔ MANUAL vì Computer Use cấm bơm input vào ứng dụng terminal; không suy diễn từ screenshot/Vite. |
| 2026-08-28 | Phase 7 | Codex | Tạo repo skill `tethys-ui-ux` với entrypoint 14 dòng, design language 81 dòng và QA matrix 55 dòng. Skill validator, path/content guard, build, check và cargo PASS; không có absolute path, UI hex mới hay binary. Native PASS/MANUAL boundary từ phase 6 được giữ nguyên. Không có deviation. |

## Deviations tổng hợp

> Phase 5: snippet plan dùng lần xuất hiện đầu tiên của `prefers-reduced-motion`, nhưng
> `App.css` có một khối sysfetch cũ nằm trước policy toàn cục. Guard dùng `lastIndexOf` để
> kiểm đúng khối xóa animation/transition delay; không sửa code sản phẩm để chiều regex.
>
> Phase 6: QA read-only xác nhận Tauri/WebView2 native boot và mode hiện tại, nhưng chính sách
> an toàn của Computer Use không cho tự động hoá input trong ứng dụng terminal. Các tiêu chí
> cần chuột/phím, terminal workload, resize giữa transition hoặc đổi appearance được ghi
> `⛔ MANUAL`; không có bug sản phẩm nào được quan sát để tạo phase fix.
