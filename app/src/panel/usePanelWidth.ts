import { useLayoutEffect, useRef, useState } from "react";

/**
 * Đo bề ngang thật của một phần tử.
 *
 * Cần đo bằng JS chứ không chỉ `@container`: thu hẹp panel không được phép làm nút
 * *biến mất* — nút phải dồn vào menu tràn, mà menu tràn thì phải biết lúc nào cần dựng.
 * CSS thuần chỉ giấu được, không gom được.
 */
export function usePanelWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const w = el.getBoundingClientRect().width;
      setWidth((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, width };
}
