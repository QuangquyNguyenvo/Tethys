# UX stability & soft polish — Checklist

> File duy nhất được sửa để cập nhật tiến độ.

## Quy tắc thực thi

1. Làm đúng 1 phase mỗi lần; đọc code thật trước khi sửa.
2. Code khác plan thì ghi Deviations và dừng phần bị lệch.
3. Không refactor ngoài scope, không xoá code chưa hiểu, không commit.
4. Sau mỗi phase chạy build/check và manual criteria.

## Thứ tự

`1 → 2` — hành vi/persistence ổn trước khi polish.

| # | Phase | Phạm vi | Rủi ro | Trạng thái |
|---|---|---|---|---|
| 1 | `phase-01-reliability-navigation.md` | mục 1, 2, 5, 8 | 🔴 | ✅ |
| 2 | `phase-02-responsive-soft-ui.md` | mục 3, 4, 6, 7 | 🟠 | ✅ |

⬜ chưa làm · 🟡 đang làm · ✅ xong & verify · ⚠️ có deviation

## Xong một phase

- [x] Acceptance/manual criteria đã ghi kết quả.
- [x] `npm run build` và `npm run check` PASS.
- [x] Deviations đã điền; bảng phase/session log đã cập nhật.

## Session log

| Ngày | Phase | Model | Kết quả |
|---|---|---|---|
| 2026-08-23 | 1 | Codex | Build/check/cargo PASS; native window/logo wiring hoàn tất, 2 tiêu chí runtime giữ `⛔ MANUAL`. |
| 2026-08-23 | 2 | Codex | Build/check PASS; browser QA Settings/Explorer ở 360px và 900px; các mục cần IPC giữ `⛔ MANUAL`. |

## Deviations tổng hợp

> Phase 2: plan gọi Preview scroll container là `.preview-body`, code thật dùng `.pv`;
> CSS target `.pv` để không đổi DOM vô ích.
