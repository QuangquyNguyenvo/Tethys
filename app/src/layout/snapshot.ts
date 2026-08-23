/**
 * Ảnh chụp hình học của canvas ở lần render gần nhất.
 *
 * `Tiles` là chỗ duy nhất biết panel nào đang nằm ở toạ độ nào, nhưng store mới là chỗ
 * xử lý kéo thả. Cho store `import Tiles` sẽ thành vòng lặp import. Một ô nhớ nhỏ ở giữa
 * rẻ hơn nhiều so với đẩy toàn bộ logic kéo thả vào tầng React.
 */
import type { Layout, Rect } from "./geometry";

export type Snapshot = {
  layout: Layout;
  /** Khung canvas trong toạ độ viewport — dùng để đổi clientX/Y sang toạ độ canvas. */
  origin: Rect;
};

let snapshot: Snapshot | null = null;

export const setSnapshot = (s: Snapshot | null) => {
  snapshot = s;
};

export const getSnapshot = () => snapshot;
