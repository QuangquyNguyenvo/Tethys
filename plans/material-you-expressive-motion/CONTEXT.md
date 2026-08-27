# Material You Expressive motion — Context

> File này là **SỰ THẬT BẤT BIẾN** cho đợt polish này. Chỉ sửa khi phát hiện điều đã ghi
> là sai và phải nói rõ trong `CHECKLIST.md`. Tiến độ chỉ nằm ở `CHECKLIST.md`.

**Viết ngày**: 2026-08-27 · **Base commit**: `89f1926`

Working tree tại thời điểm viết đang bẩn và đã chứa first pass Material You motion chưa
commit. Mọi mô tả “current code” trong plan là ảnh chụp của **working tree này**, không phải
chỉ riêng commit `89f1926`. Không được reset/revert các thay đổi đang có để quay về commit.

## 1. Mục tiêu & định nghĩa "xong"

Hoàn thiện Tethys theo ngôn ngữ **Material You / Material 3 Expressive desktop shell**:
pastel tonal surfaces, shape morph có chủ đích, floating islands và motion spring mượt nhưng
không làm giảm độ sắc hoặc phản hồi của terminal.

- Chrome có shared workspace pill, dock proximity wave, modal/palette enter + exit.
- Workspace/panel motion không scale glyph atlas của terminal và không resize terminal theo
  từng frame.
- Browser preview tự kiểm được ít nhất hai workspace và nút Add workspace mà không dựng
  `TerminalPanel`/Tauri IPC.
- `npm run build`, `npm run check`, `cargo check --manifest-path src-tauri/Cargo.toml` đều PASS.
- QA native hoàn tất ở `1280×800` và `640×400`; các mục không tự động hoá được ghi `⛔ MANUAL`.
- Repo có skill `tethys-ui-ux` để model sau giữ đúng design language và QA matrix.

## 2. Ràng buộc không được vi phạm

1. **Không reset working tree và không commit** trừ khi user yêu cầu. Working tree đã có thay
   đổi của user ở Rust, theme, web panel, changelog và scripts.
2. Mọi màu UI tiếp tục đi qua `--ui-*` do `app/src/theme/palette.ts` sinh. Không thêm hex vào
   `App.css`; không thêm glow/neon/colored shadow. `sysfetch-wave-line` đang có legacy
   `drop-shadow` ngoài scope; không lấy nó làm precedent cho chrome mới.
3. Không thêm Framer Motion, Motion One, UI framework hoặc dependency mới. CSS + React state +
   `requestAnimationFrame` là đủ.
4. Không animate `width`, `height`, `filter`, `backdrop-filter` của panel/terminal. Chỉ
   `transform` + `opacity` trên `.panel-motion` / `.workspace-motion`. Ngoại lệ: active tab
   indicator là chrome nhỏ và được phép đổi width.
5. Terminal ở workspace ẩn phải tiếp tục mount; auxiliary panel được phép unmount. Không đổi
   DOM parent của panel trong `Tiles.tsx`.
6. Giữ đủ các mode `.surface-flat`, glass mặc định, `.effects-off`, `.nav-auto`, `.dock-auto`
   và `prefers-reduced-motion`.
7. F11/F5 native, fullscreen idempotent và release DevTools là thay đổi đang có của user;
   không đụng lại trong feature này.

## 3. Kiến trúc liên quan

| File | Trách nhiệm |
|---|---|
| `app/src/App.css` | Motion tokens, shape scale, chrome, panel, dock, settings, palette, responsive và reduced motion. |
| `app/src/titlebar/Titlebar.tsx` | Đo active tab và điều khiển shared tonal pill. |
| `app/src/layout/Tiles.tsx` | Flat panel DOM, workspace transition, FLIP panel position, close ghost. |
| `app/src/layout/usePanelDrag.ts` | Pointer drag và RAF throttle cho drag overlay. |
| `app/src/settings/SettingsModal.tsx` | Settings presence/exit delay và page content. |
| `app/src/palette/CommandPalette.tsx` | Palette presence, staggered options và keyboard selection. |
| `app/src/store/sessions.ts` | Workspace/panel lifecycle; hiện `addWorkspace()` luôn tạo terminal. |
| `app/src/App.tsx` | Browser preview bootstrap và native app composition. |
| `app/scripts/check-ux.mjs` | Static guards cho UX/native invariants; file đang untracked nhưng đã nằm trong `npm run check`. |

## 4. First pass cấu trúc đã có — KHÔNG làm lại

- `App.css`: motion/spring tokens, transform-only auto-hide titlebar, shared tab indicator,
  terminal-safe workspace keyframes, dock wave, modal/palette enter + exit, settings micro
  interactions, focus-visible và responsive settings ở `360px`.
- `Titlebar.tsx`: một `.tab-active-indicator` đo bằng `ResizeObserver` và trượt giữa tab.
- `Tiles.tsx`: workspace cleanup timer không mắc kẹt khi resize; FLIP layer trả
  `will-change` về auto; terminal không scale; stagger được cap.
- `usePanelDrag.ts`: pointer coordinates được gom một lần mỗi animation frame và commit đúng
  điểm cuối ở pointer-up.
- `SettingsModal.tsx`: đã có closing state và trì hoãn unmount để chạy exit motion.
- `CommandPalette.tsx`: đã có presence state, exit motion, listbox/option semantics và stagger.

Audit cuối phát hiện các lớp trên **chưa được coi là hoàn tất**:

- backdrop đang cho click xuyên xuống app trong exit;
- modal chưa trap/restore focus và focus còn nằm trong palette vô hình khi closing;
- palette entrance fill mode đang thắng transform selected/hover;
- reduced motion chưa xoá stagger delay/JS presence wait;
- drag session chưa cleanup khi panel unmount;
- panel focus/dot còn transition paint/layout không cần thiết.

Phase 1–3 sửa đúng các lỗi này; không xoá first pass rồi viết lại.

## 5. Sự thật đã verify — đừng kiểm lại nếu code chưa đổi

| Điều | Sự thật | Kiểm bằng |
|---|---|---|
| Base revision | `89f1926` | `git rev-parse --short HEAD` |
| Frontend | React 19 + Vite 7 + Tauri v2 | `app/package.json` |
| Build sau first pass | PASS; chỉ còn cảnh báo chunk chính >500 kB đã tồn tại | `npm run build` |
| UX/theme/tree checks | PASS | `npm run check` |
| Rust compile | PASS | `cargo check --manifest-path src-tauri/Cargo.toml` |
| Browser responsive | Không overflow ngang ở `1280×720`, `640×400`, `360×760` | Browser viewport QA |
| Dock wave | `:has()` chạy trên WebView hiện tại; hovered item ~1.13×, hàng xóm ~1.035× | Computed-style QA |
| Palette exit presence | `.palette-backdrop.is-closing` giữ 200 ms rồi unmount, nhưng hiện có lỗi focus/click-through | Browser DOM + interaction audit; phase 1 xử lý |
| Native surface | Tauri dev dựng được wallpaper/glass panel | Native screenshot QA |
| Browser Add workspace | Hiện tạo terminal rồi làm Vite preview trắng vì không có Tauri IPC | Browser QA; phase 4 xử lý |
| `.agents/` trong repo | Chưa tồn tại | `Test-Path .agents` |

## 6. Vùng đã kiểm và sạch

- Palette contrast/chroma/terminal selection trên 6 M3 schemes + Brand, dark/light.
- Hidden terminal lifecycle, scrollback bounds và WebView2 memory guards.
- F5/F11/fullscreen/native shortcut wiring và release DevTools guards.
- Layout Settings/Command Palette ở wide, minimum native width và ultra-narrow browser
  preview; focus/presence interaction vẫn pending phase 1.
- Dock reveal trigger không tự tắt pointer events.

## 7. Ngoài phạm vi

- Animated wallpaper blobs, glow, liquid-glass distortion hoặc blur animation: tốn GPU và
  xung đột design rule U1.
- Storybook/Figma/Playwright MCP setup: chưa cần cho đợt này; browser fixture ở phase 4 rẻ hơn.
- Refactor store/layout tree, terminal PTY, WebPanel hoặc native shortcut backend.
- Release/commit/tag/publish.
- Đổi font hoặc thêm icon library.

## 8. Thuật ngữ / quy ước

- **Shared pill**: một surface DOM duy nhất di chuyển giữa state, không phải mỗi state tự bật
  background riêng.
- **Chrome nhỏ**: titlebar, dock, chip, icon button; có thể dùng spring/shape morph.
- **Terminal-safe motion**: translate + opacity, không scale/filter/resize glyph canvas.
- **Presence**: giữ component mount một khoảng ngắn sau khi state close để exit animation chạy.
- **Fixture**: state browser-only, deterministic, không gọi Tauri IPC, dùng để QA UI rẻ.
