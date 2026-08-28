import { QuantizerCelebi } from "@material/material-color-utilities";

/**
 * MCU's Celebi implementation seeds Wsmeans with Wu centroids, but its initial pixel to
 * cluster assignment still calls `Math.random()`. That makes refreshes of the same bitmap
 * produce slightly different clusters. The quantizer is synchronous, so temporarily using
 * a PRNG seeded from the pixels makes the result repeatable without changing Celebi itself.
 */
export function quantizeCelebiStable(pixels: number[], maxColors: number): Map<number, number> {
  let hash = 0x811c9dc5;
  for (const pixel of pixels) {
    hash ^= pixel;
    hash = Math.imul(hash, 0x01000193);
  }

  let state = hash >>> 0 || 0x6d2b79f5;
  const originalRandom = Math.random;
  Math.random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };

  try {
    return QuantizerCelebi.quantize(pixels, maxColors);
  } finally {
    Math.random = originalRandom;
  }
}
