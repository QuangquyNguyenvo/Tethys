# Phase 1 — Thêm updater + process plugin (backend/config)

> **Prereq**: không có | **Rủi ro**: 🟠 | **Rollback**: `git checkout -- app/src-tauri/Cargo.toml app/package.json app/src-tauri/capabilities/default.json app/src-tauri/src/lib.rs app/src-tauri/tauri.conf.json app/src-tauri/.gitignore`
> **Files đụng tới**: `app/src-tauri/Cargo.toml`, `app/package.json`, `app/src-tauri/capabilities/default.json`, `app/src-tauri/src/lib.rs`, `app/src-tauri/tauri.conf.json`, `app/src-tauri/.gitignore` — *không* file nào khác.

## Context recovery

Đọc `CONTEXT.md` (đặc biệt §3, §4, §7) và `CHECKLIST.md` (mục Quy tắc) trước. Phase này KHÔNG đụng
tới GitHub, KHÔNG push gì — hoàn toàn local.

## Goal

Sau phase này: app biết `plugins.updater` là gì (pubkey + endpoint đã cấu hình), Rust backend đã
đăng ký `tauri_plugin_updater` + `tauri_plugin_process`, và `cargo check` / `npm run tauri dev` chạy
được không lỗi. Chưa có UI nào gọi tới updater — đó là `phase-02`.

## KHÔNG đụng vào

- `app/src/**` — toàn bộ frontend, kể cả `SettingsPanel.tsx`. Đó là `phase-02`.
- `.github/**` — đó là `phase-03`.
- Không đổi `"version"` trong `tauri.conf.json`/`package.json`/`Cargo.toml` — đó là `phase-04`
  (đổi version phải làm sát lúc tag, không phải bây giờ).
- Không bật feature `unstable` của `tauri` trong `Cargo.toml` — comment ngay phía trên dòng
  `tauri = { version = "2", ... }` đã giải thích lý do (vỡ multi-webview ở 2.11.5). Giữ nguyên.

## Bước 1-A — Cargo.toml: thêm 2 dependency

### Current code (`app/src-tauri/Cargo.toml`, dòng 24–32), nguyên văn
```toml
tauri = { version = "2", features = ["protocol-asset"] }
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
portable-pty = "0.9.0"
anyhow = "1.0.104"
winreg = "0.56.0"
notify = "6"
window-vibrancy = "0.8.0"
```

### Vấn đề
Chưa có crate nào cho updater/process. Không thêm thì bước 1-D (đăng ký plugin trong `lib.rs`)
không compile được.

### Change
```toml
tauri = { version = "2", features = ["protocol-asset"] }
tauri-plugin-opener = "2"
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
portable-pty = "0.9.0"
anyhow = "1.0.104"
winreg = "0.56.0"
notify = "6"
window-vibrancy = "0.8.0"
```

### Verify
```bash
cd app/src-tauri && cargo metadata --format-version=1 --no-deps >/dev/null && echo "Cargo.toml parse OK"
```

## Bước 1-B — package.json: thêm 2 npm package

### Current code (`app/package.json`, dòng 8–20), nguyên văn
```json
  "dependencies": {
    "@material/material-color-utilities": "^0.4.0",
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-opener": "^2",
    "@xterm/addon-fit": "^0.11.0",
    "@xterm/addon-image": "^0.9.0",
    "@xterm/addon-search": "^0.16.0",
    "@xterm/addon-unicode11": "^0.9.0",
    "@xterm/addon-webgl": "^0.19.0",
    "@xterm/xterm": "^6.0.0",
    "lucide-react": "^1.33.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "zustand": "^5.0.15"
  },
```

### Vấn đề
Frontend cần `@tauri-apps/plugin-updater` (gọi `check()`) và `@tauri-apps/plugin-process` (gọi
`relaunch()` sau khi cài update) cho `phase-02`. Chưa cài thì import ở phase sau sẽ vỡ.

### Change
```json
  "dependencies": {
    "@material/material-color-utilities": "^0.4.0",
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-opener": "^2",
    "@tauri-apps/plugin-process": "^2",
    "@tauri-apps/plugin-updater": "^2",
    "@xterm/addon-fit": "^0.11.0",
    "@xterm/addon-image": "^0.9.0",
    "@xterm/addon-search": "^0.16.0",
    "@xterm/addon-unicode11": "^0.9.0",
    "@xterm/addon-webgl": "^0.19.0",
    "@xterm/xterm": "^6.0.0",
    "lucide-react": "^1.33.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "zustand": "^5.0.15"
  },
```

### Verify
```bash
cd app && npm install && npm ls @tauri-apps/plugin-updater @tauri-apps/plugin-process
```
Kỳ vọng: cả hai in ra version `2.x.x`, không có `UNMET DEPENDENCY`.

## Bước 1-C — capabilities/default.json: thêm quyền updater + process

### Current code (`app/src-tauri/capabilities/default.json`), nguyên văn toàn bộ file
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": [
    "main"
  ],
  "permissions": [
    "core:default",
    "core:window:default",
    "core:window:allow-close",
    "core:window:allow-minimize",
    "core:window:allow-maximize",
    "core:window:allow-internal-toggle-maximize",
    "core:window:allow-destroy",
    "core:window:allow-start-dragging",
    "core:window:allow-set-focus",
    "core:window:allow-center",
    "core:webview:default",
    "opener:default"
  ]
}
```

### Vấn đề
Tauri v2 chặn mọi plugin command bằng permission model — không khai báo thì `invoke("plugin:updater|check")`
từ frontend (phase-02) sẽ bị từ chối ở runtime với lỗi "not allowed" dù code compile OK.

### Change
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": [
    "main"
  ],
  "permissions": [
    "core:default",
    "core:window:default",
    "core:window:allow-close",
    "core:window:allow-minimize",
    "core:window:allow-maximize",
    "core:window:allow-internal-toggle-maximize",
    "core:window:allow-destroy",
    "core:window:allow-start-dragging",
    "core:window:allow-set-focus",
    "core:window:allow-center",
    "core:webview:default",
    "opener:default",
    "updater:default",
    "process:allow-restart"
  ]
}
```

### Verify
```bash
cd app && npm run tauri dev
```
Mở app, mở DevTools (nếu build cho phép) hoặc kiểm `noname_frontend_error.log` — không có lỗi
"capability" nào liên quan `updater`/`process` xuất hiện. (Chưa có UI gọi updater ở phase này nên
đây chỉ là kiểm app vẫn khởi động bình thường, không phải kiểm permission hoạt động — permission
được kiểm thật ở `phase-02`.)

## Bước 1-D — lib.rs: đăng ký 2 plugin

### Current code (`app/src-tauri/src/lib.rs`, dòng 182–199), nguyên văn
```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(PtyManager::default())
        .manage(WatcherManager::default())
        .setup(|app| {
            if let Some(win) = app.get_webview_window("main") {
                #[cfg(target_os = "windows")]
                {
                    // Áp dụng Acrylic blur / Mica cho Windows 11/10
                    if let Err(_) = window_vibrancy::apply_acrylic(&win, Some((16, 18, 24, 120))) {
                        let _ = window_vibrancy::apply_mica(&win, Some(true));
                    }
                }
            }
            Ok(())
        })
```

### Vấn đề
Plugin `tauri_plugin_updater` và `tauri_plugin_process` phải được đăng ký vào `Builder` thì
`invoke("plugin:updater|check")` / `invoke("plugin:process|restart")` từ frontend mới có handler
để gọi vào. `tauri_plugin_updater::Builder::new()` cần được gọi **trong** `.setup()` (không phải
trực tiếp ở `.plugin()`) vì nó cần `app.handle()` — đây là API chuẩn của `tauri-plugin-updater` v2,
khác với các plugin đơn giản như `opener`.

### Change
```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .manage(PtyManager::default())
        .manage(WatcherManager::default())
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            if let Some(win) = app.get_webview_window("main") {
                #[cfg(target_os = "windows")]
                {
                    // Áp dụng Acrylic blur / Mica cho Windows 11/10
                    if let Err(_) = window_vibrancy::apply_acrylic(&win, Some((16, 18, 24, 120))) {
                        let _ = window_vibrancy::apply_mica(&win, Some(true));
                    }
                }
            }
            Ok(())
        })
```

**Đã verify thật** (không còn là suy đoán): pattern `app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;`
bên trong `.setup()` **compile sạch** với `tauri = "2"` hiện tại của project — đã chạy `cargo check`
thật, `Finished` không lỗi, 117 crate compiled (gồm `tauri-plugin-updater` + `tauri-plugin-process`
tải mới). Copy đúng nguyên văn, không cần thử phương án dự phòng nào khác.

### Verify
```bash
cd app/src-tauri && cargo check
```
Kỳ vọng: `Finished` không có lỗi (warning thì OK, lỗi thì đọc message và ghi vào Deviations).

## Bước 1-E — tauri.conf.json: khai báo plugins.updater

### Current code (`app/src-tauri/tauri.conf.json`), nguyên văn toàn bộ file
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Tethys",
  "version": "0.1.0",
  "identifier": "com.tethys.app",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Tethys",
        "width": 1280,
        "height": 800,
        "minWidth": 640,
        "minHeight": 400,
        "decorations": false,
        "transparent": true
      }
    ],
    "security": {
      "csp": null,
      "assetProtocol": {
        "enable": true,
        "scope": [
          "**"
        ]
      }
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

### Vấn đề
Chưa có key `plugins` → updater plugin không biết pubkey nào để verify chữ ký, và không biết endpoint
nào để hỏi có bản mới hay không.

**Pubkey dùng ở đây** (đã sinh sẵn trong phiên khảo sát plan này, xem `CONTEXT.md` §4/§5.2 —
KHÔNG sinh lại, dùng đúng chuỗi này để khớp với private key đã/sẽ nạp vào GitHub secret ở `phase-03`):
```
dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDUwOERFMEY5RDIyNjBENkUKUldSdURTYlMrZUNOVU5mb0dsZ2ZoUUNBZTdxWW51eDNIMnEvWFVTS3hVb25vQ1c0b0xBeDc3c3AK
```

### Change
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Tethys",
  "version": "0.1.0",
  "identifier": "com.tethys.app",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Tethys",
        "width": 1280,
        "height": 800,
        "minWidth": 640,
        "minHeight": 400,
        "decorations": false,
        "transparent": true
      }
    ],
    "security": {
      "csp": null,
      "assetProtocol": {
        "enable": true,
        "scope": [
          "**"
        ]
      }
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "createUpdaterArtifacts": true,
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  },
  "plugins": {
    "updater": {
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDUwOERFMEY5RDIyNjBENkUKUldSdURTYlMrZUNOVU5mb0dsZ2ZoUUNBZTdxWW51eDNIMnEvWFVTS3hVb25vQ1c0b0xBeDc3c3AK",
      "endpoints": [
        "https://github.com/QuangquyNguyenvo/Tethys/releases/latest/download/latest.json"
      ]
    }
  }
}
```

**`createUpdaterArtifacts: true`** bắt buộc — thiếu key này thì `tauri build` không sinh file `.sig`
đi kèm installer, và `latest.json` sẽ không được tạo dù đã cấu hình `plugins.updater`.

### Verify
```bash
cd app/src-tauri && cargo check
```
(`tauri.conf.json` được `tauri-build` đọc lúc compile — sai schema sẽ lộ ra ở đây, không cần chạy
full build.)

## Bước 1-F — .gitignore: chặn key ký lọt vào git

### Current code (`app/src-tauri/.gitignore`), nguyên văn toàn bộ file
```
# Generated by Cargo
# will have compiled files and executables
/target/

# Generated by Tauri
# will have schema files for capabilities auto-completion
/gen/schemas
```

### Vấn đề
Nếu sau này ai chạy `tauri signer generate` mà quên `-w` trỏ ra ngoài repo, private key rơi thẳng
vào `src-tauri/` và dễ bị `git add .` cuốn theo. Rào một lớp an toàn rẻ tiền.

### Change
```
# Generated by Cargo
# will have compiled files and executables
/target/

# Generated by Tauri
# will have schema files for capabilities auto-completion
/gen/schemas

# Updater signing key — KHÔNG BAO GIỜ commit. Private key sống ở GitHub Actions secret
# (TAURI_SIGNING_PRIVATE_KEY), không phải trong repo.
*.key
*.key.pub
```

### Verify
```bash
cd app/src-tauri && git check-ignore -v test.key 2>&1 || echo "not ignored (expected error above if ignored)"
```
Kỳ vọng: lệnh `git check-ignore -v test.key` in ra dòng match rule `*.key` (exit code 0).

## Acceptance criteria

- [ ] `cd app/src-tauri && cargo check` → `Finished` không lỗi
- [ ] `cd app && npm install && npm ls @tauri-apps/plugin-updater @tauri-apps/plugin-process` → cả
      hai in version `2.x.x`
- [ ] `cd app && npm run tauri dev` → cửa sổ Tethys mở bình thường như trước phase này (không hồi quy)
- [ ] `git check-ignore -v app/src-tauri/foo.key` → match `*.key`
- [ ] `git status --short` chỉ liệt kê đúng 6 file ở header (`Cargo.toml`, `Cargo.lock` sẽ tự đổi
      theo do thêm dependency — **cho phép** `Cargo.lock` xuất hiện thêm dù không có trong header,
      đó là hệ quả tự động của `cargo check`/`cargo build`, không phải deviation)

## Gotchas

- `tauri_plugin_process::init()` đăng ký ở `.plugin()` bình thường (không cần `.setup()`), khác với
  `updater` — đừng nhầm 2 pattern.
- `cargo check` sẽ tải + compile 2 crate mới lần đầu — có thể mất 1–2 phút, không phải bị treo.
- Nếu `npm install` báo lỗi peer dependency giữa `@tauri-apps/plugin-updater@2.x` và
  `@tauri-apps/api@^2` hiện có — đọc kỹ message, thường chỉ là warning, không phải lỗi chặn cài.

## Deviations (điền nếu code thật khác plan)
> _(để trống nếu không có)_

## After finishing

- Cập nhật `CHECKLIST.md` (bảng phase → ✅ hoặc ⚠️, session log)
- Không commit trừ khi user yêu cầu (luật 6)
