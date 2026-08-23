import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

const WIDTH = 64;
const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 92;

function pointsFrom(levels: number[], scale = 1, offset = 0) {
  return levels.map((level, index) => ({
    x: (index / (WIDTH - 1)) * VIEW_WIDTH,
    y: VIEW_HEIGHT - 11 - Math.min(8, level) / 8 * (VIEW_HEIGHT - 28) * scale + offset,
  }));
}

function smoothPath(levels: number[], scale = 1, offset = 0): string {
  const points = pointsFrom(levels, scale, offset);
  if (!points.length) return "";
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    path += ` Q ${current.x} ${current.y} ${(current.x + next.x) / 2} ${(current.y + next.y) / 2}`;
  }
  const last = points[points.length - 1];
  return `${path} L ${last.x} ${last.y}`;
}

type AudioLevels = { levels: number[] };

/** Sóng ASCII nhận trực tiếp mức âm thanh WASAPI loopback từ output Windows. */
export function AsciiAudioWave() {
  const targetLevels = useRef<number[]>(Array(WIDTH).fill(0));
  const shownLevels = useRef<number[]>(Array(WIDTH).fill(0));
  const [levels, setLevels] = useState<number[]>(() => Array(WIDTH).fill(0));

  useEffect(() => {
    invoke("audio_set_active", { active: true }).catch(() => {});
    return () => {
      invoke("audio_set_active", { active: false }).catch(() => {});
    };
  }, []);

  useEffect(() => {
    let alive = true;
    let pending = false;
    const tick = () => {
      if (pending) return;
      pending = true;
      invoke<AudioLevels>("audio_levels")
        .then((next) => {
          if (!alive) return;
          targetLevels.current = Array.from({ length: WIDTH }, (_, index) => next.levels[index] ?? 0);
        })
        .catch(() => {})
        .finally(() => { pending = false; });
    };
    tick();
    const timer = window.setInterval(tick, 90);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let frame = 0;
    const animate = () => {
      const next = shownLevels.current.map((level, index) =>
        level + (targetLevels.current[index] - level) * 0.14,
      );
      shownLevels.current = next;
      setLevels(next);
      frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const path = smoothPath(levels);
  const fill = `${path} L ${VIEW_WIDTH} ${VIEW_HEIGHT} L 0 ${VIEW_HEIGHT} Z`;

  return (
    <div className="sysfetch-wave" aria-label="System audio waveform">
      <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} preserveAspectRatio="none" role="img">
        <defs>
          <linearGradient id="sysfetch-wave-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.36" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path className="sysfetch-wave-echo" d={smoothPath(levels, 0.72, 9)} />
        <path className="sysfetch-wave-fill" d={fill} />
        <path className="sysfetch-wave-line" d={path} />
      </svg>
    </div>
  );
}
