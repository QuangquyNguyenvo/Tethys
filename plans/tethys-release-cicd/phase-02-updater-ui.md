# Phase 2 — Trang "Updates" trong Settings

> **Prereq**: phase 1 (cần `@tauri-apps/plugin-updater` + `@tauri-apps/plugin-process` đã cài, và
> permission `updater:default` / `process:allow-restart` đã khai báo — không có thì `check()` bị
> Tauri chặn ở runtime dù compile OK) | **Rủi ro**: 🟢 | **Rollback**: `git checkout -- app/src/settings/SettingsPanel.tsx`
> **Files đụng tới**: `app/src/settings/SettingsPanel.tsx` — *không* file nào khác. Không cần sửa
> CSS: tái dùng nguyên `SettingsPage`, `SettingGroup`, `ActionRow` đã có sẵn class trong `App.css`.

## Context recovery

Đọc `CONTEXT.md` §3 (vị trí file) và §6 (lý do KHÔNG làm toast tự động — bấm nút thủ công là quyết
định có chủ đích, không phải làm thiếu). Đọc `CHECKLIST.md` mục Quy tắc.

## Goal

Sau phase này: Settings có thêm trang "Updates" — hiện version hiện tại, nút "Check for updates"
gọi `tauri-plugin-updater`, nếu có bản mới thì đổi thành nút "Install & Restart" gọi
`downloadAndInstall()` rồi `relaunch()`. Chưa cần test với update thật (không có bản `v0.0.2` nào
tồn tại lúc này) — verify ở phase này chỉ là: gọi được API, không crash, không lỗi permission.

## KHÔNG đụng vào

- `app/src-tauri/**` — mọi thứ Rust/config đã xong ở `phase-01`.
- `App.css` — không thêm class mới, chỉ dùng lại `set-item`, `set-btn`, `set-copy`, `set-label`
  (đã tồn tại, dùng bởi `ActionRow`).
- Không thêm `disabled` prop cho `ActionRow` — chặn double-click bằng cách guard đầu mỗi handler
  thay vì sửa signature component dùng chung ở nhiều page khác.

## Bước 2-A — Import: thêm updater/process/app-version + icon

### Current code (`app/src/settings/SettingsPanel.tsx`, dòng 1–13), nguyên văn
```tsx
import { useEffect, useState, type ReactNode } from "react";
import { Keyboard, LayoutGrid, Palette, Settings, Terminal } from "lucide-react";
import { PanelHeader } from "../panel/PanelHeader";
import { useThemeStore, refreshSeed, setCustomWallpaper, useDesktopWallpaper } from "../theme/useTheme";
import { invoke } from "@tauri-apps/api/core";
import {
  TERM_OPACITY_MAX,
  TERM_OPACITY_MIN,
  type ColorSource,
  type LayoutMode,
  type SchemeName,
  type SurfaceStyle,
} from "../theme/palette";
```

### Change
```tsx
import { useEffect, useState, type ReactNode } from "react";
import { Keyboard, LayoutGrid, Palette, RefreshCw, Settings, Terminal } from "lucide-react";
import { PanelHeader } from "../panel/PanelHeader";
import { useThemeStore, refreshSeed, setCustomWallpaper, useDesktopWallpaper } from "../theme/useTheme";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { check as checkForUpdate, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  TERM_OPACITY_MAX,
  TERM_OPACITY_MIN,
  type ColorSource,
  type LayoutMode,
  type SchemeName,
  type SurfaceStyle,
} from "../theme/palette";
```

### Verify
```bash
cd app && npx tsc --noEmit
```
Kỳ vọng: không lỗi `Cannot find module '@tauri-apps/plugin-updater'` (nếu có → phase 1 chưa
`npm install` xong, quay lại phase 1).

## Bước 2-B — Page type + PAGES: thêm "updates"

### Current code (`app/src/settings/SettingsPanel.tsx`, dòng 49–56), nguyên văn
```tsx
type Page = "appearance" | "terminal" | "layout" | "keys";

const PAGES: { id: Page; label: string; icon: ReactNode }[] = [
  { id: "appearance", label: "Appearance", icon: <Palette size={15} /> },
  { id: "terminal", label: "Terminal", icon: <Terminal size={15} /> },
  { id: "layout", label: "Layout", icon: <LayoutGrid size={15} /> },
  { id: "keys", label: "Shortcuts", icon: <Keyboard size={15} /> },
];
```

### Change
```tsx
type Page = "appearance" | "terminal" | "layout" | "keys" | "updates";

type UpdateState = "idle" | "checking" | "none" | "available" | "downloading" | "installed" | "error";

const PAGES: { id: Page; label: string; icon: ReactNode }[] = [
  { id: "appearance", label: "Appearance", icon: <Palette size={15} /> },
  { id: "terminal", label: "Terminal", icon: <Terminal size={15} /> },
  { id: "layout", label: "Layout", icon: <LayoutGrid size={15} /> },
  { id: "keys", label: "Shortcuts", icon: <Keyboard size={15} /> },
  { id: "updates", label: "Updates", icon: <RefreshCw size={15} /> },
];
```

### Verify
Không có lệnh riêng — kiểm cùng lúc với 2-E (`npx tsc --noEmit`).

## Bước 2-C — Component: thêm state + handler check/install

### Current code (`app/src/settings/SettingsPanel.tsx`, dòng 58–79), nguyên văn
```tsx
export function SettingsPanel({ panelKey }: { panelKey: string }) {
  const opts = useThemeStore((s) => s.opts);
  const setOpts = useThemeStore((s) => s.setOpts);
  const source = useThemeStore((s) => s.source);
  const wallpaper = useThemeStore((s) => s.wallpaper);
  const [page, setPage] = useState<Page>("appearance");
  const [logoMissing, setLogoMissing] = useState(false);

  useEffect(() => {
    const path = opts.sysfetchLogoPath;
    if (!path) {
      setLogoMissing(false);
      return;
    }
    let current = true;
    invoke("fs_stat", { path })
      .then(() => current && setLogoMissing(false))
      .catch(() => current && setLogoMissing(true));
    return () => {
      current = false;
    };
  }, [opts.sysfetchLogoPath]);
```

### Vấn đề
Cần nơi giữ: version hiện tại (để hiện "Tethys 0.1.0"), trạng thái check/install, và object
`Update` trả về từ `checkForUpdate()` (chứa `.version`, `.downloadAndInstall()`).

### Change
```tsx
export function SettingsPanel({ panelKey }: { panelKey: string }) {
  const opts = useThemeStore((s) => s.opts);
  const setOpts = useThemeStore((s) => s.setOpts);
  const source = useThemeStore((s) => s.source);
  const wallpaper = useThemeStore((s) => s.wallpaper);
  const [page, setPage] = useState<Page>("appearance");
  const [logoMissing, setLogoMissing] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  const [updateState, setUpdateState] = useState<UpdateState>("idle");
  const [updateInfo, setUpdateInfo] = useState<Update | null>(null);
  const [updateError, setUpdateError] = useState("");

  useEffect(() => {
    const path = opts.sysfetchLogoPath;
    if (!path) {
      setLogoMissing(false);
      return;
    }
    let current = true;
    invoke("fs_stat", { path })
      .then(() => current && setLogoMissing(false))
      .catch(() => current && setLogoMissing(true));
    return () => {
      current = false;
    };
  }, [opts.sysfetchLogoPath]);

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  const handleCheckForUpdate = async () => {
    if (updateState === "checking" || updateState === "downloading") return;
    setUpdateState("checking");
    setUpdateError("");
    try {
      const result = await checkForUpdate();
      setUpdateInfo(result);
      setUpdateState(result ? "available" : "none");
    } catch (error) {
      setUpdateError(String(error));
      setUpdateState("error");
    }
  };

  const handleInstallUpdate = async () => {
    if (!updateInfo || updateState === "downloading") return;
    setUpdateState("downloading");
    setUpdateError("");
    try {
      await updateInfo.downloadAndInstall();
      setUpdateState("installed");
      await relaunch();
    } catch (error) {
      setUpdateError(String(error));
      setUpdateState("error");
    }
  };
```

### Verify
```bash
cd app && npx tsc --noEmit
```

## Bước 2-D — JSX: thêm block trang "updates"

### Current code (`app/src/settings/SettingsPanel.tsx`, dòng 302–326), nguyên văn
```tsx
          {page === "keys" && (
            <SettingsPage title="Shortcuts" description="Only capture keys when they make your workflow faster.">
              <SettingGroup title="Key priority" description="Turn off to return key combinations to the shell or TUI.">
                <Toggle id="set-tabkeys" label="Ctrl+T / Ctrl+W" note="Open and close panels like browser tabs." checked={opts.tabShortcuts} onChange={(v) => setOpts({ tabShortcuts: v })} />
                <Toggle id="set-wskeys" label="Alt+1…9" note="Jump directly to the corresponding workspace." checked={opts.workspaceAltKeys} onChange={(v) => setOpts({ workspaceAltKeys: v })} />
              </SettingGroup>
              <SettingGroup title="Shortcut list" description="The primary workspace actions.">
                <div className="set-keylist">
                  {KEYS.map((item) => (
                    <div className="set-key" key={item.keys.join("+")}>
                      <span className="set-key-what">{item.keys.join("+")}</span>
                      <span className="set-key-combo">
                        {item.keys.map((key) => <kbd key={key}>{key}</kbd>)}
                      </span>
                    </div>
                  ))}
                </div>
              </SettingGroup>
            </SettingsPage>
          )}
        </div>
      </div>
    </div>
  );
}
```

> ⚠️ Dòng `<span className="set-key-what">{item.keys.join("+")}</span>` ở trên là **suy đoán** —
> đọc lại file thật lúc thực thi, bản gốc dùng `{item.what}` (xem file đầy đủ đã đọc ở khảo sát:
> dòng 311 thật là `<span className="set-key-what">{item.what}</span>`). **Copy nguyên văn từ file
> thật lúc Edit, đừng copy đoạn trên** — đây là lỗi transcription lúc viết plan, ghi rõ để không ai
> Edit nhầm theo bản sai. Neo Edit vào dòng cuối `)}` ngay trước `</div>\n      </div>\n    </div>`
> (kết thúc `set-content` / `settings-shell` / `settings-panel`) — chuỗi 3 dòng đóng đó là duy nhất
> trong file nên đủ để `old_string` khớp chính xác 1 chỗ.

### Vấn đề
Cần thêm nhánh render mới cho `page === "updates"`, chèn sau block `keys` và trước 3 dòng đóng thẻ.

### Change (chèn thêm khối sau, ngay trước `</div>\n      </div>\n    </div>\n  );\n}`)
```tsx
          {page === "updates" && (
            <SettingsPage title="Updates" description="Check GitHub for a newer build and install it without leaving Tethys.">
              <SettingGroup title="Version" description="Tethys checks GitHub Releases when you ask it to — never automatically in the background.">
                <div className="set-list">
                  <ActionRow
                    label={`Tethys ${appVersion || "…"}`}
                    note={updateNote(updateState, updateInfo, updateError)}
                    action={
                      updateState === "checking"
                        ? "Checking…"
                        : updateState === "downloading"
                          ? "Installing…"
                          : updateState === "available"
                            ? "Install & Restart"
                            : "Check for updates"
                    }
                    onClick={updateState === "available" ? handleInstallUpdate : handleCheckForUpdate}
                  />
                </div>
              </SettingGroup>
            </SettingsPage>
          )}
```

## Bước 2-E — Helper `updateNote`: thêm cạnh `sourceLabel`/`fileName`

### Current code (`app/src/settings/SettingsPanel.tsx`, dòng 391–394), nguyên văn
```tsx
function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}
```

### Vấn đề
JSX ở bước 2-D gọi `updateNote(...)` — hàm chưa tồn tại.

### Change
```tsx
function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function updateNote(state: UpdateState, info: Update | null, error: string): string {
  switch (state) {
    case "checking":
      return "Checking for updates…";
    case "none":
      return "You're on the latest version.";
    case "available":
      return info ? `Version ${info.version} is available.` : "A new version is available.";
    case "downloading":
      return "Downloading and installing — Tethys will restart automatically.";
    case "installed":
      return "Installed. Restarting…";
    case "error":
      return `Update check failed: ${error}`;
    case "idle":
    default:
      return "Press Check for updates to look for a newer build.";
  }
}
```

### Verify
```bash
cd app && npx tsc --noEmit && npm run build
```

## Acceptance criteria

- [ ] `cd app && npx tsc --noEmit` → 0 lỗi
- [ ] `cd app && npm run build` → thành công, sinh `dist/`
- [ ] `cd app && npm run tauri dev` → mở app, `Ctrl+,` mở Settings, sidebar có mục "Updates" với icon
      refresh
- [ ] Bấm "Check for updates" trong app đang chạy `npm run tauri dev` (chưa có `plugins.updater`
      endpoint thật nào trả `latest.json` hợp lệ ở giai đoạn này vì GitHub Release `v0.0.1` **chưa
      tồn tại** — đó là phase 4) → nút chuyển "Checking…" rồi về "Check for updates", note hiện
      "You're on the latest version." hoặc lỗi mạng rõ ràng (404) — **không** phải lỗi permission
      kiểu "not allowed" (nếu thấy lỗi đó, quay lại phase-01 bước 1-C, permission chưa đúng)
- [ ] `git status --short` chỉ liệt kê đúng 1 file: `app/src/settings/SettingsPanel.tsx`

## Gotchas

- `checkForUpdate()` gọi mạng thật tới `endpoints` trong `tauri.conf.json` — ở giai đoạn dev/phase
  này endpoint trỏ tới GitHub Release chưa tồn tại nên **sẽ luôn lỗi 404** cho tới sau `phase-04`.
  Đây là hành vi đúng, không phải bug — đừng cố "sửa" cho hết lỗi ở phase này.
- Đừng nhầm `@tauri-apps/plugin-process` (frontend, `relaunch()`) với `tauri-plugin-process` (Rust,
  đã thêm ở `phase-01`) — tên gói khác nhau giữa 2 phía dù cùng plugin.
- `ActionRow` không có prop `disabled` — không thêm nó. Việc chặn double-click nằm trong
  `handleCheckForUpdate`/`handleInstallUpdate` (dòng `if (updateState === ...) return;`).

## Deviations (điền nếu code thật khác plan)
> _(để trống nếu không có — NHƯNG xem cảnh báo ⚠️ ở Bước 2-D, bắt buộc đọc file thật trước Edit)_

## After finishing

- Cập nhật `CHECKLIST.md` (bảng phase → ✅ hoặc ⚠️, session log)
- Không commit trừ khi user yêu cầu (luật 6)
