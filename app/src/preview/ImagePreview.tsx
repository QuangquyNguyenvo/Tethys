import { useState, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

type Props = {
  path: string;
  onDimensions?: (dim: { width: number; height: number }) => void;
};

export function ImagePreview({ path, onDimensions }: Props) {
  const [src, setSrc] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setSrc(convertFileSrc(path));
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [path]);

  if (error) {
    return <div className="pv-err">Không thể tải ảnh: {error}</div>;
  }

  return (
    <div className="pv-image-container">
      <img
        src={src}
        alt={path}
        className="pv-img"
        onLoad={(e) => {
          const img = e.currentTarget;
          onDimensions?.({ width: img.naturalWidth, height: img.naturalHeight });
        }}
        onError={() => setError("Lỗi giải mã ảnh")}
      />
    </div>
  );
}
