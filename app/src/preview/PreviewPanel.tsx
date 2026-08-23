import { useEffect, useState } from "react";
import { Code, ExternalLink, FileDiff, FileText, Image } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ImagePreview } from "./ImagePreview";
import { MarkdownPreview } from "./MarkdownPreview";
import { DiffPreview } from "./DiffPreview";
import { PanelHeader, type HeadAction } from "../panel/PanelHeader";

type Props = {
  panelKey: string;
  path: string;
  mode?: "auto" | "image" | "markdown" | "diff" | "text";
};

type FileStat = {
  size_bytes: number;
  modified_ms: number;
  is_file: boolean;
};

export function PreviewPanel({ panelKey, path, mode = "auto" }: Props) {
  const [content, setContent] = useState<string>("");
  const [stat, setStat] = useState<FileStat | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"rendered" | "raw">("rendered");

  const ext = getExtension(path);
  const detectedType = detectType(ext, mode);

  useEffect(() => {
    let cancelled = false;

    const loadData = () => {
      invoke<FileStat>("fs_stat", { path })
        .then((st) => {
          if (!cancelled) setStat(st);
        })
        .catch(() => {});

      if (detectedType === "image") {
        setLoading(false);
        return;
      }

      invoke<string>("fs_read_text", { path })
        .then((txt) => {
          if (!cancelled) {
            setContent(txt);
            setLoading(false);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setError(String(err));
            setLoading(false);
          }
        });
    };

    setLoading(true);
    setError(null);
    loadData();

    // Bắt đầu theo dõi file trên đĩa
    invoke("watch_file", { path }).catch(() => {});

    // Lắng nghe sự kiện thay đổi để tự động làm mới
    const unlistenPromise = listen<{ path: string }>("preview:file-changed", (event) => {
      if (cancelled) return;
      const changedPath = event.payload.path.toLowerCase().replace(/\\/g, "/");
      const currentPath = path.toLowerCase().replace(/\\/g, "/");
      if (
        changedPath === currentPath ||
        currentPath.endsWith(changedPath) ||
        changedPath.endsWith(currentPath)
      ) {
        loadData();
      }
    });

    return () => {
      cancelled = true;
      invoke("unwatch_file", { path }).catch(() => {});
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
    };
  }, [path, detectedType]);

  const handleOpenExternal = () => {
    invoke("fs_open_external", { path }).catch((e) => {
      console.error("Không thể mở app ngoài:", e);
    });
  };

  const basename = path.split(/[/\\]/).pop() ?? path;
  const dirname = path.slice(0, Math.max(0, path.length - basename.length));

  const actions: HeadAction[] = [];
  if (detectedType === "markdown" || detectedType === "diff") {
    actions.push({
      id: "raw",
      label: viewMode === "rendered" ? "Xem dạng thô" : "Xem định dạng",
      inline: true,
      active: viewMode === "raw",
      icon: <Code size={12} />,
      onClick: () => setViewMode((m) => (m === "rendered" ? "raw" : "rendered")),
    });
  }
  actions.push({
    id: "external",
    label: "Mở bằng app ngoài",
    icon: <ExternalLink size={12} />,
    onClick: handleOpenExternal,
  });

  return (
    <div className="panel preview-panel">
      <PanelHeader
        panelKey={panelKey}
        kind="preview"
        icon={renderTypeIcon(detectedType)}
        title={basename}
        subtitle={dirname || "."}
        chips={
          <>
            {stat && <span className="chip">{formatBytes(stat.size_bytes)}</span>}
            {dimensions && (
              <span className="chip">
                {dimensions.width}×{dimensions.height}
              </span>
            )}
          </>
        }
        actions={actions}
      />

      <div className="pv">
        {loading && <div className="pv-loading">Đang đọc file…</div>}
        {error && <div className="pv-err">{error}</div>}
        {!loading && !error && (
          <>
            {detectedType === "image" && (
              <ImagePreview path={path} onDimensions={setDimensions} />
            )}
            {detectedType === "markdown" && (
              viewMode === "rendered" ? (
                <MarkdownPreview content={content} />
              ) : (
                <pre className="pv-raw"><code>{content}</code></pre>
              )
            )}
            {detectedType === "diff" && (
              viewMode === "rendered" ? (
                <DiffPreview content={content} />
              ) : (
                <pre className="pv-raw"><code>{content}</code></pre>
              )
            )}
            {detectedType === "text" && (
              <pre className="pv-raw"><code>{content}</code></pre>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function getExtension(p: string): string {
  const name = p.split(/[/\\]/).pop() ?? "";
  const idx = name.lastIndexOf(".");
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : "";
}

function detectType(ext: string, mode: Props["mode"]): "image" | "markdown" | "diff" | "text" {
  if (mode && mode !== "auto") return mode;
  if (["png", "jpg", "jpeg", "svg", "webp", "gif", "ico", "bmp"].includes(ext)) {
    return "image";
  }
  if (["md", "markdown"].includes(ext)) {
    return "markdown";
  }
  if (["diff", "patch"].includes(ext)) {
    return "diff";
  }
  return "text";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderTypeIcon(type: "image" | "markdown" | "diff" | "text") {
  if (type === "image") return <Image size={13} />;
  if (type === "diff") return <FileDiff size={13} />;
  return <FileText size={13} />;
}
