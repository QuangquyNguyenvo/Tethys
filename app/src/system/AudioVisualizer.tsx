import { useEffect, useRef, useState } from "react";
import { Disc, Radio } from "lucide-react";

type Props = {
  active?: boolean;
};

const BARS_COUNT = 36;

export function AudioVisualizer({ active = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<"cava" | "wave" | "dual">("dual");
  const [stereoL, setStereoL] = useState(65);
  const [stereoR, setStereoR] = useState(72);
  const [bpm] = useState(128);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let time = 0;

    // State for bar heights and peak hold/fall
    const heights = new Array(BARS_COUNT).fill(0);
    const peaks = new Array(BARS_COUNT).fill(0);
    const peakSpeeds = new Array(BARS_COUNT).fill(0);

    const render = () => {
      time += 0.035;
      const width = canvas.width;
      const height = canvas.height;
      if (width === 0 || height === 0) {
        animId = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      // Read computed primary and tertiary colors from DOM
      const style = getComputedStyle(document.documentElement);
      const primary = style.getPropertyValue("--ui-primary").trim() || "#7ba4ff";
      const tertiary = style.getPropertyValue("--ui-tertiary").trim() || "#9cd0ff";
      const secondary = style.getPropertyValue("--ui-secondary").trim() || "#89b4fa";
      const onSurfaceVariant = style.getPropertyValue("--ui-on-surface-variant").trim() || "#a6adc8";

      // Multi-harmonic audio frequency simulation
      const bassBeat = Math.pow(Math.max(0, Math.sin(time * 2.2)), 3) * 0.45;
      const snareBeat = Math.pow(Math.max(0, Math.sin(time * 4.4 + 1.2)), 4) * 0.35;
      const ambientPulse = Math.sin(time * 1.1) * 0.15 + 0.15;

      let sumL = 0;
      let sumR = 0;

      for (let i = 0; i < BARS_COUNT; i++) {
        const norm = i / (BARS_COUNT - 1);
        const freqWeight = Math.sin(norm * Math.PI); // arch distribution for music

        // Complex harmonics for realistic CAVA-like audio waves
        const wave1 = Math.sin(time * 3.2 + i * 0.38) * 0.3;
        const wave2 = Math.cos(time * 5.7 - i * 0.22) * 0.25;
        const wave3 = Math.sin(time * 8.1 + i * 0.55) * 0.18;
        const wave4 = Math.cos(time * 12.4 + i * 0.82) * 0.12;

        let target = (wave1 + wave2 + wave3 + wave4 + 0.85) * freqWeight;
        if (norm < 0.3) target += bassBeat * (1 - norm * 2.5);
        if (norm > 0.4 && norm < 0.7) target += snareBeat * 0.8;
        target += ambientPulse * 0.3;

        target = Math.max(0.04, Math.min(0.96, target));

        // Smooth easing towards target
        heights[i] += (target - heights[i]) * 0.28;

        // Peak drop physics
        if (heights[i] > peaks[i]) {
          peaks[i] = heights[i];
          peakSpeeds[i] = 0;
        } else {
          peakSpeeds[i] += 0.0015; // gravity
          peaks[i] = Math.max(0, peaks[i] - peakSpeeds[i]);
        }

        if (i < BARS_COUNT / 2) sumL += heights[i];
        else sumR += heights[i];
      }

      setStereoL(Math.round((sumL / (BARS_COUNT / 2)) * 100));
      setStereoR(Math.round((sumR / (BARS_COUNT / 2)) * 100));

      const barWidth = Math.max(3, (width - (BARS_COUNT - 1) * 3) / BARS_COUNT);
      const gap = 3;

      // 1. Draw Equalizer Spectrum Bars (Mode: 'cava' or 'dual')
      if (mode === "cava" || mode === "dual") {
        const barMaxH = mode === "dual" ? height * 0.62 : height * 0.85;
        const baseY = height - 4;

        // Create gradient
        const grad = ctx.createLinearGradient(0, baseY, 0, baseY - barMaxH);
        grad.addColorStop(0, primary);
        grad.addColorStop(0.65, secondary);
        grad.addColorStop(1, tertiary);

        for (let i = 0; i < BARS_COUNT; i++) {
          const x = i * (barWidth + gap);
          const h = heights[i] * barMaxH;
          const peakY = baseY - peaks[i] * barMaxH;

          // Bar body
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(x, baseY - h, barWidth, h, [2, 2, 0, 0]);
          ctx.fill();

          // Peak indicator cap
          ctx.fillStyle = tertiary;
          ctx.fillRect(x, Math.max(0, peakY - 2), barWidth, 2);
        }
      }

      // 2. Draw Oscilloscope Sine Wave (Mode: 'wave' or 'dual')
      if (mode === "wave" || mode === "dual") {
        const waveCenterY = mode === "dual" ? height * 0.26 : height * 0.5;
        const waveAmp = mode === "dual" ? height * 0.18 : height * 0.38;

        // Primary flowing audio sine curve
        ctx.beginPath();
        ctx.strokeStyle = tertiary;
        ctx.lineWidth = 1.8;
        for (let x = 0; x <= width; x += 4) {
          const normX = x / width;
          const y =
            waveCenterY +
            Math.sin(normX * Math.PI * 4 + time * 3.5) * waveAmp * 0.65 +
            Math.cos(normX * Math.PI * 8 - time * 2.1) * waveAmp * 0.35 * (1 + bassBeat);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Secondary subtle harmonic echo line
        ctx.beginPath();
        ctx.strokeStyle = `color-mix(in srgb, ${primary} 45%, transparent)`;
        ctx.lineWidth = 1.2;
        for (let x = 0; x <= width; x += 4) {
          const normX = x / width;
          const y =
            waveCenterY +
            Math.sin(normX * Math.PI * 3 - time * 2.8) * waveAmp * 0.45 +
            Math.sin(normX * Math.PI * 6 + time * 4.2) * waveAmp * 0.25;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Center baseline guide
      ctx.strokeStyle = `color-mix(in srgb, ${onSurfaceVariant} 18%, transparent)`;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(0, height - 3);
      ctx.lineTo(width, height - 3);
      ctx.stroke();
      ctx.setLineDash([]);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [active, mode]);

  return (
    <div className="audio-viz-box">
      <div className="audio-viz-head">
        <div className="audio-viz-title">
          <Radio size={14} className="pulse-icon" />
          <span>AUDIO SPECTRUM · CAVA EQUALIZER</span>
          <span className="audio-badge">LIVE 48kHz</span>
        </div>
        <div className="audio-viz-controls">
          <button
            className={"audio-viz-btn" + (mode === "dual" ? " on" : "")}
            onClick={() => setMode("dual")}
            title="Combined waveform and frequency bars"
          >
            Dual
          </button>
          <button
            className={"audio-viz-btn" + (mode === "cava" ? " on" : "")}
            onClick={() => setMode("cava")}
            title="CAVA equalizer bars"
          >
            Bars
          </button>
          <button
            className={"audio-viz-btn" + (mode === "wave" ? " on" : "")}
            onClick={() => setMode("wave")}
            title="Oscilloscope waveform"
          >
            Wave
          </button>
        </div>
      </div>

      <div className="audio-viz-canvas-wrap">
        <canvas ref={canvasRef} width={580} height={140} className="audio-viz-canvas" />
      </div>

      <div className="audio-viz-footer">
        <div className="audio-channel">
          <span className="channel-lbl">CH-L</span>
          <div className="channel-bar">
            <div className="channel-fill" style={{ width: `${stereoL}%` }} />
          </div>
          <span className="channel-val">{stereoL}%</span>
        </div>

        <div className="audio-meta">
          <Disc size={12} className="spin-icon" />
          <span>Stereo Harmonic Stream · {bpm} BPM</span>
        </div>

        <div className="audio-channel">
          <span className="channel-lbl">CH-R</span>
          <div className="channel-bar">
            <div className="channel-fill" style={{ width: `${stereoR}%` }} />
          </div>
          <span className="channel-val">{stereoR}%</span>
        </div>
      </div>
    </div>
  );
}
