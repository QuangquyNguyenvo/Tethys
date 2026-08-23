import assert from "node:assert/strict";

// Đọc logic tree trực tiếp (ES module)
const MIN_RATIO = 0.12;

const leaf = (key) => ({ kind: "leaf", key });

const clampRatio = (r) => Math.min(1 - MIN_RATIO, Math.max(MIN_RATIO, r));

function leaves(n) {
  if (!n) return [];
  return n.kind === "leaf" ? [n.key] : [...leaves(n.a), ...leaves(n.b)];
}

function splitAt(root, key, dir, newKey) {
  if (root.kind === "leaf") {
    return root.key === key
      ? { kind: "split", dir, ratio: 0.5, a: leaf(key), b: leaf(newKey) }
      : root;
  }
  return { ...root, a: splitAt(root.a, key, dir, newKey), b: splitAt(root.b, key, dir, newKey) };
}

function removeLeaf(root, key) {
  if (root.kind === "leaf") return root.key === key ? null : root;
  const a = removeLeaf(root.a, key);
  const b = removeLeaf(root.b, key);
  if (a === null) return b;
  if (b === null) return a;
  return a === root.a && b === root.b ? root : { ...root, a, b };
}

function setRatio(root, path, r) {
  if (path.length === 0) {
    return root.kind === "split" ? { ...root, ratio: clampRatio(r) } : root;
  }
  if (root.kind !== "split") return root;
  const [head, ...rest] = path;
  return head === "a"
    ? { ...root, a: setRatio(root.a, rest, r) }
    : { ...root, b: setRatio(root.b, rest, r) };
}

function nextLeaf(root, key, step) {
  const all = leaves(root);
  if (all.length === 0) return null;
  const i = all.indexOf(key);
  if (i < 0) return all[0];
  return all[(i + step + all.length) % all.length];
}

console.log("--- TEST D2 & D3: Layout Tree Engine ---");

// Test 1: Khởi tạo lá
const t1 = leaf("p1");
assert.deepEqual(leaves(t1), ["p1"], "leaves() trên lá đơn phải trả về [p1]");
assert.equal(nextLeaf(t1, "p1", 1), "p1");
assert.equal(nextLeaf(t1, "p1", -1), "p1");

// Test 2: Split dọc (row) tạo ra 2 lá: p1 (trái) và p2 (phải)
const t2 = splitAt(t1, "p1", "row", "p2");
assert.equal(t2.kind, "split");
assert.equal(t2.dir, "row");
assert.equal(t2.ratio, 0.5);
assert.deepEqual(leaves(t2), ["p1", "p2"], "Thứ tự leaves() phải là [p1, p2]");
assert.equal(nextLeaf(t2, "p1", 1), "p2");
assert.equal(nextLeaf(t2, "p2", 1), "p1");
assert.equal(nextLeaf(t2, "p1", -1), "p2");

// Test 3: Split tiếp p2 theo chiều ngang (col) thành p2 (trên) và p3 (dưới)
const t3 = splitAt(t2, "p2", "col", "p3");
assert.deepEqual(leaves(t3), ["p1", "p2", "p3"], "Thứ tự leaves() phải là [p1, p2, p3]");
assert.equal(nextLeaf(t3, "p1", 1), "p2");
assert.equal(nextLeaf(t3, "p2", 1), "p3");
assert.equal(nextLeaf(t3, "p3", 1), "p1");

// Test 4: Set ratio và kẹp ratio trong [MIN_RATIO, 1 - MIN_RATIO]
const t3_resized = setRatio(t3, [], 0.05); // tỉ lệ quá nhỏ
assert.equal(t3_resized.ratio, MIN_RATIO, `Ratio phải bị kẹp về MIN_RATIO (${MIN_RATIO})`);

const t3_resized2 = setRatio(t3, [], 0.99); // tỉ lệ quá lớn
assert.equal(t3_resized2.ratio, 1 - MIN_RATIO, `Ratio phải bị kẹp về 1 - MIN_RATIO (${1 - MIN_RATIO})`);

const t3_resized_sub = setRatio(t3, ["b"], 0.3); // chỉnh ratio của nhánh con b
assert.equal(t3_resized_sub.b.ratio, 0.3, "Ratio của nhánh con b phải đổi thành 0.3");

// Test 5 (D3): Đóng p3 -> nhánh b (split p2-p3) phải tự sụp, chỉ còn p2
const t4 = removeLeaf(t3, "p3");
assert.deepEqual(leaves(t4), ["p1", "p2"], "Đóng p3 thì cây phải còn lại [p1, p2]");
assert.equal(t4.b.kind, "leaf", "Nhánh b sau khi sụp phải trở thành lá p2, không còn nút split");
assert.equal(t4.b.key, "p2");

// Test 6 (D2): Đóng tiếp p2 -> cây trở về đúng lá ban đầu p1
const t5 = removeLeaf(t4, "p2");
assert.deepEqual(t5, leaf("p1"), "Đóng p2 thì cây phải trở về đúng lá p1 ban đầu");

// Test 7 (D3): Đóng lá cuối cùng p1 -> trả về null
const t6 = removeLeaf(t5, "p1");
assert.equal(t6, null, "Đóng lá cuối cùng phải trả về null");

// Test 8: Đóng lá không tồn tại -> không đổi gì
const t7 = removeLeaf(t3, "p999");
assert.deepEqual(t7, t3, "Đóng lá không tồn tại thì cây giữ nguyên");

console.log("PASS: Tất cả bài kiểm D2 và D3 cho cây layout đều ĐẠT!");
