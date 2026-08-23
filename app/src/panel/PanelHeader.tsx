import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  GripVertical,
  SquareSplitHorizontal,
  SquareSplitVertical,
  X,
} from "lucide-react";
import { useSessions } from "../store/sessions";
import { usePanelDrag } from "../layout/usePanelDrag";
import { usePanelWidth } from "./usePanelWidth";

export type HeadAction = {
  id: string;
  label: string;
  /** Một icon `lucide-react` dựng sẵn, ví dụ `<Copy size={12} />`. */
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
  /** Đang bật (nút hai trạng thái, ví dụ xem thô / xem định dạng). */
  active?: boolean;
  /**
   * Ở lại thanh dưới dạng nút. Mặc định `false` — thao tác chui vào menu `⋯`.
   *
   * Mặc định là "vào menu" chứ không phải "ra thanh": thanh nào cũng đã có sẵn hai nút
   * chia và một nút đóng; thêm bốn nút nữa là thành một hàng biểu tượng không ai đọc.
   */
  inline?: boolean;
};

type Props = {
  panelKey?: string;
  /** Quyết định màu chấm đầu thanh: mỗi loại panel một màu, nhìn là biết ngay. */
  kind: "term" | "preview" | "explorer" | "web" | "settings" | "system";
  /** Icon nhỏ đứng trước tiêu đề (tuỳ chọn). */
  icon?: ReactNode;
  title: string;
  /** Dòng phụ mờ — cwd, thư mục cha, host… Ẩn đầu tiên khi panel hẹp lại. */
  subtitle?: string;
  chips?: ReactNode;
  actions?: HeadAction[];
};

/** Ngưỡng đo bằng px trên chính thanh tiêu đề. */
const W_SUBTITLE = 430;
const W_CHIPS = 330;
const W_INLINE_ACTIONS = 270;
/** Dưới ngưỡng này thanh chỉ còn đúng một nút `⋯`; mọi thứ khác chui vào trong nó. */
const W_MINIMAL = 150;

/* Icon lấy từ `lucide-react` — cùng bộ, cùng nét, cùng lưới 24px.
   Trước đây mỗi chỗ tự viết `<path d="...">`: nét không đều nhau, không có tên gọi, và
   sửa một icon là phải đi tìm nó nằm trong file nào. */
const ICON = 12;

/**
 * Thanh tiêu đề dùng chung cho mọi loại panel.
 *
 * Hai điều nó phải giữ được, và là lý do nó tồn tại thay vì mỗi panel tự viết:
 *
 * 1. **Chia dọc / chia ngang nằm ngay góc trên của block.** Trước kia chúng nấp trong một
 *    menu xổ xuống, mà cùng lúc lại có thêm hai nút y hệt dưới dock — hai chỗ, cùng một việc.
 * 2. **Hẹp lại thì gom, không mất.** Panel co nhỏ thì nút dồn vào menu tràn `⋯`; bản cũ
 *    để chúng bị đẩy tràn ra ngoài `overflow:hidden` và biến mất không dấu vết.
 */
export function PanelHeader({ panelKey, kind, icon, title, subtitle, chips, actions = [] }: Props) {
  const { ref, width } = usePanelWidth<HTMLDivElement>();
  const dragProps = usePanelDrag(panelKey);
  const handleDragProps = usePanelDrag(panelKey, true);
  const split = useSessions((s) => s.split);
  const remove = useSessions((s) => s.remove);
  const move = useSessions((s) => s.move);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Menu phải nằm ngoài panel trong DOM. Panel có `overflow: hidden` để bo góc, nên menu
  // xổ ra từ một panel hẹp sẽ bị xén mất nửa chữ — đúng lúc cần đọc nhất.
  // (Portal ở đây vô hại: nó dựng/xoá theo lần mở menu, không phải nơi panel sinh sống.)
  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuPos(null);
      return;
    }
    const b = btnRef.current?.getBoundingClientRect();
    const m = menuRef.current?.getBoundingClientRect();
    if (!b || !m) return;
    const left = Math.max(8, Math.min(b.right - m.width, window.innerWidth - m.width - 8));
    const top = b.bottom + 6 + m.height > window.innerHeight ? b.top - m.height - 6 : b.bottom + 6;
    setMenuPos((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
  }, [menuOpen]);

  // Bấm ra ngoài thì đóng menu. `mouseleave` không đủ: bấm sang panel khác vẫn để menu treo.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as globalThis.Node;
      if (!wrapRef.current?.contains(t) && !menuRef.current?.contains(t)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const minimal = width > 0 && width < W_MINIMAL;
  const showSubtitle = width >= W_SUBTITLE && !!subtitle;
  const showChips = width >= W_CHIPS;
  const inlineActions = width >= W_INLINE_ACTIONS;

  const splitActions: HeadAction[] = [
    {
      id: "split-row",
      label: "Split to the right (Ctrl+Shift+E)",
      icon: <SquareSplitHorizontal size={ICON} />,
      onClick: () => split("row", undefined, panelKey),
    },
    {
      id: "split-col",
      label: "Split below (Ctrl+Shift+O)",
      icon: <SquareSplitVertical size={ICON} />,
      onClick: () => split("col", undefined, panelKey),
    },
  ];

  const navigationActions: HeadAction[] = [
    {
      id: "previous-panel",
      label: "Go to previous panel",
      icon: <ChevronLeft size={ICON + 1} />,
      onClick: () => move(-1),
    },
    {
      id: "next-panel",
      label: "Go to next panel (Ctrl+Shift+Tab)",
      icon: <ChevronRight size={ICON + 1} />,
      onClick: () => move(1),
    },
  ];

  const closeAction: HeadAction = {
    id: "close",
    label: "Close panel (Ctrl+Shift+W)",
    icon: <X size={ICON} />,
    danger: true,
    onClick: () => panelKey && remove(panelKey),
  };

  const wantsInline = actions.filter((a) => a.inline);
  const wantsMenu = actions.filter((a) => !a.inline);
  // Terminal là nơi mắt đọc liên tục. Giữ header của nó giống một tab mảnh; các thao tác
  // bố cục vẫn còn nguyên nhưng nằm trong menu `…` để không biến thành một toolbar dày.
  const quietTerminalHeader = kind === "term";
  const all = [...wantsInline, ...wantsMenu, ...navigationActions, ...splitActions];
  // Hẹp tới mức này thì nút đóng cũng vào menu — thà bấm hai lần còn hơn không bấm được.
  const overflow = inlineActions
    ? quietTerminalHeader
      ? [...wantsMenu, ...navigationActions, ...splitActions]
      : wantsMenu
    : minimal
      ? [...all, closeAction]
      : all;
  const shown = inlineActions && !quietTerminalHeader ? [...wantsInline, ...splitActions] : [];

  return (
    <div
      ref={ref}
      className={"panel-head head-" + kind + (minimal ? " minimal" : "")}
      {...dragProps}
      title={minimal ? title : "Drag this bar to move the panel"}
      onAuxClick={(e) => {
        if (e.button !== 1 || !panelKey) return;
        e.preventDefault();
        remove(panelKey);
      }}
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
    >
      <span className={"panel-dot dot-" + kind} />

      {!minimal && (
        <span className="ttl">
          {icon && <span className="ttl-icon">{icon}</span>}
          <span className="title" title={title}>
            {title}
          </span>
        </span>
      )}

      {showSubtitle && (
        <span className="sub" title={subtitle}>
          {subtitle}
        </span>
      )}

      <span className="sp" />

      {showChips && chips && <span className="head-chips">{chips}</span>}

      <div className="panel-actions" ref={wrapRef}>
        {!minimal && (
          <button
            className="iconbtn move-handle"
            title="Hold and drag to move the panel"
            aria-label="Drag to move the panel"
            {...handleDragProps}
          >
            <GripVertical size={14} />
          </button>
        )}

        {inlineActions &&
          navigationActions.map((a) => (
            <button key={a.id} className="iconbtn block-nav" title={a.label} aria-label={a.label} onClick={a.onClick}>
              {a.icon}
            </button>
          ))}

        {shown.map((a) => (
          <button
            key={a.id}
            className={"iconbtn" + (a.danger ? " close" : "") + (a.active ? " on" : "")}
            title={a.label}
            aria-label={a.label}
            onClick={a.onClick}
          >
            {a.icon}
          </button>
        ))}

        {overflow.length > 0 && (
          <div className="head-menu-wrap">
            <button
              ref={btnRef}
              className={"iconbtn" + (menuOpen ? " on" : "")}
              title="More actions"
              aria-label="More actions"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <Ellipsis size={14} />
            </button>
            {menuOpen &&
              createPortal(
                <div
                  ref={menuRef}
                  className="head-menu"
                  style={
                    menuPos
                      ? { top: menuPos.top, left: menuPos.left }
                      : { top: 0, left: 0, visibility: "hidden" }
                  }
                >
                  {overflow.map((a) => (
                    <button
                      key={a.id}
                      className={a.danger ? "danger" : undefined}
                      onClick={() => {
                        a.onClick();
                        setMenuOpen(false);
                      }}
                    >
                      {a.icon}
                      <span>{a.label}</span>
                    </button>
                  ))}
                </div>,
                document.body,
              )}
          </div>
        )}

        {panelKey && !minimal && (
          <button
            className="iconbtn close"
            title="Close panel (Ctrl+Shift+W)"
            aria-label="Close panel"
            onClick={() => remove(panelKey)}
          >
            <X size={ICON} />
          </button>
        )}
      </div>
    </div>
  );
}
