import { useCallback, useEffect, useRef } from "react";
import { useSessions } from "../store/sessions";

/** Kéo quá ngần này px mới tính là kéo. Dưới ngưỡng thì vẫn là một cú click bình thường. */
const THRESHOLD = 5;

/**
 * Kéo panel bằng Pointer Events thay vì HTML5 drag-and-drop.
 *
 * Lý do bắt buộc phải đổi: Tauri bật `dragDropEnabled` (mặc định, và app cần nó để nhận
 * file kéo từ Explorer vào). Trên Windows, handler kéo-thả cấp OS của WebView2 nuốt luôn
 * `dragstart`/`dragover`/`drop` bên trong trang — nên cách cũ im lặng không chạy.
 *
 * Pointer Events không đi qua đường đó, lại còn cho `setPointerCapture` nên con trỏ có
 * lướt qua canvas WebGL của xterm cũng không mất sự kiện.
 */
export function usePanelDrag(panelKey?: string, allowInteractiveTarget = false) {
  const activeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => activeCleanupRef.current?.(), []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!panelKey || e.button !== 0) return;
      // Nút bấm trên thanh tiêu đề phải bấm được, không biến thành tay cầm kéo.
      if (!allowInteractiveTarget && (e.target as HTMLElement).closest("button, input, a")) return;

      activeCleanupRef.current?.();

      const el = e.currentTarget;
      const pointerId = e.pointerId;
      const startX = e.clientX;
      const startY = e.clientY;
      let started = false;
      let finished = false;
      let frame: number | null = null;
      let pendingPoint: { x: number; y: number } | null = null;
      let sessionCleanup: (() => void) | null = null;

      const store = useSessions.getState;

      // High polling-rate mice can deliver several pointer events between two paints.
      // The overlay only needs the newest coordinate for that frame; committing every
      // event would rerender the whole tile layer at 120–240 Hz for no visible benefit.
      const flushPoint = () => {
        frame = null;
        if (!pendingPoint) return;
        const point = pendingPoint;
        pendingPoint = null;
        store().updateDrag(point.x, point.y);
      };

      const schedulePoint = (x: number, y: number) => {
        pendingPoint = { x, y };
        if (frame === null) frame = requestAnimationFrame(flushPoint);
      };

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        if (!started) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < THRESHOLD) return;
          started = true;
          try {
            el.setPointerCapture(pointerId);
          } catch {
            /* con trỏ đã rời khỏi phần tử — vẫn theo dõi được qua listener trên window */
          }
          document.body.classList.add("dragging-panel");
          store().beginDrag(panelKey, ev.clientX, ev.clientY);
          return;
        }
        schedulePoint(ev.clientX, ev.clientY);
      };

      const detach = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("keydown", onKey, true);
        try {
          if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
        } catch {
          /* không giữ capture thì cũng không cần nhả */
        }
      };

      const finish = (commit: boolean, point?: { x: number; y: number }) => {
        if (finished) return;
        finished = true;
        detach();
        if (frame !== null) {
          cancelAnimationFrame(frame);
          frame = null;
        }
        if (started) {
          if (commit && point) pendingPoint = point;
          if (commit) flushPoint();
          else pendingPoint = null;
          started = false;
          store().endDrag(commit);
        } else {
          pendingPoint = null;
        }
        document.body.classList.remove("dragging-panel");
        if (activeCleanupRef.current === sessionCleanup) activeCleanupRef.current = null;
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId === pointerId) finish(true, { x: ev.clientX, y: ev.clientY });
      };
      const onCancel = (ev: PointerEvent) => {
        if (ev.pointerId === pointerId) finish(false);
      };
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key !== "Escape" || !started) return;
        ev.preventDefault();
        ev.stopPropagation();
        finish(false);
      };

      sessionCleanup = () => finish(false);
      activeCleanupRef.current = sessionCleanup;

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("keydown", onKey, true);
    },
    [panelKey, allowInteractiveTarget],
  );

  return { onPointerDown };
}
