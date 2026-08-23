/**
 * D16 — thêm block thì tự chia theo hình xoắn ốc.
 *
 * Không kiểm bằng cách đọc lại biến cấu hình, mà bằng **hình học thật** của các panel:
 * dựng lại hướng chia của từng nước từ toạ độ hai panel liên tiếp. Cùng `y` và cùng chiều
 * cao ⇒ nước đó cắt dọc (row); cùng `x` và cùng bề ngang ⇒ cắt ngang (col). Xoắn ốc là khi
 * dãy hướng đó xen kẽ đều.
 */
import { spawn } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const EXE = "D:\\Code\\Project\\noname\\app\\src-tauri\\target\\release\\app.exe";
const WD = "D:\\Code\\Project\\noname";
const PORT = 9349;

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
const evalJs = async (ws, expression) => {
  const r = await send(ws, "Runtime.evaluate", { expression, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception));
  return r.result.value;
};

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

/** Panel theo thứ tự được tạo: khoá là `p1`, `p2`, … nên số trong khoá chính là thứ tự. */
const rects = (ws) =>
  evalJs(
    ws,
    `(() => [...document.querySelectorAll('.panel-host:not(.hidden)')]
        .map(h => { const r = h.getBoundingClientRect();
          return { k: h.dataset.panelKey, n: Number(h.dataset.panelKey.slice(1)),
                   x: Math.round(r.x), y: Math.round(r.y),
                   w: Math.round(r.width), h: Math.round(r.height) }; })
        .sort((a, b) => a.n - b.n))()`,
  );

const addTerminal = async (ws) => {
  await evalJs(
    ws,
    `(() => { const b = [...document.querySelectorAll('.dock-item')].find(x => x.title === 'Terminal');
      b && b.click(); return true; })()`,
  );
  await sleep(1800);
};

const setMode = (ws, mode) =>
  evalJs(
    ws,
    `(() => { const chips = [...document.querySelectorAll('[data-panel-type="settings"] .set-chip')];
      const c = chips.find(x => x.textContent.trim() === ${JSON.stringify(mode)});
      if (!c) return false; c.click(); return true; })()`,
  );

/** Hướng của nước chia sinh ra `b` từ `a`: cùng hàng ⇒ row, cùng cột ⇒ col. */
const dirOf = (a, b) => {
  if (Math.abs(a.y - b.y) <= 2 && Math.abs(a.h - b.h) <= 2) return "row";
  if (Math.abs(a.x - b.x) <= 2 && Math.abs(a.w - b.w) <= 2) return "col";
  return "?";
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

  /* ── D16.1 mặc định là xoắn ốc ──────────────────────────────────────────
     Suy hướng bằng cách so hình *trước và sau* mỗi lần thêm, chứ không so hai panel liên
     tiếp theo thứ tự tạo: sau vài nước nữa thì hai panel đó chẳng còn kề nhau, và mọi phép
     so trực tiếp sẽ ra "không xác định" dù layout hoàn toàn đúng. */
  const dirs = [];
  const evenHalves = [];
  for (let i = 0; i < 4; i++) {
    const before = await rects(ws);
    await addTerminal(ws);
    const after = await rects(ws);
    const fresh = after.find((p) => !before.some((b) => b.k === p.k));
    const parentBefore = before.find((b) => {
      const a = after.find((x) => x.k === b.k);
      return a && (Math.abs(a.w - b.w) > 2 || Math.abs(a.h - b.h) > 2);
    });
    const parentAfter = parentBefore && after.find((x) => x.k === parentBefore.k);
    if (!fresh || !parentBefore || !parentAfter) {
      dirs.push("?");
      continue;
    }
    dirs.push(Math.abs(parentAfter.h - parentBefore.h) <= 2 ? "row" : "col");
    // Cắt đôi thì ô mới và ô bị cắt phải bằng nhau.
    evenHalves.push((fresh.w * fresh.h) / (parentAfter.w * parentAfter.h));
  }
  const spiral = await rects(ws);
  check(
    "D16.1 thêm 4 block liên tiếp thì hướng chia xen kẽ — đúng hình xoắn ốc",
    spiral.length === 5 && dirs.join(",") === "row,col,row,col",
    `${dirs.join(" → ")}  ${JSON.stringify(spiral.map((r) => r.w + "x" + r.h))}`,
  );
  check(
    "D16.2 mỗi nước cắt đúng đôi ô vừa mở",
    evenHalves.length === 4 && evenHalves.every((h) => h > 0.92 && h < 1.08),
    evenHalves.map((h) => h.toFixed(3)).join(" · "),
  );

  const png1 = await send(ws, "Page.captureScreenshot", { format: "png" });
  writeFileSync(join(WD, "plans", "terminal-workspace", "_baseline", "ui-spiral.png"), Buffer.from(png1.data, "base64"));

  // ── D16.3 Ctrl+Shift+E / O vẫn là chỉ định tay ─────────────────────────
  const before = (await rects(ws)).length;
  await send(ws, "Input.dispatchKeyEvent", {
    type: "rawKeyDown", key: "E", code: "KeyE", windowsVirtualKeyCode: 69, modifiers: 2 | 8,
  });
  await send(ws, "Input.dispatchKeyEvent", {
    type: "keyUp", key: "E", code: "KeyE", windowsVirtualKeyCode: 69, modifiers: 2 | 8,
  });
  await sleep(2200);
  const afterE = await rects(ws);
  const newest = afterE[afterE.length - 1];
  const parent = afterE[afterE.length - 2];
  check(
    "D16.3 Ctrl+Shift+E vẫn chia sang phải, không bị chế độ xoắn ốc bẻ hướng",
    afterE.length === before + 1 && dirOf(parent, newest) === "row",
    `${before} → ${afterE.length} panel, hướng ${dirOf(parent, newest)}`,
  );

  // ── D16.4 đổi sang "Luôn sang phải" thì hết xoắn ─────────────────────────
  await evalJs(
    ws,
    `(() => { const b = [...document.querySelectorAll('.dock-item')].find(x => x.title.startsWith('Cài đặt'));
      b && b.click(); return true; })()`,
  );
  await sleep(1300);
  const switched = await setMode(ws, "Luôn sang phải");
  await sleep(600);
  const base = await rects(ws);
  await addTerminal(ws);
  await addTerminal(ws);
  const manual = await rects(ws);
  const lastTwo = manual.slice(-2);
  const manualDirs = [dirOf(manual[manual.length - 3], lastTwo[0]), dirOf(lastTwo[0], lastTwo[1])];
  check(
    "D16.4 chọn 'Luôn sang phải' thì mọi block mới đều chia dọc, không xoắn nữa",
    switched && manual.length === base.length + 2 && manualDirs.every((d) => d === "row"),
    manualDirs.join(" → "),
  );

  ws.close();
} finally {
  child.kill();
  await sleep(800);
}

const failed = results.filter((r) => !r.ok).length;
console.log("");
console.log(`===== D16: ${results.length - failed}/${results.length} PASS =====`);
process.exit(failed === 0 ? 0 : 1);
