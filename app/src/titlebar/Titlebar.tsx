import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Boxes,
  Code2,
  Database,
  FileText,
  FlaskConical,
  LayoutGrid,
  Minus,
  Plus,
  Rocket,
  Sparkles,
  Square,
  X,
} from "lucide-react";

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
const WS_ICONS = [LayoutGrid, Code2, FileText, FlaskConical, Boxes, Sparkles, Rocket, Database];

function iconFor(id: string) {
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
 * Tab đang chọn đánh dấu bằng gạch chân accent, không phải nền pill đặc. Nền đặc kéo con mắt
 * mạnh hơn hẳn mọi thứ khác trên thanh, trong khi đây là thứ người dùng liếc chứ không nhìn.
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
    const updateTime = () => {
      const d = new Date();
      setTime(d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const icons = useMemo(() => tabs.map((t) => iconFor(t.id)), [tabs]);
  const handleMinimize = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    invoke("app_window_minimize").catch(() => {
      appWindow?.minimize().catch((err) => console.error("Lỗi minimize:", err));
    });
  };

  const handleMaximize = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    invoke("app_window_toggle_maximize").catch(() => {
      appWindow?.toggleMaximize().catch((err) => console.error("Lỗi maximize:", err));
    });
  };

  const handleClose = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    invoke("app_window_close").catch(() => {
      appWindow?.close().catch((err) => console.error("Lỗi close:", err));
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target.closest(
        "button, input, [role='tab'], .tab-item, .window-controls, .tab-add, .tab-close, .win-btn"
      )
    ) {
      return;
    }
    appWindow?.startDragging().catch(() => {});
  };

  return (
    <header
      className="titlebar"
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
      onDoubleClick={handleMaximize}
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
        <div className="titlebar-center" data-tauri-drag-region onDoubleClick={handleMaximize}>
          <div className="tab-bar" role="tablist" data-tauri-drag-region>
            {tabs.map((t, idx) => {
              const Icon = icons[idx];
              const active = t.id === activeTab;
              return (
                <div
                  key={t.id}
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
                    (tabs.length > 1 ? " · Nhấn chuột giữa để đóng" : "")
                  }
                >
                  <span className="tab-face">
                    <Icon size={14} strokeWidth={2.1} />
                    <span className="tab-name">{t.name}</span>
                    {tabs.length > 1 && (
                      <button
                        className="tab-close"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCloseTab(t.id);
                        }}
                        title="Đóng không gian làm việc"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </span>
                  <span className="tab-underline" />
                </div>
              );
            })}
            <button className="tab-add" onClick={onAddTab} title="Thêm không gian làm việc">
              <Plus size={13} />
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
              title="Thu nhỏ"
            >
              <Minus size={13} />
            </button>
            <button
              className="win-btn"
              onClick={handleMaximize}
              onMouseDown={(e) => e.stopPropagation()}
              title="Phóng to / Khôi phục"
            >
              <Square size={11} />
            </button>
            <button
              className="win-btn close"
              onClick={handleClose}
              onMouseDown={(e) => e.stopPropagation()}
              title="Đóng"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
