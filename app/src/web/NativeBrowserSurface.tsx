import { useEffect, useRef } from "react";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  attachNativeBrowser,
  setNativeShape,
  supportsNativeBrowser,
  surfaceLabel,
  type SurfaceHole,
} from "./nativeBrowser";
import { shellFloatRects } from "./surfaceVisibility";

type Props = {
  panelKey: string;
  /** URL nạp lúc tạo cửa sổ. Đổi URL sau đó đi qua `browser_navigate`, không dựng lại. */
  initialUrl: string;
  /** True khi có modal/palette của Tethys đang mở, hoặc panel không nằm trong workspace hiện tại. */
  hidden?: boolean;
  onReady: (label: string) => void;
  onError: (message: string) => void;
  /** Người dùng bấm vào trang: overlay giành focus, panel tương ứng phải sáng lên. */
  onFocus: () => void;
};

/** Một panelKey chỉ được sở hữu một cửa sổ. StrictMode dựng effect hai lần, HMR còn tệ hơn. */
const surfaceLeases = new Map<string, symbol>();

export { supportsNativeBrowser };

type Bounds = { x: number; y: number; w: number; h: number };

const sameBounds = (a: Bounds | null, b: Bounds) =>
  a !== null && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

const sameHoles = (a: SurfaceHole[] | null, b: SurfaceHole[]) =>
  a !== null &&
  a.length === b.length &&
  a.every((hole, i) => {
    const other = b[i];
    return (
      hole.x === other.x &&
      hole.y === other.y &&
      hole.w === other.w &&
      hole.h === other.h &&
      hole.radius === other.radius
    );
  });

/** Bán kính bo góc của panel, đọc từ chính token CSS để hai bên không lệch nhau khi theme đổi. */
function panelCornerRadius() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--r-panel");
  const parsed = Number.parseFloat(raw);
  // Trừ 1px viền panel: vùng nội dung nằm *bên trong* viền nên bo hẹp hơn đúng chừng đó.
  return (Number.isFinite(parsed) ? parsed : 18) - 1;
}

/**
 * Tauri's child-Webview API still maps to Window::add_child, which is broken on our
 * current Windows/Tauri stack. This uses a borderless owned WebviewWindow instead and
 * pins it to this DOM slot. The iframe in WebPanel remains visible until creation works.
 */
export function NativeBrowserSurface({
  panelKey,
  initialUrl,
  hidden = false,
  onReady,
  onError,
  onFocus,
}: Props) {
  const slotRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(onReady);
  const errorRef = useRef(onError);
  const focusRef = useRef(onFocus);
  const urlRef = useRef(initialUrl);
  const hiddenRef = useRef(hidden);

  readyRef.current = onReady;
  errorRef.current = onError;
  focusRef.current = onFocus;
  urlRef.current = initialUrl;
  hiddenRef.current = hidden;

  useEffect(() => {
    if (!supportsNativeBrowser()) return;

    const label = surfaceLabel(panelKey);
    const lease = Symbol(label);
    const mainWindow = getCurrentWindow();
    const unlisteners: Array<() => void> = [];
    let browserWindow: WebviewWindow | null = null;
    let frame: number | null = null;
    let disposed = false;
    let created = false;
    let shown = false;
    let announced = false;
    let applying = false;

    /**
     * Gốc toạ độ là **inner** position — góc trên trái của vùng client, đúng chỗ mà
     * `getBoundingClientRect()` lấy làm mốc. `outerPosition()` là hình chữ nhật của cả cửa
     * sổ: trên Windows nó còn tính cả viền kéo giãn vô hình, nên overlay bị lệch đi vài
     * pixel và tràn ra khỏi tile. Cache lại vì mỗi lần đọc là một chuyến IPC.
     */
    let origin: { x: number; y: number } | null = null;
    let scale = 1;
    let applied: Bounds | null = null;
    let appliedHidden: boolean | null = null;
    let appliedHoles: SurfaceHole[] | null = null;

    surfaceLeases.set(label, lease);
    const ownsLease = () => !disposed && surfaceLeases.get(label) === lease;

    const refreshWindowGeometry = async () => {
      try {
        const [position, factor] = await Promise.all([
          mainWindow.innerPosition(),
          mainWindow.scaleFactor(),
        ]);
        if (!ownsLease()) return;
        origin = { x: position.x, y: position.y };
        scale = factor;
        // Cửa sổ chính vừa dời đi: rect trong DOM không đổi nhưng chỗ đứng trên màn hình thì có.
        applied = null;
      } catch (error) {
        if (ownsLease()) errorRef.current(String(error));
      }
    };

    /**
     * Dock và thanh trên nổi *trên* canvas, còn overlay là cửa sổ owned nên Windows luôn vẽ
     * nó trên main window — chúng sẽ bị che. Cắt đúng vùng của chúng ra khỏi overlay là cách
     * duy nhất để chúng lộ ra, và rẻ hơn hẳn việc giấu cả trang đi mỗi lần con trỏ chạm đáy.
     * Toạ độ quy về gốc của chính overlay, vì region tính theo cửa sổ chứ không theo màn hình.
     */
    const measureHoles = (rect: DOMRect): SurfaceHole[] => {
      const holes: SurfaceHole[] = [];
      for (const float of shellFloatRects()) {
        const left = Math.max(rect.left, float.left);
        const top = Math.max(rect.top, float.top);
        const right = Math.min(rect.right, float.right);
        const bottom = Math.min(rect.bottom, float.bottom);
        if (right - left < 1 || bottom - top < 1) continue;

        // Chỉ dùng phần giao để quyết định có cần khoét hay không. Hình học của lỗ vẫn
        // phải là *toàn bộ* hòn đảo: nếu dock cắt qua mép trái của browser mà ta dựng
        // một round-rect mới từ chính phần giao, Windows sẽ bo thêm một góc giả ngay giữa
        // dock. Kết quả là một miếng trang web hình lưỡi liềm đè lên icon nằm ở đường biên.
        // GDI chấp nhận toạ độ âm và tự clip region vào cửa sổ, nên giữ nguyên gốc thật.
        holes.push({
          x: Math.floor((float.left - rect.left) * scale),
          y: Math.floor((float.top - rect.top) * scale),
          w: Math.ceil(float.width * scale),
          h: Math.ceil(float.height * scale),
          // Bo theo chính hòn đảo, không theo panel: dock là một viên thuốc bo tròn hết cỡ.
          radius: Math.round(Math.min(float.height, float.width) * 0.5 * scale),
        });
      }
      return holes;
    };

    const measure = (): { bounds: Bounds; visible: boolean; holes: SurfaceHole[] } | null => {
      if (!origin || !slotRef.current) return null;
      const rect = slotRef.current.getBoundingClientRect();
      const bounds: Bounds = {
        x: Math.round(origin.x + rect.left * scale),
        y: Math.round(origin.y + rect.top * scale),
        w: Math.max(1, Math.round(rect.width * scale)),
        h: Math.max(1, Math.round(rect.height * scale)),
      };
      return {
        bounds,
        visible: !hiddenRef.current && rect.width >= 1 && rect.height >= 1,
        holes: measureHoles(rect),
      };
    };

    const apply = async (bounds: Bounds, visible: boolean, holes: SurfaceHole[]) => {
      if (applying || !ownsLease() || !created || !browserWindow) return;
      applying = true;
      try {
        if (!visible) {
          if (shown) {
            shown = false;
            await browserWindow.hide();
          }
          appliedHidden = true;
          return;
        }

        const resized = applied === null || applied.w !== bounds.w || applied.h !== bounds.h;
        if (!applied || applied.x !== bounds.x || applied.y !== bounds.y) {
          await browserWindow.setPosition(new PhysicalPosition(bounds.x, bounds.y));
        }
        if (resized) {
          await browserWindow.setSize(new PhysicalSize(bounds.w, bounds.h));
        }
        // Region tính theo kích thước cửa sổ, nên đổi cỡ là phải dựng lại; lỗ thì đổi mỗi
        // khi dock trượt vào/ra. Chỉ bo hai góc dưới: hai góc trên nằm sát thanh địa chỉ.
        if (resized || !sameHoles(appliedHoles, holes)) {
          await setNativeShape(
            label,
            Math.round(panelCornerRadius() * scale),
            holes,
          ).catch(() => {});
          appliedHoles = holes;
        }
        applied = bounds;
        appliedHidden = false;
        if (!shown) {
          shown = true;
          await browserWindow.show();
        }
        if (!announced) {
          announced = true;
          readyRef.current(label);
        }
      } catch (error) {
        if (ownsLease()) errorRef.current(String(error));
      } finally {
        applying = false;
      }
    };

    /**
     * Panel không chỉ đổi *kích thước*: nó còn trượt sang chỗ khác khi split, đóng panel
     * hàng xóm hay đổi workspace. `ResizeObserver` mù với những lần đó, nên chỗ đứng phải
     * được đo lại mỗi khung hình. Đo là một `getBoundingClientRect()`; chỉ khi số đo thật
     * sự khác lần trước mới có IPC, nên lúc đứng yên vòng lặp này gần như không tốn gì.
     */
    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (!ownsLease() || !created || applying) return;
      const next = measure();
      if (!next) return;
      if (
        next.visible === !appliedHidden &&
        sameBounds(applied, next.bounds) &&
        sameHoles(appliedHoles, next.holes)
      ) {
        return;
      }
      void apply(next.bounds, next.visible, next.holes);
    };

    const start = async () => {
      try {
        await refreshWindowGeometry();
        if (!ownsLease()) return;

        const stale = await WebviewWindow.getByLabel(label);
        if (!ownsLease()) return;
        if (stale) await stale.close();
        if (!ownsLease()) return;

        const nextWindow = new WebviewWindow(label, {
          url: urlRef.current,
          parent: mainWindow,
          title: "Tethys Browser",
          width: 1,
          height: 1,
          x: 0,
          y: 0,
          visible: false,
          focus: false,
          decorations: false,
          resizable: false,
          shadow: false,
          skipTaskbar: true,
        });
        browserWindow = nextWindow;

        const offCreated = await nextWindow.once("tauri://created", () => {
          if (!ownsLease()) {
            void nextWindow.close().catch(() => {});
            return;
          }
          created = true;
          // Gắn handler trước khi hiện: điều hướng đầu tiên cũng phải đến được chrome.
          void attachNativeBrowser(label).catch((error) => {
            if (ownsLease()) errorRef.current(String(error));
          });
        });
        unlisteners.push(offCreated);

        const offError = await nextWindow.once<unknown>("tauri://error", (event) => {
          if (ownsLease()) errorRef.current(String(event.payload));
        });
        unlisteners.push(offError);

        const [offMoved, offResized, offScale, offFocus] = await Promise.all([
          mainWindow.onMoved(() => void refreshWindowGeometry()),
          mainWindow.onResized(() => void refreshWindowGeometry()),
          mainWindow.onScaleChanged(() => void refreshWindowGeometry()),
          // Không bao giờ gọi `setFocus()` ở chiều ngược lại: overlay giành lại focus sẽ
          // cướp con trỏ khỏi thanh địa chỉ ngay khi người dùng vừa bấm vào nó.
          nextWindow.onFocusChanged(({ payload: focused }) => {
            if (focused && ownsLease()) focusRef.current();
          }),
        ]);
        unlisteners.push(offMoved, offResized, offScale, offFocus);
      } catch (error) {
        if (ownsLease()) errorRef.current(String(error));
      }
    };

    void start();
    frame = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      if (surfaceLeases.get(label) === lease) surfaceLeases.delete(label);
      if (frame !== null) cancelAnimationFrame(frame);
      for (const unlisten of unlisteners) unlisten();
      if (browserWindow) void browserWindow.close().catch(() => {});
    };
  }, [panelKey]);

  return (
    <div
      ref={slotRef}
      data-native-browser={panelKey}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0 }}
    />
  );
}
