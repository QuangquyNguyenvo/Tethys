# Terminal Workspace — Project Context

> **Loại tài liệu**: CONTEXT — sự thật bất biến. Chỉ sửa khi phát hiện điều đã ghi là **sai**,
> và phải nói rõ sửa cái gì, vì sao. Trạng thái tiến độ thuộc về `plans/*/CHECKLIST.md`.
>
> **Cập nhật**: 2026-08-20 · **Trạng thái**: pre-code, chưa có commit nào.

---

## 1. Vấn đề thật đang giải quyết

Không phải "làm một terminal đẹp". Vấn đề cụ thể:

> Chạy AI coding agent (`claude`, `codex`, aider…) trong terminal cả ngày. Agent sinh file, sửa
> code, xuất ảnh/diff. Muốn xem thì phải **alt-tab sang cửa sổ khác rồi tab ngược lại** — đứt mạch
> liên tục, và càng nhiều agent chạy song song càng loạn.

**Mục tiêu**: gom terminal + preview + file view vào **một workspace duy nhất**, tiling, không alt-tab.

Terminal ở đây là **một panel trong workspace**, không phải trung tâm của app. Đây là điểm phân biệt
quan trọng nhất so với Windows Terminal / Alacritty / WezTerm.

### Vì sao không dùng thẳng WaveTerm

| Vấn đề | Chi tiết |
|---|---|
| UI/UX | Cứng, thực dụng, không có identity thẩm mỹ. Không customize sâu được. |
| Nặng | 300–700MB RAM, khởi động chậm. Do kiến trúc Electron + Go daemon + SQLite. |
| Windows là công dân hạng hai | Hay rơi về `cmd.exe`, cấu hình ConPTY/pwsh phải tự vọc. |
| Thừa | Remote agent, multi-client, persistence session — mình không cần, nhưng vẫn trả giá. |

---

## 2. Quyết định kiến trúc đã chốt

| Hạng mục | Quyết định |
|---|---|
| **Định vị** | Workspace cho AI agent. Terminal là một panel. |
| **Layout** | Tiling kiểu Wave: panel chia lưới, không chồng nhau, kéo thả sắp xếp lại. |
| **Terminal engine** | ConPTY qua `portable-pty`. **KHÔNG** embed `wt.exe` — xem §3. |
| **Renderer** | `xterm.js` + `@xterm/addon-webgl`. |
| **Command block** | OSC 133 kiểu VS Code. v1 **chỉ pwsh 7**. Xem §5. |
| **Persistence** | SQLite: history + layout + theme. **Shell chết theo app.** Không daemon. |
| **Remote / SSH** | Không có trong v1. Local Windows only. |
| **AI trong app** | **Không nhúng LLM.** Cơ chế generic, agent-agnostic. Xem §6. |
| **Mobile** | Ngoài phạm vi. Xem §10. |
| **Design language** | Material 3 / Material You theo hướng Caelestia. Xem §7. |

Hệ quả: **một process duy nhất, không socket, không binary thứ hai, không cross-compile.**

```
┌─ Tauri app (1 process) ──────────────────────────────┐
│  Rust core                                            │
│   ├── portable-pty → ConPTY → pwsh / wsl / git-bash   │
│   ├── PTY buffer, flush 8–16ms → Channel (binary)     │
│   ├── notify (file watcher) → preview auto-refresh    │
│   └── SQLite: history, layout, theme  ← chỉ chừng này │
│              ↕ IPC (Channel, binary)                  │
│  WebView2 · React + TypeScript + Tailwind             │
│   ├── xterm.js + WebGL          (panel terminal)      │
│   ├── preview panels            (ảnh / md / diff)     │
│   └── tiling layout + command palette                 │
└───────────────────────────────────────────────────────┘
```

---

## 3. Vì sao KHÔNG embed Windows Terminal

Đã cân nhắc và **loại bỏ**. Ghi lại để về sau không ai đào lại.

**Không khả thi về kỹ thuật:**

- `wt.exe` không phải control nhúng được. Nó tạo top-level window riêng, dùng XAML Islands +
  custom titlebar, và có single-instance model (gọi lần hai là nói chuyện với process cũ).
- Hack `SetParent()` vỡ ở focus, DPI, resize — và vỡ lại mỗi lần WT update.
- **Airspace problem (lý do chí mạng)**: một HWND native nhét vào cửa sổ Tauri sẽ **luôn vẽ đè lên
  WebView2**. Command palette, panel trượt, overlay, bo góc, blur — **không thứ nào vẽ chồng lên
  terminal được**. Nó sẽ là một ô chữ nhật đục nằm giữa app. Toàn bộ §7 sẽ chết.
- `Microsoft.Terminal.Control` (XAML control mà WT xây trên đó) không được ship cho bên thứ ba,
  và là C++/WinUI — không ghép vào stack Rust/web.

**Và không cần thiết:**

Windows Terminal = **ConPTY** + renderer DirectX + UI. Phần "làm pwsh chạy đúng" nằm hết ở ConPTY —
một API của Windows, ai cũng gọi được. WT chỉ là một frontend của nó.

Bằng chứng: **terminal tích hợp của VS Code chính là xterm.js + ConPTY, và Claude Code chạy tốt ở đó.**

Chấp nhận mất: keybinding/`settings.json` của WT, và chất lượng render ligature của DirectWrite
(xterm.js WebGL kém hơn một chút với font phức tạp) — cần tự mắt kiểm ở spike.

---

## 4. Vì sao KHÔNG cần daemon riêng

Daemon Go của WaveTerm không phải bloat vô cớ. Nó mua 5 thứ:

1. Shell sống sót độc lập với UI (renderer crash/reload không giết PTY)
2. Persistence output → điều kiện để block tồn tại qua restart
3. **Remote execution** — ship static binary sang máy remote qua SSH (lý do mạnh nhất chọn Go)
4. `wsh` — CLI trong terminal điều khiển ngược GUI, cần một endpoint để gọi vào
5. Multi-window / multi-client chung state

**Mình không cần cái nào trong 5.** Nên process Rust của Tauri *chính là* daemon: PTY spawn ngay
trong đó, không socket, không serialize qua network stack.

**Đây mới là chỗ Tauri thắng thật — collapse 2 runtime thành 1, không phải "WebView nhẹ hơn Chromium".**

> ⚠️ Đính chính doc cũ: trên Windows, WebView2 **chính là Chromium**. Không thoát khỏi engine web,
> chỉ thoát khỏi việc đóng gói riêng một bản Chromium.
>
> ⚠️ Đính chính doc cũ: Tauri IPC **không phải zero-copy**. `emit()` mặc định serialize JSON qua
> webview bridge — đây là bottleneck lớn nhất của terminal app. Bắt buộc dùng `tauri::ipc::Channel`
> gửi binary + gom buffer ở Rust.
>
> ⚠️ Đính chính doc cũ: ước lượng "70–130MB" là cho app rỗng. Với tiling layout + vài terminal
> (mỗi cái giữ scrollback) + preview panel, con số thực tế là **150–220MB**.
> Vẫn nhẹ hơn WaveTerm 2–3×, nhưng đừng hứa 5×.

---

## 5. Command block — phạm vi chính xác

"Block" có hai nghĩa, doc cũ trộn chung nên gây rối:

- **Nghĩa 1 — block = panel trong layout.** Nghĩa WaveTerm dùng chủ yếu. → chính là §2 tiling layout.
- **Nghĩa 2 — command block = mỗi lệnh + output thành một khối.** Mục này bàn nghĩa 2.

### Cơ chế

Terminal không tự biết ranh giới lệnh — nó chỉ nhận luồng ký tự. Shell phải chủ động báo bằng
escape sequence vô hình **OSC 133**:

```
OSC 133;A              prompt bắt đầu
OSC 133;B              user bắt đầu gõ lệnh
OSC 133;C              output bắt đầu
OSC 133;D;<exit_code>  lệnh xong, mã thoát
```

App phải chèn script vào `$PROFILE` của pwsh. Windows Terminal làm y hệt; VS Code tự inject qua env var.

### Phạm vi v1 — kiểu VS Code, KHÔNG kiểu Warp

Cài `xterm.js` marker + decoration API. Được:

- Dấu ở gutter đánh dấu điểm bắt đầu mỗi lệnh
- `Ctrl+↑` / `Ctrl+↓` nhảy giữa các lệnh thay vì scroll mò
- Copy **đúng output**, không dính prompt và lệnh
- Badge exit code + thời gian chạy

**Không** vẽ khung card bao quanh từng lệnh. Warp làm được vì **tự viết renderer GPU riêng, không
dùng xterm.js** — đi đường đó là mất lý do chọn stack này.

### Hai giới hạn phải biết trước

1. **Command block vô dụng bên trong TUI agent.** `claude` là **một lệnh chạy suốt cả tiếng**,
   chiếm alt screen buffer và tự vẽ giao diện. OSC 133 chỉ thấy "bắt đầu lúc gõ `claude`" và
   "kết thúc lúc thoát hẳn". Nó **không biết một lượt agent vừa xong**.
   → **Không thể** làm notification "agent xong" bằng OSC 133.
   Giá trị của block nằm ở phần shell thường giữa các phiên agent (`npm test`, `git log`, `cargo build`).

2. **Mỗi shell cần script riêng** (pwsh, cmd, WSL bash, git-bash = 4 bản). v1 **chỉ làm pwsh 7**.
   Shell khác vẫn chạy bình thường, chỉ không có gutter mark.

---

## 6. AI — không nhúng LLM

**Quyết định**: app **không** có sidebar chat, không API key, không chi phí LLM.

Lý do: người dùng đã gõ `claude` / `codex` / agent bất kỳ ngay trong terminal. Thêm một LLM nữa là
trùng vai trò. Giá trị của app nằm ở chỗ **gom lại thành workspace**, không phải thêm AI.

**Hệ quả kiến trúc — tuyệt đối không hard-code cho Claude Code.** Làm cơ chế generic, tự nhiên chạy
với mọi agent hiện tại và tương lai:

| Cơ chế | Vì sao generic |
|---|---|
| Regex bắt file path trong output → click mở preview panel | Tool nào cũng in `src/foo.ts:42` |
| Hỗ trợ OSC 8 hyperlink | Chuẩn chung, tool nào emit cũng nhận |
| File watcher (`notify`) trên cwd → preview tự refresh | Không quan tâm ai ghi file |
| Kéo file thả vào panel để mở | Không phụ thuộc tool nào |

Đây là những **money feature** thật sự cho use case này — cao giá trị hơn command block nhiều.

---

## 7. Design language — Material 3 theo hướng Caelestia

Tham chiếu: [`caelestia-dots/shell`](https://github.com/caelestia-dots/shell) (Quickshell / Hyprland).

> ⚠️ Đính chính doc cũ: **bỏ hoàn toàn** hướng "Cyberpunk Neon / glassmorphism". Caelestia **không
> phải** neon. Nó mềm, tối, bo tròn mạnh, màu muted sinh ra từ wallpaper.

### 7.1 Nguyên tắc thị giác

| Nguyên tắc | Cụ thể |
|---|---|
| **Dynamic color** | Toàn bộ palette **sinh từ wallpaper**, không phải theme cứng. Đây là linh hồn của Material You. |
| **Bo tròn mạnh** | Radius lớn, hào phóng. Panel `24–28px`, control `12–16px`, chip/pill `full`. |
| **Panel nổi, có khe** | Panel **không** dính mép màn hình và **không** dính nhau. Gap `8–12px` bao quanh. |
| **Phân tầng bằng surface** | Không dùng đổ bóng nặng. Phân cấp bằng bậc `surfaceContainer*` của M3. |
| **Chuyển động expressive** | Spring/emphasized easing, không phải `ease-in-out` tuyến tính. |
| **Dark-first** | Thiết kế cho dark trước; light là biến thể. |
| **Tiết chế** | Accent dùng ít và đúng chỗ. Phần lớn màn hình là surface trung tính có tint nhẹ. |

### 7.2 Hệ màu

Dùng **`@material/material-color-utilities`** (thư viện chính chủ Google) — cùng thuật toán matugen
mà caelestia dùng:

```
wallpaper → trích seed color (HCT) → sinh tonal palette đầy đủ
          → map ra M3 color roles → CSS variables → Tailwind theme
```

- **Scheme variants** cho user chọn: `TonalSpot` (mặc định), `Vibrant`, `Expressive`, `Neutral`,
  `Content`, `Monochrome`. Đúng như matugen expose.
- **Color roles** dùng nguyên chuẩn M3: `primary` / `onPrimary` / `primaryContainer`,
  `secondary*`, `tertiary*`, `error*`, `surface`, `onSurface`, `surfaceVariant`, `outline`,
  `outlineVariant`, và bậc `surfaceContainerLowest → Low → base → High → Highest`.
- **ANSI 16 màu của terminal phải sinh ra từ chính tonal palette đó**, không hard-code.
  Đây là chi tiết làm cả app trông "một khối" thay vì terminal lạc quẻ với UI. Là task thiết kế
  thật sự, không phải chuyện vặt.

### 7.3 Shape scale (M3)

```
none 0 · extra-small 4 · small 8 · medium 12 · large 16 · extra-large 28 · full 9999
```

### 7.4 Motion (M3 expressive)

```
emphasized             cubic-bezier(0.2,  0,    0,   1)
emphasized-decelerate  cubic-bezier(0.05, 0.7,  0.1, 1)
emphasized-accelerate  cubic-bezier(0.3,  0,    0.8, 0.15)

short  50–200ms   ·   medium  250–400ms   ·   long  450–600ms
```

Framer Motion với spring physics cho panel transition, drag-to-rearrange, panel mở/đóng.

### 7.5 Typography & icon

- **UI**: sans hình học sạch — `Rubik` hoặc `IBM Plex Sans`. Cho phép user đổi.
- **Terminal**: Nerd Font mono, mặc định `JetBrainsMono Nerd Font`. Bật ligature.
- **Icon**: `Material Symbols Rounded` (variable font, có trục `FILL`/`wght`) — bundle cục bộ,
  **không** load từ CDN.

### 7.6 Nền cửa sổ

- **Mica / Acrylic** qua crate `window-vibrancy` (Win11), decoration tắt, custom titlebar.
- **Bắt buộc cho tắt được** — xem ẩn số §8.3.

### 7.7 Ba xung đột giữa Caelestia và một terminal app — phải giải, không né

Caelestia là **desktop shell**: panel của nó là overlay thoáng qua. Terminal workspace là chỗ **nhìn
chằm chằm cả ngày**. Ba chỗ va nhau:

1. **Gap + radius ăn diện tích.** Gap 12px nhân nhiều panel là mất kha khá không gian hiển thị chữ.
   → Gap và radius phải là **setting chỉnh được**, kèm "compact mode".
2. **Nền mờ hại khả năng đọc chữ terminal.** Blur đằng sau text mono nhỏ làm mỏi mắt.
   → **Panel terminal đục hơn hẳn panel chrome.** Opacity riêng cho từng loại panel.
3. **`backdrop-filter` + terminal redraw liên tục = tốn GPU/pin.** Đây là chi phí thật, không phải lý thuyết.
   → Phải đo ở spike (§8.3), và phải có đường lui (tắt blur).

---

## 8. Ẩn số chưa đo — phải spike trước khi cam kết

Bốn thứ **chưa được xác minh**. Spike có quyền kết luận "đổi stack" — spike mà không được phép fail
thì không phải spike.

| # | Ẩn số | Đo bằng gì |
|---|---|---|
| **8.1** | Claude Code TUI trong xterm.js/WebView2 — alt screen, mouse, ANSI nặng | Chạy thật một phiên Claude Code đầy đủ. Bằng chứng gián tiếp tốt (VS Code terminal = xterm.js) nhưng WebView2 ≠ Electron. |
| **8.2** | IPC throughput | `cat` file 50MB, `yes`. Đo có đơ UI không, RAM tăng bao nhiêu. Chỗ Tauri dễ gãy nhất. |
| **8.3** | Mica/Acrylic + `backdrop-filter` + terminal redraw | GPU %, pin, FPS khi terminal chạy output liên tục dưới lớp blur. |
| **8.4** | Chất lượng render ligature | Tự mắt so xterm.js WebGL với Windows Terminal, cùng Nerd Font. Chủ quan nhưng quyết định. |

**Baseline để so**: chạy WaveTerm cùng workload trên chính máy này, ghi số vào `plans/*/_baseline/`.

---

## 9. Tech stack

**Backend (Rust)**

| Thành phần | Crate |
|---|---|
| Shell / framework | `tauri` v2 |
| PTY | `portable-pty` (từ WezTerm, ConPTY battle-tested) |
| File watcher | `notify` |
| Storage | `rusqlite` |
| Window effect | `window-vibrancy` (Mica / Acrylic) |

**Frontend**

| Thành phần | Package |
|---|---|
| Framework | React + TypeScript + Vite |
| Terminal | `@xterm/xterm`, `@xterm/addon-webgl`, `-fit`, `-search`, `-web-links`, `-unicode11` |
| Styling | Tailwind CSS (theme sinh từ M3 CSS variables) |
| Dynamic color | `@material/material-color-utilities` |
| Motion | Framer Motion |
| State | Zustand |
| Icon | Material Symbols Rounded (bundle cục bộ) |

---

## 10. Ngoài phạm vi v1 — cố tình loại

Ghi rõ để không bị scope creep:

- ❌ **Mobile (iOS/Android)**. Về bản chất là một app SSH client khác hẳn, chia sẻ rất ít code với
  desktop workspace. Ăn thời gian mà không phục vụ mục tiêu chính.
- ❌ **Remote / SSH có block & preview** (mô hình `waveshell`). Cần ship binary sang máy đích,
  cross-compile, cơ chế deploy. Rất đắt.
- ❌ **Giữ shell sống khi đóng app.** Cần tách process riêng — tức là xây lại đúng daemon của Wave.
- ❌ **Sidebar LLM riêng.** Xem §6.
- ❌ **Khung card kiểu Warp.** Xem §5.
- ❌ **macOS / Linux ở v1.** Windows-first. Rủi ro WebKitGTK trên Linux (WebGL hay lỗi/chậm) chưa
  đánh giá — đó chính là lý do WaveTerm/Tabby/Hyper dùng Electron.

---

## 11. Bước tiếp theo

Kế hoạch chi tiết nằm ở `plans/terminal-workspace/` theo quy ước `PLANNING.md`:

- `CONTEXT.md` — spec + lý do (tài liệu này là nguồn)
- `CHECKLIST.md` — bảng phase, deviations, session log
- `phase-01-spike.md` — đo 4 ẩn số §8, acceptance criteria bằng số. Có quyền kết luận đổi stack.
- `phase-02-scaffold.md` — Tauri v2 + Vite + Tailwind, một terminal chạy được

Phase 3+ **chỉ phác thảo** trong CHECKLIST, chưa viết chi tiết — theo luật 6 của `PLANNING.md`:
plan viết từ trí nhớ là plan sai. Có code thật rồi mới viết được phase chi tiết.
