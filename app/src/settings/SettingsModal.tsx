import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRightToLine,
  Blend,
  CloudFog,
  Contrast,
  Download,
  Droplet,
  Hash,
  Image as ImageIcon,
  ImagePlus,
  Keyboard,
  LayoutGrid,
  Layers,
  Maximize2,
  Moon,
  Palette,
  PanelBottom,
  PanelTop,
  RefreshCw,
  RotateCw,
  Sparkles,
  Square,
  SquareStack,
  Terminal,
  Undo2,
  X,
} from "lucide-react";
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

const SOURCES: { id: ColorSource; name: string; icon: ReactNode; hint: string }[] = [
  { id: "brand", name: "Tethys", icon: <Sparkles size={17} />, hint: "Teal and navy taken directly from the logo. Consistent on every device." },
  { id: "wallpaper", name: "Wallpaper", icon: <ImageIcon size={17} />, hint: "Material You extracts the source colors from your desktop wallpaper." },
];

const SURFACES: { id: SurfaceStyle; name: string; icon: ReactNode; hint: string }[] = [
  { id: "flat", name: "Flat", icon: <Square size={17} />, hint: "Solid surfaces, crisp borders, no blur or wallpaper." },
  { id: "glass", name: "Glass", icon: <Layers size={17} />, hint: "Translucent chrome that reveals the wallpaper underneath." },
];

const LAYOUTS: { id: LayoutMode; name: string; icon: ReactNode; hint: string }[] = [
  { id: "spiral", name: "Spiral", icon: <RotateCw size={17} />, hint: "Alternates horizontal and vertical splits, always splitting the newest panel." },
  { id: "dwindle", name: "Longest side", icon: <Maximize2 size={17} />, hint: "Automatically splits along the panel's longest side." },
  { id: "manual", name: "To the right", icon: <ArrowRightToLine size={17} />, hint: "New panels always appear on the right." },
];

const KEYS: { keys: string[]; what: string }[] = [
  { keys: ["Ctrl", "T"], what: "New terminal" },
  { keys: ["Ctrl", "W"], what: "Close panel" },
  { keys: ["Ctrl", "1 / 3"], what: "Previous / next workspace" },
  { keys: ["Alt", "1…9"], what: "Switch workspace" },
  { keys: ["Win", "← ↑ ↓ →"], what: "Snap the selected panel" },
  { keys: ["Ctrl", "Alt", "← ↑ ↓ →"], what: "Snap panel (alternative to the Windows key)" },
  { keys: ["Ctrl", "Shift", "E / O"], what: "Place panel right / below" },
  { keys: ["Ctrl", "Shift", "D"], what: "Duplicate panel" },
  { keys: ["Ctrl", "Shift", "Tab"], what: "Next panel" },
  { keys: ["Ctrl", "K"], what: "Command palette" },
  { keys: ["Ctrl", ","], what: "Settings" },
  { keys: ["F11", "or", "Alt", "Enter"], what: "Toggle fullscreen" },
  { keys: ["Ctrl", "↑ / ↓"], what: "Jump between commands" },
];

type Page = "appearance" | "terminal" | "layout" | "keys" | "updates";

type UpdateState = "idle" | "checking" | "none" | "available" | "downloading" | "installed" | "error";

const PAGES: { id: Page; label: string; blurb: string; icon: ReactNode }[] = [
  { id: "appearance", label: "Appearance", blurb: "Colors, materials, and the floating chrome.", icon: <Palette size={18} /> },
  { id: "terminal", label: "Terminal", blurb: "Crisp text over a translucent surface.", icon: <Terminal size={18} /> },
  { id: "layout", label: "Layout", blurb: "How new panels split and grow.", icon: <LayoutGrid size={18} /> },
  { id: "keys", label: "Shortcuts", blurb: "What Tethys intercepts before the shell.", icon: <Keyboard size={18} /> },
  { id: "updates", label: "Updates", blurb: "Check GitHub for a newer build.", icon: <RefreshCw size={18} /> },
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
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [onClose]);

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
    <div className="settings-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Settings">
        <aside className="set-rail">
          <img src="/logo.png" alt="" className="set-rail-logo" draggable={false} />
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
                {item.icon}
              </button>
            ))}
          </nav>
        </aside>

        <div className="set-body">
          <header className="set-head">
            <div>
              <h2>{active.label}</h2>
              <p>{active.blurb}</p>
            </div>
            <button className="set-close" onClick={onClose} title="Close (Esc)" aria-label="Close settings">
              <X size={16} />
            </button>
          </header>

          <div className="set-scroll">
            {page === "appearance" && (
              <>
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
                  <div className="set-status">
                    <span className={source === "fallback" ? "source-dot" : "source-dot live"} />
                    {opts.colorSource === "brand"
                      ? "Tethys brand colors"
                      : source === "wallpaper"
                        ? `Reading ${wallpaper || "your wallpaper"}`
                        : "Fallback colors — wallpaper unreadable"}
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
                      <ActionRow icon={<RefreshCw size={16} />} label="Sync wallpaper" note="Extract colors again after changing your wallpaper." action="Refresh" onClick={() => refreshSeed()} />
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
                    icon={<ImageIcon size={16} />}
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
                    icon={<Undo2 size={16} />}
                    label="Use desktop wallpaper"
                    note="Use your current Windows wallpaper again."
                    action="Restore"
                    onClick={() => {
                      setOpts({ surfaceStyle: "glass", colorSource: "wallpaper" });
                      void useDesktopWallpaper();
                    }}
                  />
                </Group>

                <Group label="Sysfetch logo">
                  <ActionRow
                    icon={<ImagePlus size={16} />}
                    label="Logo image"
                    note={
                      logoMissing
                        ? "Saved logo is missing — choose the image again."
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
                    <ActionRow icon={<Undo2 size={16} />} label="Restore text logo" note="Return to the ASCII TETHYS logo." action="Restore" onClick={() => setOpts({ sysfetchLogoPath: "" })} />
                  )}
                </Group>

                <Group label="Chrome">
                  <div className="set-grid cols-3">
                    <OptionCard icon={<PanelTop size={17} />} label="Top bar auto-hide" hint="Move the pointer to the top edge to reveal it." active={opts.navAutoHide} onClick={() => setOpts({ navAutoHide: !opts.navAutoHide })} />
                    <OptionCard icon={<PanelBottom size={17} />} label="Dock auto-hide" hint="Move the pointer to the bottom edge to reveal it." active={opts.dockAutoHide} onClick={() => setOpts({ dockAutoHide: !opts.dockAutoHide })} />
                    <OptionCard icon={<Moon size={17} />} label="Dark theme" hint="Optimized for long terminal sessions." active={opts.dark} onClick={() => setOpts({ dark: !opts.dark })} />
                    <OptionCard icon={<Blend size={17} />} label="Mica / Acrylic" hint="Blend the wallpaper into the window surface." active={opts.windowVibrancy !== false} onClick={() => setOpts({ windowVibrancy: !(opts.windowVibrancy !== false) })} />
                    <OptionCard icon={<CloudFog size={17} />} label="Blur surfaces" hint="Turn off to prioritize FPS with heavy output." active={opts.blurEffects !== false} onClick={() => setOpts({ blurEffects: !(opts.blurEffects !== false) })} />
                  </div>
                </Group>
              </>
            )}

            {page === "terminal" && (
              <Group label="Surface">
                <Slider
                  id="set-opacity"
                  icon={<Droplet size={15} />}
                  label="Opacity"
                  note={opts.surfaceStyle === "flat" ? "Flat surfaces are always opaque — switch to Glass to adjust this." : "Lower values reveal more of the wallpaper."}
                  disabled={opts.surfaceStyle === "flat"}
                  min={TERM_OPACITY_MIN * 100}
                  max={TERM_OPACITY_MAX * 100}
                  step={1}
                  value={opts.surfaceStyle === "flat" ? 100 : Math.round(opts.termOpacity * 100)}
                  display={opts.surfaceStyle === "flat" ? "100%" : `${Math.round(opts.termOpacity * 100)}%`}
                  onChange={(v) => setOpts({ termOpacity: v / 100 })}
                />
                <Slider id="set-contrast" icon={<Contrast size={15} />} label="Contrast" note="0 is the Material 3 baseline." min={-1} max={1} step={0.1} value={opts.contrast} display={opts.contrast.toFixed(1)} onChange={(v) => setOpts({ contrast: v })} />
                <Slider id="set-chroma" icon={<Palette size={15} />} label="ANSI chroma" note="Separate terminal colors from the neutral chrome." min={1} max={2.5} step={0.05} value={opts.termChroma} display={`${opts.termChroma.toFixed(2)}×`} onChange={(v) => setOpts({ termChroma: v })} />
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
                <div className="set-tip">Use the ‹ › buttons to switch panels; drag the handle in a header to move a panel to a new position.</div>
              </Group>
            )}

            {page === "keys" && (
              <>
                <Group label="Key priority">
                  <div className="set-grid cols-2">
                    <OptionCard icon={<SquareStack size={17} />} label="Ctrl+T / Ctrl+W" hint="Open and close panels like browser tabs." active={opts.tabShortcuts} onClick={() => setOpts({ tabShortcuts: !opts.tabShortcuts })} />
                    <OptionCard icon={<Hash size={17} />} label="Alt+1…9" hint="Jump directly to the corresponding workspace." active={opts.workspaceAltKeys} onClick={() => setOpts({ workspaceAltKeys: !opts.workspaceAltKeys })} />
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
                  icon={<Download size={16} />}
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

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="set-group">
      <h3 className="set-group-label">{label}</h3>
      {children}
    </section>
  );
}

/** Thẻ icon + nhãn ngắn — chọn một (radio) hay bật/tắt (toggle) tuỳ nơi gọi, cùng một hình dạng
 * để mắt quét cả trang mà không phải phân biệt kiểu tương tác. Giải thích dài chờ ở `title`. */
function OptionCard({ icon, label, hint, active, onClick }: { icon: ReactNode; label: string; hint?: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={"set-card" + (active ? " on" : "")} onClick={onClick} title={hint}>
      <span className="set-card-icon">{icon}</span>
      <span className="set-card-label">{label}</span>
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
