/**
 * C4 + C5 — kiểm bảng màu bằng máy, không bằng mắt.
 *
 * Bundle thẳng `src/theme/palette.ts` bằng esbuild rồi chạy, để bài kiểm dùng **đúng** code
 * mà app dùng. Chép lại công thức sang script kiểm là cách chắc chắn nhất để kiểm nhầm thứ.
 *
 *   node scripts/check-theme.mjs
 */
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "theme-check-"));
const out = join(dir, "bundle.mjs");

// MCU 0.4.0 có import thiếu đuôi `.js` nên Node ESM không nạp thẳng được — chỉ bundler mới
// resolve nổi. Nên gom cả palette lẫn `Hct` vào một bundle thay vì import riêng.
await build({
  stdin: {
    contents: `
      export * from "./src/theme/palette.ts";
      export { Hct } from "@material/material-color-utilities";
    `,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: out,
  logLevel: "warning",
});
const P = await import(pathToFileURL(out).href);

const srgb = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => srgb(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
// Chroma đọc qua MCU cho khớp với không gian màu mà palette dùng.
const chroma = (hex) => P.Hct.fromInt(0xff000000 | parseInt(hex.slice(1), 16)).chroma;

const SCHEMES = ["TonalSpot", "Vibrant", "Expressive", "Neutral", "Content", "Monochrome"];
const SEEDS = [P.FALLBACK_SEED, 0xff2f6f4e, 0xffb03a2e, 0xff1c3f8f];

let fail = 0;
const rows = [];

for (const scheme of SCHEMES) {
  for (const dark of [true, false]) {
    const opts = { ...P.DEFAULTS, scheme, dark };
    let worstText = Infinity;
    let worstSelectionText = Infinity;
    let worstSelectionEdge = Infinity;
    let ratioSum = 0;

    for (const seed of SEEDS) {
      const s = P.buildScheme(seed, opts);
      const ui = P.chromeVars(s);
      const term = P.xtermTheme(s, opts);

      worstSelectionText = Math.min(
        worstSelectionText,
        contrast(term.selectionForeground, term.selectionBackground),
      );
      worstSelectionEdge = Math.min(
        worstSelectionEdge,
        contrast(term.selectionBackground, ui["--ui-surface-container-lowest"]),
      );

      // C4 — chữ trên nền phải đọc được ở mọi tổ hợp, không riêng tổ hợp đẹp.
      for (const [fg, bg] of [
        ["--ui-on-surface", "--ui-surface"],
        ["--ui-on-surface-variant", "--ui-surface"],
        ["--ui-on-surface", "--ui-surface-container-lowest"],
        ["--ui-on-primary-container", "--ui-primary-container"],
      ]) {
        worstText = Math.min(worstText, contrast(ui[fg], ui[bg]));
      }

      // C5 — 16 màu ANSI phải rực hơn hẳn chrome.
      const ansi = P.ansiColors(s, opts);
      const hueNames = Object.keys(ansi).filter(
        (k) => !/black|white/i.test(k),
      );
      const ansiChroma =
        hueNames.reduce((a, k) => a + chroma(ansi[k]), 0) / hueNames.length;
      const chromeKeys = [
        "--ui-primary",
        "--ui-secondary",
        "--ui-tertiary",
        "--ui-on-surface-variant",
      ];
      const chromeChroma =
        chromeKeys.reduce((a, k) => a + chroma(ui[k]), 0) / chromeKeys.length;
      ratioSum += ansiChroma / chromeChroma;
    }

    const ratio = ratioSum / SEEDS.length;
    // Monochrome cố ý không có chroma — nhân bao nhiêu cũng vẫn xám. Miễn cho nó.
    const ratioOk = scheme === "Monochrome" || ratio >= 1.5;
    const textOk = worstText >= 4.5;
    const selectionOk = worstSelectionText >= 4.5 && worstSelectionEdge >= 3;
    if (!ratioOk || !textOk || !selectionOk) fail++;
    rows.push({
      scheme,
      mode: dark ? "dark" : "light",
      contrast: worstText.toFixed(2),
      C4: textOk ? "PASS" : "FAIL",
      chroma_ratio: ratio.toFixed(2),
      C5: ratioOk ? "PASS" : "FAIL",
      selection: `${worstSelectionText.toFixed(2)}/${worstSelectionEdge.toFixed(2)}`,
      UX1: selectionOk ? "PASS" : "FAIL",
    });
  }
}

// C4 + C5 cho bảng màu thương hiệu. Nó không đi qua `buildScheme` nên vòng lặp trên hoàn
// toàn không chạm tới nó — mà đây lại là bảng màu *mặc định*, tức là thứ đại đa số người
// dùng nhìn thấy. Bỏ sót nó thì bài kiểm đang kiểm nhánh ít người gặp nhất.
for (const dark of [true, false]) {
  const opts = { ...P.DEFAULTS, dark };
  const s = P.buildBrandScheme(opts);
  const ui = P.chromeVars(s);
  const term = P.xtermTheme(s, opts);

  let worstText = Infinity;
  for (const [fg, bg] of [
    ["--ui-on-surface", "--ui-surface"],
    ["--ui-on-surface-variant", "--ui-surface"],
    ["--ui-on-surface", "--ui-surface-container-lowest"],
    ["--ui-on-primary-container", "--ui-primary-container"],
  ]) {
    worstText = Math.min(worstText, contrast(ui[fg], ui[bg]));
  }

  const ansi = P.ansiColors(s, opts);
  const hueNames = Object.keys(ansi).filter((k) => !/black|white/i.test(k));
  const ansiChroma = hueNames.reduce((a, k) => a + chroma(ansi[k]), 0) / hueNames.length;
  const chromeKeys = ["--ui-primary", "--ui-secondary", "--ui-tertiary", "--ui-on-surface-variant"];
  const chromeChroma = chromeKeys.reduce((a, k) => a + chroma(ui[k]), 0) / chromeKeys.length;
  const ratio = ansiChroma / chromeChroma;

  // C6 — primary phải *là* teal của logo, không phải một màu họ hàng. Đây là điều kiện
  // duy nhất phân biệt "đã áp bảng màu thương hiệu" với "tình cờ cũng xanh".
  const primaryHct = P.Hct.fromInt(0xff000000 | parseInt(ui["--ui-primary"].slice(1), 16));
  const brandHct = P.Hct.fromInt(P.BRAND_TEAL);
  const hueGap = Math.abs(((primaryHct.hue - brandHct.hue + 540) % 360) - 180);

  // C7 — nền phải là navy có màu thật, không phải xám. Chroma tụt về 0 nghĩa là
  // `BRAND_NEUTRAL_CHROMA` đã bị ai đó kéo xuống và app quay lại thành cái hộp xám.
  const bgChroma = chroma(ui["--ui-background"]);
  const selectionText = contrast(term.selectionForeground, term.selectionBackground);
  const selectionEdge = contrast(term.selectionBackground, ui["--ui-surface-container-lowest"]);

  const textOk = worstText >= 4.5;
  const ratioOk = ratio >= 1.5;
  const hueOk = hueGap <= 8;
  const bgOk = dark ? bgChroma >= 6 : bgChroma >= 2;
  const selectionOk = selectionText >= 4.5 && selectionEdge >= 3;
  if (!textOk || !ratioOk || !hueOk || !bgOk || !selectionOk) fail++;

  rows.push({
    scheme: "Brand",
    mode: dark ? "dark" : "light",
    contrast: worstText.toFixed(2),
    C4: textOk ? "PASS" : "FAIL",
    chroma_ratio: ratio.toFixed(2),
    C5: ratioOk ? "PASS" : "FAIL",
    hue_gap: hueGap.toFixed(1),
    C6: hueOk ? "PASS" : "FAIL",
    bg_chroma: bgChroma.toFixed(1),
    C7: bgOk ? "PASS" : "FAIL",
    selection: `${selectionText.toFixed(2)}/${selectionEdge.toFixed(2)}`,
    UX1: selectionOk ? "PASS" : "FAIL",
  });
}

console.table(rows);
rmSync(dir, { recursive: true, force: true });
if (fail) {
  console.error(`\n${fail} tổ hợp KHÔNG đạt.`);
  process.exit(1);
}
console.log("\nC4 + C5 PASS trên 6 scheme × dark/light × 4 màu gốc.");
