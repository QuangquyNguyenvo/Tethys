import { useCallback, useEffect, useMemo, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Tiles } from "./layout/Tiles";
import { useSessions, type PanelType } from "./store/sessions";
import { useTheme, useThemeStore } from "./theme/useTheme";
import { TERM_OPACITY_MAX, TERM_OPACITY_MIN } from "./theme/palette";
import { CommandPalette } from "./palette/CommandPalette";
import type { CommandItem } from "./palette/commands";
import { Titlebar } from "./titlebar/Titlebar";
import { Dock, type DockItem } from "./dock/Dock";
import { Folder, Globe, MonitorCog, Settings, Terminal } from "lucide-react";
import "./App.css";

export default function App() {
  const { xterm, source, wallpaper, opts, setOpts, refresh } = useTheme();
  const tree = useSessions((s) => s.tree);
  const panels = useSessions((s) => s.panels);
  const focused = useSessions((s) => s.focused);
  const split = useSessions((s) => s.split);
  const remove = useSessions((s) => s.remove);
  const move = useSessions((s) => s.move);
  const snapPanel = useSessions((s) => s.snapPanel);
  const openPreview = useSessions((s) => s.openPreview);
  const restore = useSessions((s) => s.restore);
  const createPanel = useSessions((s) => s.createPanel);
  const duplicate = useSessions((s) => s.duplicate);
  const hydrated = useSessions((s) => s.hydrated);
  const setHydrated = useSessions((s) => s.setHydrated);
  const workspaces = useSessions((s) => s.workspaces);
  const activeWorkspaceId = useSessions((s) => s.activeWorkspaceId);
  const switchWorkspace = useSessions((s) => s.switchWorkspace);
  const cycleWorkspace = useSessions((s) => s.cycleWorkspace);
  const addWorkspace = useSessions((s) => s.addWorkspace);
  const removeWorkspace = useSessions((s) => s.removeWorkspace);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    invoke<boolean>("app_window_toggle_fullscreen")
      .then(setIsFullscreen)
      .catch((error) => {
        invoke("frontend_error", { message: `fullscreen toggle failed: ${String(error)}` }).catch(() => {});
      });
  }, []);
  // CSS controls the webview only; the actual Acrylic/Mica surface belongs to Windows.
  useEffect(() => {
    invoke("app_window_set_vibrancy", { enabled: opts.windowVibrancy !== false }).catch(() => {});
  }, [opts.windowVibrancy]);

  // Khởi động: kiểm tra boot hook đo đạc trước, nếu không có thì nạp state đã lưu.
  // `setHydrated` phải chạy ở **mọi** nhánh — `Tiles` không dựng panel nào trước đó,
  // để tránh spawn một shell rồi vứt đi ngay khi state đã lưu ghi đè lên panel mặc định.
  useEffect(() => {
    // Browser preview không có Tauri/ConPTY. Dựng thẳng panel Settings để designer vẫn
    // kiểm được toàn bộ chrome thay vì React tree sập lúc TerminalPanel tạo IPC Channel.
    if (!("__TAURI_INTERNALS__" in window)) {
      const key = "preview-settings";
      restore({ kind: "leaf", key }, [{ key, type: "settings" }], key);
      setHydrated();
      return;
    }

    Promise.all([
      invoke<number>("boot_panels").catch(() => 1),
      invoke<string | null>("boot_preview").catch(() => null),
    ]).then(([bootPanels, bootPreview]) => {
      if (bootPanels > 1) {
        for (let i = 1; i < bootPanels; i++) split(i % 2 === 1 ? "row" : "col");
        setHydrated();
        return;
      }
      if (bootPreview) {
        openPreview(bootPreview, "row");
        setHydrated();
        return;
      }

      invoke<{
        layout?: any;
        panels?: any;
        focused?: string;
        theme_opts?: any;
        workspaces?: any;
        active_workspace_id?: string;
      } | null>("storage_load_state")
        .then((saved) => {
          if (saved) {
            if (saved.workspaces && saved.workspaces.length > 0) {
              restore(
                saved.layout ?? null,
                saved.panels ?? [],
                saved.focused ?? null,
                saved.workspaces,
                saved.active_workspace_id,
              );
            } else if (saved.layout && saved.panels) {
              restore(saved.layout, saved.panels, saved.focused ?? null);
            }
            if (saved.theme_opts) {
              // Các bản trước khởi động ở brand + surface phẳng, nên ngay cả khi backend
              // đã tìm được wallpaper thì nó vẫn bị che kín. Nâng state cũ một lần sang
              // giao diện kính; từ đây trở đi người dùng đổi lại Phẳng vẫn được giữ nguyên.
              const savedTheme = saved.theme_opts as Record<string, unknown>;
              const legacyAppearance = savedTheme.appearanceVersion === undefined;
              // V5 returns the workspace bar to its original auto-hide behavior. The dock
              // stays available, since its edge trigger is too easy to miss in daily use.
              const preWorkspaceAutoHide =
                legacyAppearance ||
                (typeof savedTheme.appearanceVersion === "number" && savedTheme.appearanceVersion < 5);
              setOpts(
                legacyAppearance
                  ? {
                      ...savedTheme,
                      appearanceVersion: 5,
                      colorSource: "wallpaper",
                      surfaceStyle: "glass",
                      windowVibrancy: true,
                      blurEffects: true,
                      dockAutoHide: false,
                      navAutoHide: true,
                    }
                  : preWorkspaceAutoHide
                    ? { ...savedTheme, appearanceVersion: 5, dockAutoHide: false, navAutoHide: true }
                    : savedTheme,
              );
            }
          }
        })
        .catch(() => {})
        .finally(() => setHydrated());
    });
  }, [split, openPreview, restore, setOpts, setHydrated]);

  // Tự động lưu trạng thái khi layout, workspaces hoặc cài đặt thay đổi (debounce 500ms)
  useEffect(() => {
    // Không để state mặc định ghi đè state trên đĩa trong lúc IPC khởi động còn đang nạp.
    if (!hydrated) return;
    const timer = setTimeout(() => {
      invoke("storage_save_state", {
        state: {
          layout: tree,
          panels,
          focused,
          theme_opts: opts,
          workspaces,
          active_workspace_id: activeWorkspaceId,
        },
      }).catch(() => {});
    }, 500);

    return () => clearTimeout(timer);
  }, [hydrated, tree, panels, focused, opts, workspaces, activeWorkspaceId]);

  // Kéo thả file từ bên ngoài vào cửa sổ -> mở Preview
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    // Vite preview has no Tauri bridge. Drag-and-drop remains native in the desktop
    // app, while this guard lets visual QA render without console errors.
    let webview;
    try {
      webview = getCurrentWebview();
    } catch {
      return;
    }
    webview
      .onDragDropEvent((event) => {
        if (event.payload.type === "drop") {
          const paths = event.payload.paths;
          if (paths && paths.length > 0) {
            openPreview(paths[0], "row");
          }
        }
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});

    return () => {
      if (unlisten) unlisten();
    };
  }, [openPreview]);

  // Đọc thẳng từ store thay vì đóng gói `opts` vào closure: hàm này bị cả handler phím tắt
  // lẫn bảng lệnh gọi, mà cả hai đều được nhớ (memo) — bắt qua closure là kẹp phải giá trị cũ.
  const stepTermOpacity = useCallback(
    (delta: number) => {
      const cur = useThemeStore.getState().opts.termOpacity ?? TERM_OPACITY_MAX;
      const next = Math.min(TERM_OPACITY_MAX, Math.max(TERM_OPACITY_MIN, +(cur + delta).toFixed(2)));
      setOpts({ termOpacity: next });
    },
    [setOpts],
  );

  /**
   * Mở panel loại này, nhưng chỉ **một** cái: đã có rồi thì đưa con trỏ về đó.
   *
   * Dành cho loại panel không mang trạng thái riêng — cài đặt và sysfetch đều đọc cùng
   * một nguồn, nên cái thứ hai là bản sao y hệt cái thứ nhất, chỉ tổ chiếm chỗ và nhân
   * đôi vòng đo mỗi giây. Terminal / explorer / web thì ngược lại: mỗi cái một cwd,
   * một session, nên mở bao nhiêu cái cũng có nghĩa.
   *
   * Phạm vi "một cái" là **trong workspace hiện tại**, vì `panels` của store là của
   * workspace đang mở — sang workspace khác vẫn mở được một cái của riêng nó.
   */
  const openOnce = useCallback((type: PanelType) => {
    const s = useSessions.getState();
    const open = s.panels.find((p) => p.type === type);
    if (open) s.focus(open.key);
    else s.createPanel({ type });
  }, []);

  const openSettings = useCallback(() => openOnce("settings"), [openOnce]);
  const openSystem = useCallback(() => openOnce("system"), [openOnce]);

  // Phím tắt toàn cục: Command Palette và Layout navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A real native fullscreen, so Windows chrome is gone as well. Capture phase keeps
      // both shortcuts available while focus is inside the xterm canvas.
      if (e.key === "F11" || (e.altKey && !e.ctrlKey && !e.shiftKey && e.code === "Enter")) {
        e.preventDefault();
        e.stopPropagation();
        toggleFullscreen();
        return;
      }

      if (
        (e.ctrlKey && e.key.toLowerCase() === "k") ||
        (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "p") ||
        e.key === "F1"
      ) {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
        return;
      }

      // Ctrl+1 / Ctrl+3 step through workspaces with wraparound. Keep this ahead of
      // xterm so the shell never receives the digit after the workspace has changed.
      if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        const step = /^(?:Digit|Numpad)1$/.test(e.code)
          ? -1
          : /^(?:Digit|Numpad)3$/.test(e.code)
            ? 1
            : null;
        if (step) {
          e.preventDefault();
          e.stopPropagation();
          cycleWorkspace(step);
          return;
        }
      }

      // Alt+1…9 — nhảy thẳng tới workspace thứ n.
      //
      // So bằng `e.code` chứ không `e.key`: trên Windows, Alt+<số> đi qua bảng layout nên
      // `e.key` có thể ra ký tự khác hẳn (và Alt+<số> ở numpad chính là lối gõ Alt-code).
      // `stopPropagation` bắt buộc — chỉ `preventDefault` thì xterm vẫn nuốt phím và gửi
      // `ESC` + chữ số xuống shell, tức là chuyển workspace xong shell lại ăn thêm một phím.
      if (
        e.altKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        !e.metaKey &&
        useThemeStore.getState().opts.workspaceAltKeys !== false
      ) {
        const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
        if (m) {
          e.preventDefault();
          e.stopPropagation();
          const s = useSessions.getState();
          const target = s.workspaces[Number(m[1]) - 1];
          if (target) s.switchWorkspace(target.id);
          return;
        }
      }

      // Snap kiểu Windows: chỉ sắp lại block hiện có, không spawn terminal/block mới.
      // Windows có thể giữ Super + mũi tên ở mức hệ điều hành, nên Ctrl+Alt+ mũi tên là
      // alias tin cậy khi WebView không nhận được phím Win.
      if ((e.metaKey || (e.ctrlKey && e.altKey)) && !e.shiftKey) {
        const direction =
          e.code === "ArrowLeft" ? "left" :
          e.code === "ArrowRight" ? "right" :
          e.code === "ArrowUp" ? "top" :
          e.code === "ArrowDown" ? "bottom" : null;
        if (direction) {
          const cur = useSessions.getState().focused;
          if (cur) {
            e.preventDefault();
            e.stopPropagation();
            snapPanel(cur, direction);
          }
          return;
        }
      }

      // Ctrl+, — quy ước mở cài đặt của gần như mọi editor.
      if (e.ctrlKey && !e.shiftKey && e.key === ",") {
        e.preventDefault();
        openSettings();
        return;
      }

      // Ctrl+T / Ctrl+W kiểu tab trình duyệt. `stopPropagation` là bắt buộc chứ không thừa:
      // chỉ `preventDefault` thì sự kiện vẫn xuống tới textarea của xterm và shell vẫn nhận
      // Ctrl+W như lệnh xoá lùi một từ — đóng block xong lại mất luôn một từ đang gõ.
      if (
        e.ctrlKey &&
        !e.shiftKey &&
        !e.altKey &&
        useThemeStore.getState().opts.tabShortcuts !== false
      ) {
        const c = e.key.toLowerCase();
        if (c === "t" || c === "w") {
          e.preventDefault();
          e.stopPropagation();
          if (c === "t") createPanel({ type: "terminal" });
          else {
            const cur = useSessions.getState().focused;
            if (cur) remove(cur);
          }
          return;
        }
      }

      if (!e.ctrlKey || !e.shiftKey) return;

      // Dùng `e.code` chứ không `e.key`: giữ Shift thì `[` thành `{`, so theo ký tự sẽ trượt.
      if (e.code === "BracketLeft") {
        e.preventDefault();
        stepTermOpacity(-0.05);
        return;
      }
      if (e.code === "BracketRight") {
        e.preventDefault();
        stepTermOpacity(+0.05);
        return;
      }

      // Phím layout phải dựa vào `code`, không dựa vào ký tự sinh ra: bộ gõ/keyboard layout
      // có thể biến Ctrl+Shift+E thành ký tự khác dù người dùng vẫn bấm đúng phím E.
      // Chặn propagation để xterm và TUI không nhận thêm tổ hợp sau khi block đã được chia.
      if (e.code === "KeyE") {
        e.preventDefault();
        e.stopPropagation();
        const cur = useSessions.getState().focused;
        if (cur) snapPanel(cur, "right");
      } else if (e.code === "KeyO") {
        e.preventDefault();
        e.stopPropagation();
        const cur = useSessions.getState().focused;
        if (cur) snapPanel(cur, "bottom");
      } else if (e.code === "KeyD") {
        e.preventDefault();
        e.stopPropagation();
        duplicate();
      } else if (e.code === "KeyW") {
        e.preventDefault();
        e.stopPropagation();
        const cur = useSessions.getState().focused;
        if (cur) remove(cur);
      } else if (e.code === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        move(1);
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [remove, move, snapPanel, stepTermOpacity, duplicate, openSettings, createPanel, cycleWorkspace, toggleFullscreen]);

  const commands: CommandItem[] = useMemo(
    () => [
      {
        id: "split_right",
        title: "Place selected panel to the right",
        category: "Layout",
        shortcut: "Ctrl+Shift+E",
        action: () => {
          const cur = useSessions.getState().focused;
          if (cur) snapPanel(cur, "right");
        },
      },
      {
        id: "split_down",
        title: "Place selected panel below",
        category: "Layout",
        shortcut: "Ctrl+Shift+O",
        action: () => {
          const cur = useSessions.getState().focused;
          if (cur) snapPanel(cur, "bottom");
        },
      },
      {
        id: "close_panel",
        title: "Close selected panel",
        category: "Layout",
        shortcut: "Ctrl+Shift+W",
        action: () => {
          const cur = useSessions.getState().focused;
          if (cur) remove(cur);
        },
      },
      {
        id: "next_panel",
        title: "Go to next panel",
        category: "Layout",
        shortcut: "Ctrl+Shift+Tab",
        action: () => {
          move(1);
        },
      },
      {
        id: "open_explorer",
        title: "Open file explorer",
        category: "Widget",
        action: () => {
          createPanel({ type: "explorer" });
        },
      },
      {
        id: "open_web",
        title: "Open web browser",
        category: "Widget",
        action: () => {
          createPanel({ type: "web" });
        },
      },
      {
        id: "open_system",
        title: "Open system information",
        category: "Widget",
        action: openSystem,
      },
      {
        id: "open_terminal",
        title: "Open new terminal",
        category: "Widget",
        action: () => {
          createPanel({ type: "terminal" });
        },
      },
      {
        id: "duplicate_panel",
        title: "Duplicate panel with the same working directory",
        category: "Layout",
        shortcut: "Ctrl+Shift+D",
        action: () => {
          duplicate();
        },
      },
      {
        id: "open_settings",
        title: "Open settings",
        category: "Settings",
        shortcut: "Ctrl+,",
        action: () => {
          openSettings();
        },
      },
      {
        id: "layout_spiral",
        title: "Use spiral split layout (default)",
        category: "Layout",
        action: () => {
          setOpts({ layoutMode: "spiral" });
        },
      },
      {
        id: "layout_dwindle",
        title: "Split panels along their longest side",
        category: "Layout",
        action: () => {
          setOpts({ layoutMode: "dwindle" });
        },
      },
      {
        id: "layout_manual",
        title: "Always split panels to the right",
        category: "Layout",
        action: () => {
          setOpts({ layoutMode: "manual" });
        },
      },
      {
        id: "toggle_tabkeys",
        title: "Toggle whether Ctrl+T / Ctrl+W are handled by the app or shell",
        category: "Settings",
        action: () => {
          setOpts({ tabShortcuts: !useThemeStore.getState().opts.tabShortcuts });
        },
      },
      {
        id: "toggle_wskeys",
        title: "Toggle whether Alt+1…9 switches workspaces or is handled by the shell",
        category: "Settings",
        action: () => {
          setOpts({ workspaceAltKeys: !useThemeStore.getState().opts.workspaceAltKeys });
        },
      },
      {
        id: "toggle_dock",
        title: "Toggle dock auto-hide",
        category: "Settings",
        action: () => {
          setOpts({ dockAutoHide: !useThemeStore.getState().opts.dockAutoHide });
        },
      },
      {
        id: "theme_refresh",
        title: "Extract colors from the desktop wallpaper again",
        category: "Theme",
        action: () => {
          refresh();
        },
      },
      {
        id: "term_more_transparent",
        title: "Make terminal background more transparent",
        category: "Theme",
        shortcut: "Ctrl+Shift+[",
        action: () => {
          stepTermOpacity(-0.05);
        },
      },
      {
        id: "term_less_transparent",
        title: "Make terminal background more opaque",
        category: "Theme",
        shortcut: "Ctrl+Shift+]",
        action: () => {
          stepTermOpacity(+0.05);
        },
      },
      {
        id: "term_opacity_solid",
        title: "Set terminal background to fully opaque",
        category: "Theme",
        action: () => {
          setOpts({ termOpacity: 1 });
        },
      },
      {
        id: "term_opacity_glass",
        title: "Set terminal background to light glass (40%)",
        category: "Theme",
        action: () => {
          setOpts({ termOpacity: 0.4 });
        },
      },
      {
        id: "term_opacity_default",
        title: "Set terminal background to default opacity (60%)",
        category: "Theme",
        action: () => {
          setOpts({ termOpacity: 0.6 });
        },
      },
      {
        id: "theme_tonal",
        title: "Use Material 3 TonalSpot color scheme (recommended)",
        category: "Theme",
        action: () => {
          setOpts({ scheme: "TonalSpot" });
        },
      },
      {
        id: "theme_vibrant",
        title: "Use Material 3 Vibrant color scheme",
        category: "Theme",
        action: () => {
          setOpts({ scheme: "Vibrant" });
        },
      },
      {
        id: "theme_expressive",
        title: "Use Material 3 Expressive color scheme",
        category: "Theme",
        action: () => {
          setOpts({ scheme: "Expressive" });
        },
      },
      {
        id: "theme_neutral",
        title: "Use Material 3 Neutral color scheme",
        category: "Theme",
        action: () => {
          setOpts({ scheme: "Neutral" });
        },
      },
    ],
    [
      split,
      remove,
      move,
      createPanel,
      refresh,
      setOpts,
      stepTermOpacity,
      duplicate,
      openSettings,
      openSystem,
    ],
  );

  // Dock theo lối widget bar của Wave Term: mỗi ô là một loại panel mở được, không phải
  // một thao tác layout. Hai nút "chia dọc / chia ngang" cũ đã chuyển lên góc trên của
  // từng block — chia là việc của *một* panel cụ thể, để dưới dock thì không rõ chia cái nào.
  const dockItems: DockItem[] = useMemo(
    () => [
      {
        id: "terminal",
        label: "Terminal",
        accent: 1,
        onClick: () => createPanel({ type: "terminal" }),
        icon: <Terminal size={19} />,
      },
      {
        id: "files",
        label: "Files",
        accent: 3,
        onClick: () => createPanel({ type: "explorer" }),
        icon: <Folder size={19} />,
      },
      {
        id: "web",
        label: "Web",
        accent: 4,
        onClick: () => createPanel({ type: "web" }),
        icon: <Globe size={19} />,
      },
      {
        id: "settings",
        label: "Settings (Ctrl+,)",
        accent: 6,
        onClick: openSettings,
        icon: <Settings size={19} />,
      },
      {
        id: "system",
        label: "System",
        accent: 2,
        onClick: openSystem,
        icon: <MonitorCog size={19} />,
      },
    ],
    [createPanel, openSettings, openSystem],
  );

  const handleAppMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target.classList.contains("canvas") ||
      target.classList.contains("tiles") ||
      target.classList.contains("empty-workspace") ||
      target.classList.contains("empty-card") ||
      target.classList.contains("app-wallpaper-bg") ||
      target.classList.contains("app")
    ) {
      if (
        target.closest(
          "button, input, textarea, .panel, .dock, .titlebar, .command-palette"
        )
      ) {
        return;
      }
      try {
        getCurrentWindow()?.startDragging().catch(() => {});
      } catch {}
    }
  }, []);

  return (
    <div
      className={
        "app" +
        (isFullscreen ? " is-fullscreen" : "") +
        (opts.dockAutoHide ? " dock-auto" : "") +
        (opts.navAutoHide ? " nav-auto" : "") +
        (opts.blurEffects === false ? " effects-off" : "") +
        // Bề mặt phẳng là một lớp override cuối `App.css`, không phải một bộ CSS thứ hai:
        // nó chỉ tắt blur, bóng và độ trong, còn hình khối vẫn của bản gốc.
        (opts.surfaceStyle === "flat" ? " surface-flat" : "")
      }
      data-tauri-drag-region
      onMouseDown={handleAppMouseDown}
    >
      {/* Bề mặt phẳng thì không có gì nằm sau panel để mà nhìn xuyên — vẽ ảnh nền lúc đó
          chỉ là bắt GPU tô một tấm 4K rồi che kín nó lại. */}
      {wallpaper && opts.surfaceStyle !== "flat" && (
        <div
          className="app-wallpaper-bg"
          data-tauri-drag-region
          style={{ backgroundImage: `url(${convertFileSrc(wallpaper)})` }}
        />
      )}

      <Titlebar
        tabs={workspaces}
        activeTab={activeWorkspaceId}
        onSelectTab={switchWorkspace}
        onAddTab={() => addWorkspace()}
        onCloseTab={removeWorkspace}
      />

      <main className="canvas" data-tauri-drag-region>
        <Tiles theme={xterm} />
      </main>

      <Dock items={dockItems} autoHide={opts.dockAutoHide} />

      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
      />

      {/* Nói thẳng khi màu đang chạy dự phòng, thay vì để người dùng đoán vì sao xấu. */}
      {source === "fallback" && opts.colorSource === "wallpaper" && (
        <div className="notice">Couldn't read the wallpaper — using fallback colors</div>
      )}
    </div>
  );
}
