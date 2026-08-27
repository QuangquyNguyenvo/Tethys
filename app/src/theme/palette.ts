/**
 * Sinh toàn bộ màu của app từ một màu gốc lấy ra từ ảnh nền.
 *
 * Hai vùng, hai độ bão hoà, **cùng một tonal palette** (chỉ thị U3):
 *   - chrome  — lấy thẳng từ MaterialDynamicColors, chroma nguyên bản, dịu
 *   - terminal — dựng lại từ HCT với chroma nhân `termChroma`, rực rỡ
 *
 * Không hex nào viết tay ngoài `FALLBACK_SEED`, dùng khi không đọc được ảnh nền.
 */
import {
  DynamicScheme,
  Hct,
  MaterialDynamicColors,
  SchemeContent,
  SchemeExpressive,
  SchemeMonochrome,
  SchemeNeutral,
  SchemeTonalSpot,
  SchemeVibrant,
  TonalPalette,
  Variant,
  hexFromArgb,
} from "@material/material-color-utilities";

/**
 * Cách chọn hướng chia khi *thêm* một block mới (dock, bảng lệnh, Ctrl+Shift+D).
 * Không đụng tới Ctrl+Shift+E / Ctrl+Shift+O — hai phím đó là chỉ định tay, luôn nghe lời.
 *
 * `spiral`  — xen kẽ ngang/dọc theo số block đang có, luôn cắt block vừa mở: block cuốn
 *             vào nhau thành hình xoắn ốc, giống layout dwindle của Hyprland.
 * `dwindle` — cắt theo cạnh dài của block đang chọn. Tự sửa sai khi cửa sổ đổi tỉ lệ,
 *             nhưng vòng xoắn không đều bằng.
 * `manual`  — luôn chia sang phải, đúng như bản cũ.
 */
export type LayoutMode = "spiral" | "dwindle" | "manual";

/**
 * Màu của app đến từ đâu.
 *
 * `brand`     — bảng màu Tethys: teal và navy đo thẳng từ logo. Mở app lên là ra đúng
 *               nhận diện, không phụ thuộc máy ai đang chạy.
 * `wallpaper` — Material You cổ điển: trích màu gốc từ ảnh nền desktop. Đây là hành vi
 *               của các phase trước, giữ nguyên vì nó vẫn là thứ nhiều người muốn.
 */
export type ColorSource = "brand" | "wallpaper";

/**
 * Bề mặt phẳng hay bề mặt kính.
 *
 * `flat`  — bề mặt đặc, viền rõ, không blur, không ảnh nền. Đây là ngôn ngữ của logo:
 *           mảng màu phẳng cạnh sắc, không có lớp nào giả vờ là thuỷ tinh.
 * `glass` — chrome mờ nhìn xuyên xuống ảnh nền, đúng như bản trước.
 *
 * Nằm cạnh `blurEffects` nhưng khác nghĩa: `blurEffects` là công tắc *hiệu năng* (tắt blur
 * mà vẫn giữ nền trong), còn đây là lựa chọn *thẩm mỹ* (bề mặt đặc hẳn).
 */
export type SurfaceStyle = "flat" | "glass";

export type SchemeName =
  | "TonalSpot"
  | "Vibrant"
  | "Expressive"
  | "Neutral"
  | "Content"
  | "Monochrome";

export type ThemeOptions = {
  /** Đánh dấu cấu hình đã đi qua lần đổi mặc định sang nền kính + wallpaper. */
  appearanceVersion: number;
  /** Xem `ColorSource`. */
  colorSource: ColorSource;
  /** Xem `SurfaceStyle`. */
  surfaceStyle: SurfaceStyle;
  /** Chỉ có tác dụng khi `colorSource` là `wallpaper`. */
  scheme: SchemeName;
  dark: boolean;
  /** -1 … 1 theo quy ước M3. 0 là tương phản chuẩn. */
  contrast: number;
  /** Hệ số chroma cho vùng terminal. 1 = giống chrome. */
  termChroma: number;
  /** Độ đục nền terminal, 0,3…1. 1 = đặc hẳn, không thấy ảnh nền. */
  termOpacity: number;
  /** Số dòng output mỗi terminal giữ lại; giới hạn này chặn RAM tăng theo phiên dài. */
  terminalScrollback: number;
  /** Kéo hue ANSI về phía màu gốc bao nhiêu phần (0 = giữ nguyên nghĩa ANSI). */
  harmonize: number;
  /**
   * Dock tự ẩn, chỉ hiện khi đưa chuột xuống mép dưới.
   *
   * Không phải màu, nhưng nằm ở đây vì đây là túi tuỳ chọn *được lưu* — cả cụm đi chung
   * vào `theme_opts` của `storage.rs`, thêm khoá mới không phải sửa struct bên Rust.
   */
  dockAutoHide: boolean;
  /** Thanh workspace thu vào mép trên, rê chuột lên mép để gọi lại. */
  navAutoHide: boolean;
  /** Acrylic/Mica of the native Windows frame. */
  windowVibrancy: boolean;
  /** CSS backdrop blur for chrome and translucent terminal panels. */
  blurEffects: boolean;
  /** Xem `LayoutMode`. */
  layoutMode: LayoutMode;
  /**
   * App giành `Ctrl+T` / `Ctrl+W` để mở và đóng block, kiểu tab trình duyệt.
   *
   * Có đánh đổi thật: tắt thì shell nhận lại chúng — `Ctrl+W` là xoá lùi một từ của
   * PSReadLine, `Ctrl+T` là đảo hai ký tự. Vì thế nó là công tắc, không phải mặc định cứng.
   */
  tabShortcuts: boolean;
  /**
   * `Alt+1…9` nhảy thẳng tới workspace thứ n.
   *
   * Cũng là công tắc vì lý do y hệt `tabShortcuts`: `Alt+<số>` là meta-số của readline, và
   * vài TUI dùng nó làm đối số lặp. App giành trước thì shell không thấy nữa.
   */
  workspaceAltKeys: boolean;
  /** Ảnh nền riêng của app; rỗng nghĩa là dùng wallpaper Desktop hiện tại. */
  wallpaperPath: string;
  /** Ảnh thay thế logo chữ trong panel sysfetch; rỗng nghĩa là dùng logo TETHYS mặc định. */
  sysfetchLogoPath: string;
};

/** Mặc định lấy từ `ui-demo/index.html`, nơi các con số này được kéo thử bằng tay. */
export const DEFAULTS: ThemeOptions = {
  appearanceVersion: 5,
  // Workspace nên mở đúng bản chất của nó: lấy wallpaper Windows, nền kính và terminal
  // trong mờ. Chế độ thương hiệu/phẳng vẫn là lựa chọn trong Cài đặt, không phải trạng
  // thái khởi động làm người dùng tưởng hiệu ứng đã bị gỡ.
  colorSource: "wallpaper",
  surfaceStyle: "glass",
  scheme: "TonalSpot",
  dark: true,
  contrast: 0,
  termChroma: 1.7,
  // 0,06 chứ không phải 0,18. `harmonizeHue` kéo theo *đường ngắn nhất* trên vòng hue, nên
  // độ lệch tỉ lệ với khoảng cách tới màu gốc — và màu gốc brand là teal (hue 196), gần như
  // đối diện đỏ (hue 25). Ở 0,18 thì đỏ bị đẩy 31° thành cam: `git diff` mất dòng xoá, log
  // lỗi mất màu lỗi. Terminal có 16 màu ANSI là vì *nghĩa* của chúng, hoà sắc không được
  // phép ăn vào nghĩa. 0,06 đủ để cả dãy ấm lên theo UI mà đỏ vẫn ra đỏ.
  harmonize: 0.06,
  // 0,6 chứ không phải 0,85. Nền terminal là `surfaceContainerLowest` — trong theme tối nó
  // gần như đen (đo được: luma 13,9). Ở 85% thì 15% ảnh nền lọt qua chỉ nâng luma lên ~17,
  // tức là *có* trong suốt nhưng không ai nhìn ra. 0,6 mới thấy được ảnh nền.
  termOpacity: 0.6,
  terminalScrollback: 5000,
  dockAutoHide: true,
  navAutoHide: true,
  windowVibrancy: true,
  blurEffects: true,
  layoutMode: "spiral",
  tabShortcuts: true,
  workspaceAltKeys: true,
  wallpaperPath: "",
  sysfetchLogoPath: "",
};

/** Biên độ cho phép của `termOpacity`. Dưới 0,3 thì chữ nằm trên ảnh nền, không đọc nổi. */
export const TERM_OPACITY_MIN = 0.3;
export const TERM_OPACITY_MAX = 1;

/* ──────────────────────────────────────────────────────────────────────────
   Bảng màu thương hiệu

   Ba hằng dưới đây là **những hex duy nhất được phép tồn tại trong toàn bộ app** — kể cả
   `App.css` cũng không được có dấu `#` nào. Chúng hợp lệ vì chúng không phải "màu ai đó
   thấy đẹp": chúng là ba màu đo trực tiếp từ file logo (lượng tử hoá về 64×64, lấy ba cụm
   đông nhất), tức là dữ liệu chứ không phải thị hiếu. Mọi màu khác trong app phải sinh ra
   từ ba con số này hoặc từ ảnh nền.
   ────────────────────────────────────────────────────────────────────────── */

/** Thân sứa. HCT: hue 196,1 · chroma 46,4 · tone 79,2. Đây là accent của cả app. */
export const BRAND_TEAL = 0xff53d7d6;
/** Nền logo. HCT: hue 263,7 · chroma 18,5 · tone 10,2. Đây là nền của cả app. */
export const BRAND_NAVY = 0xff111c2f;
/** Xúc tu trắng. HCT: hue 246,6 · chroma 10,4 · tone 94,8. Chữ sáng nhất dừng ở đây. */
export const BRAND_MIST = 0xffe9f1fc;

/**
 * Chroma của tonal palette trung tính ở chế độ brand.
 *
 * M3 để neutral gần như xám (chroma 4…8). Ở đây phải cao hơn hẳn, vì nền logo *không* xám —
 * nó là navy có màu thật, chroma 18,5. Để 6 thì app ra một cái hộp xám và teal trôi nổi
 * bên trên, không còn liên quan gì tới logo nữa.
 */
const BRAND_NEUTRAL_CHROMA = 14;

/** Chỉ dùng khi không đọc nổi ảnh nền — và khi đó thì rơi về đúng màu thương hiệu. */
export const FALLBACK_SEED = BRAND_TEAL;

const SCHEMES = {
  TonalSpot: SchemeTonalSpot,
  Vibrant: SchemeVibrant,
  Expressive: SchemeExpressive,
  Neutral: SchemeNeutral,
  Content: SchemeContent,
  Monochrome: SchemeMonochrome,
} as const;

/** Bảng màu Material You dựng từ một màu gốc bất kỳ — đường đi của chế độ `wallpaper`. */
export function buildScheme(seed: number, o: ThemeOptions): DynamicScheme {
  const Ctor = SCHEMES[o.scheme];
  return new Ctor(Hct.fromInt(seed), o.dark, o.contrast);
}

/**
 * Bảng màu thương hiệu: ép từng tonal palette thay vì thả cho một `Scheme*` tự suy diễn.
 *
 * Vì sao không dùng thẳng `SchemeVibrant(teal)`? Vì scheme nào cũng suy ra neutral **từ hue
 * của primary**. Cho nó màu gốc teal thì nền ra xám ám teal, còn nền logo lại là navy — hai
 * hue cách nhau gần 70°. Logo có *hai* màu gốc chứ không phải một, nên bảng màu cũng phải
 * được nuôi bằng hai màu: teal cầm nhóm primary, navy cầm nhóm nền.
 *
 * `contrastLevel` vẫn nghe theo tuỳ chọn của người dùng, nên thanh Tương phản không chết ở
 * chế độ này. `Variant.VIBRANT` chỉ còn là nhãn khai báo — mọi palette đều đã truyền tay.
 */
export function buildBrandScheme(o: ThemeOptions): DynamicScheme {
  const teal = Hct.fromInt(BRAND_TEAL);
  const navy = Hct.fromInt(BRAND_NAVY);
  return new DynamicScheme({
    sourceColorHct: teal,
    variant: Variant.VIBRANT,
    contrastLevel: o.contrast,
    isDark: o.dark,
    primaryPalette: TonalPalette.fromHueAndChroma(teal.hue, teal.chroma),
    // Secondary dịu hẳn: nó là nền của chip, tab đang chọn, vùng bôi đen — những mảng lớn.
    // Để nguyên chroma của teal thì mỗi tab đang chọn là một vệt sáng chói giữa màn hình.
    secondaryPalette: TonalPalette.fromHueAndChroma(teal.hue, 20),
    // Tertiary lệch về phía navy để có màu thứ ba mà vẫn nằm trong hai đầu của logo.
    tertiaryPalette: TonalPalette.fromHueAndChroma(navy.hue, 30),
    neutralPalette: TonalPalette.fromHueAndChroma(navy.hue, BRAND_NEUTRAL_CHROMA),
    // Neutral-variant rực hơn neutral (đúng quy ước M3) — nó cầm outline và surface-variant,
    // tức là đúng những đường mà style phẳng dựa vào để phân tầng thay cho bóng đổ.
    neutralVariantPalette: TonalPalette.fromHueAndChroma(navy.hue, BRAND_NEUTRAL_CHROMA * 1.5),
  });
}

/**
 * Một cửa duy nhất cho cả hai nguồn màu. Mọi nơi trong app phải gọi hàm này, không gọi
 * thẳng `buildScheme` — nếu không thì đổi nguồn màu ở Cài đặt sẽ chỉ đổi được một nửa app.
 */
export function resolveScheme(seed: number, o: ThemeOptions): DynamicScheme {
  return o.colorSource === "brand" ? buildBrandScheme(o) : buildScheme(seed, o);
}

/** Giữ nguyên hue và tone, chỉ kéo chroma. Đây là chỗ terminal tách khỏi chrome. */
function boost(argb: number, k: number): number {
  if (k === 1) return argb;
  const h = Hct.fromInt(argb);
  return Hct.from(h.hue, h.chroma * k, h.tone).toInt();
}

/** Các role M3 app thực sự dùng. Thêm role nào thì thêm ở đây, đừng viết hex ở CSS. */
const ROLES = [
  "background",
  "onBackground",
  "surface",
  "surfaceDim",
  "surfaceBright",
  "surfaceContainerLowest",
  "surfaceContainerLow",
  "surfaceContainer",
  "surfaceContainerHigh",
  "surfaceContainerHighest",
  "onSurface",
  "surfaceVariant",
  "onSurfaceVariant",
  "outline",
  "outlineVariant",
  "primary",
  "onPrimary",
  "primaryContainer",
  "onPrimaryContainer",
  "secondary",
  "onSecondary",
  "secondaryContainer",
  "onSecondaryContainer",
  "tertiary",
  "onTertiary",
  "tertiaryContainer",
  "onTertiaryContainer",
  "error",
  "onError",
  "errorContainer",
  "onErrorContainer",
  "inverseSurface",
  "inverseOnSurface",
] as const;

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());

export function chromeVars(s: DynamicScheme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const role of ROLES) {
    const dc = (MaterialDynamicColors as unknown as Record<string, { getArgb(x: DynamicScheme): number }>)[role];
    if (dc) out["--ui-" + kebab(role)] = hexFromArgb(dc.getArgb(s));
  }
  return out;
}

/** Hue giữ nghĩa ANSI, nhưng kéo một phần về phía màu gốc để không lạc quẻ với UI. */
export function harmonizeHue(h: number, seedHue: number, amt: number): number {
  const d = ((seedHue - h + 540) % 360) - 180;
  return (h + d * amt + 360) % 360;
}

const ANSI_HUE: Record<string, number> = {
  red: 25,
  green: 145,
  yellow: 95,
  blue: 255,
  magenta: 320,
  cyan: 200,
};

export type AnsiColors = Record<string, string>;

/**
 * 16 màu ANSI sinh từ chính tonal palette, không bảng màu chôn cứng.
 * black/white lấy từ neutral và neutral-variant nên nền terminal luôn ăn nhập với chrome.
 */
export function ansiColors(s: DynamicScheme, o: ThemeOptions): AnsiColors {
  const seedHue = Hct.fromInt(s.sourceColorArgb).hue;
  const baseChroma = Hct.fromInt(s.primaryPalette.tone(o.dark ? 80 : 40)).chroma * o.termChroma;
  const [tNormal, tBright] = o.dark ? [72, 84] : [46, 58];

  const out: AnsiColors = {};
  for (const [name, hue] of Object.entries(ANSI_HUE)) {
    const h = harmonizeHue(hue, seedHue, o.harmonize);
    out[name] = hexFromArgb(Hct.from(h, baseChroma, tNormal).toInt());
    out["bright" + name[0].toUpperCase() + name.slice(1)] = hexFromArgb(
      Hct.from(h, baseChroma, tBright).toInt(),
    );
  }
  // Hai đầu thang xám: theo nền chứ không theo hue nào.
  const [tBlack, tBrBlack, tWhite, tBrWhite] = o.dark ? [16, 34, 86, 96] : [28, 44, 92, 100];
  out.black = hexFromArgb(s.neutralPalette.tone(tBlack));
  out.brightBlack = hexFromArgb(s.neutralPalette.tone(tBrBlack));
  out.white = hexFromArgb(s.neutralVariantPalette.tone(tWhite));
  out.brightWhite = hexFromArgb(s.neutralVariantPalette.tone(tBrWhite));
  return out;
}

/**
 * ARGB + alpha → `#rrggbbaa`.
 *
 * Cả CSS lẫn xterm đều đọc được hex 8 số, nên một chuỗi duy nhất dùng được ở cả hai nơi —
 * khỏi phải sinh riêng một dạng `rgba()` cho CSS.
 */
function hexWithAlpha(argb: number, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return hexFromArgb(argb) + a.toString(16).padStart(2, "0");
}

export function terminalVars(s: DynamicScheme, o: ThemeOptions): Record<string, string> {
  const k = o.termChroma;
  const bg = MaterialDynamicColors.surfaceContainerLowest.getArgb(s);
  const fg = MaterialDynamicColors.onSurface.getArgb(s);
  const cursor = boost(MaterialDynamicColors.primary.getArgb(s), k);
  // Selection phải nổi rõ trên cả wallpaper lẫn nền terminal đục. `secondaryContainer`
  // hợp với chrome nhưng thường quá gần `surfaceContainerLowest`, nhất là palette xanh
  // tối; dùng cặp primary/onPrimary đảm bảo chính Material scheme đã chọn độ tương phản.
  const sel = MaterialDynamicColors.primary.getArgb(s);

  // Nền terminal *phải* đục theo `termOpacity`, còn lớp bên dưới nó là ảnh nền thật.
  // `--term-backdrop` làm mờ ảnh nền đó: không mờ thì chữ nằm đè lên chi tiết ảnh và
  // mất đọc. Đặc hẳn (1.0) thì trả về `none` — lớp lọc backdrop là thứ đắt nhất về GPU,
  // giữ nó chạy khi chẳng thấy gì bên dưới là phí không (§7.7 điểm 3).
  // Bề mặt phẳng nghĩa là *đặc*, không có ngoại lệ: một terminal trong suốt giữa dàn panel
  // đục sẽ tố cáo ngay rằng "phẳng" chỉ là lớp sơn. Thanh Độ đục vì thế bị vô hiệu hoá ở
  // chế độ này (xem `SettingsModal`) thay vì im lặng không có tác dụng.
  const opacity =
    o.surfaceStyle === "flat"
      ? TERM_OPACITY_MAX
      : Math.min(TERM_OPACITY_MAX, Math.max(TERM_OPACITY_MIN, o.termOpacity));
  const out: Record<string, string> = {
    "--term-bg": hexWithAlpha(bg, opacity),
    "--term-opacity": String(opacity),
    "--term-backdrop":
      opacity >= 0.99 ? "none" : `blur(${Math.round((1 - opacity) * 22)}px) saturate(135%)`,
    "--term-fg": hexFromArgb(fg),
    "--term-cursor": hexFromArgb(cursor),
    "--term-selection": hexFromArgb(sel),
  };
  for (const [name, hex] of Object.entries(ansiColors(s, o))) {
    out["--term-" + kebab(name)] = hex;
  }
  return out;
}

/** Object đưa thẳng vào `Terminal.options.theme`. Tên khoá là của xterm, không đổi được. */
export function xtermTheme(s: DynamicScheme, o: ThemeOptions) {
  const a = ansiColors(s, o);
  const selection = MaterialDynamicColors.primary.getArgb(s);
  return {
    // xterm **không** tô nền: lớp alpha duy nhất là `background: var(--term-bg)` của `.term`
    // trong CSS. Để xterm tô nữa thì hai lớp nhân nhau, và tệ hơn là chỗ lưới ký tự chia
    // không hết (dải thừa ở đáy và mép phải) không có canvas nên hụt hẳn lớp tô — nhìn ra
    // ngoài là một cái khung tối viền quanh terminal.
    background: "#00000000",
    foreground: hexFromArgb(MaterialDynamicColors.onSurface.getArgb(s)),
    cursor: hexFromArgb(boost(MaterialDynamicColors.primary.getArgb(s), o.termChroma)),
    cursorAccent: hexFromArgb(MaterialDynamicColors.onPrimary.getArgb(s)),
    selectionBackground: hexFromArgb(selection),
    selectionForeground: hexFromArgb(MaterialDynamicColors.onPrimary.getArgb(s)),
    // Khi terminal mất focus, vùng đã chọn vẫn phải nhìn ra được thay vì mờ gần như mất.
    selectionInactiveBackground: hexFromArgb(MaterialDynamicColors.primaryContainer.getArgb(s)),
    ...a,
  };
}

export function applyVars(vars: Record<string, string>) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}

/**
 * Bảng màu cho các ô icon ở dock.
 *
 * Ảnh tham chiếu user gửi có một dãy icon nhiều màu trên nền tối — đó là thứ làm dock
 * "vui" thay vì thành một hàng nút xám. Nhưng vẫn không được chôn hex: bảy hue này lấy
 * chroma và tone từ chính tonal palette của ảnh nền, rồi kéo một phần về seed như ANSI,
 * nên đổi ảnh nền là cả dãy đổi theo.
 */
export function accentVars(s: DynamicScheme, o: ThemeOptions): Record<string, string> {
  const seedHue = Hct.fromInt(s.sourceColorArgb).hue;
  const chroma = Math.max(
    46,
    Hct.fromInt(s.primaryPalette.tone(o.dark ? 80 : 40)).chroma * 1.35,
  );
  const tone = o.dark ? 66 : 52;
  const onTone = o.dark ? 14 : 100;

  const out: Record<string, string> = {};
  [0, 38, 88, 148, 202, 272, 322].forEach((h, i) => {
    const hue = harmonizeHue(h, seedHue, o.harmonize * 0.5);
    out[`--ui-accent-${i + 1}`] = hexFromArgb(Hct.from(hue, chroma, tone).toInt());
    out[`--ui-on-accent-${i + 1}`] = hexFromArgb(Hct.from(hue, chroma * 0.35, onTone).toInt());
  });
  return out;
}
