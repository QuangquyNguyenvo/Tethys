import { useSyncExternalStore } from "react";

/**
 * Cửa sổ overlay có main window làm owner nên Windows **luôn** vẽ nó trên main window.
 * `z-index` của CSS không với tới đó: modal của Tethys sẽ nằm dưới trang web nếu ta chỉ
 * xếp lớp trong DOM. Cách duy nhất là `hide()` cửa sổ đó khi shell cần che.
 *
 * Ai cũng có thể giơ tay chặn; overlay chỉ hiện lại khi không còn ai giơ tay.
 */
export type SurfaceBlocker = "palette" | "settings" | "modal";

const blockers = new Set<SurfaceBlocker>();
const listeners = new Set<() => void>();

export function setSurfaceBlocker(reason: SurfaceBlocker, active: boolean) {
  const had = blockers.has(reason);
  if (had === active) return;
  if (active) blockers.add(reason);
  else blockers.delete(reason);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const isBlocked = () => blockers.size > 0;

export function useSurfaceBlocked() {
  return useSyncExternalStore(subscribe, isBlocked, isBlocked);
}

/**
 * Những "hòn đảo" UI nổi trên canvas: dock ở đáy, thanh trên khi nó tự ẩn.
 *
 * Chúng không đáng để giấu cả trang web đi như modal — chúng nhỏ, và người dùng vẫn muốn
 * thấy trang trong lúc với tay xuống dock. Cách đúng với một cửa sổ native là **khoét lỗ**:
 * overlay bị cắt đi đúng vùng của hòn đảo, nên đảo lộ ra và bấm được.
 *
 * Đăng ký bằng phần tử thật chứ không phải toạ độ: chúng trượt vào/ra bằng CSS transition,
 * nên chỉ `getBoundingClientRect()` mỗi khung hình mới biết chúng đang ở đâu.
 */
const floats = new Set<HTMLElement>();

/** Ref callback dùng thẳng trên phần tử: `<nav ref={shellFloatRef}>`. */
export function shellFloatRef(el: HTMLElement | null) {
  if (el) floats.add(el);
}

/**
 * Vùng của mọi hòn đảo đang thật sự nhìn thấy, theo toạ độ viewport.
 *
 * Bỏ qua cái đang mờ hẳn: dock trượt ra trong 300ms nhưng mờ đi trong 200ms, nên có một
 * quãng nó vô hình mà vẫn nằm trong khung — khoét lỗ lúc đó là để lại một vết trống vô cớ.
 */
export function shellFloatRects(): DOMRect[] {
  const rects: DOMRect[] = [];
  for (const el of floats) {
    if (!el.isConnected) {
      floats.delete(el);
      continue;
    }
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || Number.parseFloat(style.opacity) < 0.05) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width >= 1 && rect.height >= 1) rects.push(rect);

    // Dock item được nhấc lên khi hover/focus và tooltip còn tràn xa hơn khỏi vỏ dock.
    // Native overlay không tham gia stacking context của DOM, nên chỉ khoét vỏ dock là
    // chưa đủ: phần tràn ra vẫn bị WebView2 cắt. Các part khai báo rõ chế độ để vòng đo
    // mỗi frame không phải khoét lại mọi icon đang đứng yên.
    for (const part of el.querySelectorAll<HTMLElement>("[data-native-float-part]")) {
      const partStyle = getComputedStyle(part);
      if (
        partStyle.visibility === "hidden" ||
        Number.parseFloat(partStyle.opacity) < 0.05 ||
        (part.dataset.nativeFloatPart === "transform" && partStyle.transform === "none")
      ) {
        continue;
      }
      const partRect = part.getBoundingClientRect();
      if (partRect.width >= 1 && partRect.height >= 1) rects.push(partRect);
    }
  }
  return rects;
}
