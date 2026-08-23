import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

const WIDTH = 56;
const HEIGHT = 7;

function frameFrom(levels: number[]): string {
  return Array.from({ length: HEIGHT }, (_, row) => {
    const threshold = HEIGHT - row;
    return Array.from({ length: WIDTH }, (_, index) =>
      (levels[index] ?? 0) >= threshold ? "#" : " ",
    ).join("");
  }).join("\n");
}

type AudioLevels = { levels: number[] };

/** Sóng ASCII nhận trực tiếp mức âm thanh WASAPI loopback từ output Windows. */
export function AsciiAudioWave() {
  const [levels, setLevels] = useState<number[]>(() => Array(WIDTH).fill(0));

  useEffect(() => {
    let alive = true;
    let pending = false;
    const tick = () => {
      if (pending) return;
      pending = true;
      invoke<AudioLevels>("audio_levels")
        .then((next) => alive && setLevels(next.levels))
        .catch(() => {})
        .finally(() => { pending = false; });
    };
    tick();
    const timer = window.setInterval(tick, 90);
    return () => window.clearInterval(timer);
  }, []);

  return <pre className="sysfetch-wave" aria-label="Sóng âm thanh hệ thống">{frameFrom(levels)}</pre>;
}
