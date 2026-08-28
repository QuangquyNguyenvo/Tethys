import type { ReactNode } from "react";

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
      <nav className="dock">
        {items.map((it) => (
          <button
            key={it.id}
            className="dock-item"
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
            <span className="dock-tip">{it.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
