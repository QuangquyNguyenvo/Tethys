// SPIKE — code vứt đi. Đo 4 ẩn số §8, không phải mẫu kiến trúc cho app thật.
import { useEffect, useRef, useState } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import "./App.css";

type Stats = { bytes: number; flushes: number; alive: boolean };
type Info = {
  shell: string; raw_threshold: number;
  autobench: boolean; flush_ms: number; min_bytes: number; hold_sec: number; blur: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Tham số đọc một lần lúc load — A7 sweep bằng cách đổi rồi reload, không phải restart tay.
const CFG = {
  flushMs: Number(localStorage.getItem("flushMs") ?? 12),
  minBytes: Number(localStorage.getItem("minBytes") ?? 4096),
};

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const bootedRef = useRef(false);

  const [flushMs, setFlushMs] = useState(CFG.flushMs);
  const [minBytes, setMinBytes] = useState(CFG.minBytes);
  const [blur, setBlur] = useState(false);
  const [info, setInfo] = useState<Info | null>(null);
  const [webgl, setWebgl] = useState<"on" | "off">("off");
  const [firstByteMs, setFirstByteMs] = useState<number | null>(null);
  const [fps, setFps] = useState(0);
  const [minFps, setMinFps] = useState(999);
  const [rate, setRate] = useState(0);
  const [peakRate, setPeakRate] = useState(0);
  const [stats, setStats] = useState<Stats>({ bytes: 0, flushes: 0, alive: false });
  const [err, setErr] = useState("");
  const [bench, setBench] = useState("");
  const fpsLog = useRef<number[]>([]);

  // ── xterm + auto start pty ───────────────────────────────────────────────
  useEffect(() => {
    if (!hostRef.current || bootedRef.current) return;
    bootedRef.current = true;

    const term = new Terminal({
      allowProposedApi: true,
      fontFamily: '"JetBrainsMono Nerd Font","JetBrains Mono","Cascadia Mono",Consolas,monospace',
      fontSize: 13,
      // KHÔNG có fontLigatures: xterm.js 6 không hỗ trợ ligature natively.
      // @xterm/addon-ligatures cần font-finder + font-ligatures (đọc file font qua Node fs)
      // → không chạy trong WebView2. Xem Deviations phase 01 → D3.
      cursorBlink: true,
      scrollback: 10000,
      theme: { background: "#00000000", foreground: "#dcdce4", cursor: "#c9a7ff" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    try {
      const gl = new WebglAddon();
      gl.onContextLoss(() => { gl.dispose(); setWebgl("off"); });
      term.loadAddon(gl);
      setWebgl("on");
    } catch (e) {
      setWebgl("off");
      console.warn("WebGL addon lỗi, rơi về DOM renderer:", e);
    }
    fit.fit();

    const ro = new ResizeObserver(() => {
      try { fit.fit(); } catch { /* trống */ }
      invoke("pty_resize", { rows: term.rows, cols: term.cols }).catch(() => {});
    });
    ro.observe(hostRef.current);

    const ch = new Channel<ArrayBuffer>();
    let gotFirst = false;
    ch.onmessage = (buf) => {
      if (!gotFirst) { gotFirst = true; setFirstByteMs(Math.round(performance.now())); }
      term.write(new Uint8Array(buf));
    };

    invoke<Info>("pty_start", {
      rows: term.rows, cols: term.cols,
      flushMs: CFG.flushMs, minBytes: CFG.minBytes, onData: ch,
    })
      .then((res) => {
        setInfo(res);
        if (res.blur) setBlur(true);   // A5: bật blur từ env, không cần bấm tay
        term.onData((d) =>
          invoke("pty_write", { data: Array.from(new TextEncoder().encode(d)) }).catch(() => {}),
        );
        term.focus();
      })
      .catch((e) => setErr(String(e)));

    return () => ro.disconnect();
  }, []);

  // ── FPS: số đo khách quan cho "UI có đơ không" (A3) ───────────────────────
  useEffect(() => {
    let frames = 0, last = performance.now(), raf = 0;
    const tick = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 1000) {
        setFps(frames);
        setMinFps((m) => Math.min(m, frames));
        fpsLog.current.push(frames);
        frames = 0; last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── throughput: đọc từ Rust, không đọc từ JS ─────────────────────────────
  useEffect(() => {
    let prev = 0, prevT = performance.now();
    const id = setInterval(async () => {
      try {
        const s = await invoke<Stats>("pty_stats");
        const now = performance.now();
        const dt = (now - prevT) / 1000;
        if (dt > 0) {
          const r = (s.bytes - prev) / dt / 1e6;
          setRate(r);
          setPeakRate((p) => Math.max(p, r));
        }
        prev = s.bytes; prevT = now;
        setStats(s);
      } catch { /* chưa start */ }
    }, 500);
    return () => clearInterval(id);
  }, []);

  // ── A3 + A7 tự chạy: bench.ps1 bật SPIKE_AUTOBENCH rồi đọc file kết quả ──
  useEffect(() => {
    if (!info?.autobench) return;
    let cancelled = false;

    (async () => {
      setBench("chờ prompt…");
      await sleep(2500);
      if (cancelled) return;

      await invoke("pty_stats_reset").catch(() => {});
      fpsLog.current = [];
      setBench("đang đổ 47.7 MB…");

      // Join-Path để tránh backslash trong chuỗi — đã bị nuốt escape một lần rồi.
      const cmd = "Get-Content (Join-Path $env:TEMP 'big.txt') -Raw\r";
      await invoke("pty_write", { data: Array.from(new TextEncoder().encode(cmd)) });

      let last = 0, lastChange = performance.now(), t0 = 0;
      const deadline = performance.now() + 180_000;
      while (!cancelled && performance.now() < deadline) {
        await sleep(250);
        const s = await invoke<Stats>("pty_stats").catch(() => null);
        if (!s) continue;
        if (s.bytes > 0 && t0 === 0) t0 = performance.now();
        if (s.bytes !== last) { last = s.bytes; lastChange = performance.now(); }
        else if (t0 && performance.now() - lastChange > 2000) break;
      }
      if (cancelled) return;

      const s = await invoke<Stats>("pty_stats");
      const seconds = t0 ? (lastChange - t0) / 1000 : 0;
      // Bỏ 2 mẫu fps đầu (lúc còn chờ prompt) để không làm đẹp số một cách gian lận.
      const fpsDuring = fpsLog.current.slice(2);

      // Giữ app sống thêm để bench.ps1 đo RAM **sau khi đã ổn định**.
      // Đỉnh tức thời không phân biệt được rò rỉ thật với GC chưa kịp chạy.
      if (info.hold_sec > 0) {
        for (let i = info.hold_sec; i > 0; i--) {
          setBench(`giữ ${i}s để đo RAM ổn định…`);
          await sleep(1000);
          if (cancelled) return;
        }
      }
      setBench("xong, ghi báo cáo…");

      await invoke("bench_done", {
        report: {
          min_bytes: info.min_bytes,
          flush_ms: info.flush_ms,
          shell: info.shell,
          seconds: Number(seconds.toFixed(2)),
          bytes: s.bytes,
          flushes: s.flushes,
          avg_chunk: s.flushes ? Math.round(s.bytes / s.flushes) : 0,
          mb_per_s: seconds ? Number((s.bytes / 1e6 / seconds).toFixed(1)) : 0,
          fps_min: fpsDuring.length ? Math.min(...fpsDuring) : null,
          fps_avg: fpsDuring.length
            ? Math.round(fpsDuring.reduce((a, b) => a + b, 0) / fpsDuring.length)
            : null,
          fps_samples: fpsDuring,
          blur: info.blur,
        },
      }).catch((e) => setErr(String(e)));
    })();

    return () => { cancelled = true; };
  }, [info?.autobench]);

  const applyAndReload = () => {
    localStorage.setItem("flushMs", String(flushMs));
    localStorage.setItem("minBytes", String(minBytes));
    location.reload();
  };
  const resetMeasure = () => {
    invoke("pty_stats_reset").catch(() => {});
    setPeakRate(0); setMinFps(999);
  };

  const mb = (n: number) => (n / 1e6).toFixed(1);
  const avgChunk = stats.flushes ? Math.round(stats.bytes / stats.flushes) : 0;
  const dirty = flushMs !== CFG.flushMs || minBytes !== CFG.minBytes;

  return (
    <div className="app">
      <div className="bar" data-tauri-drag-region>
        <b data-tauri-drag-region>spike</b>
        <span data-tauri-drag-region>· đo §8, không phải app thật</span>
        <div className="sp" data-tauri-drag-region />
        <button className="x" onClick={() => window.close()}>✕</button>
      </div>

      <div className="panel">
        <label>flush_ms
          <input type="number" min={1} max={200} value={flushMs}
                 onChange={(e) => setFlushMs(+e.target.value)} />
        </label>
        <label>min_bytes
          <select value={minBytes} onChange={(e) => setMinBytes(+e.target.value)}>
            <option value={256}>256 — dưới ngưỡng, ép đi đường eval</option>
            <option value={1024}>1024 — đúng ngưỡng raw</option>
            <option value={4096}>4096</option>
            <option value={16384}>16384</option>
            <option value={65536}>65536</option>
          </select>
        </label>
        <button className={dirty ? "go" : ""} onClick={applyAndReload}>
          {dirty ? "áp dụng + reload" : "reload"}
        </button>
        <button onClick={resetMeasure}>reset đo</button>
        <label className="chk">
          <input type="checkbox" checked={blur} onChange={(e) => setBlur(e.target.checked)} /> blur
        </label>

        <div className="sp" />

        {info && <span className="tag">{info.shell}</span>}
        <span className={"tag " + (webgl === "on" ? "ok" : "bad")}>webgl {webgl}</span>
        <span className={"tag " + (fps < 30 ? "bad" : "ok")}>{fps} fps</span>
        <span className="tag">min {minFps === 999 ? "—" : minFps} fps</span>
        <span className="tag">{rate.toFixed(1)} MB/s · đỉnh {peakRate.toFixed(1)}</span>
        <span className="tag">{mb(stats.bytes)} MB · {stats.flushes} flush · ~{avgChunk}B/chunk</span>
        {firstByteMs !== null && <span className="tag">first byte {firstByteMs}ms</span>}
        {bench && <span className="tag ok">bench: {bench}</span>}
        {info && !stats.alive && stats.bytes > 0 && <span className="tag bad">shell đã thoát</span>}
        {err && <span className="tag bad">{err}</span>}
      </div>

      <div className="stage">
        <div className="term" ref={hostRef} />
        {blur && <div className="blur" />}
      </div>
    </div>
  );
}
