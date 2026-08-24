# Phase 4 — Bump version, push, tag `v0.0.1`, verify release

> **Prereq**: phase 1, 2, 3 xong (✅ ở `CHECKLIST.md`) | **Rủi ro**: 🔴 — hành động công khai,
> không rollback bằng `git checkout` được sau khi push | **Rollback nếu lỡ push sai**: xem mục
> "Nếu cần huỷ" ở cuối file — KHÔNG dùng `git push --force` hay xoá tag đã có người khác thấy mà
> không hỏi user trước.
> **Files đụng tới**: `app/src-tauri/tauri.conf.json`, `app/src-tauri/Cargo.toml`, `app/package.json`
> — *không* file nào khác. (Ngoài ra: các file đã sửa ở phase 1–3 được **commit** ở phase này, nhưng
> không **sửa thêm** gì ở chúng.)

## Context recovery

Đọc toàn bộ `CONTEXT.md` (đặc biệt §1 định nghĩa "xong", §7 quyết định prerelease). Đọc
`CHECKLIST.md` mục Quy tắc — **luật 7 áp dụng trực tiếp cho phase này**: phải hỏi user xác nhận
ngay trước `git push`, `git push --tags`, và trước khi tag được tạo — kể cả khi cả phiên hội thoại
trước đó user đã nói "làm đi" một cách chung chung. Xác nhận đó là cho **kế hoạch**, không phải cho
**hành động không thể rút lại** này.

## Goal

Sau phase này: GitHub có tag `v0.0.1`, Release `v0.0.1` công khai (không draft, không prerelease —
lý do ở `CONTEXT.md` §7) với đủ asset, và workflow `release.yml` đã chạy xanh ít nhất 1 lần.

## KHÔNG đụng vào

- Không sửa lại code ở phase 1/2/3 — nếu phát hiện lỗi lúc này, quay lại đúng phase đó sửa, ghi
  Deviations ở phase đó, đừng vá tạm trong phase 4.
- Không thêm job/step mới vào `release.yml` — nếu workflow fail, chẩn đoán và sửa **tối thiểu**,
  ghi vào Deviations của `phase-03`, không mở rộng scope.

## Bước 4-A — Bump version 3 chỗ (0.1.0 → 0.0.1)

Cả 3 file hiện đang ghi `0.1.0` (version đặt lúc scaffold ban đầu, chưa từng release). User yêu cầu
rõ bản đầu tiên là `0.0.1` (beta) — đây không phải hạ version một bản đã public, vì **chưa có
release nào tồn tại**.

### Current code (`app/src-tauri/tauri.conf.json`, dòng 1–5), nguyên văn
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Tethys",
  "version": "0.1.0",
  "identifier": "com.tethys.app",
```
### Change
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Tethys",
  "version": "0.0.1",
  "identifier": "com.tethys.app",
```

### Current code (`app/src-tauri/Cargo.toml`, dòng 1–6), nguyên văn
```toml
[package]
name = "app"
version = "0.1.0"
description = "A Tauri App"
authors = ["you"]
edition = "2021"
```
### Change
```toml
[package]
name = "app"
version = "0.0.1"
description = "A Tauri App"
authors = ["you"]
edition = "2021"
```

### Current code (`app/package.json`, dòng 1–4), nguyên văn
```json
{
  "name": "tethys",
  "private": true,
  "version": "0.1.0",
```
### Change
```json
{
  "name": "tethys",
  "private": true,
  "version": "0.0.1",
```

### Verify
```bash
cd app/src-tauri && cargo check
```
Kỳ vọng: vẫn `Finished`, không lỗi (đổi version không ảnh hưởng compile).

## Bước 4-B — Build thử local với version mới trước khi push

Không bắt buộc về mặt kỹ thuật, nhưng rẻ và bắt lỗi sớm hơn nhiều so với chờ CI (build release
local từng chạy thành công 1 lần trong phiên khảo sát plan này, ở version `0.1.0` — giờ verify lại
với `0.0.1` + code mới từ phase 1/2).

```bash
cd app && npm run tauri build
```

### Verify
```bash
ls app/src-tauri/target/release/bundle/nsis/Tethys_0.0.1_x64-setup.exe
ls app/src-tauri/target/release/bundle/msi/Tethys_0.0.1_x64_en-US.msi
ls app/src-tauri/target/release/bundle/nsis/Tethys_0.0.1_x64-setup.exe.sig
```
File `.sig` **chỉ xuất hiện nếu** biến môi trường `TAURI_SIGNING_PRIVATE_KEY` có sẵn lúc build local
— nếu build local KHÔNG set biến đó, sẽ không có `.sig`, đây là bình thường (không phải lỗi, CI mới
là nơi set secret). Nếu muốn tự verify `.sig` sinh đúng trước khi lên CI:
```bash
SCRATCH="<đường dẫn scratchpad — xem CONTEXT.md §5.2>"
TAURI_SIGNING_PRIVATE_KEY="$(cat "$SCRATCH/tethys_updater.key")" \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(cat "$SCRATCH/tauri_updater_key.password.txt")" \
npm run tauri build
```

## ⛔ GATE — Bắt buộc dừng và hỏi user trước khi làm Bước 4-C trở đi

Trước khi chạy bất kỳ lệnh nào ở 4-C/4-D/4-E, in ra cho user:
1. Danh sách commit sẽ push lên `origin/main` (3 commit cũ đang chờ + commit mới của phase 1–4).
2. Xác nhận tag sẽ tạo là `v0.0.1`.
3. Xác nhận Release sẽ **công khai ngay, không draft, không đánh dấu prerelease** (theo
   `CONTEXT.md` §7) — nói rõ đây là lựa chọn có chủ đích, không phải quên tick.

Chỉ tiếp tục khi user xác nhận rõ ràng (không suy luận từ "làm đi" nói ở một task khác trước đó).

## Bước 4-C — Commit

```bash
cd D:/Code/Project/Tethys
git status --short
git add app/src-tauri/Cargo.toml app/src-tauri/Cargo.lock app/src-tauri/tauri.conf.json \
  app/src-tauri/capabilities/default.json app/src-tauri/src/lib.rs app/src-tauri/.gitignore \
  app/package.json app/package-lock.json app/src/settings/SettingsPanel.tsx \
  .github/workflows/release.yml plans/tethys-release-cicd/
git status --short
```
Đọc kỹ output `git status --short` lần 2 — nếu có file KHÔNG nằm trong danh sách trên xuất hiện ở
staged area, DỪNG, đó là deviation (nghĩa là có thay đổi ngoài ý muốn từ phase trước).

```bash
git commit -m "feat: add updater + release CI for v0.0.1"
```

### Verify
```bash
git log -1 --stat
```
Kỳ vọng: đúng các file ở trên, không file lạ.

## Bước 4-D — Push commit lên `origin/main`

**Chỉ chạy sau khi qua GATE ở trên.**

```bash
git push origin main
```

### Verify
```bash
git log origin/main..HEAD --oneline
```
Kỳ vọng: **rỗng** (không còn commit nào local vượt trước remote).

## Bước 4-E — Tạo và push tag `v0.0.1`

```bash
git tag -a v0.0.1 -m "Tethys v0.0.1 — beta"
git push origin v0.0.1
```

### Verify
```bash
gh run list --repo QuangquyNguyenvo/Tethys --workflow=release.yml --limit 1
```
Kỳ vọng: có 1 run mới, status `in_progress` hoặc `queued`, event `push`, liên kết tới tag `v0.0.1`.

## Bước 4-F — Theo dõi workflow tới khi xong

```bash
gh run watch --repo QuangquyNguyenvo/Tethys $(gh run list --repo QuangquyNguyenvo/Tethys --workflow=release.yml --limit 1 --json databaseId --jq '.[0].databaseId')
```
Build release trên `windows-latest` (Rust release build lần đầu trên runner sạch, không có cache)
thường mất **10–20 phút** — không phải bị treo.

### Nếu fail
Đọc log bằng:
```bash
gh run view --repo QuangquyNguyenvo/Tethys --log-failed $(gh run list --repo QuangquyNguyenvo/Tethys --workflow=release.yml --limit 1 --json databaseId --jq '.[0].databaseId')
```
Lỗi hay gặp nhất (theo kinh nghiệm chung với `tauri-action`, ghi lại để không phải đoán lại):
- `TAURI_SIGNING_PRIVATE_KEY` sai/rỗng → build vẫn ra installer nhưng KHÔNG ra `.sig`/`latest.json`,
  log có dòng cảnh báo liên quan "updater" hoặc "signature" — quay lại `phase-03` bước 3-B, kiểm
  `gh secret list` còn đủ 2 secret không.
- `npm install` fail vì thiếu `package-lock.json` đồng bộ — kiểm `app/package-lock.json` có được
  add ở bước 4-C không.
- Không tìm thấy `app/src-tauri/tauri.conf.json` → sai `projectPath` trong `release.yml`, phải là
  `app` (không phải `app/src-tauri` hay rỗng).

Sửa lỗi → ghi vào `## Deviations` bên dưới → sửa file liên quan (thường là `phase-03` nếu lỗi ở
workflow, không sửa `phase-04`) → tạo commit fix mới (KHÔNG amend, KHÔNG xoá tag) → tag mới vd
`v0.0.2` nếu cần build lại (tag `v0.0.1` một khi đã push và tạo release thì để nguyên, đừng
force-push đè lên nó).

## Bước 4-G — Verify Release có đủ asset

```bash
gh release view v0.0.1 --repo QuangquyNguyenvo/Tethys --json assets --jq '.assets[].name'
```

## Acceptance criteria

- [ ] `gh run list --repo QuangquyNguyenvo/Tethys --workflow=release.yml --limit 1 --json conclusion --jq '.[0].conclusion'` → `success`
- [ ] `gh release view v0.0.1 --repo QuangquyNguyenvo/Tethys --json assets --jq '.assets[].name'` liệt
      kê đủ: `Tethys_0.0.1_x64-setup.exe`, `Tethys_0.0.1_x64-setup.exe.sig`,
      `Tethys_0.0.1_x64_en-US.msi`, `latest.json`
- [ ] `gh release view v0.0.1 --repo QuangquyNguyenvo/Tethys --json isDraft,isPrerelease` → cả hai
      `false`
- [ ] `curl -sIL https://github.com/QuangquyNguyenvo/Tethys/releases/latest/download/latest.json | head -1`
      → `HTTP/2 200` (endpoint updater trỏ tới hoạt động thật, không phải chỉ tồn tại trên Release)
- [ ] ⛔ MANUAL — cài `Tethys_0.0.1_x64-setup.exe` trên máy thật, xác nhận có shortcut Start Menu +
      icon đúng logo Tethys (điều user hỏi ban đầu ở đầu hội thoại — đã làm thủ công 1 lần với build
      `0.1.0` trước khi có plan này, nhưng bản `0.0.1` từ CI là lần đầu cài **bản CI build**, nên
      verify lại)

## Gotchas

- `gh run watch` cần `databaseId` — nếu 2 lệnh `gh run list` cách nhau vài giây trả kết quả khác
  nhau (vd có run khác chen vào), lấy `databaseId` từ **đúng** output của lệnh 4-E, đừng chạy lại
  `gh run list` rồi giả định vẫn là run đó.
- Windows Defender / SmartScreen có thể chặn installer tải về từ trình duyệt lần đầu ("Windows
  protected your PC") — đây là hành vi bình thường cho app chưa có chứng chỉ code-signing (xem
  `CONTEXT.md` §6, ngoài phạm vi plan này), không phải build lỗi.

## Nếu cần huỷ (chỉ khi user yêu cầu rõ ràng)

- Xoá release: `gh release delete v0.0.1 --repo QuangquyNguyenvo/Tethys --yes` (không xoá tag kèm
  theo mặc định — thêm `--cleanup-tag` nếu muốn xoá cả tag).
- Xoá tag khỏi remote: `git push origin :refs/tags/v0.0.1`.
- **Không** làm 2 lệnh trên trừ khi user chủ động yêu cầu huỷ release — đây là hành động phá huỷ
  state công khai, áp dụng đúng nguyên tắc "Executing actions with care".

## Deviations (điền nếu code thật khác plan)
> _(để trống nếu không có)_

## After finishing

- Cập nhật `CHECKLIST.md` (bảng phase → ✅ hoặc ⚠️, session log, và thêm dòng vào "Việc ngoài phạm
  vi plan này" nếu phát sinh thêm việc cho lần release kế — vd bump version tiếp theo để test
  auto-update thật)
