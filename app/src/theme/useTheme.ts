/**
 * Lấy màu gốc từ ảnh nền Windows rồi đẩy toàn bộ biến màu lên `:root`.
 *
 * Ảnh nền 4K có ~8 triệu pixel; lượng tử hoá thẳng thì mất vài giây và làm nghẽn lúc khởi động.
 * Vẽ thu nhỏ về cạnh dài 160 px trước rồi mới lượng tử — kết quả gần như không đổi vì
 * QuantizerCelebi vốn chỉ quan tâm phân bố màu.
 */
import { useEffect } from "react";
import { create } from "zustand";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { Score } from "@material/material-color-utilities";
import { quantizeCelebiStable } from "./quantize";
import {
  BRAND_TEAL,
  DEFAULTS,
  FALLBACK_SEED,
  accentVars,
  applyVars,
  chromeVars,
  resolveScheme,
  terminalVars,
  xtermTheme,
  type ThemeOptions,
} from "./palette";

const SAMPLE_EDGE = 160;

/**
 * Cạnh dài của bản ảnh nền đã làm mờ sẵn.
 *
 * 320 px rồi phóng lên toàn màn hình chính là một phép blur: phóng to 8 lần thì mỗi pixel
 * gốc trải thành một mảng 8×8 được nội suy mượt. Thêm `blur(3px)` ngay trên canvas nhỏ để
 * xoá nốt cạnh khối, và ở kích thước cuối nó tương đương blur ~24 px — đúng bằng con số
 * `backdrop-filter` cũ đang chạy mỗi frame.
 */
const BLUR_EDGE = 320;

type ThemeStore = {
  opts: ThemeOptions;
  seed: number;
  /** Các màu Celebi đã xếp hạng; dock dùng cả dãy thay vì tự bịa hue quanh một seed. */
  wallpaperColors: number[];
  /**
   * Màu gốc đang lấy từ đâu — để UI settings nói rõ thay vì im lặng.
   * `brand` nghĩa là không đọc ảnh nền chút nào, màu lấy thẳng từ logo.
   */
  source: "wallpaper" | "fallback" | "loading" | "brand";
  wallpaper: string;
  /** Ảnh nền đã làm mờ sẵn, dạng data URI — nền của mọi bề mặt kính. Rỗng nghĩa là không có. */
  wallBlur: string;
  /** Vì sao phải chạy fallback — để bài kiểm và UI settings nói được lý do, không chỉ "hỏng". */
  error: string;
  setOpts: (patch: Partial<ThemeOptions>) => void;
  setSeed: (
    seed: number,
    source: "wallpaper" | "fallback" | "brand",
    wallpaper: string,
    error?: string,
    wallBlur?: string,
    wallpaperColors?: number[],
  ) => void;
};

export const useThemeStore = create<ThemeStore>((set) => ({
  opts: DEFAULTS,
  seed: FALLBACK_SEED,
  wallpaperColors: [],
  source: "loading",
  wallpaper: "",
  wallBlur: "",
  error: "",
  setOpts: (patch) => set((s) => ({ opts: { ...s.opts, ...patch } })),
  setSeed: (seed, source, wallpaper, error = "", wallBlur = "", wallpaperColors = []) =>
    set({ seed, source, wallpaper, error, wallBlur, wallpaperColors }),
}));

/**
 * Vẽ ảnh nền thành một bản nhỏ đã làm mờ, trả về dưới dạng data URI.
 *
 * Đây là chỗ thay thế cho `backdrop-filter`. Lớp lọc backdrop bắt trình duyệt đọc lại vùng
 * nền, làm mờ và ghép lại **mỗi khung hình** — kể cả khi thứ nằm dưới là một tấm ảnh không
 * hề đổi, và kể cả khi cái đổi chỉ là chữ trong terminal nằm bên trên. Ở đây phép mờ chạy
 * đúng một lần cho mỗi ảnh nền, kết quả là một tấm ảnh tĩnh mà compositor chỉ việc dán.
 *
 * `saturate`/`brightness` khớp với `.app-wallpaper-bg` để lớp kính và nền trần cùng một
 * tông; lệch một chút thôi là nhìn ra ngay chỗ nối.
 */
function blurredWallpaper(img: HTMLImageElement): string {
  const scale = BLUR_EDGE / Math.max(img.naturalWidth, img.naturalHeight);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.filter = "blur(3px) saturate(1.18) brightness(0.86)";
  ctx.drawImage(img, 0, 0, w, h);
  // WebP ở chất lượng này cho ra ~4–10 KB. Ảnh đã mờ nên nén rất tốt và mọi artefact của
  // nén đều nằm dưới ngưỡng nhìn thấy.
  return canvas.toDataURL("image/webp", 0.72);
}

async function seedFromWallpaper(customPath?: string): Promise<{
  seed: number;
  colors: number[];
  path: string;
  blur: string;
}> {
  const path = customPath || await invoke<string>("wallpaper_path");
  const img = new Image();
  // asset: protocol phục vụ từ origin khác nên canvas bị taint và `getImageData` ném lỗi.
  // Phải xin CORS tường minh thì mới đọc được pixel.
  img.crossOrigin = "anonymous";
  img.src = convertFileSrc(path);
  await img.decode();

  const scale = SAMPLE_EDGE / Math.max(img.naturalWidth, img.naturalHeight);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not get 2D canvas context");
  ctx.drawImage(img, 0, 0, w, h);

  const { data } = ctx.getImageData(0, 0, w, h);
  const pixels: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 255) continue; // bỏ pixel trong suốt, chúng kéo màu về xám
    pixels.push((255 << 24) | (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  }
  const quantized = quantizeCelebiStable(pixels, 128);
  const ranked = Score.score(quantized, {
    desired: 7,
    fallbackColorARGB: FALLBACK_SEED,
  });
  // Seed cần một màu đủ tốt để dựng Material scheme, nên giữ bộ lọc mặc định. Dock thì
  // phải phản ánh cả wallpaper ít bão hoà; `filter: false` tránh biến ảnh xám thành teal
  // fallback chỉ vì Score coi màu xám không phù hợp làm seed chủ đạo.
  const dockColors = Score.score(quantized, {
    desired: 7,
    fallbackColorARGB: FALLBACK_SEED,
    filter: false,
  });
  // Cùng một `img` đã giải mã, không đọc lại tệp.
  return {
    seed: ranked[0] ?? FALLBACK_SEED,
    colors: dockColors,
    path,
    blur: blurredWallpaper(img),
  };
}

/**
 * Trích lại màu từ ảnh nền và đẩy vào store.
 *
 * Để ở tầng module chứ không nằm trong hook: panel Cài đặt cần gọi nó mà không được phép
 * gọi `useTheme()` lần nữa — hook đó có `useEffect` nạp ảnh nền lúc mount, gọi ở panel thứ
 * hai là chạy lại cả quy trình lượng tử hoá.
 */
export function refreshSeed() {
  const { setSeed, opts } = useThemeStore.getState();
  return seedFromWallpaper(opts.wallpaperPath || undefined)
    .then(({ seed, colors, path, blur }) => setSeed(seed, "wallpaper", path, "", blur, colors))
    .catch((e) => setSeed(FALLBACK_SEED, "fallback", "", String(e?.message ?? e)));
}

/** Đổi nền riêng của app mà không động vào wallpaper Windows của người dùng. */
export function setCustomWallpaper(path: string) {
  const { setSeed, setOpts } = useThemeStore.getState();
  setOpts({ wallpaperPath: path });
  return seedFromWallpaper(path)
    .then(({ seed, colors, path: resolved, blur }) =>
      setSeed(seed, "wallpaper", resolved, "", blur, colors))
    .catch((e) => setSeed(FALLBACK_SEED, "fallback", "", String(e?.message ?? e)));
}

export function useDesktopWallpaper() {
  const { setSeed, setOpts } = useThemeStore.getState();
  setOpts({ wallpaperPath: "" });
  return seedFromWallpaper()
    .then(({ seed, colors, path, blur }) => setSeed(seed, "wallpaper", path, "", blur, colors))
    .catch((e) => setSeed(FALLBACK_SEED, "fallback", "", String(e?.message ?? e)));
}

/** Gọi một lần ở gốc cây React. Trả về scheme để nơi khác (xterm) dùng lại. */
export function useTheme() {
  const { opts, seed, wallpaperColors, source, wallpaper, wallBlur, error, setSeed, setOpts } = useThemeStore();

  // Bảng màu brand trên bề mặt phẳng thì ảnh nền không được dùng vào việc gì — không sinh
  // màu, cũng không hiện ra sau panel. Quét nó vẫn là decode một tấm ảnh 4K rồi lượng tử
  // hoá, ngay trên đường khởi động. Bỏ hẳn, và chạy lại ngay khi một trong hai đổi.
  const needsWallpaper = opts.colorSource === "wallpaper" || opts.surfaceStyle === "glass";

  useEffect(() => {
    if (!needsWallpaper) {
      // Phải báo ra khỏi trạng thái `loading`, nếu không panel Cài đặt đứng mãi ở "đang
      // tải" và `theme_report` không bao giờ được gửi cho bài kiểm.
      setSeed(BRAND_TEAL, "brand", "");
      return;
    }
    let cancelled = false;
    seedFromWallpaper(opts.wallpaperPath || undefined)
      .then(({ seed, colors, path, blur }) => {
        if (!cancelled) setSeed(seed, "wallpaper", path, "", blur, colors);
      })
      .catch((e) => {
        // Thà xấu còn hơn trắng bệch: vẫn có màu, và `source` nói rõ là đang chạy fallback.
        console.warn("Could not read wallpaper; using fallback colors:", e);
        if (!cancelled) setSeed(FALLBACK_SEED, "fallback", "", String(e?.message ?? e));
      });
    return () => {
      cancelled = true;
    };
  }, [setSeed, needsWallpaper, opts.wallpaperPath]);

  const scheme = resolveScheme(seed, opts);

  useEffect(() => {
    const vars = {
      ...chromeVars(scheme),
      ...accentVars(scheme, opts, source === "wallpaper" ? wallpaperColors : []),
      ...terminalVars(scheme, opts),
    };
    applyVars(vars);
    // Bề mặt kính lấy nền từ đây. Bề mặt phẳng thì không có kính nào để dựng, và khi chưa
    // đọc được ảnh nền thì `none` để lớp màu đặc của surface tự lo — không bao giờ để một
    // `url()` hỏng nằm trong cây vẽ.
    document.documentElement.style.setProperty(
      "--wall-blur",
      opts.surfaceStyle === "glass" && wallBlur ? `url("${wallBlur}")` : "none",
    );
    document.documentElement.dataset.theme = opts.dark ? "dark" : "light";
    if (source === "loading") return;
    // No-op trừ khi bài kiểm bật NONAME_THEME_DUMP.
    invoke("theme_report", {
      report: {
        seed: "#" + (seed >>> 0).toString(16).padStart(8, "0"),
        source,
        wallpaper,
        error,
        colorSource: opts.colorSource,
        surfaceStyle: opts.surfaceStyle,
        scheme: opts.scheme,
        dark: opts.dark,
        vars,
      },
    }).catch(() => {});
  }, [
    seed,
    wallpaperColors,
    source,
    error,
    wallBlur,
    opts.colorSource,
    opts.surfaceStyle,
    opts.scheme,
    opts.dark,
    opts.contrast,
    opts.termChroma,
    opts.termOpacity,
    opts.harmonize,
  ]);

  const refresh = refreshSeed;

  return {
    scheme,
    opts,
    seed,
    source,
    wallpaper,
    error,
    setOpts,
    refresh,
    xterm: xtermTheme(scheme, opts),
  };
}
