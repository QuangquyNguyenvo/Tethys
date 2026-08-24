# CI/CD release cho Tethys — Context

> File này là **SỰ THẬT BẤT BIẾN**. Chỉ sửa khi phát hiện điều đã ghi là sai (và nói rõ).
> Trạng thái/tiến độ nằm ở `CHECKLIST.md`, không viết vào đây.

**Viết ngày**: 2026-08-24 · **Tại commit**: `3e25248`
Mọi snippet "Current code" trong các file phase là ảnh chụp tại commit này — số dòng có thể lệch
nếu code đã đổi từ lúc đó.

## 1. Mục tiêu & định nghĩa "xong"

Đích: push tag `v0.0.1` lên GitHub thì một workflow tự build installer Windows (NSIS + MSI) và
publish thành GitHub Release, kèm cơ chế để **bản sau** (`v0.0.2`, …) tự động báo/tải/cài update
cho người đã cài `v0.0.1`.

Đo được:
- `.github/workflows/release.yml` tồn tại, trigger khi push tag khớp `v*`.
- Push tag `v0.0.1` → workflow chạy xanh → GitHub Release `v0.0.1` có đủ asset:
  `Tethys_0.0.1_x64-setup.exe`, `Tethys_0.0.1_x64_en-US.msi`, `latest.json`, và file `.sig` đi kèm
  installer.
- App cài từ `v0.0.1` có màn Settings → Updates, bấm "Check for updates" gọi được tới
  `https://github.com/QuangquyNguyenvo/Tethys/releases/latest/download/latest.json`.
- Khoá ký cập nhật (minisign keypair) **không** nằm trong git history ở bất kỳ commit nào.

## 2. Ràng buộc không được vi phạm

- **Windows-only v1** (đã chốt ở `PROJECT_CONTEXT.md` §10) — workflow chỉ build trên
  `windows-latest`, không thêm job macOS/Linux.
- Không đổi kiến trúc hiện có (tiling, PTY, theme…) — plan này chỉ thêm updater + CI, không sửa gì
  khác trong `src-tauri/src/lib.rs` ngoài phần liên quan updater.
- **Không bao giờ commit private key** của minisign keypair vào git, dưới bất kỳ file nào.
- **Không tự ý push commit/tag lên `origin`** hoặc tạo GitHub Release mà chưa hỏi user xác nhận
  ngay trước hành động đó — đây là hành động công khai, ảnh hưởng shared state.
- Không bật `unstable` feature của Tauri (lý do đã ghi trong `Cargo.toml` — vỡ ở multi-webview,
  không liên quan updater nhưng không được đụng vào comment/feature đó).

## 3. Kiến trúc liên quan

```
Tethys/                              (repo root, remote origin = QuangquyNguyenvo/Tethys)
├── .github/workflows/               (chưa tồn tại → phase 3 tạo release.yml)
└── app/                             (Tauri v2 project root — mọi lệnh npm/tauri chạy từ đây)
    ├── package.json                 (deps FE, version field không dùng cho updater)
    ├── src/
    │   ├── App.tsx                  (mount root, không cần đụng)
    │   └── settings/SettingsPanel.tsx  (nơi thêm trang "Updates" — phase 2)
    └── src-tauri/
        ├── Cargo.toml                (deps Rust — phase 1 thêm updater + process plugin)
        ├── tauri.conf.json           (bundle config, "version" ở đây LÀ version updater so sánh)
        ├── capabilities/default.json (permission model Tauri v2 — phase 1 thêm quyền updater/process)
        ├── .gitignore                 (chỉ ignore /target và /gen/schemas — phase 1 thêm *.key)
        └── src/lib.rs                 (đăng ký plugin ở hàm `run()`)
```

Updater dùng cơ chế chuẩn của `tauri-plugin-updater`: app đọc `tauri.conf.json` →
`plugins.updater.endpoints` để lấy `latest.json`, so `version` trong đó với version app đang chạy
(chính là `tauri.conf.json` → `"version"` top-level, KHÔNG phải `Cargo.toml` → `package.version`).
Nếu mới hơn → tải asset tương ứng platform, verify chữ ký bằng `pubkey` nhúng sẵn trong app, cài,
rồi cần gọi `tauri-plugin-process` để relaunch.

## 4. Sự thật đã verify (ĐỪNG kiểm lại — tốn context)

| Điều | Sự thật | Kiểm bằng |
|---|---|---|
| Remote GitHub | `origin` = `https://github.com/QuangquyNguyenvo/Tethys.git`, đã push tới trước đó | `git remote -v` |
| Nhánh local | `main`, đang **ahead origin/main 3 commit** (`7c1194d`, `661b0a0`, `3e25248`) chưa push | `git log origin/main..HEAD --oneline` |
| gh CLI | Đã auth, account `QuangquyNguyenvo`, scope có `repo` + `workflow` → đủ quyền tạo secret + push workflow | `gh auth status` |
| tauri-cli | `2.11.4`, hỗ trợ `tauri signer generate`, `tauri build`, action `tauri-apps/tauri-action@v0` tương thích | `npx tauri --version` |
| Build release local | `npm run tauri build` chạy **thành công** tại commit `3e25248`, ra `Tethys_0.1.0_x64-setup.exe` (NSIS, 3.4MB) và `Tethys_0.1.0_x64_en-US.msi` (4.66MB) tại `app/src-tauri/target/release/bundle/{nsis,msi}/` | log build phiên này |
| `@tauri-apps/plugin-updater` | **Chưa** có trong `package.json` lẫn `node_modules/@tauri-apps` | `npm ls @tauri-apps/plugin-updater` |
| `tauri-plugin-updater` (Rust) | **Chưa** có trong `Cargo.toml` | đọc file |
| `.github/workflows/` | **Không tồn tại** — chưa có CI nào | `find .github -type f` |
| `capabilities/default.json` | 1 file duy nhất `default.json`, permission model Tauri v2 chuẩn (không có "updater:default") | đọc file |
| Signing keypair | Đã sinh minisign keypair cho updater, **lưu ngoài repo** tại scratchpad phiên này — KHÔNG nằm trong `D:\Code\Project\Tethys` | xem §5.2 |
| Public key (base64, dạng minisign) | `dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDUwOERFMEY5RDIyNjBENkUKUldSdURTYlMrZUNOVU5mb0dsZ2ZoUUNBZTdxWW51eDNIMnEvWFVTS3hVb25vQ1c0b0xBeDc3c3AK` | file `.pub` sinh phiên này |

## 5. Vùng đã kiểm và SẠCH

- `app/package.json`, `app/src-tauri/Cargo.toml` — đọc toàn bộ, không có gì liên quan updater.
- `app/src-tauri/capabilities/default.json` — đọc toàn bộ (13 permission, không có updater/process).
- `app/src-tauri/src/lib.rs` — đọc toàn bộ 251 dòng, biết chính xác pattern đăng ký plugin
  (`.plugin(tauri_plugin_opener::init())` ở `tauri::Builder::default()...`) và danh sách
  `invoke_handler(tauri::generate_handler![...])`.
- `app/src/settings/SettingsPanel.tsx` — đọc toàn bộ 394 dòng. Có sẵn các component tái dùng được:
  `SettingsPage`, `SettingGroup`, `ActionRow`, `Toggle` — đủ để dựng trang "Updates" mà **không cần
  CSS mới** (style đã có qua class `set-item`, `set-btn`, …).
- `app/src-tauri/.gitignore`, `app/.gitignore` — đọc toàn bộ, không có rule nào ẩn liên quan key ký.

### 5.2 — Vị trí keypair đã sinh (phiên này, KHÔNG commit)

```
<thư mục scratchpad phiên>\tethys_updater.key           (private key, minisign, có password)
<thư mục scratchpad phiên>\tethys_updater.key.pub        (public key)
<thư mục scratchpad phiên>\tauri_updater_key.password.txt (password, random 32 ký tự base64)
```

> Thư mục scratchpad này chỉ tồn tại trong phiên hiện tại của assistant, KHÔNG phải chỗ lưu lâu
> dài. **Phase 3 phải đẩy nội dung 2 file `.key` và password vào GitHub Actions secrets ngay khi
> thực thi** rồi coi bản trên đĩa là tạm — nếu phiên kết thúc mà chưa kịp set secret, phải sinh lại
> keypair mới (không có cách khôi phục nếu mất).

## 6. Ngoài phạm vi (out of scope)

- ❌ **Code-signing certificate (EV/OV) cho Windows SmartScreen.** Đây là khoá ký RIÊNG của
  `tauri-plugin-updater` (minisign) để app tự verify update — KHÔNG liên quan, KHÔNG thay thế việc
  Windows SmartScreen cảnh báo "Unknown publisher" khi cài lần đầu. Mua chứng chỉ code-signing là
  quyết định tốn tiền, ngoài phạm vi plan này.
- ❌ **macOS / Linux build job.** Đã chốt Windows-only ở `PROJECT_CONTEXT.md`.
- ❌ **Silent auto-check-on-startup + toast notification.** Codebase chưa có hệ thống toast nào
  (đã grep, không tìm thấy). Dựng toast system mới sẽ phá vỡ ngân sách 1-phase-1-session. Bản này
  làm nút "Check for updates" thủ công trong Settings — vẫn là "auto update" đúng nghĩa (tự tải,
  tự verify chữ ký, tự cài, tự relaunch), chỉ khác là người dùng bấm để kiểm tra thay vì app tự làm
  lúc mở lên. Có thể thêm auto-check-on-startup ở plan sau, không phải bây giờ.
- ❌ **GitHub Release đánh dấu "Pre-release".** Xem quyết định kỹ thuật ở §7 — quan trọng, đọc trước
  khi làm phase 3/4.
- ❌ **Kiểm auto-update thật (tải + cài + relaunch) trong plan này.** Cần **hai** version tồn tại
  (một bản cũ đã cài + một bản mới hơn trên GitHub) mới test được. `v0.0.1` là version đầu tiên nên
  không có gì để update TỪ. Ghi rõ ở `phase-04` là bước tiếp theo, ⛔ MANUAL, làm ở lần release kế.

## 7. Quyết định kỹ thuật quan trọng — GitHub "latest" endpoint vs prerelease flag

GitHub có hành vi: URL `https://github.com/<owner>/<repo>/releases/latest/download/<asset>` (và API
`/releases/latest`) chỉ resolve tới release **mới nhất KHÔNG đánh dấu Draft và KHÔNG đánh dấu
Pre-release**. Nếu release `v0.0.1` được tạo với `prerelease: true` hoặc còn ở dạng draft, thì
`plugins.updater.endpoints` trỏ vào `/releases/latest/download/latest.json` sẽ **404 vĩnh viễn**
cho tới khi có một release KHÔNG-prerelease mới hơn — tức cơ chế update coi như chết ngay từ đầu.

**Quyết định**: workflow tạo release với `prerelease: false`, `draft: false` — release lên thẳng,
công khai ngay. "Đây là bản beta" thể hiện qua **số version** (`0.0.x`, dưới `1.0.0`) và tiêu đề/mô
tả release (vd: "Tethys v0.0.1 — Beta"), KHÔNG dùng cờ Pre-release của GitHub.

Đánh đổi: release không có badge "Pre-release" màu cam trên GitHub. Đổi lại: `/releases/latest/`
endpoint hoạt động ngay từ `v0.0.1`, và tiếp tục hoạt động cho mọi bản sau miễn giữ nguyên quy tắc
này — đúng thứ user cần ("auto update sau này").

## 8. Thuật ngữ / quy ước

- **"updater"** = `tauri-plugin-updater`, cơ chế app tự kiểm tra/tải/cài bản mới.
- **"signing key" / "keypair"** = cặp khoá minisign của riêng updater — không phải chứng chỉ
  code-signing Windows.
- **"release workflow"** = `.github/workflows/release.yml`, trigger bởi tag `v*`.
- **"app/"** = thư mục con chứa toàn bộ Tauri project; mọi lệnh `npm`/`npx tauri` trong plan này
  chạy với cwd = `app/` trừ khi ghi rõ khác.
