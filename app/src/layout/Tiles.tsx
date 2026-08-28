import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ITheme } from "@xterm/xterm";
import { TerminalPanel } from "../terminal/TerminalPanel";
import { useSessions, type Panel } from "../store/sessions";
import {
  computeLayout,
  indicatorRect,
  rootIndicatorRect,
  type GutterInfo,
  type Layout,
  type Rect,
} from "./geometry";
import { setSnapshot } from "./snapshot";
import { Icon } from "../ui/Icon";

// Terminal is the default view, while the auxiliary panels load on demand. This keeps the
// initial renderer path smaller without changing the lifetime of already-open panels.
const PreviewPanel = lazy(() => import("../preview/PreviewPanel").then(({ PreviewPanel }) => ({ default: PreviewPanel })));
const ExplorerPanel = lazy(() => import("../explorer/ExplorerPanel").then(({ ExplorerPanel }) => ({ default: ExplorerPanel })));
const WebPanel = lazy(() => import("../web/WebPanel").then(({ WebPanel }) => ({ default: WebPanel })));
const SystemPanel = lazy(() => import("../system/SystemPanel").then(({ SystemPanel }) => ({ default: SystemPanel })));

type Props = { theme?: ITheme };

/** Phải khớp `--motion-layout` trong `App.css`. */
const LAYOUT_MOTION_MS = 320;

type WorkspaceTransition = {
  leavingKeys: Set<string>;
  layout: Layout;
  /** +1 means the new workspace is to the right of the old one. */
  direction: 1 | -1;
};

const place = (r: Rect): React.CSSProperties =>
  ({
    transform: `translate(${r.x}px, ${r.y}px)`,
    width: r.w,
    height: r.h,
    // Lớp kính bên trong panel cần biết panel đang nằm ở đâu trên màn hình, để cắt đúng
    // mảng ảnh nền của chỗ đó. `transform` không đọc được từ CSS, và chính nó lại làm
    // `background-attachment: fixed` neo vào panel thay vì vào khung nhìn — nên toạ độ
    // phải được nói ra một lần nữa dưới dạng biến.
    "--px": `${r.x}px`,
    "--py": `${r.y}px`,
  }) as React.CSSProperties;

/**
 * Canvas tiling.
 *
 * Bất biến quan trọng nhất của file này: **panel không bao giờ đổi cha trong DOM.**
 * Mọi panel nằm phẳng ở một tầng duy nhất, chỉ đổi `transform` và kích thước khi cây
 * layout đổi. Bản trước lồng panel vào trong cây grid (rồi tới bản portal cũng vẫn đổi
 * container), nên mỗi lần split là React tháo `TerminalPanel` xuống — `usePty` cleanup
 * gọi `pty_kill`, shell chết, phiên agent đang chạy mất trắng. Giữ panel phẳng là cách
 * duy nhất khiến việc đó không thể xảy ra, kể cả khi đổi workspace.
 */
export function Tiles({ theme }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });

  const tree = useSessions((s) => s.tree);
  const panels = useSessions((s) => s.panels);
  const workspaces = useSessions((s) => s.workspaces);
  const activeWorkspaceId = useSessions((s) => s.activeWorkspaceId);
  const hydrated = useSessions((s) => s.hydrated);
  const drag = useSessions((s) => s.drag);
  const createPanel = useSessions((s) => s.createPanel);

  // Theo dõi kích thước canvas. Toạ độ viewport phải cập nhật cả khi cửa sổ chỉ bị dời chỗ,
  // vì kéo thả quy đổi clientX/Y qua gốc này.
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    let previous: Rect | null = null;
    let settle: number | null = null;

    // Thanh chia trượt tới vị trí mới (`.gutter` trong `App.css`), nhưng chỉ khi hình học
    // đổi vì *cây layout* đổi. Kéo mép cửa sổ thì mọi thanh chia dời chỗ liên tục theo tay
    // người dùng; để transition chạy lúc đó là chúng lết theo sau mép cửa sổ.
    // Cờ này tắt transition trong lúc kéo và bật lại khi kích thước đứng yên.
    const markWindowResize = () => {
      document.body.classList.add("resizing-window");
      if (settle !== null) window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        settle = null;
        document.body.classList.remove("resizing-window");
      }, 180);
    };

    const read = () => {
      const r = el.getBoundingClientRect();
      const next = { x: r.left, y: r.top, w: r.width, h: r.height };
      const prev = previous;
      if (prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h) {
        return;
      }
      if (!prev || prev.w !== next.w || prev.h !== next.h) markWindowResize();
      previous = next;
      setBox(next);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    window.addEventListener("resize", read);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", read);
      if (settle !== null) window.clearTimeout(settle);
      document.body.classList.remove("resizing-window");
    };
  }, []);

  const layout = useMemo(
    () => computeLayout(tree, { x: 0, y: 0, w: box.w, h: box.h }),
    [tree, box.w, box.h],
  );

  // Store cần hình học này để tính đích thả mà không phải import ngược lên đây.
  useEffect(() => {
    setSnapshot({ layout, origin: box });
    return () => setSnapshot(null);
  }, [layout, box]);

  // Panel của workspace khác vẫn phải sống (shell không được chết khi đổi tab), nhưng
  // chỉ dựng sau khi workspace đó được mở lần đầu — nếu không, mở app là spawn hết mọi shell.
  const mounted = useRef(new Set<string>());
  layout.rects.forEach((_r, k) => mounted.current.add(k));

  // Giữ lại khung cuối cùng của panel đang ẩn: đổi tab về không phải fit lại từ 0×0.
  const lastRects = useRef(new Map<string, Rect>());
  layout.rects.forEach((r, k) => lastRects.current.set(k, r));

  const allPanels = useMemo(() => {
    const map = new Map<string, Panel>();
    workspaces.forEach((w) => w.panels.forEach((p) => map.set(p.key, p)));
    panels.forEach((p) => map.set(p.key, p));
    return Array.from(map.values()).filter((p) => mounted.current.has(p.key));
  }, [workspaces, panels, layout]);

  const ready = hydrated && box.w > 0 && box.h > 0;

  // Keep both layouts at their real dimensions and animate only a visual wrapper. Terminals
  // therefore never refit on every animation frame while switching workspaces.
  const previousWorkspaceId = useRef(activeWorkspaceId);
  const workspaceTimerRef = useRef<number | null>(null);
  const [workspaceTransition, setWorkspaceTransition] = useState<WorkspaceTransition | null>(null);
  useEffect(() => () => {
    if (workspaceTimerRef.current !== null) window.clearTimeout(workspaceTimerRef.current);
  }, []);
  useLayoutEffect(() => {
    const previousId = previousWorkspaceId.current;
    if (previousId === activeWorkspaceId) return;

    const previousIndex = workspaces.findIndex((w) => w.id === previousId);
    const nextIndex = workspaces.findIndex((w) => w.id === activeWorkspaceId);
    const previous = workspaces[previousIndex];
    previousWorkspaceId.current = activeWorkspaceId;

    if (workspaceTimerRef.current !== null) {
      window.clearTimeout(workspaceTimerRef.current);
      workspaceTimerRef.current = null;
    }

    if (
      !previous ||
      box.w <= 0 ||
      box.h <= 0 ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      setWorkspaceTransition(null);
      return;
    }

    setWorkspaceTransition({
      leavingKeys: new Set(previous.panels.map((panel) => panel.key)),
      layout: computeLayout(previous.tree, { x: 0, y: 0, w: box.w, h: box.h }),
      direction: nextIndex > previousIndex ? 1 : -1,
    });
    // The timer deliberately survives ResizeObserver updates while the transition runs.
    // Tying it to this effect's cleanup used to leave the old workspace permanently visible
    // when the window changed size during the animation.
    //
    // Phải dài hơn panel vào *cuối cùng*, tức là 380ms của animation cộng bậc thang lớn
    // nhất (6 × 16ms). Hết giờ sớm thì `workspaceTransition` bị xoá giữa chừng, class
    // `entering-*` rơi khỏi phần tử, và panel nhảy phắt về vị trí cuối.
    workspaceTimerRef.current = window.setTimeout(() => {
      workspaceTimerRef.current = null;
      setWorkspaceTransition(null);
    }, 560);
  }, [activeWorkspaceId, workspaces, box.w, box.h]);

  // Bóng panel vừa đóng.
  //
  // Không giữ panel sống thêm 200ms để nó tự co lại: làm thế thì layout cũng đứng yên
  // chờ, và những panel còn lại giật một phát khi nó biến mất. Thay vào đó bỏ panel khỏi
  // cây ngay (các panel khác trượt vào chỗ trống nhờ transition ở `.panel-host`), rồi vẽ
  // một hình chữ nhật trống ở đúng khung cuối cùng của nó và cho hình đó co lại.
  const [ghosts, setGhosts] = useState<{ id: string; rect: Rect }[]>([]);
  const prevKeys = useRef<string[]>([]);
  useEffect(() => {
    const now = allPanels.map((p) => p.key);
    const gone = prevKeys.current.filter((k) => !now.includes(k));
    prevKeys.current = now;
    if (gone.length === 0) return;
    const born = gone
      .map((k) => ({ id: k + ":" + Date.now(), rect: lastRects.current.get(k) }))
      .filter((g): g is { id: string; rect: Rect } => !!g.rect);
    if (born.length === 0) return;
    setGhosts((g) => [...g, ...born]);
    const ids = new Set(born.map((b) => b.id));
    const t = setTimeout(() => setGhosts((g) => g.filter((x) => !ids.has(x.id))), 360);
    return () => clearTimeout(t);
  }, [allPanels]);

  return (
    <div
      ref={hostRef}
      className={
        "tiles" + (drag ? " is-dragging" : "") + (workspaceTransition ? " ws-switch" : "")
      }
    >
      {ready &&
        allPanels.map((p) => {
          const leaving = workspaceTransition?.leavingKeys.has(p.key) ?? false;
          const visible = layout.rects.has(p.key) || leaving;
          const rect = leaving
            ? workspaceTransition?.layout.rects.get(p.key) ?? lastRects.current.get(p.key) ?? box
            : layout.rects.get(p.key) ?? lastRects.current.get(p.key) ?? box;
          const workspaceMotion = leaving
            ? "leaving-" + (workspaceTransition?.direction === 1 ? "left" : "right")
            : workspaceTransition && layout.rects.has(p.key)
              ? "entering-" + (workspaceTransition.direction === 1 ? "right" : "left")
              : undefined;
          const workspaceOrder = leaving
            ? Array.from(workspaceTransition?.layout.rects.keys() ?? []).indexOf(p.key)
            : Array.from(layout.rects.keys()).indexOf(p.key);
          return (
            <PanelHost
              key={p.key}
              panel={p}
              rect={rect}
              visible={visible}
              theme={theme}
              workspaceMotion={workspaceMotion}
              workspaceOrder={Math.min(6, Math.max(0, workspaceOrder))}
            />
          );
        })}

      {ghosts.map((g) => (
        <div key={g.id} className="panel-ghost" style={place(g.rect)}>
          {/* Lớp trong mới là lớp co lại: `transform` của lớp ngoài đang giữ toạ độ,
              cho keyframe đặt `scale` lên đó là nó nhảy về góc canvas. */}
          <div className="panel-ghost-fill" />
        </div>
      ))}

      {ready && layout.gutters.map((g) => <Gutter key={g.id} info={g} />)}

      {ready && !tree && (
        <EmptyState
          onTerminal={() => createPanel({ type: "terminal" })}
          onFiles={() => createPanel({ type: "explorer" })}
        />
      )}

      {drag && <DropOverlay box={{ x: 0, y: 0, w: box.w, h: box.h }} layout={layout} />}
    </div>
  );
}

function PanelHost({
  panel,
  rect,
  visible,
  theme,
  workspaceMotion,
  workspaceOrder,
}: {
  panel: Panel;
  rect: Rect;
  visible: boolean;
  theme?: ITheme;
  workspaceMotion?: string;
  workspaceOrder: number;
}) {
  const previousRect = useRef<Rect | null>(null);
  const frameRef = useRef<number | null>(null);
  const motionTimerRef = useRef<number | null>(null);
  const [motionOffset, setMotionOffset] = useState<{ x: number; y: number } | null>(null);
  const [motionArmed, setMotionArmed] = useState(false);
  const focused = useSessions((s) => s.focused === panel.key);
  const isSource = useSessions((s) => s.drag?.key === panel.key);
  const focus = useSessions((s) => s.focus);
  // Chỉ terminal cần sống khi workspace ẩn để PTY/agent không bị ngắt. Panel phụ có thể
  // dựng lại từ store; tháo chúng xuống giải phóng iframe, ảnh đã decode, DOM preview,
  // watcher và worker audio thay vì chỉ phủ `visibility:hidden` lên toàn bộ workload.
  const isTerminal = panel.type === undefined || panel.type === "terminal";
  const shouldRenderPanel = visible || isTerminal;

  useEffect(() => () => {
    if (motionTimerRef.current !== null) window.clearTimeout(motionTimerRef.current);
  }, []);

  // Fallback FLIP luôn hoạt động trên WebView2: parent nhận hình học mới một lần, còn
  // lớp visual bên trong bắt đầu tại toạ độ cũ rồi translate về vị trí thật. Không scale
  // canvas chữ của xterm và không động tới backdrop-filter, nên blur giữ nguyên.
  useLayoutEffect(() => {
    const previous = previousRect.current;
    previousRect.current = rect;

    const flipping =
      !workspaceMotion &&
      !!previous &&
      visible &&
      (previous.x !== rect.x || previous.y !== rect.y);

    // Lần chạy này không FLIP thì phải **gỡ** offset đang treo, không được chỉ bỏ qua.
    //
    // Offset được đặt ngay lúc render và chỉ được gỡ trong callback của `requestAnimationFrame`.
    // Nếu effect chạy lại trước khi frame đó kịp tới — đúng chuyện xảy ra khi đổi workspace,
    // vì `Tiles` bật `workspaceMotion` trong cùng một nhịp — thì cleanup huỷ frame, nhánh này
    // return sớm, và không còn ai gỡ offset nữa. Panel đứng lệch vĩnh viễn, trông như tile bị
    // hở một khoảng vô cớ.
    if (!flipping) {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      setMotionOffset(null);
      return;
    }

    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    if (motionTimerRef.current !== null) window.clearTimeout(motionTimerRef.current);
    setMotionArmed(false);
    setMotionOffset({ x: previous.x - rect.x, y: previous.y - rect.y });
    frameRef.current = requestAnimationFrame(() => {
      setMotionArmed(true);
      setMotionOffset(null);
      frameRef.current = null;
      // Phải dài hơn `--motion-layout`: hết giờ sớm là `will-change` bị gỡ ngay giữa lúc
      // panel còn đang trượt, và lớp compositor bị gộp lại đúng lúc cần nó nhất.
      motionTimerRef.current = window.setTimeout(() => {
        motionTimerRef.current = null;
        setMotionArmed(false);
      }, LAYOUT_MOTION_MS + 120);
    });
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [rect.x, rect.y, rect.w, rect.h, visible, workspaceMotion]);

  const finishPanelMotion = useCallback((e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.currentTarget !== e.target || e.propertyName !== "transform") return;
    if (motionTimerRef.current !== null) {
      window.clearTimeout(motionTimerRef.current);
      motionTimerRef.current = null;
    }
    setMotionArmed(false);
  }, []);

  return (
    <div
      className={
        "panel-host" +
        (focused ? " on" : "") +
        (visible ? "" : " hidden") +
        (isSource ? " drag-source" : "") +
        (workspaceMotion?.startsWith("leaving") ? " workspace-leaving" : "")
      }
      style={place(rect)}
      data-panel-key={panel.key}
      data-panel-type={panel.type ?? "terminal"}
      tabIndex={-1}
      onPointerDownCapture={() => focus(panel.key)}
      onFocusCapture={() => focus(panel.key)}
    >
      <div
        className={"workspace-motion" + (workspaceMotion ? " " + workspaceMotion : "")}
        style={{ "--workspace-order": workspaceOrder } as React.CSSProperties}
      >
      <div
        className={"panel-motion" + (motionArmed ? " is-moving" : "")}
        style={motionOffset ? { transform: `translate3d(${motionOffset.x}px, ${motionOffset.y}px, 0)` } : undefined}
        onTransitionEnd={finishPanelMotion}
      >
        <Suspense fallback={<div className="panel-loading" aria-label="Loading panel" />}>
          {shouldRenderPanel && (panel.type === "preview" && panel.path ? (
            <PreviewPanel panelKey={panel.key} path={panel.path} mode={panel.mode} />
          ) : panel.type === "explorer" ? (
            <ExplorerPanel panelKey={panel.key} path={panel.path} />
          ) : panel.type === "web" ? (
            <WebPanel
              panelKey={panel.key}
              url={panel.url}
              suppressed={!visible || !!workspaceMotion}
            />
          ) : panel.type === "settings" ? (
            // Settings là popup từ giờ, không còn dựng trong tile — state cũ lưu từ trước
            // được dọn lúc hydrate (`App.tsx`); nhánh này chỉ là lưới an toàn, không nên
            // bao giờ chạy tới trong thực tế.
            null
          ) : panel.type === "system" ? (
            <SystemPanel panelKey={panel.key} visible={visible} />
          ) : (
            <TerminalPanel
              panelKey={panel.key}
              shell={panel.shell}
              cwd={panel.cwd}
              theme={theme}
              visible={visible}
            />
          ))}
        </Suspense>
      </div>
      </div>
    </div>
  );
}

function Gutter({ info }: { info: GutterInfo }) {
  const resize = useSessions((s) => s.resize);
  const [active, setActive] = useState(false);
  const resizeCleanupRef = useRef<((updateMountedState?: boolean) => void) | null>(null);

  useEffect(() => () => resizeCleanupRef.current?.(false), []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      resizeCleanupRef.current?.(true);

      const el = e.currentTarget;
      const pointerId = e.pointerId;
      const host = el.parentElement?.getBoundingClientRect();
      if (!host) return;

      let pendingRatio: number | null = null;
      let frame: number | null = null;
      let finished = false;
      let sessionCleanup: ((updateMountedState?: boolean) => void) | null = null;
      const commitRatio = () => {
        frame = null;
        if (pendingRatio === null) return;
        const ratio = pendingRatio;
        pendingRatio = null;
        resize(info.path, ratio);
      };
      const scheduleRatio = (ratio: number) => {
        pendingRatio = ratio;
        if (frame === null) frame = requestAnimationFrame(commitRatio);
      };

      el.setPointerCapture(pointerId);
      setActive(true);
      document.body.classList.add("resizing-layout");

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        const r =
          info.dir === "row"
            ? (ev.clientX - host.left - info.parent.x) / info.parent.w
            : (ev.clientY - host.top - info.parent.y) / info.parent.h;
        // Pointer events can arrive several times before the next paint. One layout update
        // per display frame is visually identical and avoids duplicate terminal reflows.
        scheduleRatio(r);
      };

      const finish = (commitPending: boolean, updateMountedState: boolean) => {
        if (finished) return;
        finished = true;
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onCancel);
        try {
          if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
        } catch {
          /* đã nhả rồi */
        }
        if (frame !== null) {
          cancelAnimationFrame(frame);
          frame = null;
        }
        if (commitPending && pendingRatio !== null) resize(info.path, pendingRatio);
        pendingRatio = null;
        if (updateMountedState) setActive(false);
        document.body.classList.remove("resizing-layout");
        if (resizeCleanupRef.current === sessionCleanup) resizeCleanupRef.current = null;
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId === pointerId) finish(true, true);
      };
      const onCancel = (ev: PointerEvent) => {
        if (ev.pointerId === pointerId) finish(false, true);
      };

      sessionCleanup = (updateMountedState = true) => finish(false, updateMountedState);
      resizeCleanupRef.current = sessionCleanup;
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onCancel);
    },
    [info.dir, info.parent.x, info.parent.y, info.parent.w, info.parent.h, info.path, resize],
  );

  return (
    <div
      className={"gutter " + info.dir + (active ? " active" : "")}
      style={place(info.rect)}
      onPointerDown={onPointerDown}
      onDoubleClick={() => resize(info.path, 0.5)}
      role="separator"
      aria-orientation={info.dir === "row" ? "vertical" : "horizontal"}
      title="Drag to resize · Double-click for an even 50/50 split"
    >
      <span className="gutter-grip" />
    </div>
  );
}

const ZONE_LABEL: Record<string, string> = {
  left: "Split to the left",
  right: "Split to the right",
  top: "Split above",
  bottom: "Split below",
  center: "Swap positions",
};

const ROOT_LABEL: Record<string, string> = {
  left: "Move to the left edge",
  right: "Move to the right edge",
  top: "Move to the top edge",
  bottom: "Move to the bottom edge",
};

function DropOverlay({ box, layout }: { box: Rect; layout: Layout }) {
  const drag = useSessions((s) => s.drag);
  if (!drag) return null;

  let rect: Rect | null = null;
  let label = "";

  if (drag.root) {
    rect = rootIndicatorRect(box, drag.root);
    label = ROOT_LABEL[drag.root];
  } else if (drag.target && drag.zone) {
    const target = layout.rects.get(drag.target);
    if (target) {
      rect = indicatorRect(target, drag.zone);
      label = ZONE_LABEL[drag.zone];
    }
  }

  return (
    <>
      {rect && (
        <div
          className={"drop-indicator" + (drag.zone === "center" && !drag.root ? " swap" : "")}
          style={place(rect)}
        >
          <span className="drop-badge">{label}</span>
        </div>
      )}
      <div className="drag-ghost" style={{ transform: `translate3d(${drag.x}px, ${drag.y}px, 0)` }}>
        <span className="drag-ghost-dot" />
        <span>moving panel</span>
      </div>
    </>
  );
}

function EmptyState({ onTerminal, onFiles }: { onTerminal: () => void; onFiles: () => void }) {
  return (
    <div className="empty-workspace">
      <div className="empty-card">
        <h3>Start a workspace</h3>
        <div className="empty-actions">
          <button className="empty-btn primary" onClick={onTerminal}>
            <Icon name="terminal" size={18} />
            <span>Terminal</span>
          </button>
          <button className="empty-btn secondary" onClick={onFiles}>
            <Icon name="folder" size={18} />
            <span>Files</span>
          </button>
        </div>
      </div>
    </div>
  );
}
