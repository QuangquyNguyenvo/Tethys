import type { ILink, ILinkProvider, Terminal } from "@xterm/xterm";
import { invoke } from "@tauri-apps/api/core";

// Bắt đường dẫn file tuyệt đối Windows hoặc đường dẫn tương đối có đuôi file
const PATH_REGEX =
  /(?:[a-zA-Z]:[\\/][^\s:()<>"]+|(?:(?:\.{1,2}[/\\]|[a-zA-Z0-9_.-]+[/\\])*[a-zA-Z0-9_.-]+\.(?:png|jpg|jpeg|svg|webp|gif|ico|bmp|md|markdown|diff|patch|rs|ts|tsx|js|jsx|json|toml|yaml|yml|txt|css|html|go|py|c|cpp|h|log|sh|ps1|bat|cmd)))/gi;
// Vite, Next, Astro… đều in URL localhost thẳng ra terminal. Bắt cả IP loopback để
// `npm run dev -- --host 0.0.0.0` vẫn mở được bằng Ctrl+click.
const URL_REGEX = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d{1,5})?(?:\/[^\s<>()\[\]{}"']*)?/gi;

export function registerFileLinkProvider(
  term: Terminal,
  cwd: string | undefined | (() => string | undefined),
  onOpen: (resolvedPath: string) => void,
  onOpenUrl: (url: string) => void,
) {
  const provider: ILinkProvider = {
    provideLinks(bufferLineNumber: number, callback: (links: ILink[] | undefined) => void) {
      const line = term.buffer.active.getLine(bufferLineNumber - 1);
      if (!line) {
        callback(undefined);
        return;
      }

      const text = line.translateToString(true);
      const links: ILink[] = [];

      const addLink = (start: number, target: string, activate: (event: MouseEvent, value: string) => void) => {
        const end = start + target.length - 1;
        links.push({
          range: {
            start: { x: start, y: bufferLineNumber },
            end: { x: end, y: bufferLineNumber },
          },
          text: target,
          activate,
          hover: () => {},
        });
      };

      // URL local đứng trước: nếu text vô tình có phần giống tên file thì URL vẫn là link
      // nguyên vẹn. Chỉ Ctrl/⌘ + click mới mở để click thường vẫn chọn/copy terminal được.
      let urlMatch: RegExpExecArray | null;
      URL_REGEX.lastIndex = 0;
      while ((urlMatch = URL_REGEX.exec(text)) !== null) {
        const target = urlMatch[0].replace(/[),;.!?]+$/, "");
        if (!target) continue;
        addLink(urlMatch.index + 1, target, (event, value) => {
          if (!event.ctrlKey && !event.metaKey) return;
          onOpenUrl(value);
        });
      }

      let match: RegExpExecArray | null;
      PATH_REGEX.lastIndex = 0;

      while ((match = PATH_REGEX.exec(text)) !== null) {
        let rawMatch = match[0];
        // Cắt bỏ ký tự phân cách ở cuối nếu lỡ bắt dính
        const cleanMatch = rawMatch.replace(/[):,;."']+$/, "");
        if (!cleanMatch || cleanMatch.length < 2) continue;

        const startX = match.index + 1; // xterm buffer positions are 1-indexed
        const overlapsUrl = links.some((link) =>
          startX <= link.range.end.x && startX + cleanMatch.length - 1 >= link.range.start.x,
        );
        if (overlapsUrl) continue;

        addLink(startX, cleanMatch, async (_event: MouseEvent, targetText: string) => {
            try {
              // The terminal stays mounted while CWD changes, so resolve relative links
              // from the current directory instead of the one it started in.
              const base = typeof cwd === "function" ? cwd() : cwd;
              const resolved = await invoke<string>("fs_resolve_path", {
                base,
                target: targetText,
              });
              if (resolved) {
                onOpen(resolved);
              }
            } catch (err) {
              console.warn("Could not open file from terminal link:", err);
            }
        });
      }

      links.sort((a, b) => a.range.start.x - b.range.start.x);
      callback(links.length > 0 ? links : undefined);
    },
  };

  return term.registerLinkProvider(provider);
}
