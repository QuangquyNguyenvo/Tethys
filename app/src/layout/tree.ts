/**
 * Cây layout nhị phân. Hàm thuần, không React, không DOM — nhờ vậy kiểm được bằng node.
 *
 * Vì sao cây chứ không phải lưới thưa: đóng một ô trong lưới để lại lỗ hổng phải lấp bằng
 * heuristic. Trong cây, nhánh chị em nhảy lên thay chỗ cha — không có trạng thái mơ hồ.
 */

export type Dir = "row" | "col";

export type Node =
  | { kind: "leaf"; key: string }
  | { kind: "split"; dir: Dir; ratio: number; a: Node; b: Node };

/** Đường đi từ gốc. Không đặt id cho nút split để khỏi phải sinh và giữ khoá. */
export type Path = ("a" | "b")[];

/** Panel hẹp hơn mức này thì xterm không còn đủ cột để hiện gì có nghĩa. */
export const MIN_RATIO = 0.12;

export const leaf = (key: string): Node => ({ kind: "leaf", key });

const clampRatio = (r: number) => Math.min(1 - MIN_RATIO, Math.max(MIN_RATIO, r));

/** Duyệt trái→phải. Dùng cho Tab/Shift-Tab và cho bài kiểm. */
export function leaves(n: Node | null): string[] {
  if (!n) return [];
  return n.kind === "leaf" ? [n.key] : [...leaves(n.a), ...leaves(n.b)];
}

/** Tách lá `key` làm đôi; lá mới nằm ở nhánh `b`. Không tìm thấy `key` thì trả cây cũ. */
export function splitAt(root: Node, key: string, dir: Dir, newKey: string): Node {
  if (root.kind === "leaf") {
    return root.key === key
      ? { kind: "split", dir, ratio: 0.5, a: leaf(key), b: leaf(newKey) }
      : root;
  }
  return { ...root, a: splitAt(root.a, key, dir, newKey), b: splitAt(root.b, key, dir, newKey) };
}

/**
 * Bỏ một lá. Cha của nó bị thay bằng nhánh chị em, nên cây không bao giờ có nút split
 * thiếu con. Bỏ lá cuối cùng thì trả `null`.
 */
export function removeLeaf(root: Node, key: string): Node | null {
  if (root.kind === "leaf") return root.key === key ? null : root;
  const a = removeLeaf(root.a, key);
  const b = removeLeaf(root.b, key);
  if (a === null) return b;
  if (b === null) return a;
  return a === root.a && b === root.b ? root : { ...root, a, b };
}

export function setRatio(root: Node, path: Path, r: number): Node {
  if (path.length === 0) {
    return root.kind === "split" ? { ...root, ratio: clampRatio(r) } : root;
  }
  if (root.kind !== "split") return root;
  const [head, ...rest] = path;
  return head === "a"
    ? { ...root, a: setRatio(root.a, rest, r) }
    : { ...root, b: setRatio(root.b, rest, r) };
}

/** Lá kế tiếp theo thứ tự duyệt, vòng lại đầu. Dùng cho phím chuyển panel. */
export function nextLeaf(root: Node | null, key: string, step: 1 | -1): string | null {
  const all = leaves(root);
  if (all.length === 0) return null;
  const i = all.indexOf(key);
  if (i < 0) return all[0];
  return all[(i + step + all.length) % all.length];
}

/** Hoán đổi vị trí của 2 panel lá trong cây. */
export function swapLeaves(root: Node, key1: string, key2: string): Node {
  if (root.kind === "leaf") {
    if (root.key === key1) return { ...root, key: key2 };
    if (root.key === key2) return { ...root, key: key1 };
    return root;
  }
  return {
    ...root,
    a: swapLeaves(root.a, key1, key2),
    b: swapLeaves(root.b, key1, key2),
  };
}

export type DropPosition = "left" | "right" | "top" | "bottom" | "center";

/**
 * Di chuyển lá sourceKey tới vị trí tương ứng bên cạnh hoặc thay thế targetKey (WaveTerm style drag-and-drop).
 */
export function moveLeafTo(
  root: Node,
  sourceKey: string,
  targetKey: string,
  position: DropPosition,
): Node {
  if (sourceKey === targetKey) return root;
  if (position === "center") {
    return swapLeaves(root, sourceKey, targetKey);
  }

  // 1. Tách sourceKey ra khỏi cây trước
  const withoutSource = removeLeaf(root, sourceKey);
  if (!withoutSource) return root;

  // 2. Chèn sourceKey vào vị trí tương ứng cạnh targetKey
  const dir: Dir = position === "left" || position === "right" ? "row" : "col";

  function insertAt(n: Node): Node {
    if (n.kind === "leaf") {
      if (n.key === targetKey) {
        if (position === "left" || position === "top") {
          return {
            kind: "split",
            dir,
            ratio: 0.5,
            a: leaf(sourceKey),
            b: leaf(targetKey),
          };
        } else {
          return {
            kind: "split",
            dir,
            ratio: 0.5,
            a: leaf(targetKey),
            b: leaf(sourceKey),
          };
        }
      }
      return n;
    }
    return {
      ...n,
      a: insertAt(n.a),
      b: insertAt(n.b),
    };
  }

  return insertAt(withoutSource);
}


/** Vị trí thả ở mép ngoài cùng của cả canvas, không gắn với panel nào. */
export type RootPosition = "left" | "right" | "top" | "bottom";

/** Tỉ lệ dành cho panel vừa thả vào mép ngoài. Nhỏ hơn 0.5 để không nuốt layout cũ. */
const ROOT_RATIO = 0.32;

/** Chèn một lá mới thành nhánh ngoài cùng của cây. */
export function insertAtRoot(root: Node, key: string, position: RootPosition, ratio = ROOT_RATIO): Node {
  const dir: Dir = position === "left" || position === "right" ? "row" : "col";
  return position === "left" || position === "top"
    ? { kind: "split", dir, ratio, a: leaf(key), b: root }
    : { kind: "split", dir, ratio: 1 - ratio, a: root, b: leaf(key) };
}

/**
 * Chuyển một lá đã có ra mép ngoài cùng. Nếu lá đó là lá duy nhất thì không làm gì —
 * gỡ ra sẽ còn cây rỗng, chèn lại chỉ tạo ra đúng cây cũ.
 */
export function moveLeafToRoot(root: Node, key: string, position: RootPosition, ratio?: number): Node {
  const rest = removeLeaf(root, key);
  if (!rest) return root;
  return insertAtRoot(rest, key, position, ratio);
}
