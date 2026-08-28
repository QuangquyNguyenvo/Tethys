/**
 * Trần số WebView2 native mở cùng lúc.
 *
 * WebView2 dùng chung một browser process, nhưng **mỗi** overlay vẫn kéo theo renderer và
 * GPU work riêng của nó. Mở mười Browser panel là mười renderer, và không có gì trong
 * Tethys tự dừng lại — nên chỗ dừng phải được viết ra ở đây.
 *
 * Panel bị đẩy ra khỏi pool không mất gì: URL vẫn nằm trong store, panel quay về iframe và
 * có nút bật lại native. Đây là nhường chỗ, không phải đóng tab.
 */
export const MAX_NATIVE_SURFACES = 4;

type Entry = {
  /** Lần cuối panel này được focus. LRU tính theo đây, nên panel đang dùng không bao giờ bị đẩy. */
  touched: number;
  park: () => void;
};

const entries = new Map<string, Entry>();

const debugEnabled = () => {
  try {
    return localStorage.getItem("tethys:browser-debug") === "1";
  } catch {
    return false;
  }
};

const trace = (event: string, panelKey: string) => {
  if (!debugEnabled()) return;
  console.info(`[browser-pool] ${event} ${panelKey} (open=${entries.size})`);
};

/**
 * Xin một chỗ trong pool. Vượt trần thì panel ít dùng nhất bị park để nhường chỗ,
 * và panel vừa xin luôn là panel mới nhất nên nó không tự đẩy chính mình.
 */
export function claimSurfaceSlot(panelKey: string, park: () => void) {
  entries.set(panelKey, { touched: Date.now(), park });
  trace("claim", panelKey);

  while (entries.size > MAX_NATIVE_SURFACES) {
    let oldestKey: string | null = null;
    let oldest = Infinity;
    for (const [key, entry] of entries) {
      if (key === panelKey) continue;
      if (entry.touched < oldest) {
        oldest = entry.touched;
        oldestKey = key;
      }
    }
    if (!oldestKey) break;
    const victim = entries.get(oldestKey)!;
    entries.delete(oldestKey);
    trace("park", oldestKey);
    victim.park();
  }
}

export function touchSurfaceSlot(panelKey: string) {
  const entry = entries.get(panelKey);
  if (entry) entry.touched = Date.now();
}

export function releaseSurfaceSlot(panelKey: string) {
  if (entries.delete(panelKey)) trace("release", panelKey);
}

export function nativeSurfaceCount() {
  return entries.size;
}
