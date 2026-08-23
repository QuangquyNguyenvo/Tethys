# Phase 03 — Dynamic color: wallpaper → M3 palette → CSS vars → ANSI 16

> Prereq: phase 02 PASS | Rủi ro: 🟠
> Files: `app/src-tauri/src/wallpaper.rs`, `app/src/theme/*`, `App.css`, `usePty.ts`
> Rollback: `git checkout -- app/src app/src-tauri/src` (chưa có git → copy `app/` ra trước)

## Mục tiêu

Toàn bộ màu sinh từ wallpaper, không một mã hex nào viết tay. Bao gồm **cả 16 màu ANSI** của
terminal — đây là chỗ quyết định app trông "một khối" hay terminal lạc quẻ với UI.

**KHÔNG đụng**: bố cục tiling (P04), preview (P05), OSC 133 (P07), Mica/titlebar (P10).

## Chỉ thị UI phải tuân (từ user, xem `CHECKLIST.md`)

| # | Chỉ thị | Nghĩa cụ thể ở phase này |
|---|---|---|
| U1 | **Không glow** | Không `box-shadow` màu, không `filter: drop-shadow` màu, không viền phát sáng. Phân tầng bằng bậc `surfaceContainer*` và `outlineVariant`. Bóng chỉ được là bóng **đen** để tả độ cao |
| U2 | Round + soft color | Shape scale M3 nguyên bản; chrome dùng chroma của `TonalSpot` (thấp) |
| U3 | Terminal **màu mè**, chữ to rõ | Terminal dùng **chroma × 1,70** so với chrome. Hai vùng, hai độ bão hoà, cùng một tonal palette |

**U3 là quyết định kiến trúc**: phải sinh **hai** bộ biến màu, không phải một.

## Việc làm

### 1. Rust — lấy đường dẫn wallpaper

```bash
cd app/src-tauri && cargo add winreg
```

`wallpaper.rs`, một command duy nhất:

```rust
#[tauri::command]
fn wallpaper_path() -> Result<String, String>
```

Đọc `HKCU\Control Panel\Desktop` giá trị `WallPaper`. **Đã kiểm trên máy này**, trả về:
`C:\Users\Wjbu\Downloads\the-shorekeeper-wuthering-waves-4k-wallpaper-uhdpaper.com-313@2@b.jpg`

Fallback khi giá trị trống hoặc file không tồn tại (hay gặp với slideshow / Spotlight):
`%APPDATA%\Microsoft\Windows\Themes\TranscodedWallpaper` — **đã kiểm, có thật, 535 KB**.
File này không có phần mở rộng nhưng vẫn là ảnh hợp lệ.

### 2. Cho webview đọc được file đó

Ảnh nằm ngoài bundle nên phải mở `assetProtocol`:

- `tauri.conf.json` → `app.security.assetProtocol`: `{ "enable": true, "scope": ["**"] }`
- Capability: thêm `core:asset:default`
- Frontend: `convertFileSrc(path)` → `<img>` → `<canvas>` → `getImageData`

⚠️ `scope: ["**"]` là rộng. Thu hẹp lại nếu thấy cần — nhưng wallpaper có thể nằm bất cứ đâu,
kể cả ổ khác, nên hẹp quá sẽ gãy.

### 3. Sinh palette

```bash
npm i @material/material-color-utilities
```

```
ảnh → QuantizerCelebi.quantize(pixels, 128) → Score.score() → seed (ARGB)
     → SchemeTonalSpot(Hct.fromInt(seed), isDark, contrastLevel)
     → MaterialDynamicColors.* → CSS custom properties
```

Scheme variant cho user đổi: `TonalSpot` (mặc định), `Vibrant`, `Expressive`, `Neutral`,
`Content`, `Monochrome` — đúng bộ matugen expose.

### 4. Hai vùng bão hoà — cốt lõi của U3

Chrome lấy thẳng `MaterialDynamicColors`. Terminal thì **dựng lại từ HCT** với chroma nhân lên:

```ts
const boost = (argb: number, k: number) => {
  const h = Hct.fromInt(argb);
  return Hct.from(h.hue, h.chroma * k, h.tone).toInt();
};
```

`k = 1.70` cho terminal, `k = 1` cho chrome. Đưa vào `--term-*` và `--ui-*` tách bạch.

### 5. ANSI 16 — sinh từ chính tonal palette

Không hard-code, kể cả ở đây. Hue giữ nghĩa ANSI nhưng **kéo 18 % về phía seed** để hoà với UI:

```ts
const harmonize = (h: number, seed: number, amt = 0.18) => {
  const d = ((seed - h + 540) % 360) - 180;
  return (h + d * amt + 360) % 360;
};
const ANSI_HUE = { red: 25, green: 145, yellow: 95, blue: 255, magenta: 320, cyan: 200 };
```

- tone: `72` cho màu thường, `84` cho `bright*` (dark theme); `46` / `58` cho light
- chroma: chroma của `primary` × **1,70** (U3)
- `black` / `white` lấy từ palette neutral và neutral-variant, không lấy từ hue nào

Số 18 % và 1,70 là **mặc định lấy từ `ui-demo/index.html`**, nơi user đã kéo thử. Cả hai phải là
setting chỉnh được, không phải hằng số chôn trong code.

### 6. Nối vào xterm

`usePty.ts` hiện đặt `theme: { background, foreground, cursor }` cứng. Đổi thành đọc từ CSS vars
đã sinh, và gọi lại khi theme đổi. `Terminal.options.theme` gán lại được lúc đang chạy.

## Acceptance criteria

Đo ngày 2026-08-20.

| # | Tiêu chí | Cách kiểm | Kết quả |
|---|---|---|---|
| C1 | Build sạch | `npm run tauri build -- --no-bundle` | ✅ exit 0 |
| C2 | Không màu chôn cứng | `grep -rn "#[0-9a-fA-F]{6}" src/` | ✅ không khớp gì ngoài `FALLBACK_SEED` |
| C3 | Đọc được ảnh nền thật | `cargo test --lib` | ✅ trả `…the-shorekeeper-wuthering-waves-4k….jpg`, 1 802 476 byte |
| C4 | Tương phản ≥ 4.5:1 | `node scripts/check-theme.mjs` | ✅ thấp nhất **4,54** (Content); còn lại 7,19–10,88 |
| C5 | Terminal rực hơn chrome ≥ 1,5× | cùng script | ✅ 1,57–2,57× |
| C6 | Không glow (U1) | `grep -rn "drop-shadow|box-shadow" src/` | ✅ không khớp gì |
| C7 | Đổi ảnh → đổi màu | `_baseline/c7-wallpaper.ps1` | ✅ **tự động được**, không còn MANUAL |

### C4/C5 chi tiết — 6 scheme × dark/light × 4 màu gốc

| scheme | tương phản thấp nhất | chroma terminal / chrome |
|---|---|---|
| TonalSpot | 7,19 | 2,28× |
| Vibrant | 7,22 | 1,75× |
| Expressive | 7,19 | 1,82× |
| Neutral | 7,25 | 2,16× |
| Content | **4,54** | 1,73× |
| Monochrome | 10,88 | 1,57× |

`Content` chỉ dư 0,04 so với ngưỡng 4,5 vì nó lấy màu gốc làm `primary` gần như nguyên bản.
Nếu sau này đổi `contrastLevel` hoặc thêm role mới thì đây là chỗ vỡ trước.

`Monochrome` được miễn tiêu chí C5: nó cố ý không có chroma, nhân bao nhiêu cũng vẫn xám.

### C7 chi tiết

| ảnh | seed | surface | primary |
|---|---|---|---|
| ảnh nền thật | `#ff4377b5` | `#111318` | `#a4c9fe` |
| đỏ thuần | `#ffc63e3e` | `#1a1111` | `#ffb3ae` |
| xanh lá | `#ff2e9660` | `#0f1511` | `#94d5a9` |

Nền cũng ám theo màu ảnh, không chỉ màu nhấn — đúng ý đồ "một khối".

## Deviations

| # | Plan nói | Thực tế | Xử lý |
|---|---|---|---|
| F1 | Capability thêm `core:asset:default` | Permission đó **không tồn tại** — build fail | Asset protocol trong Tauri v2 chỉ cần `assetProtocol.scope` trong config, không qua ACL |
| F2 | `convertFileSrc` → `<img>` → canvas → `getImageData` | Ném `The canvas has been tainted by cross-origin data` vì `asset:` phục vụ từ origin khác | Thêm `img.crossOrigin = "anonymous"`. Tauri có trả CORS header nên chỉ cần một dòng |
| F3 | C7 là `⛔ MANUAL` | Tự động được | Thêm override `NONAME_WALLPAPER` + hook `theme_report` (họ hàng với `NONAME_BOOT_CMD`) |
| F4 | — | Bài kiểm C7 bản đầu so ảnh nền với `TranscodedWallpaper` — mà đó là **bản transcode của chính ảnh đó**, nên `surface` trùng nhau và C7 FAIL oan | Đổi sang hai ảnh đơn sắc tự sinh, khác hẳn nhau |
| F5 | — | `QuantizerCelebi` có nhiễu: cùng một ảnh cho seed lệch nhẹ giữa các lần (`#ff4477b4` / `#ff4377b5` / `#ff6e95c6`) | Không ảnh hưởng thị giác, nhưng **đừng dùng seed làm khoá cache** ở phase 09 |
| F6 | Ảnh nền 4K lượng tử hoá thẳng | ~8 triệu pixel, nghẽn lúc khởi động | Vẽ thu nhỏ về cạnh dài 160 px trước khi lượng tử |
