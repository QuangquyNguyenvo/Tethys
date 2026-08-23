/**
 * Chụp ảnh giao diện thật qua CDP. Không có nó thì mọi nhận xét về UI chỉ là đoán.
 * Chạy: node ui-shot.mjs [so_panel] [duong_dan_png]
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const EXE = "D:\\Code\\Project\\noname\\app\\src-tauri\\target\\release\\app.exe";
const WD = "D:\\Code\\Project\\noname";
const PORT = 9334;
const PANELS = process.argv[2] ?? "3";
const OUT = process.argv[3] ?? "D:\\Code\\Project\\noname\\plans\\terminal-workspace\\_baseline\\ui.png";
/** Biểu thức JS chạy trước khi chụp — dùng để dựng sẵn một bố cục cụ thể. */
const SETUP = process.argv[4] ?? null;

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

const child = spawn(EXE, {
  cwd: WD,
  env: {
    ...process.env,
    NONAME_PANELS: PANELS,
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

  // Chờ terminal vẽ xong prompt
  await sleep(4500);
  if (SETUP) {
    await send(ws, "Runtime.evaluate", { expression: SETUP, returnByValue: true, awaitPromise: true });
    await sleep(2500);
  }
  const shot = await send(ws, "Page.captureScreenshot", { format: "png" });
  writeFileSync(OUT, Buffer.from(shot.data, "base64"));
  console.log("Da luu:", OUT);
  ws.close();
} finally {
  child.kill();
  await sleep(800);
}
