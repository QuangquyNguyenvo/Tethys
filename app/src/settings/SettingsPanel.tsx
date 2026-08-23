import { useState, type ReactNode } from "react";
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

const SCHEMES: SchemeName[] = ["TonalSpot", "Vibrant", "Expressive", "Neutral", "Content", "Monochrome"];

const SOURCES: { id: ColorSource; name: string; note: string }[] = [
  { id: "brand", name: "Tethys", note: "Teal và navy lấy thẳng từ logo. Giống nhau trên mọi máy." },
  { id: "wallpaper", name: "Wallpaper", note: "Material You trích màu gốc từ ảnh nền desktop." },
];

const SURFACES: { id: SurfaceStyle; name: string; note: string }[] = [
  { id: "flat", name: "Phẳng", note: "Bề mặt đặc, viền rõ, không blur, không ảnh nền." },
  { id: "glass", name: "Kính", note: "Chrome mờ, nhìn xuyên xuống ảnh nền phía sau." },
];

const LAYOUTS: { id: LayoutMode; name: string; note: string }[] = [
  { id: "spiral", name: "Xoắn ốc", note: "Xen kẽ ngang và dọc, luôn chia block vừa mở." },
  { id: "dwindle", name: "Cạnh dài", note: "Tự chọn chiều chia theo cạnh dài hơn của block." },
  { id: "manual", name: "Sang phải", note: "Block mới luôn xuất hiện ở bên phải." },
];

const KEYS: { keys: string[]; what: string }[] = [
  { keys: ["Ctrl", "T"], what: "Terminal mới" },
  { keys: ["Ctrl", "W"], what: "Đóng block" },
  { keys: ["Alt", "1…9"], what: "Chuyển workspace" },
  { keys: ["Win", "← ↑ ↓ →"], what: "Snap block đang chọn" },
  { keys: ["Ctrl", "Alt", "← ↑ ↓ →"], what: "Snap block (thay cho phím Win)" },
  { keys: ["Ctrl", "Shift", "E / O"], what: "Đặt block sang phải / xuống dưới" },
  { keys: ["Ctrl", "Shift", "D"], what: "Nhân đôi block" },
  { keys: ["Ctrl", "Shift", "Tab"], what: "Block kế tiếp" },
  { keys: ["Ctrl", "K"], what: "Bảng lệnh" },
  { keys: ["Ctrl", ","], what: "Cài đặt" },
  { keys: ["Ctrl", "↑ / ↓"], what: "Nhảy giữa các lệnh" },
];

type Page = "appearance" | "terminal" | "layout" | "keys";

const PAGES: { id: Page; label: string; icon: ReactNode }[] = [
  { id: "appearance", label: "Giao diện", icon: <Palette size={15} /> },
  { id: "terminal", label: "Terminal", icon: <Terminal size={15} /> },
  { id: "layout", label: "Block", icon: <LayoutGrid size={15} /> },
  { id: "keys", label: "Phím tắt", icon: <Keyboard size={15} /> },
];

export function SettingsPanel({ panelKey }: { panelKey: string }) {
  const opts = useThemeStore((s) => s.opts);
  const setOpts = useThemeStore((s) => s.setOpts);
  const source = useThemeStore((s) => s.source);
  const wallpaper = useThemeStore((s) => s.wallpaper);
  const [page, setPage] = useState<Page>("appearance");

  return (
    <div className="panel settings-panel">
      <PanelHeader
        panelKey={panelKey}
        kind="settings"
        icon={<Settings size={13} />}
        title="Cài đặt"
        subtitle={sourceLabel(opts.colorSource, source, wallpaper)}
      />

      <div className="settings-shell">
        <aside className="set-sidebar" aria-label="Danh mục cài đặt">
          <div className="set-sidebar-title">
            <span>Tùy chỉnh</span>
            <small>Mọi thay đổi được lưu tự động</small>
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
                ? "Màu thương hiệu Tethys"
                : source === "wallpaper"
                  ? "Màu theo wallpaper"
                  : "Màu dự phòng"}
            </span>
          </div>
        </aside>

        <div className="set-content">
          {page === "appearance" && (
            <SettingsPage title="Giao diện" description="Ít chrome hơn, nhiều không gian làm việc hơn.">
              <SettingGroup title="Bảng màu" description="Chọn màu đến từ logo Tethys hay từ ảnh nền desktop.">
                <ChoiceRow label="Nguồn màu">
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
                    <ChoiceRow label="Phong cách màu">
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
                      label="Đồng bộ wallpaper"
                      note="Trích lại màu nếu bạn vừa đổi ảnh nền."
                      action="Làm mới màu"
                      onClick={() => refreshSeed()}
                    />
                  </>
                )}
              </SettingGroup>

              <SettingGroup title="Bề mặt" description="Chất liệu của các lớp chrome bao quanh nội dung.">
                <ChoiceRow label="Kiểu bề mặt">
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

              <SettingGroup title="Hình nền" description="Đổi nền riêng của app, không chạm tới ảnh nền Windows.">
                <div className="set-list">
                  <ActionRow
                    label="Ảnh nền workspace"
                    note={wallpaper ? wallpaper : "Đang dùng ảnh nền Desktop."}
                    action="Chọn ảnh"
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
                    label="Quay về Desktop"
                    note="Dùng lại ảnh nền Windows hiện tại."
                    action="Khôi phục"
                    onClick={() => {
                      setOpts({ surfaceStyle: "glass", colorSource: "wallpaper" });
                      void useDesktopWallpaper();
                    }}
                  />
                </div>
              </SettingGroup>

              <SettingGroup title="Chrome" description="Các lớp nổi bao quanh nội dung.">
                <Toggle id="set-nav" label="Thanh điều hướng tự ẩn" note="Rê chuột lên mép trên để gọi lại." checked={opts.navAutoHide} onChange={(v) => setOpts({ navAutoHide: v })} />
                <Toggle id="set-dock" label="Dock tự ẩn" note="Rê chuột xuống mép dưới để gọi lại." checked={opts.dockAutoHide} onChange={(v) => setOpts({ dockAutoHide: v })} />
                <Toggle id="set-dark" label="Theme tối" note="Tối ưu cho phiên terminal dài." checked={opts.dark} onChange={(v) => setOpts({ dark: v })} />
                <Toggle id="set-vibrancy" label="Mica / Acrylic" note="Cho wallpaper hòa vào bề mặt cửa sổ." checked={opts.windowVibrancy !== false} onChange={(v) => setOpts({ windowVibrancy: v })} />
                <Toggle id="set-blur" label="Làm mờ bề mặt" note="Tắt để ưu tiên FPS và pin khi output nặng." checked={opts.blurEffects !== false} onChange={(v) => setOpts({ blurEffects: v })} />
              </SettingGroup>
            </SettingsPage>
          )}

          {page === "terminal" && (
            <SettingsPage title="Terminal" description="Giữ chữ sắc nét nhưng vẫn thấy chiều sâu của wallpaper.">
              <SettingGroup title="Bề mặt" description="Chỉ nền terminal thay đổi; chữ luôn giữ tương phản.">
                <Slider
                  id="set-opacity"
                  label="Độ đục"
                  note={
                    opts.surfaceStyle === "flat"
                      ? "Bề mặt Phẳng luôn đục hẳn — đổi sang Kính để chỉnh."
                      : "Thấp hơn sẽ thấy wallpaper rõ hơn."
                  }
                  disabled={opts.surfaceStyle === "flat"}
                  min={TERM_OPACITY_MIN * 100}
                  max={TERM_OPACITY_MAX * 100}
                  step={1}
                  value={opts.surfaceStyle === "flat" ? 100 : Math.round(opts.termOpacity * 100)}
                  display={opts.surfaceStyle === "flat" ? "100%" : `${Math.round(opts.termOpacity * 100)}%`}
                  onChange={(v) => setOpts({ termOpacity: v / 100 })}
                />
                <Slider id="set-contrast" label="Tương phản" note="0 là mức chuẩn của Material 3." min={-1} max={1} step={0.1} value={opts.contrast} display={opts.contrast.toFixed(1)} onChange={(v) => setOpts({ contrast: v })} />
                <Slider id="set-chroma" label="Độ rực ANSI" note="Tách màu terminal khỏi phần chrome trung tính." min={1} max={2.5} step={0.05} value={opts.termChroma} display={`${opts.termChroma.toFixed(2)}×`} onChange={(v) => setOpts({ termChroma: v })} />
              </SettingGroup>
            </SettingsPage>
          )}

          {page === "layout" && (
            <SettingsPage title="Block" description="Chia, chuyển và kéo block mà không làm mất session.">
              <SettingGroup title="Block mới" description="Chọn cách cây layout mở rộng.">
                <ChoiceRow label="Kiểu chia">
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
                  {LAYOUTS.find((layout) => layout.id === opts.layoutMode)?.note} Dùng nút ‹ › để chuyển block; giữ biểu tượng tay nắm trên header để kéo block tới vị trí mới.
                </div>
              </SettingGroup>
            </SettingsPage>
          )}

          {page === "keys" && (
            <SettingsPage title="Phím tắt" description="Chỉ giành phím khi nó thật sự giúp workflow nhanh hơn.">
              <SettingGroup title="Quyền ưu tiên" description="Tắt để trả tổ hợp phím về shell hoặc TUI.">
                <Toggle id="set-tabkeys" label="Ctrl+T / Ctrl+W" note="Mở và đóng block giống tab trình duyệt." checked={opts.tabShortcuts} onChange={(v) => setOpts({ tabShortcuts: v })} />
                <Toggle id="set-wskeys" label="Alt+1…9" note="Nhảy thẳng tới workspace tương ứng." checked={opts.workspaceAltKeys} onChange={(v) => setOpts({ workspaceAltKeys: v })} />
              </SettingGroup>
              <SettingGroup title="Danh sách phím" description="Các thao tác chính của workspace.">
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
  if (colorSource === "brand") return "bảng màu thương hiệu";
  if (source === "wallpaper") return wallpaper;
  return "bảng màu dự phòng";
}
