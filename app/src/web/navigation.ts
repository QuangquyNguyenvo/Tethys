export type WebHistory = {
  entries: string[];
  index: number;
};

const MAX_WEB_HISTORY = 50;

export function createWebHistory(url = ""): WebHistory {
  return url ? { entries: [url], index: 0 } : { entries: [], index: -1 };
}

export function pushWebHistory(history: WebHistory, url: string): WebHistory {
  if (!url || history.entries[history.index] === url) return history;
  const entries = [...history.entries.slice(0, history.index + 1), url].slice(-MAX_WEB_HISTORY);
  return { entries, index: entries.length - 1 };
}

export function moveWebHistory(
  history: WebHistory,
  step: -1 | 1,
): { history: WebHistory; target: string } | null {
  const index = history.index + step;
  if (index < 0 || index >= history.entries.length) return null;
  return { history: { ...history, index }, target: history.entries[index] };
}

/** Chỉ cho phép web URL; localhost mặc định HTTP, tên miền thường mặc định HTTPS. */
export function normalizeWebInput(raw: string): string {
  const value = raw.trim();
  if (!value) return "";

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  const local = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d{1,5})?(?:\/.*)?$/i.test(value);
  const domain = /^(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,}(?::\d{1,5})?(?:\/.*)?$/iu.test(value);
  if (local || domain) {
    try {
      return new URL((local ? "http://" : "https://") + value).href;
    } catch {
      return "";
    }
  }

  return "https://duckduckgo.com/?q=" + encodeURIComponent(value);
}

/** Các host đã biết gửi X-Frame-Options/CSP chặn iframe; mở ngoài tránh màn trắng giả. */
export function requiresExternalBrowser(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return host === "developer.mozilla.org" ||
      host === "tauri.app" ||
      host === "duckduckgo.com" ||
      host.endsWith(".duckduckgo.com") ||
      host === "github.com" ||
      host.endsWith(".github.com") ||
      /^(?:.+\.)?google\.[a-z.]+$/.test(host);
  } catch {
    return false;
  }
}
