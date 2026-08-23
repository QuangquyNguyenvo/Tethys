/**
 * D13 — tiêu đề panel phải gọi tên thứ đang chạy, không phải luôn luôn "pwsh".
 *
 * Đo bằng cách gõ thật vào terminal qua CDP rồi đọc lại tiêu đề. Đường đi được kiểm ở đây:
 * PSReadLine `AddToHistoryHandler` phát `OSC 133;C;<lệnh>` ngay lúc bấm Enter →
 * `Osc133Tracker` bắt được → `usePty` báo `running` → `TerminalPanel` lấy tên lệnh.
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const EXE = "D:\\Code\\Project\\noname\\app\\src-tauri\\target\\release\\app.exe";
const WD = "D:\\Code\\Project\\noname";
const PORT = 9339;

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
const evalJs = async (ws, expression) => {
  const r = await send(ws, "Runtime.evaluate", { expression, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception));
  return r.result.value;
};
const key = (ws, type, opts) => send(ws, "Input.dispatchKeyEvent", { type, ...opts });
const enter = async (ws) => {
  const o = { windowsVirtualKeyCode: 13, key: "Enter", code: "Enter", text: "\r" };
  await key(ws, "rawKeyDown", o);
  await key(ws, "char", o);
  await key(ws, "keyUp", o);
};

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

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
  await sleep(5000);

  const titleOf = () =>
    evalJs(ws, `document.querySelector('[data-panel-type="terminal"] .panel-head .title')?.textContent`);

  const idle = await titleOf();
  check("D13.1 lúc rảnh tiêu đề là tên shell", idle === "pwsh" || idle === "powershell", `"${idle}"`);

  await evalJs(ws, `document.querySelector('.xterm-helper-textarea')?.focus()`);
  await send(ws, "Input.insertText", { text: "Start-Sleep -Seconds 7" });
  await enter(ws);
  await sleep(2000);

  const busy = await titleOf();
  check("D13.2 đang chạy lệnh thì tiêu đề đổi thành tên lệnh", busy === "Start-Sleep", `"${busy}"`);

  const chip = await evalJs(
    ws,
    `document.querySelector('[data-panel-type="terminal"] .chip.run')?.textContent ?? ""`,
  );
  check("D13.3 có nhãn 'đang chạy'", chip.includes("đang chạy"), `"${chip}"`);

  await sleep(7000);
  const back = await titleOf();
  check("D13.4 lệnh xong thì tiêu đề trả về tên shell", back === "pwsh" || back === "powershell", `"${back}"`);

  ws.close();
} finally {
  child.kill();
  await sleep(800);
}

const failed = results.filter((r) => !r.ok).length;
console.log("");
console.log(`===== D13: ${results.length - failed}/${results.length} PASS =====`);
process.exit(failed === 0 ? 0 : 1);
