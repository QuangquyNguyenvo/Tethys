import { create } from "zustand";
import {
  leaf,
  leaves,
  moveLeafTo,
  moveLeafToRoot,
  nextLeaf,
  removeLeaf,
  setRatio,
  splitAt,
  type Dir,
  type DropPosition,
  type Node,
  type Path,
  type RootPosition,
} from "../layout/tree";
import { dropZoneFor, hitTest, rootZoneFor } from "../layout/geometry";
import { getSnapshot } from "../layout/snapshot";
import { useThemeStore } from "../theme/useTheme";

/**
 * Hướng chia cho một block *mới thêm* (không phải Ctrl+Shift+E/O — hai phím đó chỉ định tay).
 *
 * Xoắn ốc chỉ cần đúng hai điều: luôn cắt block vừa mở (chính là block đang chọn, vì mở
 * xong là focus nhảy sang nó), và đổi hướng sau mỗi lần. Số leaf hiện có cho biết đang ở
 * nước thứ mấy: lẻ → cắt dọc thành trái/phải, chẵn → cắt ngang thành trên/dưới.
 */
function autoDir(tree: Node | null, target: string | null): Dir {
  const mode = useThemeStore.getState().opts.layoutMode ?? "spiral";
  if (mode === "manual") return "row";
  if (mode === "dwindle") {
    const r = target ? getSnapshot()?.layout.rects.get(target) : null;
    // Không đo được (panel chưa vẽ xong) thì chia ngang — cửa sổ nào cũng rộng hơn cao.
    return !r || r.w >= r.h ? "row" : "col";
  }
  return (tree ? leaves(tree).length : 0) % 2 === 1 ? "row" : "col";
}

export type PanelType = "terminal" | "preview" | "explorer" | "web" | "settings" | "system";

export type Panel = {
  /** Khoá phía frontend. `SessionId` của Rust do `usePty` tự lấy sau khi spawn. */
  key: string;
  type?: PanelType;
  // Cho terminal
  shell?: string;
  cwd?: string;
  // Cho preview và explorer (explorer dùng `path` làm thư mục đang mở)
  path?: string;
  mode?: "auto" | "image" | "markdown" | "diff" | "text";
  // Cho web
  url?: string;
};

export type Workspace = {
  id: string;
  name: string;
  tree: Node | null;
  panels: Panel[];
  focused: string | null;
};

/**
 * Trạng thái một lượt kéo panel. Toạ độ lưu theo hệ của canvas (đã trừ gốc), nhờ vậy
 * lớp phủ chỉ báo vẽ thẳng ra được mà không phải đổi hệ toạ độ lần nữa.
 */
export type DragState = {
  key: string;
  x: number;
  y: number;
  /** Panel đang bị nhắm tới, `null` khi con trỏ ở mép ngoài hoặc ngoài canvas. */
  target: string | null;
  zone: DropPosition | null;
  /** Mép ngoài cùng của canvas, ưu tiên hơn `target` khi khác `null`. */
  root: RootPosition | null;
};

type SessionStore = {
  // Current active workspace state (synced with activeWorkspaceId)
  panels: Panel[];
  tree: Node | null;
  focused: string | null;
  /** Chỉ khác `null` trong lúc thật sự đang kéo, không phải lúc mới bấm chuột. */
  drag: DragState | null;
  /** Chỉ dựng panel sau khi đã nạp xong state đã lưu, để khỏi spawn thừa một shell. */
  hydrated: boolean;

  // Workspaces list
  workspaces: Workspace[];
  activeWorkspaceId: string;

  /** Tách panel đang focus làm đôi. Trả khoá của panel mới. */
  split: (dir: Dir, p?: Omit<Panel, "key">, targetKey?: string) => string | null;
  /** Tạo một panel mới (kể cả khi không còn panel nào). */
  createPanel: (p?: Omit<Panel, "key">) => string;
  /** Mở preview cho một file. Nếu file đã mở thì focus panel đó, ngược lại split panel mới. */
  openPreview: (path: string, dir?: Dir, mode?: Panel["mode"]) => string | null;
  /** Mở URL trong block Web; dùng cho Ctrl+click URL từ output `npm run dev`. */
  openWeb: (url: string, dir?: Dir) => string | null;
  /** Cập nhật thuộc tính của một panel đang mở (explorer đổi thư mục, web đổi URL). */
  updatePanel: (key: string, patch: Partial<Omit<Panel, "key">>) => void;
  /**
   * Nhân đôi một panel *cùng thư mục làm việc* (Ctrl+Shift+D).
   *
   * Terminal thì `cwd` là thư mục shell đang đứng — không phải thư mục lúc mở panel:
   * `usePty` bám OSC 7 nên `cd` xong là store đã cập nhật.
   */
  duplicate: (key?: string) => string | null;
  remove: (key: string) => void;
  focus: (key: string) => void;
  move: (step: 1 | -1) => void;
  resize: (path: Path, ratio: number) => void;
  setHydrated: () => void;
  beginDrag: (key: string, clientX: number, clientY: number) => void;
  updateDrag: (clientX: number, clientY: number) => void;
  endDrag: (commit: boolean) => void;
  restore: (
    tree: Node | null,
    panels: Panel[],
    focused: string | null,
    workspaces?: Workspace[],
    activeWsId?: string,
  ) => void;
  movePanel: (sourceKey: string, targetKey: string, position: DropPosition) => void;
  movePanelToRoot: (sourceKey: string, position: RootPosition) => void;
  /** Snap block đang chọn vào một cạnh, giữ nguyên các block khác. */
  snapPanel: (sourceKey: string, position: RootPosition) => void;

  // Workspaces actions
  switchWorkspace: (id: string) => void;
  cycleWorkspace: (step: -1 | 1) => void;
  addWorkspace: (name?: string) => string;
  removeWorkspace: (id: string) => void;
  renameWorkspace: (id: string, name: string) => void;
};

let seq = 0;
const nextKey = () => `p${++seq}`;

const first = nextKey();
const defaultWsId = "ws_1";

const initialWorkspaces: Workspace[] = [
  {
    id: defaultWsId,
    name: "Workspace 1",
    tree: leaf(first),
    panels: [{ key: first, type: "terminal" }],
    focused: first,
  },
];

export const useSessions = create<SessionStore>((set, get) => ({
  panels: [{ key: first, type: "terminal" }],
  tree: leaf(first),
  focused: first,
  drag: null,
  hydrated: false,
  workspaces: initialWorkspaces,
  activeWorkspaceId: defaultWsId,

  setHydrated: () => set({ hydrated: true }),

  restore: (tree, panels, focused, savedWorkspaces, activeWsId) => {
    // Cập nhật seq cao hơn các key hiện có để tránh trùng lặp
    const scanPanels = (pList: Panel[]) => {
      pList.forEach((p) => {
        const match = p.key.match(/^p(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > seq) seq = num;
        }
      });
    };

    scanPanels(panels);
    if (savedWorkspaces) {
      savedWorkspaces.forEach((w) => scanPanels(w.panels));
    }

    if (savedWorkspaces && savedWorkspaces.length > 0) {
      const activeId = activeWsId && savedWorkspaces.some((w) => w.id === activeWsId)
        ? activeWsId
        : savedWorkspaces[0].id;
      const curWs = savedWorkspaces.find((w) => w.id === activeId) || savedWorkspaces[0];
      set({
        workspaces: savedWorkspaces,
        activeWorkspaceId: activeId,
        tree: curWs.tree,
        panels: curWs.panels,
        focused: curWs.focused,
      });
    } else {
      set({
        tree,
        panels,
        focused,
        workspaces: [
          {
            id: defaultWsId,
            name: "Workspace 1",
            tree,
            panels,
            focused,
          },
        ],
        activeWorkspaceId: defaultWsId,
      });
    }
  },

  createPanel: (p) => {
    const { tree } = get();
    const key = nextKey();
    const panelType = p?.type ?? (p?.path ? "preview" : "terminal");
    const newPanel: Panel = { key, type: panelType, ...p };

    if (!tree) {
      const newTree = leaf(key);
      set((s) => {
        const nextWorkspaces = s.workspaces.map((w) =>
          w.id === s.activeWorkspaceId
            ? { ...w, tree: newTree, panels: [newPanel], focused: key }
            : w,
        );
        return {
          tree: newTree,
          panels: [newPanel],
          focused: key,
          workspaces: nextWorkspaces,
        };
      });
      return key;
    }

    // `key` ở trên chỉ dùng cho nhánh cây rỗng; nhánh này để `split` tự cấp khoá và trả về
    // đúng khoá đó. Bản cũ trả `key` cũ — một khoá không hề tồn tại trong store.
    return get().split(autoDir(tree, get().focused), p) ?? key;
  },

  split: (dir, p, targetKey) => {
    const { tree, focused, activeWorkspaceId, workspaces } = get();
    const target = targetKey ?? focused;
    if (!tree || !target) return null;
    const key = nextKey();
    const panelType = p?.type ?? (p?.path ? "preview" : "terminal");
    const newPanel: Panel = { key, type: panelType, ...p };
    const nextTree = splitAt(tree, target, dir, key);

    set((s) => {
      const nextPanels = [...s.panels, newPanel];
      const nextWorkspaces = workspaces.map((w) =>
        w.id === activeWorkspaceId
          ? { ...w, tree: nextTree, panels: nextPanels, focused: key }
          : w,
      );
      return {
        panels: nextPanels,
        tree: nextTree,
        focused: key,
        workspaces: nextWorkspaces,
      };
    });
    return key;
  },

  openPreview: (path, dir = "row", mode = "auto") => {
    const { panels, split, focus } = get();
    const existing = panels.find((p) => p.type === "preview" && p.path === path);
    if (existing) {
      focus(existing.key);
      return existing.key;
    }
    return split(dir, { type: "preview", path, mode });
  },

  openWeb: (url, dir = "row") => {
    const { panels, split, focus } = get();
    const existing = panels.find((p) => p.type === "web" && p.url === url);
    if (existing) {
      focus(existing.key);
      return existing.key;
    }
    return split(dir, { type: "web", url });
  },

  duplicate: (key) => {
    const s = get();
    const src = s.panels.find((p) => p.key === (key ?? s.focused));
    if (!src) return null;
    const { key: _drop, ...rest } = src;
    return s.split(autoDir(s.tree, src.key), rest, src.key);
  },

  updatePanel: (key, patch) =>
    set((s) => {
      const apply = (list: Panel[]) =>
        list.map((p) => (p.key === key ? { ...p, ...patch } : p));
      return {
        panels: apply(s.panels),
        workspaces: s.workspaces.map((w) => ({ ...w, panels: apply(w.panels) })),
      };
    }),

  remove: (key) =>
    set((s) => {
      if (!s.tree) return s;
      const previousLeaves = leaves(s.tree);
      const removedIndex = previousLeaves.indexOf(key);
      const tree = removeLeaf(s.tree, key);
      const rest = leaves(tree);
      const nextPanels = s.panels.filter((x) => x.key !== key);
      const neighborIndex = Math.min(Math.max(removedIndex, 0), Math.max(rest.length - 1, 0));
      const nextFocused = s.focused === key ? (rest[neighborIndex] ?? null) : s.focused;

      const nextWorkspaces = s.workspaces.map((w) =>
        w.id === s.activeWorkspaceId
          ? { ...w, tree, panels: nextPanels, focused: nextFocused }
          : w,
      );

      return {
        panels: nextPanels,
        tree,
        focused: nextFocused,
        workspaces: nextWorkspaces,
      };
    }),

  focus: (key) =>
    set((s) => {
      const nextWorkspaces = s.workspaces.map((w) =>
        w.id === s.activeWorkspaceId ? { ...w, focused: key } : w,
      );
      return { focused: key, workspaces: nextWorkspaces };
    }),

  move: (step) =>
    set((s) => {
      const nextFocused = s.focused ? nextLeaf(s.tree, s.focused, step) : s.focused;
      const nextWorkspaces = s.workspaces.map((w) =>
        w.id === s.activeWorkspaceId ? { ...w, focused: nextFocused } : w,
      );
      return { focused: nextFocused, workspaces: nextWorkspaces };
    }),

  resize: (path, ratio) =>
    set((s) => {
      if (!s.tree) return s;
      const nextTree = setRatio(s.tree, path, ratio);
      const nextWorkspaces = s.workspaces.map((w) =>
        w.id === s.activeWorkspaceId ? { ...w, tree: nextTree } : w,
      );
      return { tree: nextTree, workspaces: nextWorkspaces };
    }),

  movePanel: (sourceKey, targetKey, position) =>
    set((s) => {
      if (!s.tree) return s;
      const nextTree = moveLeafTo(s.tree, sourceKey, targetKey, position);
      if (nextTree === s.tree) return s;
      const nextWorkspaces = s.workspaces.map((w) =>
        w.id === s.activeWorkspaceId
          ? { ...w, tree: nextTree, focused: sourceKey }
          : w,
      );
      return { tree: nextTree, focused: sourceKey, workspaces: nextWorkspaces };
    }),

  movePanelToRoot: (sourceKey, position) =>
    set((s) => {
      if (!s.tree) return s;
      const nextTree = moveLeafToRoot(s.tree, sourceKey, position);
      if (nextTree === s.tree) return s;
      const nextWorkspaces = s.workspaces.map((w) =>
        w.id === s.activeWorkspaceId
          ? { ...w, tree: nextTree, focused: sourceKey }
          : w,
      );
      return { tree: nextTree, focused: sourceKey, workspaces: nextWorkspaces };
    }),

  snapPanel: (sourceKey, position) =>
    set((s) => {
      if (!s.tree) return s;
      // Khác kéo-thả ở mép (32%): snap là một nửa canvas như Windows.
      const nextTree = moveLeafToRoot(s.tree, sourceKey, position, 0.5);
      if (nextTree === s.tree) return s;
      const nextWorkspaces = s.workspaces.map((w) =>
        w.id === s.activeWorkspaceId
          ? { ...w, tree: nextTree, focused: sourceKey }
          : w,
      );
      return { tree: nextTree, focused: sourceKey, workspaces: nextWorkspaces };
    }),

  beginDrag: (key, clientX, clientY) => {
    set({ drag: { key, x: 0, y: 0, target: null, zone: null, root: null } });
    get().updateDrag(clientX, clientY);
  },

  /**
   * Tự tính đích thả từ ảnh chụp hình học thay vì dựa vào `dragover` của DOM.
   * Bản cũ dùng HTML5 drag-and-drop, mà WebView2 trên Windows nuốt sạch nhóm sự kiện đó
   * khi Tauri bật `dragDropEnabled` để nhận file kéo từ ngoài vào — nên nó không bao giờ chạy.
   */
  updateDrag: (clientX, clientY) => {
    const d = get().drag;
    if (!d) return;
    const snap = getSnapshot();
    if (!snap) return;

    const x = clientX - snap.origin.x;
    const y = clientY - snap.origin.y;
    const box = { x: 0, y: 0, w: snap.origin.w, h: snap.origin.h };

    const root = rootZoneFor(box, x, y);
    let target: string | null = null;
    let zone: DropPosition | null = null;

    if (!root) {
      const hit = hitTest(snap.layout, x, y);
      if (hit && hit !== d.key) {
        target = hit;
        zone = dropZoneFor(snap.layout.rects.get(hit)!, x, y);
      }
    }

    if (d.x === x && d.y === y && d.target === target && d.zone === zone && d.root === root) return;
    set({ drag: { key: d.key, x, y, target, zone, root } });
  },

  endDrag: (commit) => {
    const d = get().drag;
    set({ drag: null });
    if (!d || !commit) return;
    if (d.root) {
      get().movePanelToRoot(d.key, d.root);
    } else if (d.target && d.zone) {
      get().movePanel(d.key, d.target, d.zone);
    }
  },

  switchWorkspace: (id) => {
    const { workspaces, activeWorkspaceId, tree, panels, focused } = get();
    if (id === activeWorkspaceId) return;

    // Save current active workspace state first
    const updated = workspaces.map((w) =>
      w.id === activeWorkspaceId ? { ...w, tree, panels, focused } : w,
    );

    const target = updated.find((w) => w.id === id);
    if (!target) return;

    set({
      workspaces: updated,
      activeWorkspaceId: id,
      tree: target.tree,
      panels: target.panels,
      focused: target.focused,
    });
  },

  cycleWorkspace: (step) => {
    const { workspaces, activeWorkspaceId } = get();
    if (workspaces.length < 2) return;
    const activeIndex = workspaces.findIndex((workspace) => workspace.id === activeWorkspaceId);
    const currentIndex = activeIndex >= 0 ? activeIndex : 0;
    const targetIndex = (currentIndex + step + workspaces.length) % workspaces.length;
    get().switchWorkspace(workspaces[targetIndex].id);
  },

  addWorkspace: (name) => {
    const { workspaces, activeWorkspaceId, tree, panels, focused } = get();
    const id = `ws_${Date.now()}`;
    const wsName = name || `Workspace ${workspaces.length + 1}`;
    const newKey = nextKey();
    const newPanel: Panel = { key: newKey, type: "terminal" };
    const newTree = leaf(newKey);

    const updated = workspaces.map((w) =>
      w.id === activeWorkspaceId ? { ...w, tree, panels, focused } : w,
    );

    const newWs: Workspace = {
      id,
      name: wsName,
      tree: newTree,
      panels: [newPanel],
      focused: newKey,
    };

    set({
      workspaces: [...updated, newWs],
      activeWorkspaceId: id,
      tree: newTree,
      panels: [newPanel],
      focused: newKey,
    });
    return id;
  },

  removeWorkspace: (id) => {
    const { workspaces, activeWorkspaceId } = get();
    if (workspaces.length <= 1) return;

    const nextWorkspaces = workspaces.filter((w) => w.id !== id);
    if (activeWorkspaceId === id) {
      const fallback = nextWorkspaces[nextWorkspaces.length - 1];
      set({
        workspaces: nextWorkspaces,
        activeWorkspaceId: fallback.id,
        tree: fallback.tree,
        panels: fallback.panels,
        focused: fallback.focused,
      });
    } else {
      set({ workspaces: nextWorkspaces });
    }
  },

  renameWorkspace: (id, name) =>
    set((s) => ({
      workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, name } : w)),
    })),
}));
