# Phase 3 — Dọn compositor cho panel dot, focus outline và shared pill

> **Prereq**: phase 2 | **Rủi ro**: 🟠 | **Rollback**: đảo đúng hunk của phase này; không
> dùng `git restore`.
> **Files đụng tới**: `app/src/App.css` — không file khác.

## Context recovery

Đọc `CONTEXT.md`, `CHECKLIST.md`, kết quả phase 1–2 và source thật. Phase này giữ nguyên
design Material You đã có, nhưng bỏ paint/layout không cần thiết và cô lập width morph nhỏ.

## Goal

Panel focus không tween box-shadow toàn terminal. Dot morph không dịch title/cwd. Width morph
của shared pill tuyệt đối nhỏ được contain, không lan layout xuống terminal.

## KHÔNG đụng vào

- Không tạo pill riêng cho mỗi tab.
- Không đổi workspace order/icon/name semantics.
- Không scale terminal panel/canvas.
- Không viết lại shared pill bằng WAAPI/JavaScript khi chưa có trace chứng minh CSS transition
  hiện tại gây jank. CSS transition tự retarget mượt khi switch liên tục và ít code hơn.

## Bước 3-A — Focus outline không tween box-shadow lớn

### Current code (`app/src/App.css` ~dòng 585–603), nguyên văn

```css
.panel {
  /* ... */
  transition:
    border-color var(--motion-fast) var(--e-standard),
    box-shadow var(--motion-medium) var(--e-standard);
}

.panel-host.on .panel {
  border-color: var(--ui-primary);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ui-primary) 38%, transparent);
}
```

### Change

Ưu tiên tối thiểu và ít layer:

- `.panel` chỉ transition `border-color`; `box-shadow` active được bật/tắt tức thì, không
  nội suy trên toàn diện tích terminal.
- Không thêm `will-change: box-shadow`.
- Giữ override `.app.surface-flat .panel-host.on .panel` đồng bộ; rule cuối file không được
  khôi phục transition shadow.

Chỉ dùng pseudo-element opacity nếu visual QA chứng minh bật/tắt shadow tức thì quá gắt. Nếu
dùng pseudo-element, nó phải `pointer-events: none`, chỉ vẽ inner outline và không phủ glyph.

## Bước 3-B — Panel dot morph trong slot width cố định

### Current code (`app/src/App.css` ~dòng 706–724), nguyên văn

```css
.panel-dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: var(--r-full);
  background: var(--ui-outline);
}
/* các .dot-* đổi background */
.panel-dot {
  transition:
    width var(--motion-medium) var(--e-spring),
    border-radius var(--motion-medium) var(--e-standard);
}
.panel-host.on .panel-dot { width: 17px; }
```

### Change

- `.panel-dot` luôn chiếm slot `17px × 7px`, `position: relative`, không transition width.
- Các `.dot-*` đặt `--panel-dot-color` thay vì background trực tiếp.
- Dùng pseudo-element để vẽ dot/pill. Cách an toàn nhất là hai lớp:
  - `::before`: circle 7 px (terminal 6 px);
  - `::after`: pill 17 px, ban đầu `scaleX(7 / 17)` và opacity 0;
  - focused crossfade circle → pill bằng opacity + transform.
- Rule terminal hiện đặt dot `6px`; giữ kích thước visual 6 px nhưng slot vẫn 17 px.

Kết quả nhìn giống dot → pill nhưng title/cwd/actions không bị đẩy theo từng frame. Verify
panel cực hẹp vì slot không focus chiếm thêm 10–11 px so với trước.

## Bước 3-C — Cô lập width morph của shared pill

### Current code

```css
.tab-active-indicator {
  width: var(--tab-width, 0px);
  transform: translate3d(var(--tab-x, 0px), 0, 0);
  will-change: transform, width;
  transition:
    transform var(--motion-slow) var(--e-spring-soft),
    width var(--motion-slow) var(--e-spring-soft),
```

### Change

- Giữ `Titlebar.tsx` và CSS transition `transform + width`: indicator là element absolute cao
  30 px, width không tham gia flex layout nên không resize terminal. CSS tự nội suy từ visual
  state hiện tại khi target đổi nhanh.
- Thêm `contain: layout paint` vào `.tab-active-indicator` để width invalidation không lan ra
  ngoài indicator.
- Đổi `will-change: transform, width` thành `will-change: transform`; width không phải thuộc
  tính compositor và hint này chỉ giữ tài nguyên vô ích.
- Giữ `prefers-reduced-motion` toàn cục từ phase 1 để transition còn 1 ms và delay 0.

Chỉ tạo follow-up FLIP/WAAPI nếu phase 6 có performance trace cho thấy width transition này
làm terminal reflow hoặc dropped frame. Không tối ưu theo phỏng đoán trong phase này.

## Bước 3-D — Bỏ colored glow ở reveal handle

### Current code

```css
.app.nav-auto .titlebar::after {
  /* ... */
  box-shadow: 0 1px 4px color-mix(in srgb, var(--ui-primary) 28%, transparent);
}
```

Thay bằng neutral black elevation nhẹ hoặc bỏ shadow. Background primary tonal vẫn đủ nhận
diện; không tạo colored outer glow.

## Verify

```powershell
cd app
npx tsc --noEmit
npm run build
npm run check
git diff --check
```

Manual:

1. Focus liên tục giữa 4 terminal đang output; không thấy shadow tween/seam toàn panel.
2. Dot morph nhưng title/cwd/action không xê dịch, kể cả panel rất hẹp.
3. Switch 3 workspace tên width khác nhau thật nhanh; CSS transition retarget không jump.
4. Cuộn tab bar rồi switch; pill vẫn bám đúng tab.
5. Reduced motion: pill chuyển gần như ngay và không có delay.

## Acceptance criteria

- [ ] `.panel` không transition `box-shadow`; glass/flat focus vẫn rõ.
- [ ] Panel dot morph bằng opacity/transform trong slot width cố định.
- [ ] Shared pill giữ morph mượt, có `contain: layout paint`, không `will-change: width`.
- [ ] Interrupted switch, scrolled tab bar và reduced motion PASS.
- [ ] Reveal handle không colored shadow.
- [ ] Build/check/diff-check PASS.

## Gotchas

- Width transition ở đây là ngoại lệ có chủ đích cho chrome absolute nhỏ. Không nhân ngoại lệ
  này sang panel, terminal hoặc layout container.
- `contain: layout paint` có thể cắt shadow tràn ra ngoài; indicator hiện chỉ có inset shadow,
  nên an toàn. Nếu design đổi sang outer shadow, phải QA lại clipping.

## Deviations

> _(để trống nếu không có)_

## After finishing

- Chỉ cập nhật tiến độ, session log và deviations trong `CHECKLIST.md`.
