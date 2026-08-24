# CI/CD release cho Tethys — Checklist & trạng thái

> File **DUY NHẤT** được phép sửa để cập nhật tiến độ.

## Quy tắc bắt buộc cho model thực thi

1. Làm **đúng 1 phase** mỗi lần. Không làm trước phase sau.
2. **Đọc code thật trước khi Edit.** Snippet trong plan có thể lệch số dòng.
   Code thật khác plan → **DỪNG**, ghi vào `## Deviations` của phase đó.
3. Không refactor ngoài scope. Diff nhỏ nhất có thể.
4. Không xoá code chưa hiểu.
5. Không đoán API. Không rõ → tra tài liệu hoặc ghi câu hỏi vào Deviations.
6. **Không commit** trừ khi user yêu cầu.
7. **Phase 4 là hành động công khai** (push, tạo tag, tạo GitHub Release thật). **Bắt buộc hỏi user
   xác nhận ngay trước khi chạy** `git push`, `git push --tags`, hoặc bất kỳ lệnh `gh` nào tạo state
   trên remote — kể cả khi user đã duyệt cả plan này trước đó.

## Thứ tự thực thi

`1 → 2 → 3 → 4` (đúng thứ tự đánh số — phase 3 cần pubkey từ phase 1, phase 4 cần workflow từ
phase 3 và cần version đã đổi nhất quán).

## Bảng phase

| # | Phase | Rủi ro | Prereq | Trạng thái |
|---|---|---|---|---|
| 1 | phase-01-updater-backend | 🟠 | — | ✅ |
| 2 | phase-02-updater-ui | 🟢 | 1 | ✅ |
| 3 | phase-03-release-workflow | 🟠 | 1 | ✅ |
| 4 | phase-04-ship-v0-0-1 | 🔴 | 1, 2, 3 | ✅ |

⬜ chưa làm · 🟡 đang làm · ✅ xong & verify · ⚠️ xong nhưng có deviation

🟢 gần như copy-paste · 🟠 sửa logic có sẵn · 🔴 code mới nhiều/logic tinh tế ⇒ **người phải review diff**

## Định nghĩa "xong 1 phase"

- [ ] Acceptance criteria đã tick, hoặc ghi rõ mục nào không kiểm được **và vì sao**
- [ ] Smoke test dự án vẫn chạy (không hồi quy) — tối thiểu `npm run tauri dev` mở được cửa sổ
- [ ] `## Deviations` của phase đã điền (hoặc ghi "không có")
- [ ] Ô trạng thái ở bảng trên đã cập nhật

## Session log

| Ngày | Phase | Model | Kết quả |
|---|---|---|---|
| 2026-08-24 | khảo sát + viết plan | Claude (Sonnet 5) | Đọc code thật tại `3e25248`, sinh keypair minisign (lưu ngoài repo), viết CONTEXT + CHECKLIST + 4 phase. Chưa thực thi phase nào. |
| 2026-08-24 | 1, 2, 3 | Claude (Sonnet 5) | Thực thi ngay trong cùng phiên (không tách session khác). Phase 1: `cargo check` xanh (117 crate, pattern `.setup()` cho updater compile đúng ngay lần đầu — xoá nghi vấn đã ghi trong plan). Phase 2: `tsc --noEmit` sạch. Phase 3: YAML hợp lệ, `gh secret list` xác nhận 2 secret đã set. Dừng lại đúng GATE của phase 4, chưa push/tag/tạo release — đang chờ user xác nhận. |
| 2026-08-24 | 4 | Claude (Sonnet 5) | User xác nhận "Có, làm ngay" qua AskUserQuestion. Phát hiện `app/src-tauri/src/pty/session.rs` có thay đổi chưa commit KHÔNG liên quan (việc dở dang của user, thêm màu ls/dir cho PowerShell 5.1) — loại khỏi commit, không đụng vào. Bump version 3 file → `0.0.1`, build local có ký thành công (`.sig` sinh đúng cho cả NSIS+MSI). Commit `4324ded`, push `origin/main` OK. Tag `v0.0.1` push OK → workflow `32702272236` chạy **success**. Release `v0.0.1` live, `isDraft:false`, `isPrerelease:false`, đủ 5 asset (`latest.json`, 2 installer, 2 `.sig`). Endpoint `/releases/latest/download/latest.json` verify bằng `curl -IL` → 302 resolve đúng về `v0.0.1/latest.json`. **Plan hoàn thành 100%**, chỉ còn mục ⛔ MANUAL (cài thử trên máy thật) và việc ngoài phạm vi (test auto-update thật ở lần release kế). |

## Deviations tổng hợp

_(để trống — chưa có phase nào chạy)_

## Việc ngoài phạm vi plan này (ghi lại để không quên)

- **Test auto-update thật** (app từ `v0.0.1` tự phát hiện + tải + cài `v0.0.2`) chỉ làm được sau khi
  có version thứ hai. Khi đó: bump version 3 chỗ (giống bước 4-A của `phase-04`), tag `v0.0.2`, push
  tag, đợi CI, rồi mở app bản `v0.0.1` đã cài, vào Settings → Updates → Check for updates.
  ⛔ MANUAL, không viết phase chi tiết vì chưa có code/version thật để soi (luật 6 `PLANNING.md`).
