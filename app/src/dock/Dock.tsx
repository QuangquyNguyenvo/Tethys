import type { ReactNode } from "react";
import { shellFloatRef } from "../web/surfaceVisibility";

export type DockItem = {
  id: string;
  label: string;
  /** Chỉ số ô màu 1..7 trong `--ui-accent-*`; wallpaper mode lấy trực tiếp từ cụm Celebi. */
  accent: number;
  /** Icon `lucide-react` dựng sẵn. */
  icon: ReactNode;
  onClick: () => void;
};

/**
 * Dock nổi ở đáy cửa sổ.
 *
 * Bản trước là một cột dọc dính mép phải: nó ăn 58 px bề ngang vĩnh viễn và cắt đôi
 * khung nhìn của terminal. Dock nổi nằm đè lên canvas nên không ăn diện tích nào cả,
 * và đúng với hình tham chiếu user gửi.
 *
 * `autoHide` cho nó trượt hẳn xuống dưới mép. Dải `.dock-hot` là thứ duy nhất còn nhận
 * chuột lúc đó — không có nó thì dock đã ra khỏi màn hình, chẳng còn gì để rê vào mà hiện
 * lại. Đưa chuột xuống sát đáy là dock trồi lên.
 */
export function Dock({ items, autoHide = false }: { items: DockItem[]; autoHide?: boolean }) {
  return (
    <div className={"dock-wrap" + (autoHide ? " auto" : "")}>
      {autoHide && <div className="dock-hot" />}
      {/* Dock nổi trên canvas, mà panel browser là cửa sổ native luôn nằm trên canvas.
          Đăng ký ở đây để overlay khoét đúng vùng này ra thay vì đè lên. */}
      <nav className="dock" ref={shellFloatRef}>
        {items.map((it) => (
          <button
            key={it.id}
            className="dock-item"
            data-native-float-part="transform"
            title={it.label}
            aria-label={it.label}
            onClick={it.onClick}
            style={
              {
                "--tile": `var(--ui-accent-${it.accent})`,
                "--on-tile": `var(--ui-on-accent-${it.accent})`,
              } as React.CSSProperties
            }
          >
            {it.icon}
            <span className="dock-tip" data-native-float-part="visible">{it.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
