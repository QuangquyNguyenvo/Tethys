/**
 * D8 — kéo thả panel phải thật sự đổi được layout.
 *
 * Không kiểm được bằng PowerShell: kéo thả là chuỗi sự kiện con trỏ bên trong WebView.
 * Cách duy nhất đo tự động là nói chuyện với WebView2 qua CDP (bật bằng
 * WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port) rồi bơm sự kiện chuột
 * thật vào — sự kiện do CDP sinh ra là trusted, đi đúng đường như người dùng bấm.
 *
 * Bài kiểm này cũng chính là bằng chứng cho việc bỏ HTML5 drag-and-drop: bản cũ dùng
 * `dragstart`/`drop`, mà WebView2 nuốt sạch nhóm đó khi Tauri bật `dragDropEnabled`.
 *
 * Chạy: node d8-dragdrop.mjs
 */
import { spawn } from "node:child_process";
import { rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

const SPAWN_LOG = join(tmpdir(), "pty_spawn.log");

const EXE = "D:\\Code\\Project\\noname\\app\\src-tauri\\target\\release\\app.exe";
const WD = "D:\\Code\\Project\\noname";
const PORT = 9333;

let seq = 0;
const pending = new Map();

function send(ws, method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error("timeout: " + method));
    }, 15000);
  });
}

async function evaluate(ws, expression) {
  const r = await send(ws, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + expression);
  return r.result.value;
}

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

/** Kéo từ (x1,y1) tới (x2,y2) theo nhiều bước — một bước duy nhất không vượt ngưỡng nhận kéo. */
async function drag(ws, x1, y1, x2, y2, steps = 14) {
  await mouse(ws, "mousePressed", x1, y1);
  for (let i = 1; i <= steps; i++) {
    await mouse(ws, "mouseMoved", x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps);
    await sleep(16);
  }
  await sleep(60);
  await mouse(ws, "mouseReleased", x2, y2);
  await sleep(220);
}

const READ_PANELS = `
  Array.from(document.querySelectorAll('[data-panel-key]')).map(el => {
    const r = el.getBoundingClientRect();
    return { key: el.dataset.panelKey, x: r.x, y: r.y, w: r.width, h: r.height,
             hidden: el.classList.contains('hidden') };
  }).filter(p => !p.hidden)
`;

const headOf = (p) => ({ x: p.x + p.w / 2, y: p.y + 14 });

async function main() {
  const env = {
    ...process.env,
    NONAME_PANELS: "2",
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
  };
  rmSync(SPAWN_LOG, { force: true });
  const child = spawn(EXE, { cwd: WD, env, detached: false, stdio: "ignore" });

  let ws;
  const fails = [];
  const ok = [];
  try {
    let target = null;
    for (let i = 0; i < 40 && !target; i++) {
      await sleep(500);
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
        target = list.find((t) => t.type === "page");
      } catch {
        /* webview chưa lên */
      }
    }
    if (!target) throw new Error("khong ket noi duoc CDP");

    ws = new WebSocket(target.webSocketDebuggerUrl);
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    });
    await new Promise((res, rej) => {
      ws.addEventListener("open", res, { once: true });
      ws.addEventListener("error", rej, { once: true });
    });
    await send(ws, "Runtime.enable");

    // Chờ hai panel dựng xong
    let panels = [];
    for (let i = 0; i < 40 && panels.length < 2; i++) {
      await sleep(500);
      panels = await evaluate(ws, READ_PANELS);
    }
    if (panels.length !== 2) throw new Error(`can 2 panel, thay ${panels.length}`);

    panels.sort((a, b) => a.x - b.x);
    const [left, right] = panels;
    console.log(`Ban dau: ${left.key} ben trai (x=${left.x|0}), ${right.key} ben phai (x=${right.x|0})`);

    // ── D8.1 — kéo panel trái sang mép phải của panel phải: thứ tự phải đảo lại ──
    await drag(ws, headOf(left).x, headOf(left).y, right.x + right.w * 0.88, right.y + right.h / 2);
    let after = (await evaluate(ws, READ_PANELS)).sort((a, b) => a.x - b.x);
    const swapped = after.length === 2 && after[1].key === left.key && after[0].key === right.key;
    (swapped ? ok : fails).push(
      `D8.1 keo sang mep phai -> thu tu moi: ${after.map((p) => p.key).join(" | ")}`,
    );

    // ── D8.2 — thả vào lõi panel kia: hoán đổi vị trí, số panel không đổi ──
    after.sort((a, b) => a.x - b.x);
    const [l2, r2] = after;
    await drag(ws, headOf(l2).x, headOf(l2).y, r2.x + r2.w / 2, r2.y + r2.h / 2);
    let after2 = (await evaluate(ws, READ_PANELS)).sort((a, b) => a.x - b.x);
    const swapOk = after2.length === 2 && after2[0].key === r2.key && after2[1].key === l2.key;
    (swapOk ? ok : fails).push(
      `D8.2 tha vao loi -> hoan doi: ${after2.map((p) => p.key).join(" | ")}`,
    );

    // ── D8.3 — thả xuống mép dưới của panel kia: đổi từ chia dọc sang chia ngang ──
    after2.sort((a, b) => a.x - b.x);
    const [l3, r3] = after2;
    await drag(ws, headOf(l3).x, headOf(l3).y, r3.x + r3.w / 2, r3.y + r3.h * 0.9);
    const after3 = await evaluate(ws, READ_PANELS);
    const stacked =
      after3.length === 2 && Math.abs(after3[0].x - after3[1].x) < 4 && after3[0].y !== after3[1].y;
    (stacked ? ok : fails).push(
      `D8.3 tha xuong mep duoi -> xep chong doc: ${after3
        .map((p) => `${p.key}@(${p.x | 0},${p.y | 0})`)
        .join(" | ")}`,
    );

    // ── D8.4 — số panel không đổi sau cả ba lượt kéo (không nhân bản, không mất) ──
    (after3.length === 2 ? ok : fails).push(`D8.4 van dung 2 panel: thay ${after3.length}`);

    // ── D8.5 — ba lượt kéo không được spawn thêm shell nào ──
    const spawns = existsSync(SPAWN_LOG)
      ? readFileSync(SPAWN_LOG, "utf8")
          .split(String.fromCharCode(10))
          .filter((l) => l.startsWith("spawned id=")).length
      : -1;
    (spawns === 2 ? ok : fails).push(`D8.5 van dung 2 lan spawn PTY sau khi keo: ${spawns}`);
  } finally {
    try {
      ws?.close();
    } catch {}
    child.kill();
    await sleep(1000);
  }

  console.log("\n===== KET QUA D8 =====");
  ok.forEach((l) => console.log("  PASS  " + l));
  fails.forEach((l) => console.log("  FAIL  " + l));
  console.log(fails.length === 0 ? "\nD8 PASS" : `\nD8 FAIL (${fails.length} tieu chi)`);
  process.exit(fails.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("D8 loi:", e.message);
  process.exit(1);
});
