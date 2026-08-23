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
import { QuantizerCelebi, Score } from "@material/material-color-utilities";
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

type ThemeStore = {
  opts: ThemeOptions;
  seed: number;
  /**
   * Màu gốc đang lấy từ đâu — để UI settings nói rõ thay vì im lặng.
   * `brand` nghĩa là không đọc ảnh nền chút nào, màu lấy thẳng từ logo.
   */
  source: "wallpaper" | "fallback" | "loading" | "brand";
  wallpaper: string;
  /** Vì sao phải chạy fallback — để bài kiểm và UI settings nói được lý do, không chỉ "hỏng". */
  error: string;
  setOpts: (patch: Partial<ThemeOptions>) => void;
  setSeed: (
    seed: number,
    source: "wallpaper" | "fallback" | "brand",
    wallpaper: string,
    error?: string,
  ) => void;
};

export const useThemeStore = create<ThemeStore>((set) => ({
  opts: DEFAULTS,
  seed: FALLBACK_SEED,
  source: "loading",
  wallpaper: "",
  error: "",
  setOpts: (patch) => set((s) => ({ opts: { ...s.opts, ...patch } })),
  setSeed: (seed, source, wallpaper, error = "") =>
    set({ seed, source, wallpaper, error }),
}));

async function seedFromWallpaper(customPath?: string): Promise<{ seed: number; path: string }> {
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
  if (!ctx) throw new Error("Khong lay duoc canvas 2d context");
  ctx.drawImage(img, 0, 0, w, h);

  const { data } = ctx.getImageData(0, 0, w, h);
  const pixels: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 255) continue; // bỏ pixel trong suốt, chúng kéo màu về xám
    pixels.push((255 << 24) | (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  }
  const ranked = Score.score(QuantizerCelebi.quantize(pixels, 128));
  return { seed: ranked[0] ?? FALLBACK_SEED, path };
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
    .then(({ seed, path }) => setSeed(seed, "wallpaper", path))
    .catch((e) => setSeed(FALLBACK_SEED, "fallback", "", String(e?.message ?? e)));
}

/** Đổi nền riêng của app mà không động vào wallpaper Windows của người dùng. */
export function setCustomWallpaper(path: string) {
  const { setSeed, setOpts } = useThemeStore.getState();
  setOpts({ wallpaperPath: path });
  return seedFromWallpaper(path)
    .then(({ seed, path: resolved }) => setSeed(seed, "wallpaper", resolved))
    .catch((e) => setSeed(FALLBACK_SEED, "fallback", "", String(e?.message ?? e)));
}

export function useDesktopWallpaper() {
  const { setSeed, setOpts } = useThemeStore.getState();
  setOpts({ wallpaperPath: "" });
  return seedFromWallpaper()
    .then(({ seed, path }) => setSeed(seed, "wallpaper", path))
    .catch((e) => setSeed(FALLBACK_SEED, "fallback", "", String(e?.message ?? e)));
}

/** Gọi một lần ở gốc cây React. Trả về scheme để nơi khác (xterm) dùng lại. */
export function useTheme() {
  const { opts, seed, source, wallpaper, error, setSeed, setOpts } = useThemeStore();

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
      .then(({ seed, path }) => {
        if (!cancelled) setSeed(seed, "wallpaper", path);
      })
      .catch((e) => {
        // Thà xấu còn hơn trắng bệch: vẫn có màu, và `source` nói rõ là đang chạy fallback.
        console.warn("Khong doc duoc anh nen, dung mau du phong:", e);
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
      ...accentVars(scheme, opts),
      ...terminalVars(scheme, opts),
    };
    applyVars(vars);
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
    source,
    error,
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
