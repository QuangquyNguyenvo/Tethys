# Phase 2 — Cleanup lifecycle của panel drag và gutter resize

> **Prereq**: phase 1 | **Rủi ro**: 🟠 | **Rollback**: đảo đúng các hunk của phase này;
> không dùng `git restore` vì source đang bẩn.
> **Files đụng tới**: `app/src/layout/usePanelDrag.ts`, `app/src/layout/Tiles.tsx` — không
> file nào khác.

## Context recovery

Đọc `CONTEXT.md`, `CHECKLIST.md`, kết quả phase 1 và hai source thật. Cả panel drag và gutter
resize đã throttle bằng RAF, nhưng cleanup hiện nằm trong pointer-up/cancel local. Nếu owner
unmount giữa gesture, listener, RAF và body class có thể còn sống.

## Goal

Mỗi gesture có đúng một cleanup idempotent. Pointer-up vẫn commit tọa độ/ratio cuối chính
xác; cancel, gesture mới và component unmount đều abort sạch mà không set state sau unmount.

## KHÔNG đụng vào

- Không đổi tree/drop algorithm hoặc store `beginDrag/updateDrag/endDrag/resize`.
- Không đổi DOM parent/lifecycle terminal.
- Không bỏ RAF throttle hay pointer capture.
- Không refactor drag và resize thành một abstraction chung; commit semantics khác nhau.

## Bước 2-A — Cleanup panel drag khi hook unmount

### Current code (`usePanelDrag.ts`), nguyên văn rút gọn

```ts
import { useCallback } from "react";

export function usePanelDrag(panelKey?: string, allowInteractiveTarget = false) {
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      // frame, pendingPoint, detach và finish đều local trong callback này
```

Cleanup hiện chỉ chạy từ `pointerup`, `pointercancel` hoặc Escape; unmount mất đường gọi
`detach()`/`endDrag(false)`.

### Change

1. Import `useEffect`, `useRef`; tạo
   `activeCleanupRef = useRef<(() => void) | null>(null)` ở cấp hook.
2. Trước pointer session mới, gọi cleanup cũ nếu còn.
3. Sau khi tạo `finish`, lưu một closure cleanup nhận diện đúng session vào ref.
4. `finish` phải idempotent và luôn:
   - tháo bốn listener;
   - release pointer capture nếu còn;
   - cancel RAF và xoá pending point;
   - nếu drag đã bắt đầu, gọi `endDrag(commit)` đúng một lần;
   - bỏ `body.dragging-panel`;
   - chỉ clear ref nếu ref vẫn trỏ đúng session này.
5. `useEffect(() => () => activeCleanupRef.current?.(), [])` xử lý unmount.

Không `return` sớm trước cleanup khi gesture chưa vượt `THRESHOLD`. Giữ đường pointer-up:
đưa event cuối vào pending point, flush, rồi `endDrag(true)`.

## Bước 2-B — Cleanup gutter resize khi unmount

### Current code (`Tiles.tsx`, component `Gutter` ~dòng 355–418), nguyên văn rút gọn

```tsx
function Gutter({ info }: { info: GutterInfo }) {
  const resize = useSessions((s) => s.resize);
  const [active, setActive] = useState(false);

  const onPointerDown = useCallback((e) => {
    let pendingRatio: number | null = null;
    let frame: number | null = null;
    // ...
    const onUp = () => {
      // remove listeners, release capture, cancel RAF
      if (pendingRatio !== null) resize(info.path, pendingRatio);
      setActive(false);
      document.body.classList.remove("resizing-layout");
    };
```

### Change

1. Thêm `resizeCleanupRef` ở cấp `Gutter` và cleanup effect khi unmount.
2. Tạo `finish(commitPending: boolean, updateMountedState: boolean)` idempotent:
   - gỡ ba listener trên gutter;
   - release pointer capture;
   - cancel RAF;
   - nếu pointer-up thật, commit `pendingRatio` cuối;
   - nếu abort/unmount, bỏ pending ratio;
   - bỏ `body.resizing-layout` trong mọi đường;
   - chỉ `setActive(false)` khi component vẫn mount;
   - clear đúng cleanup closure khỏi ref.
3. Pointer-up dùng `finish(true, true)`; pointercancel dùng `finish(false, true)`; unmount dùng
   `finish(false, false)`. Đừng dùng chung pointercancel với pointer-up như code hiện tại.
4. Cleanup gesture cũ trước khi bắt đầu gesture mới.

## Verify

```powershell
cd app
npx tsc --noEmit
npm run build
npm run check
git diff --check
```

Manual:

1. Drag panel rồi đóng panel/đổi workspace trước pointer-up: ghost và
   `body.dragging-panel` biến mất; drag tiếp theo vẫn chạy.
2. Resize gutter rồi đóng workspace/remove split giữa gesture: grip active và
   `body.resizing-layout` biến mất; resize tiếp theo vẫn chạy.
3. Pointer-up bình thường vẫn commit đúng tọa độ/ratio cuối dù event tới giữa hai frame.
4. Escape panel drag abort; pointercancel gutter abort và không commit ratio stale.

## Acceptance criteria

- [ ] Panel drag cleanup đúng ở pointer-up, cancel, Escape, gesture mới và unmount.
- [ ] Gutter cleanup đúng ở pointer-up, pointercancel, gesture mới và unmount.
- [ ] Không còn RAF, listener, pointer capture hoặc body class sau abort.
- [ ] Không set React state sau component unmount.
- [ ] Pointer-up vẫn commit chính xác điểm cuối.
- [ ] Build/check/diff-check PASS.

## Gotchas

- Cleanup phải idempotent; React Strict Mode và pointercancel có thể gọi nhiều đường gần nhau.
- Đừng gọi `endDrag(false)` sau khi pointer-up đã commit `true`.
- `pointercancel` không được commit ratio cuối như pointer-up.
- Closure cleanup trong ref phải kiểm tra identity; cleanup session cũ không được clear ref
  của session mới.

## Deviations

> _(để trống nếu không có)_

## After finishing

- Chỉ cập nhật tiến độ, session log và deviations trong `CHECKLIST.md`.
