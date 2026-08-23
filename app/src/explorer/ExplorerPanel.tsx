import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSessions } from "../store/sessions";
import { PanelHeader, type HeadAction } from "../panel/PanelHeader";
import { usePanelWidth } from "../panel/usePanelWidth";
import {
  ArrowUp,
  Columns2,
  Copy,
  ExternalLink,
  Eye,
  File,
  Folder,
  FolderOpen,
  RotateCw,
  Rows2,
  TerminalSquare,
} from "lucide-react";
import { ContextMenu, useContextMenu, type MenuItem } from "../ui/ContextMenu";

type DirEntryInfo = {
  name: string;
  path: string;
  is_dir: boolean;
  size_bytes: number;
  modified_ms: number;
};

type DirListing = {
  path: string;
  parent: string | null;
  entries: DirEntryInfo[];
};

type Props = {
  panelKey: string;
  path?: string;
};

/**
 * Trình duyệt tệp.
 *
 * Thay cho nút "Tài liệu README" cũ dưới dock — nút đó chỉ mở đúng một file chôn cứng
 * trong code, gặp dự án không có README là bấm ra lỗi. Explorer thì đi được mọi nơi:
 * bấm thư mục để vào, bấm file để mở Preview, và mở thẳng terminal tại thư mục đang xem.
 */
export function ExplorerPanel({ panelKey, path }: Props) {
  const [listing, setListing] = useState<DirListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const { ref: barRef, width } = usePanelWidth<HTMLDivElement>();
  const updatePanel = useSessions((s) => s.updatePanel);
  const openPreview = useSessions((s) => s.openPreview);
  const split = useSessions((s) => s.split);
  const { menu, openMenu, closeMenu } = useContextMenu();

  const load = useCallback(
    (target?: string) => {
      setLoading(true);
      invoke<DirListing>("fs_list_dir", { path: target ?? null })
        .then((res) => {
          setListing(res);
          setError(null);
          setFilter("");
          // Ghi lại vào store để đổi workspace / mở lại app vẫn đúng thư mục.
          if (res.path !== path) updatePanel(panelKey, { path: res.path });
        })
        .catch((e) => setError(String(e)))
        .finally(() => setLoading(false));
    },
    [panelKey, path, updatePanel],
  );

  useEffect(() => {
    load(path);
    // Chỉ nạp khi panel mở lần đầu; điều hướng về sau do `go()` lo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (target: string) => load(target);

  const entries = useMemo(() => {
    if (!listing) return [];
    const q = filter.trim().toLowerCase();
    return q ? listing.entries.filter((e) => e.name.toLowerCase().includes(q)) : listing.entries;
  }, [listing, filter]);

  const cur = listing?.path ?? path ?? "";
  const basename = cur.split(/[/\\]/).filter(Boolean).pop() ?? cur;

  // Đường dẫn dài thì chặng cuối mới là chặng đang đứng — cuộn về cuối, đừng để nó
  // nằm khuất bên phải trong khi phần hiện ra là "D: › Code ›".
  const crumbsRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = crumbsRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [cur, width]);

  /** Thư mục chứa mục này: thư mục thì chính nó, tệp thì thư mục đang xem. */
  const cwdFor = (e: DirEntryInfo) => (e.is_dir ? e.path : cur);

  const openTerminal = (dir: string, d: "row" | "col" = "row") =>
    split(d, { type: "terminal", cwd: dir }, panelKey);

  const copyPath = (p: string) => {
    navigator.clipboard.writeText(p).catch(() => {});
  };

  const entryMenu = (e: DirEntryInfo): MenuItem[] => [
    e.is_dir
      ? {
          id: "open",
          label: "Mở thư mục",
          icon: <FolderOpen size={13} />,
          onClick: () => go(e.path),
        }
      : {
          id: "open",
          label: "Xem trước",
          icon: <Eye size={13} />,
          onClick: () => openPreview(e.path),
        },
    {
      id: "term",
      label: e.is_dir ? "Mở terminal tại thư mục này" : "Mở terminal tại thư mục chứa",
      icon: <TerminalSquare size={13} />,
      onClick: () => openTerminal(cwdFor(e)),
    },
    {
      id: "term-down",
      label: "Mở terminal ở dưới",
      icon: <Rows2 size={13} />,
      onClick: () => openTerminal(cwdFor(e), "col"),
    },
    {
      id: "copy",
      label: "Sao chép đường dẫn",
      icon: <Copy size={13} />,
      sep: true,
      onClick: () => copyPath(e.path),
    },
    {
      id: "external",
      label: e.is_dir ? "Mở bằng File Explorer" : "Mở bằng ứng dụng mặc định",
      icon: <ExternalLink size={13} />,
      onClick: () => {
        invoke("fs_open_external", { path: e.path }).catch(() => {});
      },
    },
    {
      id: "reveal",
      label: "Hiện trong File Explorer",
      icon: <Folder size={13} />,
      onClick: () => {
        invoke("fs_reveal", { path: e.path }).catch(() => {});
      },
    },
  ];

  /** Bấm vào khoảng trống dưới danh sách — thao tác nhắm vào chính thư mục đang xem. */
  const dirMenu = (): MenuItem[] => [
    {
      id: "term",
      label: "Mở terminal tại thư mục này",
      icon: <TerminalSquare size={13} />,
      onClick: () => openTerminal(cur),
    },
    {
      id: "term-right",
      label: "Mở terminal bên phải",
      icon: <Columns2 size={13} />,
      onClick: () => openTerminal(cur, "row"),
    },
    {
      id: "up",
      label: "Lên thư mục cha",
      icon: <ArrowUp size={13} />,
      sep: true,
      disabled: !listing?.parent,
      onClick: () => listing?.parent && go(listing.parent),
    },
    {
      id: "reload",
      label: "Nạp lại",
      icon: <RotateCw size={13} />,
      onClick: () => load(cur),
    },
    {
      id: "copy",
      label: "Sao chép đường dẫn thư mục",
      icon: <Copy size={13} />,
      sep: true,
      onClick: () => copyPath(cur),
    },
    {
      id: "reveal",
      label: "Hiện trong File Explorer",
      icon: <Folder size={13} />,
      onClick: () => {
        invoke("fs_reveal", { path: cur }).catch(() => {});
      },
    },
  ];

  const actions: HeadAction[] = [
    {
      id: "up",
      label: "Lên thư mục cha",
      inline: true,
      icon: <ArrowUp size={12} />,
      onClick: () => listing?.parent && go(listing.parent),
    },
    {
      id: "reload",
      label: "Nạp lại",
      inline: true,
      icon: <RotateCw size={12} />,
      onClick: () => load(cur),
    },
    {
      id: "term-here",
      label: "Mở terminal tại thư mục này",
      icon: <TerminalSquare size={12} />,
      onClick: () => split("row", { type: "terminal", cwd: cur }, panelKey),
    },
  ];

  return (
    <div className="panel explorer-panel">
      <PanelHeader
        panelKey={panelKey}
        kind="explorer"
        icon={<Folder size={13} />}
        title={basename || "Tệp"}
        subtitle={cur}
        chips={listing && <span className="chip">{listing.entries.length} mục</span>}
        actions={actions}
      />

      {/* Đường dẫn cuộn ngang được, ô lọc giữ bề ngang cố định. Để chung một khối cuộn thì
          ô lọc trôi mất theo đường dẫn dài; panel quá hẹp thì bỏ ô lọc chứ không bóp nó. */}
      <div className="ex-bar" ref={barRef}>
        <div className="ex-crumbs" ref={crumbsRef}>
          {crumbs(cur).map((c) => (
            <button key={c.path} className="ex-crumb" onClick={() => go(c.path)} title={c.path}>
              {c.name}
            </button>
          ))}
        </div>
        {width >= 240 && (
          <input
            className="ex-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Lọc…"
            spellCheck={false}
          />
        )}
      </div>

      <div className="ex-list" onContextMenu={(e) => openMenu(e, dirMenu())}>
        {loading && <div className="pv-loading">Đang đọc thư mục…</div>}
        {error && <div className="pv-err">{error}</div>}
        {!loading && !error && entries.length === 0 && (
          <div className="pv-loading">{filter ? "Không khớp mục nào" : "Thư mục trống"}</div>
        )}
        {!loading &&
          !error &&
          entries.map((e) => (
            <button
              key={e.path}
              className={"ex-row" + (e.is_dir ? " dir" : "")}
              onClick={() => (e.is_dir ? go(e.path) : openPreview(e.path))}
              onContextMenu={(ev) => openMenu(ev, entryMenu(e))}
              title={e.path}
            >
              <span className="ex-icon">
                {e.is_dir ? <Folder size={15} /> : <File size={15} />}
              </span>
              <span className="ex-name">{e.name}</span>
              <span className="ex-meta">{e.is_dir ? "" : formatBytes(e.size_bytes)}</span>
            </button>
          ))}
      </div>

      <ContextMenu menu={menu} onClose={closeMenu} />
    </div>
  );
}

/** Cắt đường dẫn thành các chặng bấm được. Gốc ổ đĩa giữ nguyên `D:\`. */
function crumbs(p: string): { name: string; path: string }[] {
  if (!p) return [];
  const parts = p.split(/[/\\]/).filter(Boolean);
  const sep = p.includes("\\") ? "\\" : "/";
  const out: { name: string; path: string }[] = [];
  let acc = p.startsWith("/") ? "" : "";
  parts.forEach((part, i) => {
    acc = i === 0 ? (p.startsWith("/") ? sep + part : part) : acc + sep + part;
    out.push({ name: part, path: i === 0 && /^[a-zA-Z]:$/.test(part) ? part + sep : acc });
  });
  return out;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
