import { useEffect, useRef, useState, type CSSProperties } from "react";
import { MonitorCog } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { PanelHeader } from "../panel/PanelHeader";
import { AsciiAudioWave } from "./AsciiAudioWave";

/** Phần tĩnh — backend đọc một lần, không đổi trong suốt phiên chạy. */
type SystemInfo = {
  os: string;
  version: string;
  kernel: string;
  arch: string;
  hostname: string;
  user: string;
  shell: string;
  cpu: string;
  cores: number;
  gpu: string;
};

/**
 * Phần động — backend đo lại mỗi giây.
 */
type SystemMetrics = {
  memoryTotal: number;
  memoryAvailable: number;
  uptimeSeconds: number;
  cpuUsage: number | null;
  diskRead: number | null;
  diskWrite: number | null;
  netRx: number | null;
  netTx: number | null;
};

const LOGO = [
  "          ▄████████████▄          ",
  "       ▄██████████████████▄       ",
  "     ▄██████████████████████▄     ",
  "    ██████████████████████████    ",
  "     ▀██████████████████████▀     ",
  "        ▀████████████████▀        ",
  "      ▄██▀  ▀██▄  ██  ▄██▀  ▀██▄  ",
  "    ▄██▀      ▀██▄██▄██▀      ▀██▄",
  "  ▄██▀          ▀████▀          ▀██▄",
  " ███              ██              ███",
  "  ▀██▄          ▄████▄          ▄██▀",
  "    ▀██▄      ▄██▀  ▀██▄      ▄██▀  ",
  "      ▀██▄  ▄██▀      ▀██▄  ▄██▀    ",
  "        ▀████▀          ▀████▀      ",
];
const LOGO_RULE = "    ────────  T E T H Y S  ────────";

const BAR_WIDTH = 16;
const BAR_CELLS = "░".repeat(BAR_WIDTH);
const BAR_FILL = "█".repeat(BAR_WIDTH);

const mib = (value: number) => `${Math.round(value / 1024 / 1024)}MiB`;

function uptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days) parts.push(`${days} ngày`);
  if (hours) parts.push(`${hours} giờ`);
  if (mins || !parts.length) parts.push(`${mins} phút`);
  return parts.join(", ");
}

export function SystemPanel({ panelKey }: { panelKey: string }) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [live, setLive] = useState<SystemMetrics | null>(null);
  const [showAudioWave, setShowAudioWave] = useState(false);

  // Chỉ mount animation khi chính panel đủ rộng; panel hẹp giữ bố cục neofetch gọn.
  useEffect(() => {
    const node = panelRef.current;
    if (!node) return;
    const update = () => setShowAudioWave(node.clientWidth >= 720);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    invoke<SystemInfo>("system_info").then((next) => alive && setInfo(next)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      invoke<SystemMetrics>("system_metrics")
        .then((next) => {
          if (!alive) return;
          setLive(next);
        })
        .catch(() => {});
    };
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const used = live ? Math.max(0, live.memoryTotal - live.memoryAvailable) : 0;
  const ram = live?.memoryTotal ? Math.round((used / live.memoryTotal) * 100) : 0;
  const cpu = live?.cpuUsage ?? null;

  const user = info?.user ?? "";
  const host = info?.hostname ?? "";
  const title = user && host ? `${user}@${host}` : "";

  type Row = { label: string; value: string; meter?: number };
  const rows: Row[] = [];
  const push = (label: string, value: string, meter?: number) => {
    if (value.trim()) rows.push({ label, value, meter });
  };
  if (info) {
    push("OS", [info.os, info.version, info.arch].filter(Boolean).join(" "));
    push("Kernel", info.kernel);
    push("Shell", info.shell);
    push("Terminal", "Tethys");
    push("GPU", info.gpu);
  }
  if (live) push("Uptime", uptime(live.uptimeSeconds));
  if (info) push("CPU", info.cores ? `${info.cpu} (${info.cores})` : info.cpu);
  if (cpu !== null) push("Load", `${cpu.toFixed(1)}%`, cpu);
  if (live?.memoryTotal) push("Memory", `${mib(used)} / ${mib(live.memoryTotal)}`, ram);

  return (
    <div ref={panelRef} className="panel system-panel terminal-panel">
      <PanelHeader
        panelKey={panelKey}
        kind="system"
        icon={<MonitorCog size={13} />}
        title="sysfetch"
        subtitle={title}
      />

      <div className="sysfetch-container" aria-live="polite">
        <div className="sysfetch-stack">
          <div className="sysfetch-main">
            <pre className="sysfetch-logo" aria-hidden="true">
              {LOGO.map((line, i) => (
                <span className="line" key={i} style={{ "--i": i } as CSSProperties}>
                  {line}
                </span>
              ))}
              <span className="line rule" style={{ "--i": LOGO.length } as CSSProperties}>
                {LOGO_RULE}
              </span>
            </pre>

            <pre className="sysfetch-out">
              {title ? (
                <>
                  <span className="line head" style={{ "--i": 0 } as CSSProperties}>
                    <b>{user}</b>@<b>{host}</b>
                  </span>
                  <span className="line rule" style={{ "--i": 1 } as CSSProperties}>
                    {"-".repeat(title.length)}
                  </span>
                </>
              ) : null}

              {rows.map((row, i) => (
                <span className="line" key={row.label} style={{ "--i": i + 2 } as CSSProperties}>
                  <b>{row.label}</b>: {row.value}
                  {row.meter === undefined ? null : (
                    <span className="meter" style={{ "--p": `${row.meter}%` } as CSSProperties}>
                      <span className="track">{BAR_CELLS}</span>
                      <span className="fill">{BAR_FILL}</span>
                    </span>
                  )}
                </span>
              ))}

              <span className="caret" aria-hidden="true">
                █
              </span>
            </pre>
          </div>

          {showAudioWave && <AsciiAudioWave />}
        </div>
      </div>
    </div>
  );
}
