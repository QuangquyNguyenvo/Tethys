/** Tiện ích soi DOM/CSS trong app đang chạy qua CDP. `node inspect.mjs "<biểu thức JS>"` */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const EXE = "D:\\Code\\Project\\noname\\app\\src-tauri\\target\\release\\app.exe";
const WD = "D:\\Code\\Project\\noname";
const PORT = 9335;
const EXPR = process.argv[2] ?? "1";
const PANELS = process.argv[3] ?? "2";
const WAIT = Number(process.argv[4] ?? 4000);

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
  await sleep(WAIT);
  const r = await send(ws, "Runtime.evaluate", {
    expression: EXPR,
    returnByValue: true,
    awaitPromise: true,
  });
  console.log(JSON.stringify(r.exceptionDetails ?? r.result.value, null, 2));
  ws.close();
} finally {
  child.kill();
  await sleep(800);
}
