import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

export type MenuItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Vạch ngăn *phía trên* mục này. Nhóm việc lành với việc phá là lỗi thiết kế menu. */
  sep?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export type MenuState = { x: number; y: number; items: MenuItem[] } | null;

/**
 * Menu chuột phải.
 *
 * Đi qua portal ra thẳng `body`: panel nào cũng có `overflow: hidden` để nội dung không tràn
 * ra khỏi góc bo tròn, nên một menu vẽ *trong* panel sẽ bị cắt cụt ngay khi bấm gần mép dưới —
 * mà mép dưới lại đúng là chỗ danh sách file dài hay được bấm nhất.
 */
export function useContextMenu() {
  const [menu, setMenu] = useState<MenuState>(null);

  const openMenu = useCallback((e: React.MouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    if (items.length === 0) return;
    setMenu({ x: e.clientX, y: e.clientY, items });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  return { menu, openMenu, closeMenu };
}

export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  // Đo rồi mới đặt: menu bung ra ở mép phải hay mép dưới màn hình thì phải lật ngược lại,
  // và chỉ sau khi vẽ mới biết nó cao bao nhiêu. `useLayoutEffect` để việc chỉnh chỗ xong
  // trước lượt sơn — dùng `useEffect` thì thấy rõ menu nhảy một cái.
  useLayoutEffect(() => {
    if (!menu) return;
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const pad = 6;
    setPos({
      x: Math.max(pad, Math.min(menu.x, window.innerWidth - width - pad)),
      y: Math.max(pad, Math.min(menu.y, window.innerHeight - height - pad)),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    // Bỏ qua cú bấm rơi vào chính menu. `stopPropagation` trên phần tử không cứu được:
    // listener này ở **pha capture** của `window`, nó chạy trước khi sự kiện kịp đi xuống —
    // không lọc thì mọi cú bấm đều đóng menu ở `mousedown`, React gỡ nút đi, và `click`
    // không bao giờ tới nơi. Tức là menu hiện ra để nhìn chứ không bấm được.
    const onDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    // `capture` cho `mousedown`: bấm ra ngoài là đóng menu, kể cả khi thứ bị bấm là một
    // nút tự chặn sự kiện. `scroll` cũng đóng — menu neo theo toạ độ màn hình, cuộn xong
    // nó sẽ trỏ nhầm hàng.
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("mousedown", onDown, { capture: true });
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("mousedown", onDown, { capture: true });
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, { capture: true });
    };
  }, [menu, onClose]);

  if (!menu) return null;

  return createPortal(
    <div
      className="ctx-menu"
      ref={ref}
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      role="menu"
    >
      {menu.items.map((it) => (
        <button
          key={it.id}
          className="ctx-item"
          role="menuitem"
          disabled={it.disabled}
          data-sep={it.sep ? "" : undefined}
          onClick={() => {
            onClose();
            it.onClick();
          }}
        >
          <span className="ctx-icon">{it.icon}</span>
          <span className="ctx-label">{it.label}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
