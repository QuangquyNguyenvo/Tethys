import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Globe, Search } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSessions } from "../store/sessions";
import { PanelHeader, type HeadAction } from "../panel/PanelHeader";
import {
  createWebHistory,
  moveWebHistory,
  normalizeWebInput,
  pushWebHistory,
  requiresExternalBrowser,
} from "./navigation";
import { NativeBrowserSurface } from "./NativeBrowserSurface";
import { useSurfaceBlocked } from "./surfaceVisibility";
import {
  goNative,
  navigateNative,
  reloadNative,
  setNativeMemoryTarget,
  subscribeNativeState,
  supportsNativeBrowser,
  type NativeBrowserState,
} from "./nativeBrowser";
import {
  claimSurfaceSlot,
  MAX_NATIVE_SURFACES,
  releaseSurfaceSlot,
  touchSurfaceSlot,
} from "./surfacePool";

type Props = {
  panelKey: string;
  url?: string;
  /** Modal/palette đang mở, hoặc panel không thuộc workspace hiện tại — overlay phải biến mất. */
  suppressed?: boolean;
};

const QUICK = [
  { label: "Rust std", url: "https://doc.rust-lang.org/std/" },
  { label: "Rust Book", url: "https://doc.rust-lang.org/book/" },
  { label: "Wikipedia", url: "https://en.wikipedia.org/" },
];

const SLOW_LOAD_MS = 12_000;
type LoadState = "idle" | "loading" | "ready" | "slow";
type NativeState = "unavailable" | "starting" | "ready" | "failed" | "parked";

/**
 * Panel duyệt web, đặt ngang hàng với terminal và explorer đúng như cách Wave Term xếp
 * widget: mọi thứ đều là một ô trong lưới, không có cái nào là "cửa sổ chính".
 *
 * Trong app Tauri, nội dung là một **WebView2 thật** nằm trong cửa sổ không viền bám lên
 * ô này (`NativeBrowserSurface`), nên trang gửi `X-Frame-Options: DENY` như GitHub vẫn mở
 * bình thường, và back/forward/reload/địa chỉ đều đọc từ trang thật qua `nativeBrowser.ts`.
 *
 * Chạy trong trình duyệt thường (Vite dev) thì không có native, và fallback là `<iframe>`:
 * ở nhánh đó trang nào chặn nhúng sẽ hiện trắng, nên các host đã biết được mở ra ngoài,
 * còn lịch sử tiến/lùi chỉ theo dõi những lần điều hướng do thanh địa chỉ này thực hiện.
 *
 * ⚠️ Đã thử **webview con native** (`Window::add_child`, feature `unstable` của Tauri) và
 * **hỏng**: trên Tauri 2.11.5 + wry 0.55.1 + WebView2, webview con được tạo (CDP thấy nó
 * như một target) nhưng không nạp trang nào — cả URL ngoài lẫn `http://localhost`, và tô
 * nền đỏ cũng không thấy nó ở đâu. Chi tiết ở `plans/terminal-workspace/CHECKLIST.md`.
 * Đừng thử lại hướng đó nếu không có bản Tauri mới hơn.
 */
export function WebPanel({ panelKey, url, suppressed = false }: Props) {
  const updatePanel = useSessions((s) => s.updatePanel);
  const focusPanel = useSessions((s) => s.focus);
  const focused = useSessions((s) => s.focused === panelKey);
  const [input, setInput] = useState(url ?? "");
  const [nonce, setNonce] = useState(0);
  const [history, setHistory] = useState(() => createWebHistory(url));
  const [loadState, setLoadState] = useState<LoadState>(url ? "loading" : "idle");
  const nativeAvailable = supportsNativeBrowser();
  const [nativeState, setNativeState] = useState<NativeState>(
    nativeAvailable && url ? "starting" : "unavailable",
  );
  const [nativeLabel, setNativeLabel] = useState<string | null>(null);
  const [native, setNative] = useState<NativeBrowserState | null>(null);
  const loadTimer = useRef<number | null>(null);
  /** Điều hướng người dùng yêu cầu trước khi overlay kịp sẵn sàng; phát lại khi ready. */
  const pendingNav = useRef<string | null>(null);

  // Palette/Settings đang mở thì overlay phải biến mất, cộng thêm lý do riêng của tile
  // (không thuộc workspace hiện tại, đang trong animation chuyển workspace).
  const shellBlocked = useSurfaceBlocked();
  const hideSurface = suppressed || shellBlocked;

  const current = url ?? "";
  const nativeReady = nativeState === "ready" && nativeLabel !== null;
  /** Native không còn là đường đi thì iframe phải nhận lại luật "host này chặn nhúng". */
  const useIframe = !nativeAvailable || nativeState === "failed" || nativeState === "parked";
  const wantsSurface = nativeAvailable && nativeState !== "failed" && nativeState !== "parked";

  const clearLoadTimer = useCallback(() => {
    if (loadTimer.current !== null) {
      window.clearTimeout(loadTimer.current);
      loadTimer.current = null;
    }
  }, []);

  useEffect(() => {
    setInput(current);
    if (current) setHistory((state) => pushWebHistory(state, current));
  }, [current]);

  useEffect(() => {
    clearLoadTimer();
    if (!current) {
      setLoadState("idle");
      return;
    }
    setLoadState("loading");
    loadTimer.current = window.setTimeout(() => {
      loadTimer.current = null;
      setLoadState((state) => (state === "loading" ? "slow" : state));
    }, SLOW_LOAD_MS);
    return clearLoadTimer;
  }, [current, nonce, clearLoadTimer]);

  useEffect(() => {
    if (!nativeAvailable || !current) {
      setNativeState("unavailable");
      setNativeLabel(null);
      setNative(null);
      return;
    }
    setNativeState((state) => (state === "unavailable" ? "starting" : state));
  }, [current, nativeAvailable]);

  // Chrome phản ánh trang thật: URL, tiêu đề, loading và cả back/forward đều do WebView2
  // báo lên, nên bấm link *bên trong* trang cũng cập nhật đúng.
  useEffect(() => {
    if (!nativeLabel) return;
    return subscribeNativeState(nativeLabel, (state) => {
      setNative(state);
      if (state.loading) {
        setLoadState("loading");
      } else {
        clearLoadTimer();
        setLoadState("ready");
      }
      if (state.url && state.url !== current) {
        updatePanel(panelKey, { url: state.url });
      }
    });
  }, [nativeLabel, current, panelKey, updatePanel, clearLoadTimer]);

  const openExternal = (
    target = current || normalizeWebInput(input) || "https://duckduckgo.com/",
  ) => {
    invoke("fs_open_external", { path: target }).catch(() => {});
  };

  const failNative = (message: string) => {
    setNativeState("failed");
    setNativeLabel(null);
    setNative(null);
    setLoadState("loading");
    invoke("frontend_error", { message: `native browser fell back to iframe: ${message}` }).catch(
      () => {},
    );
  };

  /** Bật lại native cho panel đã nhường chỗ; panel khác sẽ bị park nếu pool lại đầy. */
  const resumeNative = () => {
    setNativeState("starting");
    focusPanel(panelKey);
  };

  /** Reload thật khi có native, bump nonce để dựng lại iframe khi không có. */
  const reloadCurrent = () => {
    if (nativeReady && nativeLabel) {
      reloadNative(nativeLabel).catch((error) => failNative(String(error)));
      return;
    }
    setNonce((value) => value + 1);
  };

  // Giữ trần số overlay: panel ít dùng nhất nhường chỗ cho panel vừa mở, và nó chỉ
  // rơi về iframe chứ không mất URL. Không có bước này thì mở bao nhiêu Browser panel
  // là bấy nhiêu renderer WebView2 sống song song.
  useEffect(() => {
    if (!wantsSurface || !current) return;
    claimSurfaceSlot(panelKey, () => setNativeState("parked"));
    return () => releaseSurfaceSlot(panelKey);
  }, [panelKey, wantsSurface, current]);

  useEffect(() => {
    if (focused) touchSurfaceSlot(panelKey);
  }, [focused, panelKey]);

  // Panel đang bị che thì hạ mục tiêu bộ nhớ của renderer, hiện lại thì trả về Normal.
  // Đây là mức gợi ý cho WebView2, không phải suspend: trang không bị đóng băng.
  useEffect(() => {
    if (!nativeReady || !nativeLabel) return;
    setNativeMemoryTarget(nativeLabel, hideSurface).catch(() => {});
  }, [nativeReady, nativeLabel, hideSurface]);

  // Renderer của overlay chết thì cửa sổ vẫn còn nhưng trắng. Backend báo lên đây để
  // panel đóng nó và quay về iframe kèm banner, thay vì để lại một ô trống im lặng.
  useEffect(() => {
    if (!nativeLabel) return;
    let unlisten: (() => void) | null = null;
    let disposed = false;
    listen<string>("browser-failed", (event) => {
      if (event.payload === nativeLabel) failNative("the page process stopped responding");
    })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeLabel]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let disposed = false;

    // WebView2 bắt F5 ở tầng native trước cả document, đặc biệt khi focus nằm trong
    // trang khác origin. Backend chặn việc reload nguyên Tethys rồi phát tín hiệu này;
    // chỉ panel web đang được chọn mới nạp lại nội dung của chính nó.
    listen<string>("app-shortcut", (event) => {
      if (event.payload === "reload-web" && useSessions.getState().focused === panelKey) {
        reloadCurrent();
      }
    })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => {});

    const onFallbackReload = () => {
      if (useSessions.getState().focused === panelKey) reloadCurrent();
    };
    window.addEventListener("tethys:web-reload", onFallbackReload);

    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener("tethys:web-reload", onFallbackReload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelKey, nativeReady, nativeLabel]);

  const commit = (next: string, pushHistory = true) => {
    const normalized = normalizeWebInput(next);
    if (!normalized) return;
    if (useIframe && requiresExternalBrowser(normalized)) {
      setInput(normalized);
      openExternal(normalized);
      return;
    }
    setInput(normalized);
    if (pushHistory) setHistory((state) => pushWebHistory(state, normalized));

    if (nativeAvailable && nativeState !== "failed") {
      if (nativeReady && nativeLabel) {
        // Overlay đã tồn tại: điều hướng tại chỗ, không dựng lại cửa sổ.
        navigateNative(nativeLabel, normalized).catch((error) => failNative(String(error)));
      } else {
        pendingNav.current = normalized;
      }
      if (normalized !== current) updatePanel(panelKey, { url: normalized });
      return;
    }

    if (normalized === current) reloadCurrent();
    else updatePanel(panelKey, { url: normalized });
  };

  const goRelative = (step: -1 | 1) => {
    if (nativeReady && nativeLabel) {
      goNative(nativeLabel, step === 1).catch((error) => failNative(String(error)));
      return;
    }
    const result = moveWebHistory(history, step);
    if (!result) return;
    setHistory(result.history);
    setInput(result.target);
    if (result.target === current) reloadCurrent();
    else updatePanel(panelKey, { url: result.target });
  };

  const displayUrl = nativeReady ? native?.url || current : current;

  const host = useMemo(() => {
    try {
      return displayUrl ? new URL(displayUrl).host : "";
    } catch {
      return "";
    }
  }, [displayUrl]);

  const canGoBack = nativeReady
    ? (native?.canGoBack ?? false)
    : history.index > 0;
  const canGoForward = nativeReady
    ? (native?.canGoForward ?? false)
    : history.index >= 0 && history.index < history.entries.length - 1;

  const actions: HeadAction[] = [
    {
      id: "back",
      label: "Back",
      icon: <path d="M15 18l-6-6 6-6" />,
      onClick: () => goRelative(-1),
      disabled: !canGoBack,
    },
    {
      id: "fwd",
      label: "Forward",
      icon: <path d="M9 18l6-6-6-6" />,
      onClick: () => goRelative(1),
      disabled: !canGoForward,
    },
    {
      id: "reload",
      label: "Reload",
      icon: (
        <>
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </>
      ),
      onClick: reloadCurrent,
      inline: true,
    },
    {
      id: "external",
      label: "Open in external browser",
      icon: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
      onClick: () => openExternal(),
      inline: true,
    },
  ];

  return (
    <div className="panel web-panel">
      <PanelHeader
        panelKey={panelKey}
        kind="web"
        icon={<Globe size={13} />}
        title={(nativeReady && native?.title) || host || "Web"}
        subtitle={displayUrl}
        actions={actions}
      />

      <form
        className="web-bar"
        onSubmit={(e) => {
          e.preventDefault();
          commit(input);
        }}
      >
        <Search size={12} />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter an address or search term, then press Enter"
          spellCheck={false}
        />
      </form>

      <div className="web-view">
        {current ? (
          <>
            {wantsSurface && (
              <NativeBrowserSurface
                panelKey={panelKey}
                initialUrl={current}
                hidden={hideSurface}
                onReady={(label) => {
                  setNativeLabel(label);
                  setNativeState("ready");
                  const pending = pendingNav.current;
                  pendingNav.current = null;
                  if (pending) {
                    navigateNative(label, pending).catch((error) => failNative(String(error)));
                  } else {
                    clearLoadTimer();
                    setLoadState("ready");
                  }
                }}
                onError={failNative}
                onFocus={() => focusPanel(panelKey)}
              />
            )}
            {!nativeReady && (
              <iframe
                key={"fallback-" + current + "#" + nonce}
                src={current}
                title="web"
                aria-busy={loadState === "loading"}
                onFocus={() => focusPanel(panelKey)}
                onLoad={() => {
                  if (nativeAvailable && nativeState !== "failed") return;
                  clearLoadTimer();
                  setLoadState("ready");
                }}
                onError={() => {
                  if (useIframe) setLoadState("slow");
                }}
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals allow-popups allow-popups-to-escape-sandbox"
              />
            )}
          </>
        ) : (
          <div className="web-start">
            <p>Enter an address above, or open one of these:</p>
            <div className="web-quick">
              {QUICK.map((q) => (
                <button key={q.url} onClick={() => commit(q.url)}>
                  {q.label}
                </button>
              ))}
            </div>
            <button className="web-open-default" onClick={() => openExternal()}>
              Open default browser
            </button>
            <p className="web-note">
              Known sites that block embedding open externally. If another page stays blank, use
              the external-browser button in the top bar.
            </p>
          </div>
        )}
        {loadState === "loading" && (
          <div className="web-loading" role="status" aria-live="polite">
            <span /> Loading…
          </div>
        )}
        {nativeState === "parked" && (
          <div className="web-recovery" role="status">
            <strong>Paused the native view to save memory.</strong>
            <span>
              Tethys keeps at most {MAX_NATIVE_SURFACES} native browser views open at once.
            </span>
            <div>
              <button onClick={resumeNative}>Resume native view</button>
              <button onClick={() => openExternal()}>Open externally</button>
            </div>
          </div>
        )}
        {loadState === "slow" && (
          <div className="web-recovery" role="alert">
            <strong>This page is taking longer than expected.</strong>
            <span>It may be offline or may block embedded browsers.</span>
            <div>
              <button onClick={reloadCurrent}>Retry</button>
              <button onClick={() => openExternal()}>Open externally</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
