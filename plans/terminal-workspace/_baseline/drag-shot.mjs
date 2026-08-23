/** Chụp ảnh giữa lúc đang kéo panel — cách duy nhất để nhìn thấy ô chỉ báo vùng thả. */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const EXE = "D:\\Code\\Project\\noname\\app\\src-tauri\\target\\release\\app.exe";
const WD = "D:\\Code\\Project\\noname";
const PORT = 9336;
const OUT = "D:\\Code\\Project\\noname\\plans\\terminal-workspace\\_baseline\\ui-drag.png";

let seq = 0;
const pending = new Map();
const send = (ws, method, params = {}) => {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    setTimeout(() => pending.delete(id) && rej(new Error("timeout " + method)), 20000);
  });
};
const mouse = (ws, type, x, y) =>
  send(ws, "Input.dispatchMouseEvent", {
    type,
    x: Math.round(x),
    y: Math.round(y),
    button: "left",
    buttons: type === "mouseReleased" ? 0 : 1,
    clickCount: 1,
    pointerType: "mouse",
  });

const child = spawn(EXE, {
  cwd: WD,
  env: {
    ...process.env,
    NONAME_PANELS: "3",
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
  },
  stdio: "ignore",
});

try {
  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(500);
    try {
      target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(
        (t) => t.type === "page",
      );
    } catch {}
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
  });
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  await sleep(5000);

  const panels = (
    await send(ws, "Runtime.evaluate", {
      expression: `Array.from(document.querySelectorAll('[data-panel-key]')).map(el => { const r = el.getBoundingClientRect(); return { key: el.dataset.panelKey, x: r.x, y: r.y, w: r.width, h: r.height }; })`,
      returnByValue: true,
    })
  ).result.value;

  panels.sort((a, b) => a.x - b.x || a.y - b.y);
  const src = panels[0];
  const dst = panels[panels.length - 1];

  // Nắm thanh tiêu đề panel trái, kéo tới mép trái panel cuối rồi dừng lại — chưa thả.
  await mouse(ws, "mousePressed", src.x + src.w / 2, src.y + 14);
  const tx = dst.x + dst.w * 0.12;
  const ty = dst.y + dst.h / 2;
  for (let i = 1; i <= 16; i++) {
    await mouse(
      ws,
      "mouseMoved",
      src.x + src.w / 2 + ((tx - src.x - src.w / 2) * i) / 16,
      src.y + 14 + ((ty - src.y - 14) * i) / 16,
    );
    await sleep(20);
  }
  await sleep(300);

  const shot = await send(ws, "Page.captureScreenshot", { format: "png" });
  writeFileSync(OUT, Buffer.from(shot.data, "base64"));
  console.log("Da luu:", OUT);
  await mouse(ws, "mouseReleased", tx, ty);
  ws.close();
} finally {
  child.kill();
  await sleep(800);
}
