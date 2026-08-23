import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

const WIDTH = 64;
const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 92;

function smoothPath(levels: number[], scale = 1, offset = 0): string {
  if (!levels.length) return "";
  const xAt = (index: number) => (index / (WIDTH - 1)) * VIEW_WIDTH;
  const yAt = (index: number) => (
    VIEW_HEIGHT - 11 - Math.min(8, levels[index]) / 8 * (VIEW_HEIGHT - 28) * scale + offset
  );
  let path = `M 0 ${yAt(0)}`;
  for (let index = 1; index < levels.length - 1; index += 1) {
    const currentX = xAt(index);
    const currentY = yAt(index);
    const nextX = xAt(index + 1);
    const nextY = yAt(index + 1);
    path += ` Q ${currentX} ${currentY} ${(currentX + nextX) / 2} ${(currentY + nextY) / 2}`;
  }
  const lastIndex = levels.length - 1;
  return `${path} L ${xAt(lastIndex)} ${yAt(lastIndex)}`;
}

type AudioLevels = { levels: number[] };

const EMPTY_LEVELS = Array<number>(WIDTH).fill(0);
const INITIAL_PATH = smoothPath(EMPTY_LEVELS);
const INITIAL_FILL = `${INITIAL_PATH} L ${VIEW_WIDTH} ${VIEW_HEIGHT} L 0 ${VIEW_HEIGHT} Z`;
const INITIAL_ECHO = smoothPath(EMPTY_LEVELS, 0.72, 9);

/** Sóng ASCII nhận trực tiếp mức âm thanh WASAPI loopback từ output Windows. */
export function AsciiAudioWave() {
  const targetLevels = useRef<number[]>(Array(WIDTH).fill(0));
  const shownLevels = useRef<number[]>(Array(WIDTH).fill(0));
  const echoRef = useRef<SVGPathElement>(null);
  const fillRef = useRef<SVGPathElement>(null);
  const lineRef = useRef<SVGPathElement>(null);

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
      const shown = shownLevels.current;
      const target = targetLevels.current;
      for (let index = 0; index < shown.length; index += 1) {
        shown[index] += (target[index] - shown[index]) * 0.14;
      }

      const path = smoothPath(shown);
      lineRef.current?.setAttribute("d", path);
      fillRef.current?.setAttribute("d", `${path} L ${VIEW_WIDTH} ${VIEW_HEIGHT} L 0 ${VIEW_HEIGHT} Z`);
      echoRef.current?.setAttribute("d", smoothPath(shown, 0.72, 9));
      frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="sysfetch-wave" aria-label="System audio waveform">
      <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} preserveAspectRatio="none" role="img">
        <defs>
          <linearGradient id="sysfetch-wave-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.36" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path ref={echoRef} className="sysfetch-wave-echo" d={INITIAL_ECHO} />
        <path ref={fillRef} className="sysfetch-wave-fill" d={INITIAL_FILL} />
        <path ref={lineRef} className="sysfetch-wave-line" d={INITIAL_PATH} />
      </svg>
    </div>
  );
}
