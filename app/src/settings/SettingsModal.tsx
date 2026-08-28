import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "../ui/Icon";
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

const SCHEMES: SchemeName[] = ["TonalSpot", "Vibrant", "Expressive", "Neutral", "Content", "Monochrome"];

const SOURCES: { id: ColorSource; name: string; icon: IconName; hint: string }[] = [
  { id: "brand", name: "Tethys", icon: "shapes", hint: "Teal and navy from the logo." },
  { id: "wallpaper", name: "Wallpaper", icon: "wallpaper", hint: "Colors read from your wallpaper." },
];

const SURFACES: { id: SurfaceStyle; name: string; icon: IconName; hint: string }[] = [
  { id: "flat", name: "Flat", icon: "square", hint: "Solid surfaces, no blur." },
  { id: "glass", name: "Glass", icon: "layers", hint: "Translucent — wallpaper shows through." },
];

const LAYOUTS: { id: LayoutMode; name: string; icon: IconName; hint: string }[] = [
  { id: "spiral", name: "Spiral", icon: "rotate_right", hint: "Alternates horizontal and vertical splits." },
  { id: "dwindle", name: "Longest side", icon: "open_in_full", hint: "Splits along the longest side." },
  { id: "manual", name: "To the right", icon: "keyboard_tab", hint: "New panels appear on the right." },
];

const KEYS: { keys: string[]; what: string }[] = [
  { keys: ["Ctrl", "T"], what: "New terminal" },
  { keys: ["Ctrl", "W"], what: "Close panel" },
  { keys: ["Ctrl", "1 / 3"], what: "Prev / next workspace" },
  { keys: ["Alt", "1…9"], what: "Switch workspace" },
  { keys: ["Alt", "T / W"], what: "New / close workspace" },
  { keys: ["Win", "← ↑ ↓ →"], what: "Snap selected panel" },
  { keys: ["Ctrl", "Alt", "← ↑ ↓ →"], what: "Snap panel (no Win key)" },
  { keys: ["Ctrl", "Shift", "E / O"], what: "Place right / below" },
  { keys: ["Ctrl", "Shift", "D"], what: "Duplicate panel" },
  { keys: ["Ctrl", "Tab"], what: "Next panel" },
  { keys: ["Ctrl", "K"], what: "Command palette" },
  { keys: ["Ctrl", ","], what: "Settings" },
  { keys: ["F11", "or", "Alt", "Enter"], what: "Toggle fullscreen" },
  { keys: ["Ctrl", "↑ / ↓"], what: "Jump between commands" },
];

type Page = "appearance" | "terminal" | "layout" | "keys" | "updates";

type UpdateState = "idle" | "checking" | "none" | "available" | "downloading" | "installed" | "error";

const PAGES: { id: Page; label: string; blurb: string; icon: IconName }[] = [
  { id: "appearance", label: "Appearance", blurb: "Color, surface, wallpaper.", icon: "palette" },
  { id: "terminal", label: "Terminal", blurb: "Opacity, contrast, scrollback.", icon: "terminal" },
  { id: "layout", label: "Layout", blurb: "How new panels split.", icon: "grid_view" },
  { id: "keys", label: "Shortcuts", blurb: "Keys Tethys takes before the shell.", icon: "keyboard" },
  { id: "updates", label: "Updates", blurb: "Check for a newer build.", icon: "refresh" },
];

type Props = { onClose: () => void };

export function SettingsModal({ onClose }: Props) {
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
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const closeTimer = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }

    setClosing(true);
    backdropRef.current?.focus({ preventScroll: true });
    closeTimer.current = window.setTimeout(onClose, 220);
  }, [onClose]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      dialogRef.current?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
      const returnTarget = returnFocusRef.current;
      if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
    };
  }, []);

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

  // Escape đóng popup — quy ước chung với Command Palette / menu chuột phải. Component
  // chỉ được `App.tsx` dựng lên khi đang mở, nên không cần tự gác cổng bằng một prop `open`.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
      } else if (e.key === "Tab") {
        if (closingRef.current) {
          e.preventDefault();
          return;
        }

        const dialog = dialogRef.current;
        if (dialog) trapFocus(e, dialog);
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [requestClose]);

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

  const active = PAGES.find((p) => p.id === page) ?? PAGES[0];

  return (
    <div
      ref={backdropRef}
      className={"settings-backdrop" + (closing ? " is-closing" : "")}
      onClick={requestClose}
      tabIndex={-1}
    >
      <div
        ref={dialogRef}
        className="settings-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        aria-hidden={closing || undefined}
        inert={closing}
        tabIndex={-1}
      >
        <aside className="set-rail">
          <div className="set-rail-brand" aria-hidden="true">
            <img src="/logo.png" alt="" className="set-rail-logo" draggable={false} />
            <span>Tethys</span>
          </div>
          <nav className="set-rail-nav">
            {PAGES.map((item) => (
              <button
                key={item.id}
                className={page === item.id ? "on" : ""}
                aria-current={page === item.id ? "page" : undefined}
                title={item.label}
                aria-label={item.label}
                onClick={() => setPage(item.id)}
              >
                <span className="set-rail-icon">
                  <Icon name={item.icon} size={24} filled={page === item.id} />
                </span>
                <span className="set-rail-label">{item.label}</span>
                <span className="set-rail-state" aria-hidden="true" />
              </button>
            ))}
          </nav>
        </aside>

        <div className="set-body">
          <header className="set-head">
            <div key={page} className="set-title">
              <h2>{active.label}</h2>
              <p>{active.blurb}</p>
            </div>
            <button className="set-close" onClick={requestClose} title="Close (Esc)" aria-label="Close settings">
              <Icon name="close" size={20} />
            </button>
          </header>

          <div className="set-scroll">
            {page === "appearance" && (
              <>
                <div className="set-tone-preview" aria-label={`Current Material You scheme: ${opts.scheme}`}>
                  <span className="set-tone-copy">
                    <small>Material You palette</small>
                    <strong>{opts.scheme}</strong>
                  </span>
                  <span className="set-tone-cluster" aria-hidden="true">
                    <i className="primary" />
                    <i className="secondary" />
                    <i className="tertiary" />
                    <i className="surface" />
                  </span>
                </div>

                <Group label="Color palette">
                  <div className="set-grid cols-2">
                    {SOURCES.map((item) => (
                      <OptionCard
                        key={item.id}
                        icon={item.icon}
                        label={item.name}
                        hint={item.hint}
                        active={opts.colorSource === item.id}
                        onClick={() => setOpts({ colorSource: item.id })}
                      />
                    ))}
                  </div>
                  {/* Duong dan day du keo vien trang thai dai gan het chieu ngang, bien mot
                      chu thich thanh mot khoi chu. Chi ten tep o day; ban day du trong tooltip. */}
                  <div className="set-status" title={source === "wallpaper" ? wallpaper : undefined}>
                    <span className={source === "fallback" ? "source-dot" : "source-dot live"} />
                    {opts.colorSource === "brand"
                      ? "Tethys brand colors"
                      : source === "wallpaper"
                        ? wallpaper ? `From ${fileName(wallpaper)}` : "From your wallpaper"
                        : "Fallback — wallpaper unreadable"}
                  </div>

                  {/* Phong cách màu và nút đồng bộ chỉ có nghĩa khi màu thật sự đến từ ảnh nền. */}
                  {opts.colorSource === "wallpaper" && (
                    <>
                      <div className="set-chips">
                        {SCHEMES.map((scheme) => (
                          <button
                            key={scheme}
                            className={"set-chip" + (opts.scheme === scheme ? " on" : "")}
                            onClick={() => setOpts({ scheme })}
                          >
                            {scheme}
                          </button>
                        ))}
                      </div>
                      <ActionRow icon={<Icon name="refresh" size={22} />} label="Sync wallpaper" note="Re-read colors after changing wallpaper." action="Refresh" onClick={() => refreshSeed()} />
                    </>
                  )}
                </Group>

                <Group label="Surface">
                  <div className="set-grid cols-2">
                    {SURFACES.map((item) => (
                      <OptionCard
                        key={item.id}
                        icon={item.icon}
                        label={item.name}
                        hint={item.hint}
                        active={opts.surfaceStyle === item.id}
                        onClick={() => setOpts({ surfaceStyle: item.id })}
                      />
                    ))}
                  </div>
                </Group>

                <Group label="Wallpaper">
                  <ActionRow
                    icon={<Icon name="wallpaper" size={22} />}
                    label="Workspace wallpaper"
                    note={wallpaper ? wallpaper : "Using your desktop wallpaper."}
                    action="Choose image"
                    onClick={() => {
                      invoke<string | null>("wallpaper_pick")
                        .then((path) => {
                          if (path) {
                            setOpts({ surfaceStyle: "glass", colorSource: "wallpaper" });
                            void setCustomWallpaper(path);
                          }
                        })
                        .catch(() => {});
                    }}
                  />
                  <ActionRow
                    icon={<Icon name="undo" size={22} />}
                    label="Use desktop wallpaper"
                    note="Back to the Windows wallpaper."
                    action="Restore"
                    onClick={() => {
                      setOpts({ surfaceStyle: "glass", colorSource: "wallpaper" });
                      void useDesktopWallpaper();
                    }}
                  />
                </Group>

                <Group label="Sysfetch logo">
                  <ActionRow
                    icon={<Icon name="add_photo_alternate" size={22} />}
                    label="Logo image"
                    note={
                      logoMissing
                        ? "Saved logo is missing."
                        : opts.sysfetchLogoPath
                          ? fileName(opts.sysfetchLogoPath)
                          : "Using the TETHYS text logo."
                    }
                    action="Choose image"
                    onClick={() => {
                      invoke<string | null>("sysfetch_logo_pick")
                        .then((path) => path && setOpts({ sysfetchLogoPath: path }))
                        .catch(() => {});
                    }}
                  />
                  {opts.sysfetchLogoPath && (
                    <ActionRow icon={<Icon name="undo" size={22} />} label="Restore text logo" note="Back to the text logo." action="Restore" onClick={() => setOpts({ sysfetchLogoPath: "" })} />
                  )}
                </Group>

                <Group label="Chrome">
                  <div className="set-grid cols-3">
                    <OptionCard icon="web_asset" label="Top bar auto-hide" hint="Reveal at the top edge." active={opts.navAutoHide} onClick={() => setOpts({ navAutoHide: !opts.navAutoHide })} />
                    <OptionCard icon="bottom_panel_open" label="Dock auto-hide" hint="Reveal at the bottom edge." active={opts.dockAutoHide} onClick={() => setOpts({ dockAutoHide: !opts.dockAutoHide })} />
                    <OptionCard icon="dark_mode" label="Dark theme" hint="Tuned for long sessions." active={opts.dark} onClick={() => setOpts({ dark: !opts.dark })} />
                    <OptionCard icon="gradient" label="Mica / Acrylic" hint="Blend wallpaper into the window." active={opts.windowVibrancy !== false} onClick={() => setOpts({ windowVibrancy: !(opts.windowVibrancy !== false) })} />
                    <OptionCard icon="blur_on" label="Blur surfaces" hint="Turn off for more FPS." active={opts.blurEffects !== false} onClick={() => setOpts({ blurEffects: !(opts.blurEffects !== false) })} />
                  </div>
                </Group>
              </>
            )}

            {page === "terminal" && (
              <Group label="Surface">
                <Slider
                  id="set-opacity"
                  icon={<Icon name="opacity" size={22} />}
                  label="Opacity"
                  note={opts.surfaceStyle === "flat" ? "Flat surfaces are always opaque." : "Lower values reveal more of the wallpaper."}
                  disabled={opts.surfaceStyle === "flat"}
                  min={TERM_OPACITY_MIN * 100}
                  max={TERM_OPACITY_MAX * 100}
                  step={1}
                  value={opts.surfaceStyle === "flat" ? 100 : Math.round(opts.termOpacity * 100)}
                  display={opts.surfaceStyle === "flat" ? "100%" : `${Math.round(opts.termOpacity * 100)}%`}
                  onChange={(v) => setOpts({ termOpacity: v / 100 })}
                />
                <Slider id="set-contrast" icon={<Icon name="contrast" size={22} />} label="Contrast" note="0 is the Material 3 baseline." min={-1} max={1} step={0.1} value={opts.contrast} display={opts.contrast.toFixed(1)} onChange={(v) => setOpts({ contrast: v })} />
                <Slider id="set-chroma" icon={<Icon name="palette" size={22} />} label="ANSI chroma" note="Saturation of terminal colors." min={1} max={2.5} step={0.05} value={opts.termChroma} display={`${opts.termChroma.toFixed(2)}×`} onChange={(v) => setOpts({ termChroma: v })} />
                <Slider
                  id="set-scrollback"
                  icon={<Icon name="terminal" size={22} />}
                  label="Scrollback"
                  note="Lower values cap memory growth."
                  min={1000}
                  max={20000}
                  step={1000}
                  value={opts.terminalScrollback}
                  display={`${Math.round(opts.terminalScrollback / 1000)}k lines`}
                  onChange={(v) => setOpts({ terminalScrollback: v })}
                />
              </Group>
            )}

            {page === "layout" && (
              <Group label="New panels">
                <div className="set-grid cols-3">
                  {LAYOUTS.map((layout) => (
                    <OptionCard
                      key={layout.id}
                      icon={layout.icon}
                      label={layout.name}
                      hint={layout.hint}
                      active={opts.layoutMode === layout.id}
                      onClick={() => setOpts({ layoutMode: layout.id })}
                    />
                  ))}
                </div>
                <div className="set-tip">Drag a panel header to move it. Use ‹ › to switch panels.</div>
              </Group>
            )}

            {page === "keys" && (
              <>
                <Group label="Key priority">
                  <div className="set-grid cols-2">
                    <OptionCard icon="tab" label="Tab-style panels" hint="Ctrl+T and Ctrl+W open and close panels like browser tabs." active={opts.tabShortcuts} onClick={() => setOpts({ tabShortcuts: !opts.tabShortcuts })} />
                    <OptionCard icon="tag" label="Workspace shortcuts" hint="Alt+1…9 switches; Alt+T/W creates or closes." active={opts.workspaceAltKeys} onClick={() => setOpts({ workspaceAltKeys: !opts.workspaceAltKeys })} />
                  </div>
                </Group>
                <Group label="Shortcut list">
                  <div className="set-keylist">
                    {KEYS.map((item) => (
                      <div className="set-key" key={item.keys.join("+")}>
                        <span className="set-key-what">{item.what}</span>
                        <span className="set-key-combo">
                          {item.keys.map((key) => <kbd key={key}>{key}</kbd>)}
                        </span>
                      </div>
                    ))}
                  </div>
                </Group>
              </>
            )}

            {page === "updates" && (
              <Group label="Version">
                <ActionRow
                  icon={<Icon name="download" size={22} />}
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
              </Group>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function trapFocus(event: KeyboardEvent, dialog: HTMLElement) {
  const focusable = getFocusableElements(dialog);
  if (focusable.length === 0) {
    event.preventDefault();
    dialog.focus({ preventScroll: true });
    return;
  }

  const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
  const atStart = activeIndex <= 0;
  const atEnd = activeIndex === focusable.length - 1;

  if (event.shiftKey && atStart) {
    event.preventDefault();
    focusable[focusable.length - 1].focus({ preventScroll: true });
  } else if (!event.shiftKey && (activeIndex === -1 || atEnd)) {
    event.preventDefault();
    focusable[0].focus({ preventScroll: true });
  }
}

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");

  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((element) =>
    !element.hidden &&
    element.getAttribute("aria-hidden") !== "true" &&
    !element.closest('[hidden], [aria-hidden="true"]') &&
    element.getClientRects().length > 0
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="set-group">
      <h3 className="set-group-label">{label}</h3>
      {children}
    </section>
  );
}

/** Thẻ icon + nhãn — chọn một (radio) hay bật/tắt (toggle) tuỳ nơi gọi, cùng một hình dạng
 * để mắt quét cả trang.
 *
 * Icon nằm trên, chiếm phần lớn thẻ: ở một lưới 2–3 cột thì hình khối phân biệt được từ xa
 * còn dòng chữ thì không. `hint` từng in thẳng dưới nhãn ở cỡ 9.5px — nhỏ hơn ngưỡng đọc
 * thoải mái, và mười mấy dòng như vậy trên một trang biến bảng chọn thành bài đọc. Nó lùi
 * vào `title`: vẫn tra được khi cần, không chiếm chỗ khi không. */
function OptionCard({ icon, label, hint, active, onClick }: { icon: IconName; label: string; hint?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={"set-card" + (active ? " on" : "")}
      onClick={onClick}
      title={hint}
      aria-pressed={active}
    >
      <span className="set-card-icon" aria-hidden="true">
        <Icon name={icon} size={32} filled={active} />
      </span>
      <span className="set-card-label">{label}</span>
      <span className="set-card-state" aria-hidden="true">
        <Icon name="check" size={17} filled />
      </span>
    </button>
  );
}

function ActionRow({ icon, label, note, action, onClick }: { icon: ReactNode; label: string; note: string; action: string; onClick: () => void }) {
  return (
    <div className="set-item">
      <span className="set-item-icon">{icon}</span>
      <span className="set-copy"><span className="set-label">{label}</span><small>{note}</small></span>
      <button className="set-btn" onClick={onClick}>{action}</button>
    </div>
  );
}

function Slider({ id, icon, label, note, min, max, step, value, display, disabled = false, onChange }: { id: string; icon: ReactNode; label: string; note: string; min: number; max: number; step: number; value: number; display: string; disabled?: boolean; onChange: (v: number) => void }) {
  return (
    <label className={"set-item set-slider" + (disabled ? " off" : "")} htmlFor={id}>
      <span className="set-item-icon">{icon}</span>
      <span className="set-copy"><span className="set-label">{label}</span><small>{note}</small></span>
      <span className="set-val">{display}</span>
      <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

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
      return "Installing — Tethys will restart.";
    case "installed":
      return "Installed. Restarting…";
    case "error":
      return `Update check failed: ${error}`;
    case "idle":
    default:
      return "No check run yet.";
  }
}
