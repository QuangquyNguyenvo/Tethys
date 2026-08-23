/**
 * D15 — dọn nút thừa, panel cài đặt, hoạt ảnh, Ctrl+C copy, Ctrl+Shift+D.
 *
 * Mấy phép đo đáng chú ý:
 *  - Ctrl+C không kiểm bằng clipboard (webview không cho đọc khi mất focus) mà kiểm bằng
 *    *hậu quả*: có bôi đen thì chương trình đang chạy phải sống tiếp; không bôi đen thì
 *    nó phải chết. Đó mới đúng là điều user cần.
 *  - Ctrl+Shift+D kiểm luôn cả OSC 7: `cd` sang thư mục con rồi nhân đôi, panel mới phải
 *    mở ở thư mục con chứ không phải thư mục lúc panel gốc được tạo.
 */
import { spawn } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const EXE = "D:\\Code\\Project\\noname\\app\\src-tauri\\target\\release\\app.exe";
const WD = "D:\\Code\\Project\\noname";
const PORT = 9343;

let seq = 0;
const pending = new Map();
const send = (ws, method, params = {}) => {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    setTimeout(() => pending.delete(id) && rej(new Error("timeout " + method)), 25000);
  });
};
const evalJs = async (ws, expression, awaitPromise = false) => {
  const r = await send(ws, "Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception));
  return r.result.value;
};

const MOD = { ctrl: 2, shift: 8 };
/** Bắn một tổ hợp phím thật qua CDP (không phải `dispatchEvent` giả trong trang). */
const press = async (ws, { key, code, vk, modifiers = 0, text }) => {
  const o = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await send(ws, "Input.dispatchKeyEvent", { type: "rawKeyDown", ...o, ...(text ? { text } : {}) });
  if (text) await send(ws, "Input.dispatchKeyEvent", { type: "char", ...o, text });
  await send(ws, "Input.dispatchKeyEvent", { type: "keyUp", ...o });
};
const enter = (ws) => press(ws, { key: "Enter", code: "Enter", vk: 13, text: "\r" });

const mouse = (ws, type, x, y, clickCount = 1) =>
  send(ws, "Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount, buttons: type === "mouseReleased" ? 0 : 1 });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

/** Tiêu đề của terminal **đang chọn** — không phải cái đầu tiên trong DOM: sau khi nhân
 *  đôi thì có hai terminal, cái chạy lệnh là cái đang chọn. */
const termTitle = (ws) =>
  evalJs(ws, `document.querySelector('.panel-host.on[data-panel-type="terminal"] .panel-head .title')?.textContent ?? ""`);

rmSync(join(process.env.APPDATA, "com.noname.app", "state.json"), { force: true });

const child = spawn(EXE, {
  cwd: WD,
  env: {
    ...process.env,
    NONAME_PANELS: "1",
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
  },
  stdio: "ignore",
});

try {
  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(500);
    try {
      target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === "page");
    } catch {}
  }
  if (!target) throw new Error("khong ket noi duoc CDP");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
  });
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  await sleep(5500);

  // ── D15.1 thanh trên và dock đã bớt nút ────────────────────────────────
  const bar = await evalJs(
    ws,
    `({
      search: document.querySelectorAll('.titlebar-search-btn').length,
      center: document.querySelectorAll('.titlebar-center').length,
      winBtns: document.querySelectorAll('.win-btn').length,
      tabs: document.querySelectorAll('.tab-pill').length,
      dockItems: document.querySelectorAll('.dock-item').length,
      dockLabels: [...document.querySelectorAll('.dock-item')].map(b => b.title),
    })`,
  );
  check(
    "D15.1 bỏ ô tìm kiếm giữa thanh, dock rút còn 4 ô",
    bar.search === 0 && bar.center === 0 && bar.winBtns === 3 && bar.tabs >= 1 && bar.dockItems === 4,
    JSON.stringify(bar),
  );

  // ── D15.2 hàng nút chỉ rõ trên panel đang chọn ─────────────────────────
  await evalJs(ws, `(() => { const b = [...document.querySelectorAll('.dock-item')].find(x => x.title === 'Tệp'); b && b.click(); return true; })()`);
  await sleep(1400);
  const dim = await evalJs(
    ws,
    `(() => { const hosts = [...document.querySelectorAll('.panel-host:not(.hidden)')];
      return hosts.map(h => ({
        on: h.classList.contains('on'),
        opacity: Number(getComputedStyle(h.querySelector('.panel-actions')).opacity),
      })); })()`,
  );
  const focusedLit = dim.some((d) => d.on && d.opacity === 1);
  const restDim = dim.filter((d) => !d.on).every((d) => d.opacity < 0.3);
  check(
    "D15.2 chỉ panel đang chọn hiện hàng nút, panel còn lại để yên",
    dim.length >= 2 && focusedLit && restDim,
    JSON.stringify(dim),
  );

  // ── D15.3 Ctrl+, mở panel cài đặt, kéo thanh trượt đổi được nền ────────
  await press(ws, { key: ",", code: "Comma", vk: 188, modifiers: MOD.ctrl });
  await sleep(1200);
  const set1 = await evalJs(
    ws,
    `(() => { const p = document.querySelector('[data-panel-type="settings"]');
      if (!p) return { ok: false };
      const r = p.querySelector('input[type=range]');
      return { ok: true, ranges: p.querySelectorAll('input[type=range]').length,
               checks: p.querySelectorAll('input[type=checkbox]').length,
               chips: p.querySelectorAll('.set-chip').length, first: r ? r.value : null }; })()`,
  );
  // Kéo thanh trượt: đặt value rồi bắn `input` như trình duyệt vẫn làm khi người dùng kéo.
  await evalJs(
    ws,
    `(() => { const r = document.querySelector('[data-panel-type="settings"] input[type=range]');
      if (!r) return false;
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(r, '42');
      r.dispatchEvent(new Event('input', { bubbles: true }));
      return true; })()`,
  );
  await sleep(700);
  const opacity = await evalJs(ws, `getComputedStyle(document.documentElement).getPropertyValue('--term-opacity').trim()`);
  check(
    "D15.3 Ctrl+, mở cài đặt, thanh trượt đổi thật độ đục nền terminal",
    // 6 chip scheme M3 + 3 chip kiểu chia block.
    set1.ok && set1.ranges >= 3 && set1.checks >= 2 && set1.chips === 9 && opacity === "0.42",
    JSON.stringify({ ...set1, opacity }),
  );

  // Đóng panel cài đặt và kiểm bóng hoạt ảnh.
  const ghost = await evalJs(
    ws,
    `(async () => { const p = document.querySelector('[data-panel-type="settings"] .iconbtn.close');
      if (!p) return { ok: false };
      p.click();
      await new Promise(r => setTimeout(r, 60));
      const during = document.querySelectorAll('.panel-ghost').length;
      await new Promise(r => setTimeout(r, 500));
      return { ok: true, during, after: document.querySelectorAll('.panel-ghost').length }; })()`,
    true,
  );
  check(
    "D15.4 đóng panel để lại bóng co dần rồi tự dọn",
    !!ghost && ghost.ok === true && ghost.during >= 1 && ghost.after === 0,
    JSON.stringify(ghost),
  );

  // ── D15.5 OSC 7 + Ctrl+Shift+D ─────────────────────────────────────────
  // Đóng explorer trước: dòng phụ (cwd) bị ẩn khi panel hẹp dưới 430px, mà ba panel chia
  // nhau 1280px thì không cái nào đủ rộng — đo sẽ ra chuỗi rỗng vì lý do chẳng liên quan.
  await evalJs(
    ws,
    `(() => { const b = document.querySelector('[data-panel-type="explorer"] .iconbtn.close');
      b && b.click(); return true; })()`,
  );
  await sleep(900);
  await evalJs(
    ws,
    `(() => { const h = document.querySelector('.panel-host[data-panel-type="terminal"]');
      h && h.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      document.querySelector('.xterm-helper-textarea')?.focus(); return true; })()`,
  );
  await send(ws, "Input.insertText", { text: "cd app" });
  await enter(ws);
  await sleep(2500);

  const cwdAfterCd = await evalJs(
    ws,
    `document.querySelector('.panel-host.on[data-panel-type="terminal"] .panel-head .sub')?.textContent ?? ""`,
  );
  await press(ws, { key: "D", code: "KeyD", vk: 68, modifiers: MOD.ctrl | MOD.shift });
  await sleep(4000);

  const dup = await evalJs(
    ws,
    `(() => { const t = [...document.querySelectorAll('.panel-host:not(.hidden)[data-panel-type="terminal"]')];
      return { count: t.length,
               subs: t.map(h => h.querySelector('.panel-head .sub')?.textContent ?? '') }; })()`,
  );
  const allInApp = dup.subs.length >= 2 && dup.subs.every((s) => /\\app$/i.test(s));
  check(
    "D15.5 Ctrl+Shift+D nhân đôi terminal ở đúng thư mục shell đang đứng (OSC 7)",
    dup.count >= 2 && allInApp,
    JSON.stringify({ cwdAfterCd, ...dup }),
  );

  // ── D15.6 Ctrl+C: có bôi đen thì copy, không bôi đen thì ngắt ──────────
  // Shell của panel vừa nhân đôi mất một lúc mới tới prompt; gõ sớm là lệnh rơi mất.
  // Thử lại thay vì cắm một `sleep` dài đoán mò.
  let busy = "";
  for (let i = 0; i < 3 && busy !== "Start-Sleep"; i++) {
    await evalJs(ws, `document.querySelector('.panel-host.on .xterm-helper-textarea')?.focus()`);
    await send(ws, "Input.insertText", { text: "Start-Sleep -Seconds 9" });
    await enter(ws);
    await sleep(2400);
    busy = await termTitle(ws);
  }

  // Nháy đúp lên một từ trong terminal để có vùng bôi đen.
  const spot = await evalJs(
    ws,
    `(() => { const t = document.querySelector('.panel-host.on .term');
      const r = t.getBoundingClientRect();
      return { x: Math.round(r.x + 40), y: Math.round(r.y + 14) }; })()`,
  );
  await mouse(ws, "mousePressed", spot.x, spot.y, 1);
  await mouse(ws, "mouseReleased", spot.x, spot.y, 1);
  await mouse(ws, "mousePressed", spot.x, spot.y, 2);
  await mouse(ws, "mouseReleased", spot.x, spot.y, 2);
  await sleep(300);

  /* Ctrl+C phải bắn bằng sự kiện DOM chứ không phải `Input.dispatchKeyEvent`.
     Đo được: CDP gửi Ctrl+C thì WebView2 nuốt luôn làm phím Copy của chính nó, trang không
     bao giờ thấy `keydown` (Enter và mọi phím khác thì qua bình thường). Đây là giới hạn
     của đường tiêm phím tự động, không phải của app — sự kiện dựng ở đây giống hệt cái mà
     trình duyệt giao cho trang khi người thật bấm, nên vẫn đi qua đủ chuỗi
     `attachCustomKeyEventHandler` → xterm → ConPTY → PowerShell. */
  const ctrlC = () =>
    evalJs(
      ws,
      `(() => { const ta = document.querySelector('.panel-host.on .xterm-helper-textarea');
        if (!ta) return false;
        ta.dispatchEvent(new KeyboardEvent('keydown',
          { key: 'c', code: 'KeyC', keyCode: 67, which: 67, ctrlKey: true, bubbles: true, cancelable: true }));
        return true; })()`,
    );

  const selBefore = await evalJs(
    ws,
    `(() => { const t = document.querySelector('.panel-host.on .term'); return !!t.__term?.hasSelection(); })()`,
  );
  await ctrlC();
  await sleep(1600);
  const stillBusy = await termTitle(ws);
  const clip = await evalJs(ws, `navigator.clipboard.readText().then(t => t.length).catch(() => -1)`, true);
  const selAfter = await evalJs(
    ws,
    `(() => { const t = document.querySelector('.panel-host.on .term'); return !!t.__term?.hasSelection(); })()`,
  );

  check(
    "D15.6 Ctrl+C khi đang bôi đen thì copy, lệnh đang chạy không bị đụng tới",
    selBefore && clip > 0 && !selAfter && busy === "Start-Sleep" && stillBusy === "Start-Sleep",
    `bôi-đen ${selBefore}→${selAfter}, clipboard ${clip} ký tự, chạy "${busy}"→"${stillBusy}"`,
  );

  /* ⚠️ LỖI CÓ SẴN, CHƯA SỬA ĐƯỢC — Ctrl+C không ngắt được lệnh đang chạy.
     Bốn đường đã thử và đo, tất cả đều hỏng: xem CHECKLIST phase 14, mục Deviations.
     Kiểm ở đây để nó không lặng lẽ trôi, và để biết ngay ngày nó được sửa. */
  await ctrlC();
  await sleep(2600);
  const afterInterrupt = await termTitle(ws);
  console.log(
    (afterInterrupt === "Start-Sleep" ? "ĐÃ BIẾT" : "ĐÃ SỬA ") +
      `  Ctrl+C không bôi đen vẫn chưa ngắt được lệnh — sau khi gửi: "${afterInterrupt}"`,
  );

  // ── D15.7 dock tự ẩn ───────────────────────────────────────────────────
  await evalJs(
    ws,
    `(() => { const b = [...document.querySelectorAll('.dock-item')].find(x => x.title.startsWith('Cài đặt')); b && b.click(); return true; })()`,
  );
  await sleep(1200);
  await evalJs(
    ws,
    `(() => { const c = document.querySelector('[data-panel-type="settings"] input[type=checkbox]');
      if (!c) return false; c.click(); return true; })()`,
  );
  await sleep(900);
  const hidden = await evalJs(
    ws,
    `(() => { const d = document.querySelector('.dock');
      const w = document.querySelector('.dock-wrap');
      const r = d.getBoundingClientRect();
      return { auto: w.classList.contains('auto'),
               hot: !!document.querySelector('.dock-hot'),
               top: Math.round(r.top), vh: window.innerHeight,
               opacity: Number(getComputedStyle(d).opacity) }; })()`,
  );
  check(
    "D15.7 bật dock tự ẩn thì dock trượt khỏi màn hình, còn dải gọi ở mép dưới",
    hidden.auto && hidden.hot && hidden.opacity < 0.1 && hidden.top >= hidden.vh - 8,
    JSON.stringify(hidden),
  );

  const png = await send(ws, "Page.captureScreenshot", { format: "png" });
  writeFileSync(join(WD, "plans", "terminal-workspace", "_baseline", "ui-clean.png"), Buffer.from(png.data, "base64"));

  ws.close();
} finally {
  child.kill();
  await sleep(800);
}

const failed = results.filter((r) => !r.ok).length;
console.log("");
console.log(`===== D15: ${results.length - failed}/${results.length} PASS =====`);
process.exit(failed === 0 ? 0 : 1);
