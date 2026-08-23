import { useEffect, useRef, useState, type CSSProperties } from "react";
import { MonitorCog } from "lucide-react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { PanelHeader } from "../panel/PanelHeader";
import { AsciiAudioWave } from "./AsciiAudioWave";
import { useThemeStore } from "../theme/useTheme";

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

type NowPlaying = {
  title: string;
  artist: string;
};

const LOGO = [
  "████████╗███████╗████████╗██╗  ██╗██╗   ██╗███████╗",
  "╚══██╔══╝██╔════╝╚══██╔══╝██║  ██║╚██╗ ██╔╝██╔════╝",
  "   ██║   █████╗     ██║   ███████║ ╚████╔╝ ███████╗",
  "   ██║   ██╔══╝     ██║   ██╔══██║  ╚██╔╝  ╚════██║",
  "   ██║   ███████╗   ██║   ██║  ██║   ██║   ███████║",
  "   ╚═╝   ╚══════╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝   ╚══════╝",
];
const LOGO_RULE = "──────────────  T E T H Y S  ──────────────";

const BAR_WIDTH = 16;
const BAR_CELLS = "░".repeat(BAR_WIDTH);
const BAR_FILL = "█".repeat(BAR_WIDTH);

const mib = (value: number) => `${Math.round(value / 1024 / 1024)}MiB`;

function uptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins || !parts.length) parts.push(`${mins}m`);
  return parts.join(", ");
}

type FetchDensity = "compact" | "standard" | "expanded";

export function SystemPanel({ panelKey, visible = true }: { panelKey: string; visible?: boolean }) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const densityRef = useRef<FetchDensity>("standard");
  const customLogoPath = useThemeStore((s) => s.opts.sysfetchLogoPath);
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [live, setLive] = useState<SystemMetrics | null>(null);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [showAudioWave, setShowAudioWave] = useState(false);
  const [density, setDensity] = useState<FetchDensity>("standard");
  const [customLogoFailed, setCustomLogoFailed] = useState(false);

  useEffect(() => setCustomLogoFailed(false), [customLogoPath]);

  // Nội dung được mở dần theo chính kích thước panel, không phụ thuộc kích thước cửa sổ.
  useEffect(() => {
    const node = panelRef.current;
    if (!node) return;
    let frame: number | null = null;
    const update = () => {
      frame = null;
      const { clientWidth: width, clientHeight: height } = node;
      const nextDensity: FetchDensity =
        width < 520
          ? "compact"
          : width >= 680 && height >= 620
            ? "expanded"
            : "standard";
      setShowAudioWave((current) => (current === (width >= 560) ? current : width >= 560));
      if (densityRef.current !== nextDensity) {
        densityRef.current = nextDensity;
        setDensity(nextDensity);
      }
    };
    const scheduleUpdate = () => {
      if (frame === null) frame = window.requestAnimationFrame(update);
    };
    update();
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    invoke("media_set_active", { active: true }).catch(() => {});
    const tick = () => {
      invoke<NowPlaying | null>("now_playing")
        .then((next) => alive && setNowPlaying(next))
        .catch(() => {});
    };
    tick();
    const timer = window.setInterval(tick, 2_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
      invoke("media_set_active", { active: false }).catch(() => {});
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    invoke<SystemInfo>("system_info").then((next) => alive && setInfo(next)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
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
  }, [visible]);

  const used = live ? Math.max(0, live.memoryTotal - live.memoryAvailable) : 0;
  const ram = live?.memoryTotal ? Math.round((used / live.memoryTotal) * 100) : 0;
  const cpu = live?.cpuUsage ?? null;

  const user = info?.user ?? "";
  const host = info?.hostname ?? "";
  const title = user && host ? `${user}@${host}` : "";
  const playingLabel = nowPlaying
    ? [nowPlaying.artist, nowPlaying.title].filter(Boolean).join(" — ")
    : "";

  type Row = { label: string; value: string; meter?: number };
  const rows: Row[] = [];
  const push = (label: string, value: string, meter?: number) => {
    if (value.trim()) rows.push({ label, value, meter });
  };
  if (info) {
    push("OS", [info.os, info.version, info.arch].filter(Boolean).join(" "));
    if (density !== "compact") {
      push("Kernel", info.kernel);
      push("Shell", info.shell);
      push("Terminal", "Tethys");
      push("GPU", info.gpu);
    }
  }
  if (live && density !== "compact") push("Uptime", uptime(live.uptimeSeconds));
  if (info) push("CPU", info.cores ? `${info.cpu} (${info.cores})` : info.cpu);
  if (cpu !== null) push("Load", `${cpu.toFixed(1)}%`, cpu);
  if (live?.memoryTotal) push("Memory", `${mib(used)} / ${mib(live.memoryTotal)}`, ram);

  return (
    <div ref={panelRef} className="panel system-panel terminal-panel" data-density={density}>
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
            {customLogoPath && !customLogoFailed ? (
              <div className="sysfetch-image-logo">
                <img
                  src={convertFileSrc(customLogoPath)}
                  alt="Selected sysfetch logo"
                  onError={() => setCustomLogoFailed(true)}
                />
              </div>
            ) : (
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
            )}

            <div className="sysfetch-details">
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

                {playingLabel ? (
                  <span className="sysfetch-now-playing" title={playingLabel}>
                    <span className="sysfetch-now-playing-label">NOW PLAYING</span>
                    <span className="sysfetch-now-playing-viewport">
                      <span className="sysfetch-now-playing-track">
                        <span>{playingLabel}</span>
                        <span aria-hidden="true">{playingLabel}</span>
                      </span>
                    </span>
                  </span>
                ) : density !== "compact" ? (
                  <span className="caret" aria-hidden="true">█</span>
                ) : null}
              </pre>

              {visible && showAudioWave && <AsciiAudioWave />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
