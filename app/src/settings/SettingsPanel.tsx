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

const SCHEMES: SchemeName[] = ["TonalSpot", "Vibrant", "Expressive", "Neutral", "Content", "Monochrome"];

const SOURCES: { id: ColorSource; name: string; note: string }[] = [
  { id: "brand", name: "Tethys", note: "Teal and navy are taken directly from the logo. Consistent on every device." },
  { id: "wallpaper", name: "Wallpaper", note: "Material You extracts the source colors from your desktop wallpaper." },
];

const SURFACES: { id: SurfaceStyle; name: string; note: string }[] = [
  { id: "flat", name: "Flat", note: "Solid surfaces, crisp borders, no blur or wallpaper." },
  { id: "glass", name: "Glass", note: "Translucent chrome that reveals the wallpaper underneath." },
];

const LAYOUTS: { id: LayoutMode; name: string; note: string }[] = [
  { id: "spiral", name: "Spiral", note: "Alternates horizontal and vertical splits, always splitting the newest panel." },
  { id: "dwindle", name: "Longest side", note: "Automatically splits along the panel's longest side." },
  { id: "manual", name: "To the right", note: "New panels always appear on the right." },
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

const PAGES: { id: Page; label: string; icon: ReactNode }[] = [
  { id: "appearance", label: "Appearance", icon: <Palette size={15} /> },
  { id: "terminal", label: "Terminal", icon: <Terminal size={15} /> },
  { id: "layout", label: "Layout", icon: <LayoutGrid size={15} /> },
  { id: "keys", label: "Shortcuts", icon: <Keyboard size={15} /> },
  { id: "updates", label: "Updates", icon: <RefreshCw size={15} /> },
];

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

  return (
    <div className="panel settings-panel">
      <PanelHeader
        panelKey={panelKey}
        kind="settings"
        icon={<Settings size={13} />}
        title="Settings"
        subtitle={sourceLabel(opts.colorSource, source, wallpaper)}
      />

      <div className="settings-shell">
        <aside className="set-sidebar" aria-label="Settings categories">
          <div className="set-sidebar-title">
            <span>Customize</span>
            <small>All changes are saved automatically</small>
          </div>
          <nav className="set-nav">
            {PAGES.map((item) => (
              <button
                key={item.id}
                className={page === item.id ? "on" : ""}
                aria-current={page === item.id ? "page" : undefined}
                onClick={() => setPage(item.id)}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="set-source">
            <span className={source === "fallback" ? "source-dot" : "source-dot live"} />
            <span>
              {opts.colorSource === "brand"
                ? "Tethys brand colors"
                : source === "wallpaper"
                  ? "Wallpaper colors"
                  : "Fallback colors"}
            </span>
          </div>
        </aside>

        <div className="set-content">
          {page === "appearance" && (
            <SettingsPage title="Appearance" description="Less chrome, more room for your workspace.">
              <SettingGroup title="Color palette" description="Choose colors from the Tethys logo or your desktop wallpaper.">
                <ChoiceRow label="Color source">
                  {SOURCES.map((item) => (
                    <button
                      key={item.id}
                      className={"set-chip" + (opts.colorSource === item.id ? " on" : "")}
                      onClick={() => setOpts({ colorSource: item.id })}
                      title={item.note}
                    >
                      {item.name}
                    </button>
                  ))}
                </ChoiceRow>
                <div className="set-tip">
                  {SOURCES.find((item) => item.id === opts.colorSource)?.note}
                </div>

                {/* Phong cách màu và nút đồng bộ chỉ có nghĩa khi màu thật sự đến từ ảnh nền.
                    Để chúng hiện ra ở chế độ Tethys là mời người dùng bấm vào một nút không
                    làm gì cả — tệ hơn hẳn so với việc nó vắng mặt. */}
                {opts.colorSource === "wallpaper" && (
                  <>
                    <ChoiceRow label="Color style">
                      {SCHEMES.map((scheme) => (
                        <button
                          key={scheme}
                          className={"set-chip" + (opts.scheme === scheme ? " on" : "")}
                          onClick={() => setOpts({ scheme })}
                        >
                          {scheme}
                        </button>
                      ))}
                    </ChoiceRow>
                    <ActionRow
                      label="Sync wallpaper"
                      note="Extract colors again after changing your wallpaper."
                      action="Refresh colors"
                      onClick={() => refreshSeed()}
                    />
                  </>
                )}
              </SettingGroup>

              <SettingGroup title="Surface" description="The material of the chrome around your content.">
                <ChoiceRow label="Surface style">
                  {SURFACES.map((item) => (
                    <button
                      key={item.id}
                      className={"set-chip" + (opts.surfaceStyle === item.id ? " on" : "")}
                      onClick={() => setOpts({ surfaceStyle: item.id })}
                      title={item.note}
                    >
                      {item.name}
                    </button>
                  ))}
                </ChoiceRow>
                <div className="set-tip">
                  {SURFACES.find((item) => item.id === opts.surfaceStyle)?.note}
                </div>
              </SettingGroup>

              <SettingGroup title="Wallpaper" description="Change the app background without changing your Windows wallpaper.">
                <div className="set-list">
                  <ActionRow
                    label="Workspace wallpaper"
                    note={wallpaper ? wallpaper : "Using your desktop wallpaper."}
                    action="Choose image"
                    onClick={() => {
                      invoke<string | null>("wallpaper_pick")
                        .then((path) => {
                          if (path) {
                            // Chọn ảnh nền mà vẫn ở surface phẳng sẽ không cho người dùng
                            // thấy kết quả. Đây là một hành động có chủ đích, nên bật luôn
                            // chế độ kính và bảng màu wallpaper thay vì bắt họ tìm hai nút nữa.
                            setOpts({ surfaceStyle: "glass", colorSource: "wallpaper" });
                            void setCustomWallpaper(path);
                          }
                        })
                        .catch(() => {});
                    }}
                  />
                  <ActionRow
                    label="Use desktop wallpaper"
                    note="Use your current Windows wallpaper again."
                    action="Restore"
                    onClick={() => {
                      setOpts({ surfaceStyle: "glass", colorSource: "wallpaper" });
                      void useDesktopWallpaper();
                    }}
                  />
                </div>
              </SettingGroup>

              <SettingGroup title="Sysfetch logo" description="This image replaces the TETHYS text logo in the system information panel.">
                <div className="set-list">
                  <ActionRow
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
                  <ActionRow
                    label="Restore text logo"
                    note="Remove the selected image and return to the ASCII TETHYS logo."
                    action="Restore"
                    onClick={() => setOpts({ sysfetchLogoPath: "" })}
                  />
                </div>
              </SettingGroup>

              <SettingGroup title="Chrome" description="The floating layers around your content.">
                <Toggle id="set-nav" label="Auto-hide navigation bar" note="Move the pointer to the top edge to reveal it." checked={opts.navAutoHide} onChange={(v) => setOpts({ navAutoHide: v })} />
                <Toggle id="set-dock" label="Auto-hide dock" note="Move the pointer to the bottom edge to reveal it." checked={opts.dockAutoHide} onChange={(v) => setOpts({ dockAutoHide: v })} />
                <Toggle id="set-dark" label="Dark theme" note="Optimized for long terminal sessions." checked={opts.dark} onChange={(v) => setOpts({ dark: v })} />
                <Toggle id="set-vibrancy" label="Mica / Acrylic" note="Blend the wallpaper into the window surface." checked={opts.windowVibrancy !== false} onChange={(v) => setOpts({ windowVibrancy: v })} />
                <Toggle id="set-blur" label="Blur surfaces" note="Turn off to prioritize FPS and battery life with heavy output." checked={opts.blurEffects !== false} onChange={(v) => setOpts({ blurEffects: v })} />
              </SettingGroup>
            </SettingsPage>
          )}

          {page === "terminal" && (
            <SettingsPage title="Terminal" description="Keep text crisp while preserving the wallpaper's depth.">
              <SettingGroup title="Surface" description="Only the terminal background changes; text always remains legible.">
                <Slider
                  id="set-opacity"
                  label="Opacity"
                  note={
                    opts.surfaceStyle === "flat"
                      ? "Flat surfaces are always fully opaque — switch to Glass to adjust this."
                      : "Lower values reveal more of the wallpaper."
                  }
                  disabled={opts.surfaceStyle === "flat"}
                  min={TERM_OPACITY_MIN * 100}
                  max={TERM_OPACITY_MAX * 100}
                  step={1}
                  value={opts.surfaceStyle === "flat" ? 100 : Math.round(opts.termOpacity * 100)}
                  display={opts.surfaceStyle === "flat" ? "100%" : `${Math.round(opts.termOpacity * 100)}%`}
                  onChange={(v) => setOpts({ termOpacity: v / 100 })}
                />
                <Slider id="set-contrast" label="Contrast" note="0 is the Material 3 baseline." min={-1} max={1} step={0.1} value={opts.contrast} display={opts.contrast.toFixed(1)} onChange={(v) => setOpts({ contrast: v })} />
                <Slider id="set-chroma" label="ANSI chroma" note="Separate terminal colors from the neutral chrome." min={1} max={2.5} step={0.05} value={opts.termChroma} display={`${opts.termChroma.toFixed(2)}×`} onChange={(v) => setOpts({ termChroma: v })} />
              </SettingGroup>
            </SettingsPage>
          )}

          {page === "layout" && (
            <SettingsPage title="Layout" description="Split, switch, and drag panels without losing sessions.">
              <SettingGroup title="New panels" description="Choose how the layout tree grows.">
                <ChoiceRow label="Split behavior">
                  {LAYOUTS.map((layout) => (
                    <button
                      key={layout.id}
                      className={"set-chip" + (opts.layoutMode === layout.id ? " on" : "")}
                      onClick={() => setOpts({ layoutMode: layout.id })}
                      title={layout.note}
                    >
                      {layout.name}
                    </button>
                  ))}
                </ChoiceRow>
                <div className="set-tip">
                  {LAYOUTS.find((layout) => layout.id === opts.layoutMode)?.note} Use the ‹ › buttons to switch panels; drag the handle in a header to move a panel to a new position.
                </div>
              </SettingGroup>
            </SettingsPage>
          )}

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
                      <span className="set-key-what">{item.what}</span>
                      <span className="set-key-combo">
                        {item.keys.map((key) => <kbd key={key}>{key}</kbd>)}
                      </span>
                    </div>
                  ))}
                </div>
              </SettingGroup>
            </SettingsPage>
          )}

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
        </div>
      </div>
    </div>
  );
}

function SettingsPage({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="set-page">
      <header className="set-page-head"><h2>{title}</h2><p>{description}</p></header>
      {children}
    </section>
  );
}

function SettingGroup({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="set-group">
      <div className="set-group-head"><h3>{title}</h3><p>{description}</p></div>
      <div className="set-list">{children}</div>
    </section>
  );
}

function ChoiceRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="set-item set-choice"><span className="set-label">{label}</span><div className="set-chips">{children}</div></div>;
}

function ActionRow({ label, note, action, onClick }: { label: string; note: string; action: string; onClick: () => void }) {
  return <div className="set-item"><span className="set-copy"><span className="set-label">{label}</span><small>{note}</small></span><button className="set-btn" onClick={onClick}>{action}</button></div>;
}

function Slider({ id, label, note, min, max, step, value, display, disabled = false, onChange }: { id: string; label: string; note: string; min: number; max: number; step: number; value: number; display: string; disabled?: boolean; onChange: (v: number) => void }) {
  return (
    <label className={"set-item set-slider" + (disabled ? " off" : "")} htmlFor={id}>
      <span className="set-copy"><span className="set-label">{label}</span><small>{note}</small></span>
      <span className="set-val">{display}</span>
      <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function Toggle({ id, label, note, checked, onChange }: { id: string; label: string; note: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="set-item set-toggle" htmlFor={id}>
      <span className="set-copy"><span className="set-label">{label}</span><small>{note}</small></span>
      <span className="set-switch">
        <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span className="set-switch-track"><span /></span>
      </span>
    </label>
  );
}

/**
 * Dòng phụ đề của panel phải nói *màu đang từ đâu ra*, không phải trạng thái của bộ quét
 * ảnh nền. Hai thứ đó tách nhau kể từ khi có bảng màu thương hiệu: ở chế độ Tethys + bề mặt
 * Kính, app vẫn đọc ảnh nền để vẽ nền, nhưng không một màu nào của UI đến từ đó.
 */
function sourceLabel(
  colorSource: ColorSource,
  source: string,
  wallpaper: string,
): string {
  if (colorSource === "brand") return "brand color palette";
  if (source === "wallpaper") return wallpaper;
  return "fallback color palette";
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
