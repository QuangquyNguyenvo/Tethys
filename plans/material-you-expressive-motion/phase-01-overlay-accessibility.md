# Phase 1 — Sửa presence, focus và reduced motion của overlay

> **Prereq**: không | **Rủi ro**: 🟠 | **Rollback**: đảo đúng các hunk của phase này;
> không dùng `git restore` vì cả ba file đã bẩn từ trước.
> **Files đụng tới**: `app/src/settings/SettingsModal.tsx`,
> `app/src/palette/CommandPalette.tsx`, `app/src/App.css` — không file nào khác.

## Context recovery

Đọc `CONTEXT.md`, `CHECKLIST.md` và ba file thật trước khi sửa. First pass đã có enter/exit
motion, nhưng audit tương tác phát hiện click xuyên qua backdrop lúc closing, focus chưa được
quản lý như modal thật, palette item bị animation giữ mất transform selected, và reduced
motion vẫn phải chờ timer.

## Goal

Settings và Command Palette phải là modal hoàn chỉnh: chặn pointer đến lúc unmount, giữ Tab
trong dialog, đưa focus vào khi mở, vô hiệu hoá control trong exit, trả focus đúng nơi đã mở,
và đóng ngay khi OS bật reduced motion.

## KHÔNG đụng vào

- Không đổi layout/nội dung 5 trang Settings hoặc danh sách command.
- Không thêm focus-trap package hay animation dependency.
- Không animate `backdrop-filter`; blur vẫn là giá trị tĩnh.
- Không đổi phím mở Settings/Palette trong `App.tsx`.

## Bước 1-A — Backdrop chặn click đến hết exit

### Current code (`app/src/App.css`), nguyên văn

```css
.settings-backdrop.is-closing {
  pointer-events: none;
  animation: overlay-out 200ms var(--e-standard) both;
}
.settings-backdrop.is-closing .settings-modal {
  animation: settings-modal-out 200ms var(--e-emphasized) both;
}
```

```css
.palette-backdrop.is-closing {
  pointer-events: none;
  animation: overlay-out 180ms var(--e-standard) both;
}
.palette-backdrop.is-closing .palette-modal {
  animation: palette-modal-out 180ms var(--e-emphasized) both;
}
```

### Change

- Bỏ `pointer-events: none` khỏi **backdrop**. Backdrop phải tiếp tục phủ viewport và nuốt
  pointer trong toàn bộ exit.
- Đặt `pointer-events: none` lên `.settings-modal` / `.palette-modal` khi closing để control
  bên trong không nhận thêm thao tác. Click khi đó dừng ở backdrop, không lọt xuống app.
- React cũng phải đặt `inert` lên dialog lúc closing; CSS không thay thế keyboard semantics.

## Bước 1-B — Focus lifecycle cho Settings

### Current symbols

`SettingsModal.tsx` hiện có `closing`, `closingRef`, `closeTimer`, `requestClose`, một listener
Escape ở `window`, và markup dialog tại:

```tsx
<div className={"settings-backdrop" + (closing ? " is-closing" : "")} onClick={requestClose}>
  <div className="settings-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Settings">
```

### Change

1. Thêm `dialogRef`, `backdropRef` và `returnFocusRef`.
2. Khi component mount, lưu `document.activeElement` nếu là `HTMLElement`, rồi focus dialog
   bằng `dialogRef.current?.focus({ preventScroll: true })`. Dialog có `tabIndex={-1}`.
3. Trong cleanup unmount, trả focus cho `returnFocusRef.current` nếu phần tử còn
   `isConnected`. Không trả focus vào node đã bị xoá.
4. Mở rộng listener `keydown` hiện tại:
   - Escape gọi `requestClose` như cũ;
   - Tab khi chưa closing lấy danh sách focusable còn enabled trong `dialogRef`, vòng từ
     cuối về đầu hoặc đầu về cuối, và `preventDefault` ở hai mép;
   - bỏ qua element có `hidden`, `aria-hidden="true"` hoặc kích thước bằng 0.
5. Khi `requestClose` chạy:
   - nếu `matchMedia("(prefers-reduced-motion: reduce)").matches`, gọi `onClose()` ngay;
   - nếu không, set closing, focus backdrop có `tabIndex={-1}`, và giữ timer dự phòng lớn
     hơn CSS exit một ít (`220ms` cho CSS `200ms`);
   - dialog nhận `inert={closing}` và `aria-hidden={closing || undefined}`.

Không focus control ở app bên dưới trong lúc backdrop còn nhìn thấy; focus tạm nằm trên
backdrop rồi mới trả về opener khi unmount.

## Bước 1-C — Focus lifecycle cho Command Palette

### Current code (`CommandPalette.tsx` ~dòng 19–34), nguyên văn

```tsx
useEffect(() => {
  let timer = 0;
  if (isOpen) {
    setMounted(true);
    setClosing(false);
  } else if (mounted) {
    setClosing(true);
    timer = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, 200);
  }
  return () => window.clearTimeout(timer);
}, [isOpen, mounted]);
```

### Change

1. Thêm `dialogRef`, `backdropRef`, `returnFocusRef`.
2. Khi `isOpen` chuyển `true`, lưu opener **trước** khi focus input, bỏ `inert` cũ nếu có,
   reset query/index và focus input ở frame kế tiếp.
3. Khi `isOpen` chuyển `false`:
   - reduced motion: unmount presence ngay, không tạo timer 200 ms;
   - motion thường: set closing, focus backdrop, giữ modal thêm 200 ms;
   - sau khi `mounted` thành `false`, trả focus cho opener còn connected đúng một lần.
4. `handleKeyDown` xử lý Tab trap trong `dialogRef` và return sớm nếu `closing`.
5. Markup dialog nhận `ref={dialogRef}`, `inert={closing}` và
   `aria-hidden={closing || undefined}`; backdrop nhận `ref`, `tabIndex={-1}`.

Rapid reopen phải huỷ timer cũ, bỏ inert và không trả focus ra ngoài giữa lần reopen.

## Bước 1-D — Palette item, focus ring và CSS reduced motion

### Current code (`app/src/App.css`), nguyên văn

```css
.palette-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
```

```css
.palette-item {
  /* ... */
  animation: palette-item-in 300ms var(--e-spring-soft) both;
  animation-delay: calc(55ms + var(--palette-order, 0) * 16ms);
}
```

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
}
```

### Change

- Đổi fill mode palette item từ `both` sang `backwards`. Sau khi entrance kết thúc, animation
  không được tiếp tục thắng `transform` của `.selected` / `:hover`.
- Thêm focus indicator không glow cho input, ưu tiên
  `.palette-input-wrap:focus-within { box-shadow: inset 0 0 0 2px var(--ui-primary); }` và
  đổi border color. Không dùng colored outer shadow.
- Trong media query reduced motion, thêm cả `animation-delay: 0ms !important` và
  `transition-delay: 0ms !important`.

## Verify

```powershell
cd app
npx tsc --noEmit
npm run build
npm run check
```

Browser manual:

1. Mở Settings từ một nút, Tab/Shift+Tab vòng trong dialog; đóng và focus quay lại nút đó.
2. Trong 200 ms closing, click vị trí explorer bên dưới; row không được chọn/mở.
3. Palette: dùng Arrow để đổi selected sau khi item entrance xong; selected dịch 3 px.
4. Ctrl+K mở/đóng nhanh 10 lần; không flash, focus không mắc trong input vô hình.
5. Emulate `prefers-reduced-motion: reduce`; overlay unmount ngay và không có stagger delay.

## Acceptance criteria

- [ ] Settings và Palette chặn click-through đến lúc unmount.
- [ ] Initial focus, Tab trap và restore focus PASS cho cả hai overlay.
- [ ] Dialog/control inert trong exit; focus không nằm trong input vô hình.
- [ ] Palette selected/hover transform hoạt động sau entrance.
- [ ] Palette input có focus indicator nhìn rõ.
- [ ] Reduced motion bỏ cả CSS delay và JS presence wait.
- [ ] Rapid reopen PASS.
- [ ] `npx tsc --noEmit`, `npm run build`, `npm run check`, `git diff --check` PASS.

## Gotchas

- `aria-modal="true"` mà không quản lý focus là thông tin sai cho assistive tech.
- Không trả focus ngay lúc bắt đầu exit: keyboard sẽ thao tác app trong khi modal còn phủ.
- `inert` chặn focus/click của subtree nhưng backdrop vẫn phải nhận pointer để chặn nền.
- Nếu React typings không nhận boolean `inert`, set/remove attribute bằng `dialogRef` trong
  effect; không bỏ invariant chỉ để chiều TypeScript.

## Deviations

> _(để trống nếu không có)_

## After finishing

- Chỉ cập nhật tiến độ, session log và deviations trong `CHECKLIST.md`.
