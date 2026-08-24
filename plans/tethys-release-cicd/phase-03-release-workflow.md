# Phase 3 — GitHub Actions release workflow + secrets

> **Prereq**: phase 1 (cần pubkey đã nằm trong `tauri.conf.json` để build trong CI khớp với
> `TAURI_SIGNING_PRIVATE_KEY` sẽ set ở đây) | **Rủi ro**: 🟠 (tạo secret trên GitHub — không public
> nhưng vẫn là ghi state lên remote) | **Rollback**: `rm .github/workflows/release.yml` (file mới,
> chưa từng tồn tại) + `gh secret delete TAURI_SIGNING_PRIVATE_KEY --repo QuangquyNguyenvo/Tethys`
> + `gh secret delete TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo QuangquyNguyenvo/Tethys`
> **Files đụng tới**: `.github/workflows/release.yml` (file mới, ở **repo root**, KHÔNG phải
> `app/.github/...`) — *không* file nào khác.

## Context recovery

Đọc `CONTEXT.md` §4 (bảng sự thật — đặc biệt dòng "Signing keypair" và "Public key"), §7 (quyết
định `prerelease: false`), §8 (thuật ngữ). Đọc `CHECKLIST.md` mục Quy tắc, đặc biệt luật 7.

## Goal

Sau phase này: `.github/workflows/release.yml` tồn tại và hợp lệ cú pháp YAML, và 2 secret
`TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` đã có trên GitHub repo
`QuangquyNguyenvo/Tethys`. **Chưa push commit/tag nào** — workflow chỉ tồn tại local + secret đã set,
chưa có lần chạy nào (`push tag` là `phase-04`).

## KHÔNG đụng vào

- `app/**` — không sửa gì trong Tauri project ở phase này.
- Không tạo thêm workflow khác (vd `ci.yml` chạy test mỗi PR) — ngoài phạm vi plan này, không phải
  điều user yêu cầu.
- Không đặt `releaseDraft: true` — xem `CONTEXT.md` §7, đây là quyết định đã chốt có lý do kỹ thuật
  cụ thể (endpoint `/releases/latest/`), không phải mặc định tuỳ tiện.

## Bước 3-A — Tạo `.github/workflows/release.yml`

File này **chưa tồn tại** — tạo mới, không có "current code" để đối chiếu.

### Nội dung đầy đủ
```yaml
name: release

on:
  push:
    tags:
      - "v*"

permissions:
  contents: write

jobs:
  release:
    runs-on: windows-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install frontend dependencies
        working-directory: app
        run: npm install

      - name: Build and release
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          projectPath: app
          tagName: ${{ github.ref_name }}
          releaseName: "Tethys ${{ github.ref_name }} (Beta)"
          releaseBody: "Automated build from CI. Download `*-setup.exe` (recommended) or the `.msi` below."
          releaseDraft: false
          prerelease: false
```

### Vì sao từng phần
- `on.push.tags: ["v*"]` — chỉ chạy khi push tag khớp `v*` (vd `v0.0.1`), không chạy trên mỗi push
  thường lên `main`.
- `permissions: contents: write` — bắt buộc để `tauri-action` tạo được GitHub Release (mặc định
  `GITHUB_TOKEN` chỉ có quyền đọc từ 2023 trở đi trên repo mới).
- `projectPath: app` — Tauri project nằm ở `app/`, không phải repo root (đã verify ở khảo sát).
- `tagName: ${{ github.ref_name }}` — dùng đúng tên tag vừa push làm tên release, không suy ra từ
  `tauri.conf.json` (tránh lệch nếu quên bump version).
- `TAURI_SIGNING_PRIVATE_KEY` / `_PASSWORD` — `tauri-action` tự đọc 2 biến môi trường này để ký
  installer + sinh `latest.json` + file `.sig`. Không set thì build **vẫn chạy** nhưng KHÔNG sinh
  updater artifact — updater sẽ không có gì để tải.
- `releaseDraft: false`, `prerelease: false` — quyết định đã chốt ở `CONTEXT.md` §7, để endpoint
  `/releases/latest/download/latest.json` hoạt động ngay từ bản đầu.

### Verify
```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml', encoding='utf-8')); print('YAML OK')"
```
Kỳ vọng: in `YAML OK`, không exception.

## Bước 3-B — Set GitHub Actions secrets

Dùng đúng 2 file đã sinh ở phiên khảo sát plan (xem `CONTEXT.md` §5.2 để lấy đường dẫn thư mục
scratchpad — **thay `<SCRATCH>` bên dưới bằng đường dẫn thật ghi trong đó**).

> ⚠️ **Nếu 2 file `tethys_updater.key` / `tauri_updater_key.password.txt` không còn tồn tại ở
> đường dẫn đó** (vd: đang chạy phase này ở một phiên/model khác, hoặc thư mục temp đã bị dọn) —
> **DỪNG NGAY, đây là deviation.** Không được tự sinh keypair mới rồi set secret mới mà không sửa
> lại pubkey ở `phase-01` bước 1-E và `CONTEXT.md` §4 — pubkey trong app phải khớp CHÍNH XÁC với
> private key trong secret, lệch nhau thì mọi bản build sau ký ra installer mà app cũ **không bao
> giờ verify được**, coi như auto-update chết êm không ai biết cho tới khi thử. Nếu bắt buộc phải
> sinh lại: sinh mới → cập nhật pubkey ở CẢ HAI chỗ (`tauri.conf.json` và `CONTEXT.md` §4) → ghi rõ
> vào Deviations của phase 1 lẫn phase 3 → rồi mới tiếp tục set secret.

```bash
SCRATCH="<đường dẫn thư mục scratchpad ghi trong CONTEXT.md §5.2>"

gh secret set TAURI_SIGNING_PRIVATE_KEY \
  --repo QuangquyNguyenvo/Tethys \
  --body "$(cat "$SCRATCH/tethys_updater.key")"

gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD \
  --repo QuangquyNguyenvo/Tethys \
  --body "$(cat "$SCRATCH/tauri_updater_key.password.txt")"
```

**Vì sao dùng `--body "$(cat ...)"` thay vì `< file`**: command substitution `$(...)` tự cắt bỏ
newline cuối file trong bash; redirect `<` giữ nguyên. Password có newline thừa ở cuối có thể khiến
`tauri-action` verify sai password mà lỗi hiện ra rất khó hiểu ("invalid password" dù password đúng).

### Verify
```bash
gh secret list --repo QuangquyNguyenvo/Tethys
```
Kỳ vọng: thấy cả `TAURI_SIGNING_PRIVATE_KEY` và `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` trong danh
sách (chỉ tên + ngày cập nhật, gh không bao giờ in giá trị secret).

## Acceptance criteria

- [ ] `python -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))"` → không lỗi
- [ ] `gh secret list --repo QuangquyNguyenvo/Tethys` → có đủ 2 tên secret ở trên
- [ ] `git status --short` → chỉ có 1 dòng `?? .github/workflows/release.yml` (untracked, file mới)
- [ ] ⛔ MANUAL — workflow **chưa chạy lần nào** ở phase này (cần push tag, đó là `phase-04`); không
      thể verify workflow thật sự pass cho tới khi đó

## Gotchas

- `dtolnay/rust-toolchain@stable` là action bên thứ ba rất phổ biến cho setup Rust trên GH Actions
  (không phải action chính chủ GitHub) — đúng chính tả tên action, gõ sai sẽ fail ở bước checkout
  action với lỗi "repository not found".
- Nếu tổ chức/repo có bật "Require secrets to be used only in protected branches" hoặc rule tương
  tự, `gh secret set` có thể cần thêm quyền — lỗi sẽ nói rõ "must have admin access", lúc đó ghi
  vào Deviations, không tự ý đổi quyền repo.
- Windows runner (`windows-latest`) đã có sẵn WebView2 runtime — không cần bước cài thêm cho bundle
  NSIS/MSI (khác Linux cần `webkit2gtk`, không áp dụng ở đây vì project Windows-only).

## Deviations (điền nếu code thật khác plan)
> _(để trống nếu không có)_

## After finishing

- Cập nhật `CHECKLIST.md` (bảng phase → ✅ hoặc ⚠️, session log)
- Không commit trừ khi user yêu cầu (luật 6) — `.github/workflows/release.yml` tạo xong vẫn nằm
  untracked cho tới khi user duyệt commit ở `phase-04`
