import { useMemo, useRef, useState } from "react";
import { Globe, Search } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useSessions } from "../store/sessions";
import { PanelHeader, type HeadAction } from "../panel/PanelHeader";

type Props = {
  panelKey: string;
  url?: string;
};

const QUICK = [
  { label: "MDN", url: "https://developer.mozilla.org/" },
  { label: "Rust std", url: "https://doc.rust-lang.org/std/" },
  { label: "Tauri", url: "https://tauri.app/" },
  { label: "Wikipedia", url: "https://vi.wikipedia.org/" },
];

/**
 * Panel duyệt web, đặt ngang hàng với terminal và explorer đúng như cách Wave Term xếp
 * widget: mọi thứ đều là một ô trong lưới, không có cái nào là "cửa sổ chính".
 *
 * Giới hạn phải nói thẳng: đây là `<iframe>`, nên trang nào gửi `X-Frame-Options: DENY`
 * hoặc `frame-ancestors 'none'` (Google, GitHub…) sẽ hiện trắng — đó là trang từ chối,
 * không phải panel hỏng. Vì vậy luôn có sẵn nút mở bằng trình duyệt ngoài.
 * Lịch sử tiến/lùi chỉ theo dõi những lần điều hướng do thanh địa chỉ này thực hiện;
 * bấm link *bên trong* trang là chuyện của origin khác, ta không đọc được.
 *
 * ⚠️ Đã thử thay iframe bằng **webview con native** (`Window::add_child`, feature `unstable`
 * của Tauri) để thoát khỏi giới hạn trên, và **hỏng**: trên Tauri 2.11.5 + wry 0.55.1 +
 * WebView2, webview con được tạo (CDP thấy nó như một target) nhưng không nạp trang nào —
 * cả URL ngoài lẫn `http://localhost`, và tô nền đỏ cũng không thấy nó ở đâu trên cửa sổ.
 * Chi tiết phép đo nằm ở `plans/terminal-workspace/CHECKLIST.md`. Đừng thử lại hướng đó nếu
 * không có bản Tauri mới hơn: mọi thứ ở đây đã được đo, không phải phỏng đoán.
 */
export function WebPanel({ panelKey, url }: Props) {
  const updatePanel = useSessions((s) => s.updatePanel);
  const [input, setInput] = useState(url ?? "");
  const [nonce, setNonce] = useState(0);
  const history = useRef<string[]>(url ? [url] : []);
  const cursor = useRef(url ? 0 : -1);

  const current = url ?? "";

  const openExternal = (target = current || normalize(input) || "https://duckduckgo.com/") => {
    invoke("fs_open_external", { path: target }).catch(() => {});
  };

  const commit = (next: string, pushHistory = true) => {
    const normalized = normalize(next);
    if (!normalized) return;
    if (pushHistory) {
      history.current = history.current.slice(0, cursor.current + 1);
      history.current.push(normalized);
      cursor.current = history.current.length - 1;
    }
    setInput(normalized);
    updatePanel(panelKey, { url: normalized });
  };

  const goRelative = (step: -1 | 1) => {
    const next = cursor.current + step;
    if (next < 0 || next >= history.current.length) return;
    cursor.current = next;
    const target = history.current[next];
    setInput(target);
    updatePanel(panelKey, { url: target });
  };

  const host = useMemo(() => {
    try {
      return current ? new URL(current).host : "";
    } catch {
      return "";
    }
  }, [current]);

  const actions: HeadAction[] = [
    {
      id: "back",
      label: "Lùi lại",
      icon: <path d="M15 18l-6-6 6-6" />,
      onClick: () => goRelative(-1),
    },
    {
      id: "fwd",
      label: "Tiến tới",
      icon: <path d="M9 18l6-6-6-6" />,
      onClick: () => goRelative(1),
    },
    {
      id: "reload",
      label: "Nạp lại",
      icon: (
        <>
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </>
      ),
      onClick: () => setNonce((n) => n + 1),
    },
    {
      id: "external",
      label: "Mở bằng trình duyệt ngoài",
      icon: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
      onClick: () => openExternal(),
    },
  ];

  return (
    <div className="panel web-panel">
      <PanelHeader
        panelKey={panelKey}
        kind="web"
        icon={<Globe size={13} />}
        title={host || "Web"}
        subtitle={current}
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
          placeholder="Nhập địa chỉ hoặc từ khoá rồi Enter"
          spellCheck={false}
        />
      </form>

      <div className="web-view">
        {current ? (
          <iframe
            key={current + "#" + nonce}
            src={current}
            title="web"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ) : (
          <div className="web-start">
            <p>Nhập địa chỉ ở trên, hoặc mở nhanh:</p>
            <div className="web-quick">
              {QUICK.map((q) => (
                <button key={q.url} onClick={() => commit(q.url)}>
                  {q.label}
                </button>
              ))}
            </div>
            <button className="web-open-default" onClick={() => openExternal()}>
              Mở trình duyệt mặc định
            </button>
            <p className="web-note">
              Trang nào chặn nhúng (Google, GitHub…) sẽ hiện trắng — dùng nút mở bằng trình
              duyệt ngoài ở thanh trên.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Có dấu chấm và không khoảng trắng thì coi là địa chỉ, còn lại đem đi tìm kiếm. */
function normalize(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[^\s]+\.[^\s]{2,}(\/.*)?$/.test(s)) return "https://" + s;
  return "https://duckduckgo.com/?q=" + encodeURIComponent(s);
}
