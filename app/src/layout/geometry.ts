/**
 * Quy đổi cây layout thành toạ độ tuyệt đối (px) trong khung canvas.
 *
 * Vì sao cần bước này: trước đây mỗi panel là một phần tử con thật trong DOM của cây
 * (grid lồng grid). Cây đổi hình -> React tháo và dựng lại nhánh -> `TerminalPanel`
 * bị unmount -> `usePty` cleanup giết PTY. Panel phải nằm **phẳng** ở một tầng duy nhất
 * và chỉ đổi toạ độ, thì phiên shell mới sống sót qua mọi thao tác split / kéo thả.
 */
import { MIN_RATIO, type Dir, type Node, type Path } from "./tree";
import type { DropPosition, RootPosition } from "./tree";

export type Rect = { x: number; y: number; w: number; h: number };

export type GutterInfo = {
  /** Khoá ổn định để React không dựng lại đường ngăn mỗi lần render. */
  id: string;
  path: Path;
  dir: Dir;
  /** Vùng vẽ của chính đường ngăn. */
  rect: Rect;
  /** Khung của nút split cha — cần để đổi vị trí chuột thành tỉ lệ. */
  parent: Rect;
};

export type Layout = {
  rects: Map<string, Rect>;
  gutters: GutterInfo[];
};

/** Bề dày đường ngăn. Cũng chính là khe hở giữa hai panel. */
export const GUTTER = 10;

/** Mép ngoài canvas: thả vào dải này thì panel ra ngoài cùng thay vì cạnh một panel. */
export const ROOT_EDGE = 26;

/**
 * Bề rộng/cao nhỏ nhất của một panel, tính bằng px.
 *
 * `MIN_RATIO` chỉ chặn theo tỉ lệ nên vô dụng khi khung cha đã nhỏ: 8% của 200px vẫn là
 * 16px. Có ngưỡng px thì kéo đường ngăn không thể bóp một panel xuống còn không, và
 * thanh tiêu đề của nó luôn còn đủ chỗ cho menu tràn.
 */
export const MIN_PANEL = 140;

const clamp = (r: number) => Math.min(1 - MIN_RATIO, Math.max(MIN_RATIO, r));

/** Vị trí cắt tính bằng px, đã chặn hai đầu. Khung quá nhỏ để chặn thì chia đôi. */
const clampPx = (v: number, avail: number) =>
  avail < MIN_PANEL * 2
    ? Math.round(avail / 2)
    : Math.min(avail - MIN_PANEL, Math.max(MIN_PANEL, v));

export function computeLayout(root: Node | null, box: Rect, gutter = GUTTER): Layout {
  const rects = new Map<string, Rect>();
  const gutters: GutterInfo[] = [];
  if (!root) return { rects, gutters };

  const walk = (n: Node, r: Rect, path: Path) => {
    if (n.kind === "leaf") {
      rects.set(n.key, r);
      return;
    }
    const ratio = clamp(n.ratio);
    const id = "g" + (path.join("") || "root");

    if (n.dir === "row") {
      const avail = Math.max(0, r.w - gutter);
      const aw = clampPx(Math.round(avail * ratio), avail);
      walk(n.a, { x: r.x, y: r.y, w: aw, h: r.h }, [...path, "a"]);
      gutters.push({
        id,
        path,
        dir: "row",
        rect: { x: r.x + aw, y: r.y, w: gutter, h: r.h },
        parent: r,
      });
      walk(n.b, { x: r.x + aw + gutter, y: r.y, w: avail - aw, h: r.h }, [...path, "b"]);
    } else {
      const avail = Math.max(0, r.h - gutter);
      const ah = clampPx(Math.round(avail * ratio), avail);
      walk(n.a, { x: r.x, y: r.y, w: r.w, h: ah }, [...path, "a"]);
      gutters.push({
        id,
        path,
        dir: "col",
        rect: { x: r.x, y: r.y + ah, w: r.w, h: gutter },
        parent: r,
      });
      walk(n.b, { x: r.x, y: r.y + ah + gutter, w: r.w, h: avail - ah }, [...path, "b"]);
    }
  };

  walk(root, box, []);
  return { rects, gutters };
}

const inside = (r: Rect, x: number, y: number) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** Panel nào đang nằm dưới con trỏ. Toạ độ tính theo gốc canvas, không phải viewport. */
export function hitTest(layout: Layout, x: number, y: number): string | null {
  for (const [key, r] of layout.rects) if (inside(r, x, y)) return key;
  return null;
}

/**
 * Chia panel thành 5 vùng thả: bốn mép và một lõi ở giữa.
 * Lõi rộng 40% mỗi chiều — đủ to để bấm trúng mà không nuốt mất bốn mép.
 */
export function dropZoneFor(r: Rect, x: number, y: number): DropPosition {
  if (r.w <= 0 || r.h <= 0) return "center";
  const fx = (x - r.x) / r.w;
  const fy = (y - r.y) / r.h;
  if (fx > 0.3 && fx < 0.7 && fy > 0.3 && fy < 0.7) return "center";

  const d: [DropPosition, number][] = [
    ["left", fx],
    ["right", 1 - fx],
    ["top", fy],
    ["bottom", 1 - fy],
  ];
  d.sort((a, b) => a[1] - b[1]);
  return d[0][0];
}

/** Ô xem trước sẽ hiện ở đâu khi thả vào vùng `zone` của panel `r`. */
export function indicatorRect(r: Rect, zone: DropPosition): Rect {
  switch (zone) {
    case "left":
      return { x: r.x, y: r.y, w: r.w / 2, h: r.h };
    case "right":
      return { x: r.x + r.w / 2, y: r.y, w: r.w / 2, h: r.h };
    case "top":
      return { x: r.x, y: r.y, w: r.w, h: r.h / 2 };
    case "bottom":
      return { x: r.x, y: r.y + r.h / 2, w: r.w, h: r.h / 2 };
    default:
      return r;
  }
}

/** Ô xem trước khi thả ra mép ngoài cùng của cả canvas. */
export function rootIndicatorRect(box: Rect, pos: RootPosition): Rect {
  const t = 0.32;
  switch (pos) {
    case "left":
      return { x: box.x, y: box.y, w: box.w * t, h: box.h };
    case "right":
      return { x: box.x + box.w * (1 - t), y: box.y, w: box.w * t, h: box.h };
    case "top":
      return { x: box.x, y: box.y, w: box.w, h: box.h * t };
    default:
      return { x: box.x, y: box.y + box.h * (1 - t), w: box.w, h: box.h * t };
  }
}

/** Con trỏ có đang nằm trong dải mép ngoài không. `null` nghĩa là đang ở giữa canvas. */
export function rootZoneFor(box: Rect, x: number, y: number): RootPosition | null {
  if (!inside(box, x, y)) return null;
  const d: [RootPosition, number][] = [
    ["left", x - box.x],
    ["right", box.x + box.w - x],
    ["top", y - box.y],
    ["bottom", box.y + box.h - y],
  ];
  d.sort((a, b) => a[1] - b[1]);
  return d[0][1] <= ROOT_EDGE ? d[0][0] : null;
}
