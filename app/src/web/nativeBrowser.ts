import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** Trạng thái trang đọc từ WebView2 thật, không phải lịch sử mô phỏng của React. */
export type NativeBrowserState = {
  label: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
};

export function supportsNativeBrowser() {
  return "__TAURI_INTERNALS__" in window;
}

/**
 * Label cửa sổ overlay suy ra từ panelKey, nên một panel không bao giờ có hai cửa sổ.
 * Tauri chỉ nhận `a-zA-Z0-9-/:_`, còn panelKey có thể chứa bất cứ thứ gì.
 */
export function surfaceLabel(panelKey: string) {
  return "browser-" + panelKey.replace(/[^a-zA-Z0-9-/:_]/g, "-");
}

export function attachNativeBrowser(label: string) {
  return invoke<void>("browser_attach", { label });
}

export function navigateNative(label: string, url: string) {
  return invoke<void>("browser_navigate", { label, url });
}

export function reloadNative(label: string) {
  return invoke<void>("browser_reload", { label });
}

export function goNative(label: string, forward: boolean) {
  return invoke<void>("browser_go", { label, forward });
}

export function stopNative(label: string) {
  return invoke<void>("browser_stop", { label });
}

export function readNativeState(label: string) {
  return invoke<NativeBrowserState>("browser_state", { label });
}

export function setNativeMemoryTarget(label: string, low: boolean) {
  return invoke<void>("browser_set_memory_target", { label, low });
}

/** Vùng bị khoét khỏi overlay, pixel vật lý tính từ góc trên trái của chính overlay. */
export type SurfaceHole = { x: number; y: number; w: number; h: number; radius: number };

/**
 * Cắt cửa sổ overlay: bo góc dưới cho khớp tile, khoét chỗ cho dock và thanh trên.
 * Phải gọi lại mỗi lần overlay đổi kích thước hoặc UI nổi của shell dời chỗ.
 */
export function setNativeShape(label: string, radius: number, holes: SurfaceHole[]) {
  return invoke<void>("browser_set_shape", { label, radius, holes });
}

/**
 * Nhãn của mọi overlay Tauri đang mở. Chỉ chạy khi backend được bật bằng
 * `TETHYS_BROWSER_STATS`; dùng để đo lifecycle chứ không phải để điều khiển UI.
 */
export function readNativeSurfaceLabels() {
  return invoke<string[]>("browser_stats");
}

type Subscriber = (state: NativeBrowserState) => void;

const subscribers = new Map<string, Set<Subscriber>>();
let listening: Promise<() => void> | null = null;

/**
 * Một listener duy nhất cho mọi panel, chia theo `label`.
 *
 * Backend emit `browser-state` cho cả app, và một panel vừa đóng vẫn có thể còn event
 * trên đường; lọc theo label ở đây khiến event mồ côi rơi vào hư không thay vì ghi đè
 * chrome của panel khác.
 */
export function subscribeNativeState(label: string, onState: Subscriber): () => void {
  let set = subscribers.get(label);
  if (!set) {
    set = new Set();
    subscribers.set(label, set);
  }
  set.add(onState);

  if (!listening) {
    listening = listen<NativeBrowserState>("browser-state", (event) => {
      const state = event.payload;
      const targets = subscribers.get(state?.label ?? "");
      if (!targets) return;
      for (const fn of targets) fn(state);
    }).catch(() => () => {});
  }

  return () => {
    const current = subscribers.get(label);
    if (!current) return;
    current.delete(onState);
    if (current.size === 0) subscribers.delete(label);
  };
}
