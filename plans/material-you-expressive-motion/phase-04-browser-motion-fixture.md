# Phase 4 — Tạo browser fixture cho workspace motion

> **Prereq**: phase 3 | **Rủi ro**: 🟠 | **Rollback**: đảo đúng các hunk của phase này;
> **không** dùng `git restore` vì cả hai file đã có thay đổi từ trước.
> **Files đụng tới**: `app/src/App.tsx`, `app/src/store/sessions.ts` — không file nào khác.

## Context recovery

Đọc `CONTEXT.md` và `CHECKLIST.md` trước. Phase này chỉ làm Vite preview deterministic để
model rẻ có thể test shared pill/workspace motion mà không cần Tauri/ConPTY.

## Goal

Vite preview khởi động với hai workspace explorer có tên dài khác nhau, đổi workspace được,
và nút Add workspace tạo explorer thay vì terminal. Native Tauri vẫn tạo terminal như cũ.

## KHÔNG đụng vào

- Motion CSS/React đang có — first pass đã verify.
- `TerminalPanel`, `usePty`, Rust backend — browser fixture không được giả IPC.
- Persistence của native saved state — fixture chỉ chạy khi không có `__TAURI_INTERNALS__`.

## Bước 4-A — Cho `addWorkspace` nhận initial panel

### Current code (`app/src/store/sessions.ts` ~dòng 129–133), nguyên văn

```ts
// Workspaces actions
switchWorkspace: (id: string) => void;
cycleWorkspace: (step: -1 | 1) => void;
addWorkspace: (name?: string) => string;
removeWorkspace: (id: string) => void;
renameWorkspace: (id: string, name: string) => void;
```

### Current code (`app/src/store/sessions.ts` ~dòng 474–480), nguyên văn

```ts
addWorkspace: (name) => {
  const { workspaces, activeWorkspaceId, tree, panels, focused } = get();
  const id = `ws_${Date.now()}`;
  const wsName = name || `Workspace ${workspaces.length + 1}`;
  const newKey = nextKey();
  const newPanel: Panel = { key: newKey, type: "terminal" };
  const newTree = leaf(newKey);
```

### Vấn đề

`addWorkspace()` luôn dựng `TerminalPanel`. Trong Vite không có Tauri Channel nên click dấu `+`
làm React tree trắng; vì vậy không test được active pill hoặc workspace transition.

### Change

Đổi type và implementation như sau; giữ toàn bộ phần còn lại của action nguyên vẹn:

```ts
addWorkspace: (name?: string, initialPanel?: Omit<Panel, "key">) => string;
```

```ts
addWorkspace: (name, initialPanel) => {
  const { workspaces, activeWorkspaceId, tree, panels, focused } = get();
  const id = `ws_${Date.now()}`;
  const wsName = name || `Workspace ${workspaces.length + 1}`;
  const newKey = nextKey();
  const panelType = initialPanel?.type ?? (initialPanel?.path ? "preview" : "terminal");
  const newPanel: Panel = { key: newKey, ...initialPanel, type: panelType };
  const newTree = leaf(newKey);
```

Native caller không truyền `initialPanel`, nên hành vi terminal mặc định không đổi.

### Verify

```powershell
cd app
npx tsc --noEmit
```

## Bước 4-B — Bootstrap hai workspace browser-only

### Current code (`app/src/App.tsx` ~dòng 4–7), nguyên văn

```ts
import { Tiles } from "./layout/Tiles";
import { useSessions, type PanelType } from "./store/sessions";
import { useTheme, useThemeStore } from "./theme/useTheme";
```

### Current code (`app/src/App.tsx` ~dòng 103–114), nguyên văn

```ts
useEffect(() => {
  // Browser preview không có Tauri/ConPTY. TerminalPanel tạo IPC Channel thật nên sập
  // cả React tree; Explorer thì gọi `invoke` bọc try/catch nên chỉ tự hiện lỗi, an toàn
  // để designer soi chrome. Settings giờ là popup, không còn là panel — mở nó song song
  // là cách designer vẫn kiểm được toàn bộ chrome của nó.
  if (!("__TAURI_INTERNALS__" in window)) {
    const key = "preview-settings";
    restore({ kind: "leaf", key }, [{ key, type: "explorer" }], key);
    setSettingsOpen(true);
    setHydrated();
    return;
  }
```

### Change

Import thêm `Workspace`:

```ts
import { useSessions, type PanelType, type Workspace } from "./store/sessions";
```

Thay riêng nhánh browser bằng fixture sau:

```ts
if (!("__TAURI_INTERNALS__" in window)) {
  const previewWorkspaces: Workspace[] = [
    {
      id: "preview-workspace-1",
      name: "Workspace 1",
      tree: { kind: "leaf", key: "preview-explorer-1" },
      panels: [{ key: "preview-explorer-1", type: "explorer" }],
      focused: "preview-explorer-1",
    },
    {
      id: "preview-workspace-2",
      name: "Motion Lab",
      tree: { kind: "leaf", key: "preview-explorer-2" },
      panels: [{ key: "preview-explorer-2", type: "explorer" }],
      focused: "preview-explorer-2",
    },
  ];
  const active = previewWorkspaces[0];
  restore(active.tree, active.panels, active.focused, previewWorkspaces, active.id);
  setSettingsOpen(true);
  setHydrated();
  return;
}
```

Tên `Workspace 1` và `Motion Lab` cố ý khác width để nhìn được cả translate lẫn width morph
của `.tab-active-indicator`.

## Bước 4-C — Nút Add dùng explorer trong browser

### Current code (`app/src/App.tsx` ~dòng 781–787), nguyên văn

```tsx
<Titlebar
  tabs={workspaces}
  activeTab={activeWorkspaceId}
  onSelectTab={switchWorkspace}
  onAddTab={() => addWorkspace()}
  onCloseTab={removeWorkspace}
/>
```

### Change

```tsx
<Titlebar
  tabs={workspaces}
  activeTab={activeWorkspaceId}
  onSelectTab={switchWorkspace}
  onAddTab={() =>
    addWorkspace(
      undefined,
      "__TAURI_INTERNALS__" in window ? undefined : { type: "explorer" },
    )
  }
  onCloseTab={removeWorkspace}
/>
```

### Verify

```powershell
cd app
npm run dev
```

Mở URL Vite và kiểm bằng mắt:

1. Settings mở, phía sau có hai workspace.
2. Đóng Settings; click `Workspace 1` ↔ `Motion Lab`: pill trượt, app không trắng.
3. Click `+`: workspace thứ ba mở explorer, không dựng terminal.
4. Native Tauri vẫn gọi `addWorkspace()` không initial panel và tạo terminal.

## Acceptance criteria

- [ ] `npx tsc --noEmit` PASS.
- [ ] `npm run build` PASS.
- [ ] `npm run check` PASS.
- [ ] Vite DOM có `preview-workspace-1` và `preview-workspace-2` trong store.
- [ ] ⛔ MANUAL — switch hai workspace 10 lần; không trắng, không stuck leaving panel.
- [ ] ⛔ MANUAL — click Add trong Vite tạo explorer; click Add trong Tauri tạo terminal.
- [ ] `git status --short` vẫn giữ toàn bộ file bẩn đã có trước phase.

## Gotchas

- Không “mock” `window.__TAURI_INTERNALS__`; đó là ranh giới thật giữa preview và native.
- Hai explorer sẽ báo lỗi IPC trong Vite nhưng React tree vẫn sống; đây là trạng thái fixture
  chấp nhận được. Không đi sửa Explorer/Tauri trong phase này.
- `restore` phải nhận cả `previewWorkspaces` và active id; gọi overload ba tham số sẽ lại chỉ
  có một workspace.

## Deviations

> _(để trống nếu không có)_

## After finishing

- Cập nhật `CHECKLIST.md`: trạng thái phase, session log và deviations.
