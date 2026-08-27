# Phase 7 — Đóng gói design language thành repo skill

> **Prereq**: phase 6 | **Rủi ro**: 🟢 | **Rollback**: xóa đúng thư mục skill mới nếu
> chưa có thay đổi nào khác trong đó.
> **Files đụng tới**: `.agents/skills/tethys-ui-ux/SKILL.md`,
> `.agents/skills/tethys-ui-ux/references/design-language.md`,
> `.agents/skills/tethys-ui-ux/references/qa-matrix.md` — không file nào khác.

## Context recovery

Đọc `CONTEXT.md`, `CHECKLIST.md` và kết quả QA phase 6. Repo hiện **chưa có** `.agents/`.
Nếu session có skill `skill-creator`, phải dùng nó và đọc hướng dẫn trước khi tạo.

## Goal

Model sau chỉ cần invoke `tethys-ui-ux` là biết đúng style, invariant terminal, file map và QA
matrix. Skill phải ngắn ở `SKILL.md`; chi tiết nằm trong `references/` để không tốn context ở
những task không cần.

## KHÔNG đụng vào

- Không sửa source UI trong phase này.
- Không biến plan thành skill; chỉ copy những quy tắc đã verify và ổn định.
- Không nhúng ảnh/screenshots lớn vào skill.
- Không ghi absolute path máy hiện tại.

## Bước 7-A — Tạo `SKILL.md`

Frontmatter bắt buộc:

```markdown
---
name: tethys-ui-ux
description: Use when designing, reviewing, or changing Tethys UI, Material You colors, expressive motion, floating chrome, responsive states, or visual QA. Enforces terminal-safe motion and the repo's flat/glass invariants.
---
```

Body phải có đúng luồng sau, viết ngắn và imperative:

1. Đọc `references/design-language.md` trước khi edit UI.
2. Xác định surface mode và state bị ảnh hưởng.
3. Đọc code thật + dirty diff; không reset user changes.
4. Dùng role `--ui-*`, shape scale và motion tokens sẵn có.
5. Terminal chỉ translate/opacity; không scale/resize/filter/blur animation.
6. Chạy build/check, rồi dùng `references/qa-matrix.md` chọn đúng viewport/native cases.
7. Không claim native pass dựa trên browser preview.

## Bước 7-B — Viết `references/design-language.md`

Tối đa khoảng 180 dòng, gồm:

- Một câu direction:
  **“Material 3 Expressive desktop shell with pastel tonal colors, soft rounded surfaces,
  floating islands and restrained frosted glass.”**
- Màu: `palette.ts` là source of truth; `--ui-*`; brand/wallpaper; flat/glass.
- Shape: `--r-xs` → `--r-xxl`, pill chỉ cho chip/tab/dock control; panel dùng `--r-panel`.
- Elevation: surface container + outline + black shadow; cấm colored glow.
- Motion hierarchy:
  - workspace/panel terminal: translate + opacity;
  - chrome nhỏ: spring + shape morph;
  - modal: presence enter/exit, backdrop chặn input, focus trap + restore;
  - direct manipulation: bám tay, không transition trong drag/resize.
- File/selector map lấy từ `CONTEXT.md`.
- Anti-patterns cụ thể: `margin-top` auto-hide, dock jiggle replay, blur animation, hardcoded
  hex, scale xterm, thêm framework.

## Bước 7-C — Viết `references/qa-matrix.md`

Gồm checklist ngắn nhưng đo được:

- Browser: `1280×720`, `640×400`, `360×760`; overflow; fixture 2 workspace; Settings;
  Command Palette; dock wave.
- Native: `1280×800`, `640×400`; glass/flat; dark/light; blur on/off; auto-hide; 4 PTY;
  workspace resize-during-transition; drag/split/close.
- Accessibility: keyboard focus/trap/restore, inert khi modal closing, click-through, Escape,
  reduced motion gồm cả CSS delay + JS wait, contrast checks.
- Lệnh chuẩn:

```powershell
cd app
npm run build
npm run check
cargo check --manifest-path src-tauri/Cargo.toml
git diff --check
```

- Quy tắc report: tách `PASS`, `FAIL`, `⛔ MANUAL`, và không biến manual thành pass.

## Verify

Nếu `skill-creator` có validator, chạy validator được skill đó chỉ định. Sau đó chạy:

```powershell
Test-Path .agents/skills/tethys-ui-ux/SKILL.md
Test-Path .agents/skills/tethys-ui-ux/references/design-language.md
Test-Path .agents/skills/tethys-ui-ux/references/qa-matrix.md
rg -n "name: tethys-ui-ux|terminal-safe|prefers-reduced-motion|npm run check" .agents/skills/tethys-ui-ux
```

## Acceptance criteria

- [ ] Skill validator PASS nếu validator khả dụng.
- [ ] Frontmatter chỉ có `name` và `description`, YAML hợp lệ.
- [ ] `SKILL.md` ngắn; chi tiết nằm ở hai reference.
- [ ] Design language ghi đúng kết quả phase 6, không ghi giả định chưa kiểm.
- [ ] QA matrix phân biệt browser/native/manual.
- [ ] Không có absolute path, hex màu UI mới hoặc screenshot binary.
- [ ] `npm run build` và `npm run check` vẫn PASS dù phase không sửa source.

## Gotchas

- Skill repo-local chưa tự động có nghĩa mọi host sẽ discover nó; cấu trúc phải theo đúng
  `skill-creator` của runtime đang dùng.
- Description phải nói rõ trigger, không chỉ ghi “UI skill”.
- Không copy nguyên plan vào skill: quá dài và làm mỗi lần invoke tốn token.

## Deviations

> _(để trống nếu không có)_

## After finishing

- Cập nhật `CHECKLIST.md`: trạng thái phase, session log và deviations.
