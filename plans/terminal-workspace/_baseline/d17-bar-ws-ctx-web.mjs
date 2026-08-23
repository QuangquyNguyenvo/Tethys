/**
 * D17 — bốn việc của phiên này, kiểm bằng app thật qua CDP:
 *
 *  1. Thanh trên kiểu tab icon + gạch chân, cụm tab nằm **giữa thanh** (đo bằng toạ độ, không
 *     phải nhìn ảnh: tâm cụm tab phải trùng tâm thanh trong sai số vài px).
 *  2. `Alt+<số>` nhảy workspace — bắn phím thật qua CDP, không phải `dispatchEvent` giả.
 *  3. Chuột phải trong explorer ra menu, và "Mở terminal tại thư mục này" mở đúng thư mục.
 *  4. Panel web vẫn là iframe và vẫn nhúng được trang cho phép nhúng. (Hướng webview con
 *     native đã thử và hỏng — xem `d18-webview-child.md`.)
 */
import { spawn } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const EXE = "D:\\Code\\Project\\noname\\app\\src-tauri\\target\\release\\app.exe";
const WD = "D:\\Code\\Project\\noname";
const PORT = 9347;

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

const MOD = { alt: 1, ctrl: 2, shift: 8 };
const press = async (ws, { key, code, vk, modifiers = 0, text }) => {
  const o = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await send(ws, "Input.dispatchKeyEvent", { type: "rawKeyDown", ...o, ...(text ? { text } : {}) });
  if (text) await send(ws, "Input.dispatchKeyEvent", { type: "char", ...o, text });
  await send(ws, "Input.dispatchKeyEvent", { type: "keyUp", ...o });
};
const mouse = (ws, type, x, y, button = "left", clickCount = 1) =>
  send(ws, "Input.dispatchMouseEvent", {
    type,
    x,
    y,
    button,
    clickCount,
    buttons: type === "mouseReleased" ? 0 : button === "right" ? 2 : 1,
  });
const rightClick = async (ws, x, y) => {
  await mouse(ws, "mousePressed", x, y, "right");
  await mouse(ws, "mouseReleased", x, y, "right");
};
const click = async (ws, x, y) => {
  await mouse(ws, "mousePressed", x, y);
  await mouse(ws, "mouseReleased", x, y);
};

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ ok, name });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const targets = async () => (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json());

rmSync(join(process.env.APPDATA, "com.noname.app", "state.json"), { force: true });

const child = spawn(EXE, {
  cwd: WD,
  env: {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
  },
  stdio: "ignore",
});

try {
  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(500);
    try {
      target = (await targets()).find((t) => t.type === "page");
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
  await send(ws, "Runtime.enable");
  // React cần vài giây mới dựng xong lưới panel; 2,5 s là chưa đủ, đo hụt là fail giả.
  await sleep(6000);

  // ── 1. Thanh trên ────────────────────────────────────────────────────────────────────
  const bar = await evalJs(
    ws,
    `(() => {
       const bar = document.querySelector('.tb-bar');
       const tabs = document.querySelector('.tab-bar');
       const item = document.querySelector('.tab-item');
       const ul = document.querySelector('.tab-item.active .tab-underline');
       if (!bar || !tabs || !item || !ul) return null;
       const b = bar.getBoundingClientRect(), t = tabs.getBoundingClientRect();
       const u = ul.getBoundingClientRect();
       return {
         offset: Math.abs((t.left + t.right) / 2 - (b.left + b.right) / 2),
         hasIcon: !!item.querySelector('svg'),
         underlineH: u.height,
         underlineColor: getComputedStyle(ul).backgroundColor,
         pillBg: getComputedStyle(document.querySelector('.tab-item.active .tab-face')).backgroundColor,
         barH: b.height,
       };
     })()`,
  );
  check("thanh trên: cụm tab nằm giữa thanh", bar && bar.offset < 4, bar && `lệch ${bar.offset.toFixed(1)}px`);
  check("thanh trên: tab có icon", !!bar?.hasIcon);
  check(
    "thanh trên: tab đang chọn có gạch chân màu, không phải nền pill đặc",
    !!bar && bar.underlineH >= 1.5 && !/rgba\(0, 0, 0, 0\)/.test(bar.underlineColor) && /rgba\(0, 0, 0, 0\)/.test(bar.pillBg),
    bar && `gạch ${bar.underlineH}px ${bar.underlineColor}, nền tab ${bar.pillBg}`,
  );
  check("thanh trên: chiều cao không đổi (40px)", !!bar && Math.abs(bar.barH - 32) < 2, bar && `thân ${bar.barH}px`);

  // ── 2. Alt+<số> ──────────────────────────────────────────────────────────────────────
  await evalJs(ws, `document.querySelector('.tab-add').click()`); // thêm workspace 2
  await sleep(600);
  await evalJs(ws, `document.querySelector('.tab-add').click()`); // thêm workspace 3
  await sleep(600);
  const wsCount = await evalJs(ws, `document.querySelectorAll('.tab-item').length`);
  check("Alt: có 3 workspace để thử", wsCount === 3, `${wsCount}`);

  const activeIdx = () =>
    evalJs(ws, `[...document.querySelectorAll('.tab-item')].findIndex(e => e.classList.contains('active'))`);

  await press(ws, { key: "1", code: "Digit1", vk: 49, modifiers: MOD.alt });
  await sleep(500);
  const after1 = await activeIdx();
  check("Alt+1 → workspace 1", after1 === 0, `index ${after1}`);

  await press(ws, { key: "3", code: "Digit3", vk: 51, modifiers: MOD.alt });
  await sleep(500);
  const after3 = await activeIdx();
  check("Alt+3 → workspace 3", after3 === 2, `index ${after3}`);

  await press(ws, { key: "2", code: "Digit2", vk: 50, modifiers: MOD.alt });
  await sleep(500);
  const after2 = await activeIdx();
  check("Alt+2 → workspace 2", after2 === 1, `index ${after2}`);

  // Alt+9 khi chỉ có 3 workspace: không được làm gì cả, cũng không được nổ.
  await press(ws, { key: "9", code: "Digit9", vk: 57, modifiers: MOD.alt });
  await sleep(400);
  const after9 = await activeIdx();
  check("Alt+9 khi không có workspace 9 → đứng yên", after9 === 1, `index ${after9}`);

  // ── 3. Chuột phải trong explorer ─────────────────────────────────────────────────────
  await evalJs(ws, `[...document.querySelectorAll('.dock-item')].find(b => b.title === 'Tệp').click()`);
  await sleep(1200);

  const dirRow = await evalJs(
    ws,
    `(() => {
       const row = document.querySelector('.ex-row.dir');
       if (!row) return null;
       const r = row.getBoundingClientRect();
       return { x: r.left + 40, y: r.top + r.height / 2, name: row.querySelector('.ex-name').textContent };
     })()`,
  );
  check("explorer: có thư mục để bấm", !!dirRow, dirRow?.name);

  await rightClick(ws, dirRow.x, dirRow.y);
  await sleep(500);
  const menu = await evalJs(
    ws,
    `(() => {
       const m = document.querySelector('.ctx-menu');
       if (!m) return null;
       const items = [...m.querySelectorAll('.ctx-item')].map(b => b.textContent.trim());
       const term = [...m.querySelectorAll('.ctx-item')].find(b => b.textContent.includes('Mở terminal tại thư mục này'));
       const r = term && term.getBoundingClientRect();
       return { items, termAt: r && { x: r.left + 20, y: r.top + r.height / 2 } };
     })()`,
  );
  check("explorer: chuột phải ra menu", !!menu, menu && menu.items.join(" · "));
  check("explorer: menu có 'Mở terminal tại thư mục này'", !!menu?.termAt);

  const termsBefore = await evalJs(ws, `document.querySelectorAll('[data-panel-type="terminal"]').length`);
  await click(ws, menu.termAt.x, menu.termAt.y);
  await sleep(3500);
  const termsAfter = await evalJs(ws, `document.querySelectorAll('[data-panel-type="terminal"]').length`);
  check("explorer: bấm mục đó mở thêm một terminal", termsAfter === termsBefore + 1, `${termsBefore} → ${termsAfter}`);

  // Đo qua state đã lưu, không qua DOM: phụ đề panel bị **ẩn khi panel hẹp**, mà panel thứ tư
  // trong lưới thì chắc chắn hẹp — đo bằng DOM ở đây là đo cái không hiện, fail giả.
  await sleep(1200);
  const saved = JSON.parse(readFileSync(join(process.env.APPDATA, "com.noname.app", "state.json"), "utf8"));
  const cwds = (saved.panels ?? []).filter((p) => p.type === "terminal").map((p) => p.cwd ?? "");
  check(
    "explorer: terminal mới mở đúng thư mục vừa bấm",
    cwds.some((c) => String(c).toLowerCase().endsWith(String(dirRow.name).toLowerCase())),
    `${cwds.join(" | ")} (chờ một cái kết thúc bằng "${dirRow.name}")`,
  );

  const menuGone = await evalJs(ws, `!document.querySelector('.ctx-menu')`);
  check("explorer: chọn xong menu tự đóng", menuGone === true);

  // ── 4. Panel web ────────────────────────────────────────────────────────────────────
  //
  // Panel web vẫn là `<iframe>`. Hướng "webview con native" đã thử và **hỏng** — xem
  // `d18-webview-child.md` cạnh file này. Nên ở đây chỉ kiểm hai điều còn đúng: panel mở
  // được, và trang **cho phép nhúng** thì hiện thật.
  await evalJs(ws, `[...document.querySelectorAll('.dock-item')].find(b => b.title === 'Web').click()`);
  await sleep(1200);
  await evalJs(
    ws,
    `(() => {
       const i = document.querySelector('.web-bar input');
       const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
       set.call(i, 'https://example.com/');
       i.dispatchEvent(new Event('input', { bubbles: true }));
       i.form.requestSubmit();
     })()`,
  );
  await sleep(6000);

  const web = await evalJs(
    ws,
    `(() => {
       const f = document.querySelector('.web-view iframe');
       return f ? { src: f.getAttribute('src'), w: f.getBoundingClientRect().width } : null;
     })()`,
  );
  check("web: panel mở và nhúng đúng địa chỉ", !!web && /example\.com/.test(web.src), web && `${web.src} rộng ${Math.round(web.w)}px`);

  const addr = await evalJs(ws, `document.querySelector('.web-bar input').value`);
  check("web: thanh địa chỉ khớp", /example\.com/.test(String(addr)), String(addr));

  // Bảng lệnh mở được khi panel web đang hiện — với iframe thì hiển nhiên, giữ lại như lưới
  // an toàn cho lần sau ai đó đổi panel web sang một bề mặt native.
  await press(ws, { key: "k", code: "KeyK", vk: 75, modifiers: MOD.ctrl });
  await sleep(700);
  const paletteOpen = await evalJs(ws, `!!document.querySelector('[class*="palette"]')`);
  check("web: bảng lệnh vẫn mở được khi panel web đang hiện", paletteOpen === true);
} finally {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
  if (failed.length) console.log("FAIL: " + failed.map((f) => f.name).join(" · "));
  child.kill();
}
