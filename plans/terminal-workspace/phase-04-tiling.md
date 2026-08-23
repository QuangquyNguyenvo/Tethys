# Phase 04 — Tiling layout engine

> Prereq: phase 03 PASS | Rủi ro: 🔴 (cây layout + vòng đời PTY — người phải review diff)
> Files: `src/layout/tree.ts`, `src/layout/Tiles.tsx`, `src/store/sessions.ts`, `src/App.tsx`, `src/App.css`
> Rollback: chưa có git → `cp -r app/src app/src.bak` trước khi bắt đầu

## Mục tiêu

Chia cửa sổ thành nhiều panel bằng cây nhị phân, kéo được đường ngăn để đổi tỉ lệ, đóng panel
thì nhánh tự sụp. Mỗi leaf giữ đúng một PTY session suốt vòng đời của nó.

`ui-demo/index.html` dùng grid cố định `1.35fr .95fr` — đó là ảnh minh hoạ, **không** phải engine.
Phase này thay nó bằng cây thật.

**KHÔNG đụng**: preview panel (P05), command palette (P08), custom titlebar + Mica (P10),
kéo-thả đổi chỗ panel (để sau — split + resize + close đã đủ một session).

## Kiến trúc

```ts
export type Dir = "row" | "col";
export type Node =
  | { kind: "leaf"; key: string }
  | { kind: "split"; dir: Dir; ratio: number; a: Node; b: Node };
```

- `key` trỏ tới `Panel.key` đã có trong `store/sessions.ts`.
- `ratio` là phần của nhánh `a`, trong `[MIN_RATIO, 1 - MIN_RATIO]`.
- Đường đi tới một nút là `("a" | "b")[]` — không dùng id cho nút split, tránh phải sinh khoá.

Vì sao cây nhị phân chứ không phải grid thưa: đóng một panel trong grid để lại lỗ hổng phải
lấp bằng heuristic, còn cây thì nhánh chị em nhảy lên thay chỗ cha, không có trạng thái mơ hồ.

### Điểm chết người: danh tính của leaf

`TerminalPanel` chỉ được unmount khi panel **thật sự** bị đóng. Nếu React thấy `key` đổi chỗ
trong cây, nó sẽ dựng lại component và PTY cũ bị kill — người dùng mất phiên `claude` đang chạy.
Vậy: `key` của React **phải** là `Panel.key`, và mọi thao tác trên cây chỉ đổi cấu trúc, không
đổi khoá của leaf.

## Việc làm

### 1. `src/layout/tree.ts` — thuần tuý, không React

| hàm | việc |
|---|---|
| `leaf(key)` | tạo lá |
| `splitAt(root, key, dir, newKey)` | biến lá `key` thành split, lá mới nằm ở `b` |
| `removeLeaf(root, key)` | bỏ lá; cha bị thay bằng nhánh chị em; trả `null` nếu hết lá |
| `setRatio(root, path, r)` | kẹp trong `[MIN_RATIO, 1-MIN_RATIO]` |
| `leaves(root)` | duyệt trái→phải, dùng cho Tab/Shift-Tab và cho bài kiểm |

Tất cả là hàm thuần, trả cây mới. Nhờ vậy kiểm được bằng node mà không cần dựng DOM.

### 2. `src/store/sessions.ts` — thay `panels: Panel[]` bằng `panels` + `tree`

Giữ nguyên `Panel`, thêm `tree: Node | null`. `add()` cũ đang nối vào mảng; đổi thành
`split(dir)` tách từ panel đang focus. `remove(key)` gọi `removeLeaf`.

Hook đo đạc `NONAME_PANELS`: đọc trong `App.tsx` (frontend không đọc được env của process, nên
Rust phải chuyển qua — thêm command `boot_panels() -> u32` trả `NONAME_PANELS`, mặc định 1).

### 3. `src/layout/Tiles.tsx` — render đệ quy

Split `row` → `grid-template-columns: {r}fr {GUTTER}px {1-r}fr`; `col` → `grid-template-rows`.
Đường ngăn là `<div class="gutter">` với `onPointerDown` → `setPointerCapture` → tính tỉ lệ
theo `getBoundingClientRect()` của phần tử split.

Dùng pointer capture chứ không nghe `mousemove` trên `window`: chuột đi qua vùng terminal thì
xterm nuốt sự kiện, kéo sẽ khựng.

### 4. `App.tsx` + `App.css`

`App.tsx` render `<Tiles>`; phím tắt tối thiểu: `Ctrl+Shift+E` split dọc, `Ctrl+Shift+O` split
ngang, `Ctrl+Shift+W` đóng panel focus.

CSS: `.gutter` dùng `--ui-outline-variant`, hover đổi sang `--ui-primary`. Không glow (U1).
Bo góc panel giữ `16px` như phase 03 (U2).

## Acceptance criteria

| # | Tiêu chí | Cách kiểm | PASS khi | Kết quả |
|---|---|---|---|---|
| D1 | Build sạch | `npm run tauri build -- --no-bundle` | exit 0 | ✅ PASS |
| D2 | Cây đúng | `node scripts/check-tree.mjs` | split → close → về đúng cây ban đầu; `leaves()` giữ thứ tự; ratio bị kẹp | ✅ PASS |
| D3 | Đóng lá thì nhánh sụp | cùng script | Không còn nút split nào có con `null`; đóng lá cuối trả `null` | ✅ PASS |
| D4 | Không rò PTY | `_baseline/d4-panels.ps1`: mở 4 panel, đếm `powershell`, đóng app | 4 panel ⇒ +4 shell; sau khi đóng app, về đúng số ban đầu | ✅ PASS (+8 shells khi mở 4 panel, về 6 ban đầu khi đóng) |
| D5 | Kéo đường ngăn → PTY đổi kích thước | `_baseline/d5-gutter.ps1` | `cols` của panel trái giảm khi chia đôi / kéo | ✅ PASS (155 cols → 76 cols) |
| D6 | Không glow (U1) | `grep -rn "drop-shadow\|box-shadow" src/` | Không khớp gì | ✅ PASS (0 matches) |
| D7 | Panel không bị dựng lại khi split | `_baseline/d7-persistence.ps1`: so PID trước/sau split | PID shell không đổi, session sống liên tục | ✅ PASS (PID 20784 giữ nguyên vẹn) |

## Deviations

| # | Plan nói | Thực tế | Xử lý |
|---|---|---|---|
| G1 | Global keydown thông thường | Xterm nuốt phím tắt nếu không dùng capture phase | Thêm `{ capture: true }` vào `window.addEventListener("keydown")` |
| G2 | `on_window_event` chỉ bắt `Destroyed` | Khi đóng qua `CloseMainWindow` / nút X, `CloseRequested` chạy trước | Bắt cả `Destroyed` và `CloseRequested` để `kill_all()` luôn dọn sạch PTY |
| G3 | D7 là MANUAL | Tự động hoá được bằng script kiểm tra PID qua `NONAME_BOOT_CMD` + `boot_panels` | Chuyển thành bài kiểm tự động trong `d7-persistence.ps1` |
