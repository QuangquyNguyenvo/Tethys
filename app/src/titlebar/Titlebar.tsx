import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Icon, type IconName } from "../ui/Icon";
import { shellFloatRef } from "../web/surfaceVisibility";

export type WorkspaceTab = {
  id: string;
  name: string;
};

type Props = {
  tabs: WorkspaceTab[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  onAddTab: () => void;
  onCloseTab: (id: string) => void;
};

/** Icon gán theo id workspace, không theo vị trí: đóng tab bên cạnh thì icon của các tab
 *  còn lại phải đứng yên, nếu không cả thanh nhìn như vừa xáo lại. */
const WS_ICONS: IconName[] = [
  "dashboard",
  "code",
  "description",
  "science",
  "deployed-code",
  "bolt",
  "rocket-launch",
  "database",
];

function iconFor(id: string): IconName {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return WS_ICONS[h % WS_ICONS.length];
}

/**
 * Thanh trên cùng.
 *
 * Bố cục ba cột `1fr auto 1fr`: brand bên trái, workspace **chính giữa thanh**, đồng hồ và
 * nút cửa sổ bên phải. Dùng grid chứ không phải flex + spacer vì chỉ grid mới cho cụm giữa
 * nằm giữa *thanh*; với flex nó chỉ nằm giữa *khoảng trống còn lại*, tức là lệch đúng bằng
 * hiệu bề ngang hai cụm hai bên — và cụm phải luôn rộng hơn cụm trái.
 *
 * Tab đang chọn dùng một tonal pill duy nhất trượt giữa các workspace. Indicator nằm trên
 * compositor layer riêng nên đổi tab chỉ animate transform/width của chrome nhỏ, không làm
 * các terminal bên dưới reflow theo từng frame.
 *
 * Đã bỏ hai thứ vô dụng của bản trước:
 * — "3AM — Aesthetic" cùng mấy vạch nhạc nhấp nháy: một trình phát nhạc giả, không nối
 *   vào cái gì, chỉ chiếm chỗ và làm người dùng tưởng bấm được.
 * — Nút "+ Terminal" đứng ngay cạnh nút "+" của tab: hai dấu cộng sát nhau, hai việc khác
 *   hẳn nhau, không cách nào đoán được cái nào là cái nào. Mở terminal nay nằm dưới dock.
 * — Ô "Tìm lệnh, tệp, cài đặt…": một hộp chữ nhật to chắn giữa thanh, chỉ để mở đúng thứ
 *   mà Ctrl+K đã mở, và ngay bên trong nó đã in sẵn "Ctrl+K".
 */
export function Titlebar({
  tabs,
  activeTab,
  onSelectTab,
  onAddTab,
  onCloseTab,
}: Props) {
  // Keep the UI previewable in Vite, where the Tauri bridge does not exist.
  const appWindow = useMemo(() => {
    try {
      return getCurrentWindow();
    } catch {
      return null;
    }
  }, []);
  const [time, setTime] = useState<string>("");

  useEffect(() => {
    let timer = 0;
    const updateTime = () => {
      const d = new Date();
      setTime(d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }));
      // Mặt đồng hồ chỉ hiện tới phút: canh đúng biên phút thay vì render cả titlebar mỗi giây.
      timer = window.setTimeout(updateTime, 60_000 - (Date.now() % 60_000) + 25);
    };
    updateTime();
    return () => window.clearTimeout(timer);
  }, []);

  const icons = useMemo(() => tabs.map((t) => iconFor(t.id)), [tabs]);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<string, HTMLDivElement>());
  const [activePill, setActivePill] = useState({ x: 0, width: 0, ready: false });

  // The active workspace is represented by one shared pill instead of one background per
  // tab. Moving the same surface is the Material motion equivalent of shape morphing and
  // avoids a cross-fade that would make the bar flash on every workspace switch.
  useLayoutEffect(() => {
    const bar = tabBarRef.current;
    const active = tabRefs.current.get(activeTab);
    if (!bar || !active) {
      setActivePill((current) => current.ready ? { ...current, ready: false } : current);
      return;
    }

    const measure = () => {
      const next = { x: active.offsetLeft, width: active.offsetWidth, ready: true };
      setActivePill((current) =>
        current.x === next.x && current.width === next.width && current.ready
          ? current
          : next,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    observer.observe(active);
    return () => observer.disconnect();
  }, [activeTab, tabs]);
  const handleMinimize = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    invoke("app_window_minimize").catch(() => {
      appWindow?.minimize().catch((err) => console.error("Could not minimize:", err));
    });
  };

  const handleMaximize = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    invoke("app_window_toggle_maximize").catch(() => {
      appWindow?.toggleMaximize().catch((err) => console.error("Could not maximize:", err));
    });
  };

  const handleClose = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    invoke("app_window_close").catch(() => {
      appWindow?.close().catch((err) => console.error("Could not close:", err));
    });
  };

  /** true nếu click rơi vào chrome trống (không phải tab/nút) — chỗ hợp lệ để kéo/maximize. */
  const isChromeTarget = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    return !target.closest(
      "button, input, [role='tab'], .tab-item, .window-controls, .tab-add, .tab-close, .win-btn"
    );
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (!isChromeTarget(e)) return;
    appWindow?.startDragging().catch(() => {});
  };

  // Double-click bubbling từ một tab lên `.titlebar-center` từng bị hiểu nhầm là double-click
  // vào chrome trống, nên bấm nhanh hai lần vào workspace tab lại vô tình toggle maximize.
  const handleChromeDoubleClick = (e: React.MouseEvent) => {
    if (!isChromeTarget(e)) return;
    handleMaximize(e);
  };

  const handleSystemMenu = (e: React.MouseEvent) => {
    if (!isChromeTarget(e)) return;
    e.preventDefault();
    invoke("app_window_system_menu").catch(() => {});
  };

  return (
    <header
      className="titlebar"
      // Khi thanh trên tự ẩn, nó nổi *trên* canvas — cùng bài toán với dock, nên overlay
      // native cũng phải khoét vùng của nó ra. Lúc thanh nằm trong dòng chảy bình thường
      // thì nó không giao với tile nào và việc đăng ký này là vô hại.
      ref={shellFloatRef}
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
      onDoubleClick={handleChromeDoubleClick}
      onContextMenu={handleSystemMenu}
    >
      {/* Thanh thật là `.tb-bar`, một hòn đảo bo tròn nổi trên ảnh nền — `header` chỉ còn
          là dải lề quanh nó, và vẫn là vùng kéo cửa sổ để phần lề không thành chỗ chết. */}
      <div className="tb-bar" data-tauri-drag-region>
        <div className="titlebar-left" data-tauri-drag-region>
          <div className="brand" data-tauri-drag-region>
            <img src="/logo.png" alt="Tethys Logo" className="brand-logo" data-tauri-drag-region draggable={false} />
            <span className="brand-name" data-tauri-drag-region>Tethys</span>
          </div>
        </div>

        {/* Vùng kéo nằm ở chính khối này, nên khoảng trống hai bên cụm tab vẫn kéo được
            cửa sổ; các nút bên trong là target khác nên không dính. */}
        <div
          className="titlebar-center"
          data-tauri-drag-region
          onDoubleClick={handleChromeDoubleClick}
        >
          <div ref={tabBarRef} className="tab-bar" role="tablist" data-tauri-drag-region>
            <span
              className="tab-active-indicator"
              aria-hidden="true"
              style={
                {
                  "--tab-x": `${activePill.x}px`,
                  "--tab-width": `${activePill.width}px`,
                  opacity: activePill.ready ? 1 : 0,
                } as CSSProperties
              }
            />
            {tabs.map((t, idx) => {
              const icon = icons[idx];
              const active = t.id === activeTab;
              return (
                <div
                  key={t.id}
                  ref={(node) => {
                    if (node) tabRefs.current.set(t.id, node);
                    else tabRefs.current.delete(t.id);
                  }}
                  role="tab"
                  aria-selected={active}
                  className={`tab-item ${active ? "active" : ""}`}
                  onClick={() => onSelectTab(t.id)}
                  onAuxClick={(e) => {
                    if (e.button !== 1 || tabs.length <= 1) return;
                    e.preventDefault();
                    onCloseTab(t.id);
                  }}
                  onMouseDown={(e) => {
                    if (e.button === 1) e.preventDefault();
                    e.stopPropagation();
                  }}
                  title={
                    (idx < 9 ? `${t.name} — Alt+${idx + 1}` : t.name) +
                    (tabs.length > 1 ? " · Middle-click to close" : "")
                  }
                >
                  <span className="tab-face">
                    {/* Trục FILL: workspace đang mở dùng bản đặc, các tab khác bản rỗng.
                        Đây là cách Material You nói "đang chọn" — nhận ra bằng *hình*, chứ
                        không phải bằng sắc độ, nên không phụ thuộc vào việc màu sinh từ ảnh
                        nền hôm nay có tương phản đủ hay không. */}
                    <Icon name={icon} size={18} filled={active} />
                    <span className="tab-name">{t.name}</span>
                    {tabs.length > 1 && (
                      <button
                        className="tab-close"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCloseTab(t.id);
                        }}
                        title="Close workspace"
                      >
                        <Icon name="close" size={14} />
                      </button>
                    )}
                  </span>
                  <span className="tab-underline" />
                </div>
              );
            })}
            <button className="tab-add" onClick={onAddTab} title="Add workspace" aria-label="Add workspace">
              <Icon name="add" size={18} />
            </button>
          </div>
        </div>

        <div className="titlebar-right" data-tauri-drag-region>
          <div className="clock-pill" data-tauri-drag-region>
            <span data-tauri-drag-region>{time || "00:00"}</span>
          </div>

          <div className="window-controls" onMouseDown={(e) => e.stopPropagation()}>
            <button
              className="win-btn"
              onClick={handleMinimize}
              onMouseDown={(e) => e.stopPropagation()}
              title="Minimize"
              aria-label="Minimize"
            >
              <Icon name="remove" size={18} />
            </button>
            <button
              className="win-btn"
              onClick={handleMaximize}
              onMouseDown={(e) => e.stopPropagation()}
              title="Maximize / Restore"
              aria-label="Maximize or restore"
            >
              <Icon name="crop-square" size={16} />
            </button>
            <button
              className="win-btn close"
              onClick={handleClose}
              onMouseDown={(e) => e.stopPropagation()}
              title="Close"
              aria-label="Close"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
