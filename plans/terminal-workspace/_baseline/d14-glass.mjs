/**
 * D14 — nền terminal trong suốt chỉnh được, và thanh trên là hòn đảo bo tròn.
 *
 * Không kiểm bằng cách đọc lại chính biến CSS mình vừa ghi — thế thì chỉ chứng minh
 * `setProperty` chạy. Ở đây chụp màn hình thật rồi **giải mã PNG** và đọc pixel bên trong
 * terminal: đục hẳn thì cả vùng là một màu phẳng, trong thì ảnh nền lọt qua nên pixel
 * tản ra. Chênh lệch đó mới là bằng chứng alpha đi tới tận khung hình.
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { setTimeout as sleep } from "node:timers/promises";

const EXE = "D:\\Code\\Project\\noname\\app\\src-tauri\\target\\release\\app.exe";
const WD = "D:\\Code\\Project\\noname";
const PORT = 9341;

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
const key = (ws, type, opts) => send(ws, "Input.dispatchKeyEvent", { type, ...opts });
const enter = async (ws) => {
  const o = { windowsVirtualKeyCode: 13, key: "Enter", code: "Enter", text: "\r" };
  await key(ws, "rawKeyDown", o);
  await key(ws, "char", o);
  await key(ws, "keyUp", o);
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

/* ── Giải mã PNG ────────────────────────────────────────────────────────────
   Node không có sẵn bộ giải mã ảnh, nhưng PNG mà Chromium xuất ra luôn là 8 bit,
   không xen kẽ, nên chỉ cần: gom IDAT → inflate → bỏ bộ lọc từng dòng quét.
   Đủ dùng và khỏi kéo thêm phụ thuộc vào một bài kiểm. */
function decodePng(buf) {
  let w = 0, h = 0, colorType = 0, bitDepth = 0;
  const idat = [];
  let off = 8; // bỏ chữ ký
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error("PNG xen ke, khong ho tro");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (bitDepth !== 8) throw new Error("PNG bitDepth " + bitDepth);
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!ch) throw new Error("PNG colorType " + colorType);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= ch ? prev[x - ch] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
  }
  return { w, h, ch, px: out };
}

/** Độ lệch chuẩn của độ sáng trên toàn ảnh cắt. Màu phẳng → gần 0. */
function lumaStats({ w, h, ch, px }) {
  let n = 0, sum = 0, sum2 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      n++; sum += l; sum2 += l * l;
    }
  }
  const mean = sum / n;
  return { mean, sd: Math.sqrt(Math.max(0, sum2 / n - mean * mean)) };
}

const shot = async (ws, clip) => {
  const r = await send(ws, "Page.captureScreenshot", {
    format: "png",
    clip: { ...clip, scale: 1 },
    captureBeyondViewport: false,
  });
  return decodePng(Buffer.from(r.data, "base64"));
};

/** Bắn phím tắt thật qua sự kiện DOM — đúng đường mà người dùng đi. */
const chord = (ws, code, times) =>
  evalJs(
    ws,
    `(() => { for (let i = 0; i < ${times}; i++)
        window.dispatchEvent(new KeyboardEvent('keydown',
          { ctrlKey: true, shiftKey: true, code: '${code}', key: '${code}', bubbles: true }));
      return true; })()`,
  );

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
  await sleep(5000);

  // ── D14.1 chuỗi CSS đã nối đúng ────────────────────────────────────────
  const css = await evalJs(
    ws,
    `(() => { const cs = getComputedStyle(document.documentElement);
      const p = document.querySelector('.panel.terminal-panel');
      const ps = p && getComputedStyle(p);
      return {
        termBg: cs.getPropertyValue('--term-bg').trim(),
        opacity: cs.getPropertyValue('--term-opacity').trim(),
        backdrop: ps && (ps.backdropFilter || ps.webkitBackdropFilter),
        panelBg: ps && ps.backgroundColor,
        wallpaper: !!document.querySelector('.app-wallpaper-bg'),
      }; })()`,
  );
  check(
    "D14.1 nền panel để trống, alpha nằm ở --term-bg, có lớp làm mờ ảnh nền",
    css.termBg.length === 9 &&
      css.panelBg === "rgba(0, 0, 0, 0)" &&
      !!css.backdrop && css.backdrop !== "none" &&
      css.wallpaper,
    JSON.stringify(css),
  );

  // Vùng đo: nửa dưới của terminal, nơi chắc chắn không có chữ của prompt.
  const box = await evalJs(
    ws,
    `(() => { const t = document.querySelector('.terminal-panel .term');
      if (!t) return null; const r = t.getBoundingClientRect();
      return { x: Math.round(r.x + 24), y: Math.round(r.y + r.height * 0.55),
               width: Math.round(r.width - 48), height: Math.round(r.height * 0.35) }; })()`,
  );
  if (!box || box.width < 40 || box.height < 20) throw new Error("khong do duoc vung terminal");

  // ── D14.2 đục hẳn: vùng nền phải phẳng ─────────────────────────────────
  await chord(ws, "BracketRight", 12); // kẹp về 1.0
  await sleep(900);
  const solidVar = await evalJs(ws, `getComputedStyle(document.documentElement).getPropertyValue('--term-opacity').trim()`);
  const solid = lumaStats(await shot(ws, box));
  check(
    "D14.2 đặc hoàn toàn thì nền terminal là một màu phẳng",
    solidVar === "1" && solid.sd < 2,
    `opacity=${solidVar} sd=${solid.sd.toFixed(2)} mean=${solid.mean.toFixed(1)}`,
  );

  // ── D14.3 kéo trong: ảnh nền lọt qua ───────────────────────────────────
  await chord(ws, "BracketLeft", 9); // 1.0 → 0.55
  await sleep(900);
  const glassVar = await evalJs(ws, `getComputedStyle(document.documentElement).getPropertyValue('--term-opacity').trim()`);
  const glass = lumaStats(await shot(ws, box));
  check(
    "D14.3 Ctrl+Shift+[ kéo được độ trong, ảnh nền hiện qua nền terminal",
    glassVar === "0.55" && glass.sd > solid.sd + 1.5,
    `opacity=${glassVar} sd ${solid.sd.toFixed(2)} → ${glass.sd.toFixed(2)}`,
  );

  // ── D14.4 chặn dưới, không kéo tới mức không đọc được ───────────────────
  await chord(ws, "BracketLeft", 20);
  await sleep(500);
  const floor = await evalJs(ws, `getComputedStyle(document.documentElement).getPropertyValue('--term-opacity').trim()`);
  check("D14.4 độ trong bị chặn ở 0,3 chứ không về 0", floor === "0.3", `opacity=${floor}`);

  // ── D14.5 thanh trên là hòn đảo nổi ────────────────────────────────────
  await chord(ws, "BracketRight", 6);
  await sleep(600);
  const bar = await evalJs(
    ws,
    `(() => { const h = document.querySelector('.titlebar'); const b = document.querySelector('.tb-bar');
      if (!h || !b) return { ok: false };
      const hr = h.getBoundingClientRect(), br = b.getBoundingClientRect();
      const bs = getComputedStyle(b), hs = getComputedStyle(h);
      const wb = document.querySelector('.win-btn'); const ws_ = wb && getComputedStyle(wb);
      return { ok: true,
        insetTop: Math.round(br.top - hr.top), insetLeft: Math.round(br.left - hr.left),
        insetRight: Math.round(hr.right - br.right),
        radius: parseFloat(bs.borderTopLeftRadius),
        blur: bs.backdropFilter || bs.webkitBackdropFilter,
        headerBottomBorder: hs.borderBottomWidth,
        winRadius: ws_ ? parseFloat(ws_.borderTopLeftRadius) : -1,
        winWidth: ws_ ? parseFloat(ws_.width) : -1,
      }; })()`,
  );
  check(
    "D14.5 thanh trên tách mép, bo tròn hết cỡ, nền kính mờ",
    bar.ok && bar.insetTop >= 6 && bar.insetLeft >= 6 && bar.insetRight >= 6 &&
      bar.radius >= 14 && bar.blur !== "none" && bar.headerBottomBorder === "0px",
    JSON.stringify(bar),
  );
  check(
    "D14.6 nút cửa sổ thành nút tròn, không còn ô vuông cao hết thanh",
    bar.ok && bar.winRadius >= 12 && bar.winWidth <= 30,
    `r=${bar.winRadius} w=${bar.winWidth}`,
  );

  // ── D14.7 chữ đảo màu (ESC[7m) vẫn đọc được ────────────────────────────
  // Rủi ro có thật của cách này: xterm tô nền trong suốt hoàn toàn, mà chế độ đảo màu lại
  // lấy *màu nền* làm màu chữ. Nếu nó lấy nguyên alpha 0 thì chữ tàng hình trên khối sáng.
  await evalJs(ws, `document.querySelector('.xterm-helper-textarea')?.focus()`);
  await send(ws, "Input.insertText", {
    text: `Clear-Host; $e=[char]27; Write-Host "$e[7mWWWWWWWWWWWWWWWW$e[0m"`,
  });
  await enter(ws);
  await sleep(2500);

  const inv = await evalJs(
    ws,
    `(() => { const t = document.querySelector('.terminal-panel .term');
      const r = t.getBoundingClientRect();
      return { x: Math.round(r.x + 10), y: Math.round(r.y + 6),
               width: 240, height: 60 }; })()`,
  );
  const invPx = await shot(ws, inv);
  let bright = 0, dark = 0;
  for (let i = 0; i < invPx.w * invPx.h; i++) {
    const j = i * invPx.ch;
    const l = 0.2126 * invPx.px[j] + 0.7152 * invPx.px[j + 1] + 0.0722 * invPx.px[j + 2];
    if (l > 110) bright++;
    else if (l < 60) dark++;
  }
  const total = invPx.w * invPx.h;
  check(
    "D14.7 chữ đảo màu vẫn thấy nét — có cả khối sáng lẫn nét chữ tối",
    bright / total > 0.02 && dark / total > 0.02,
    `sáng=${((bright / total) * 100).toFixed(1)}% tối=${((dark / total) * 100).toFixed(1)}%`,
  );

  // ── D14.8 panel không phải terminal vẫn đục ────────────────────────────
  await evalJs(
    ws,
    `(() => { const b = [...document.querySelectorAll('.dock-item')].find(x => x.title === 'Tệp');
      b && b.click(); return true; })()`,
  );
  await sleep(1500);
  const ex = await evalJs(
    ws,
    `(() => { const p = document.querySelector('.panel.explorer-panel');
      if (!p) return null; const c = getComputedStyle(p).backgroundColor;
      return { bg: c, alpha: c.startsWith('rgba') ? parseFloat(c.split(',')[3]) : 1 }; })()`,
  );
  check(
    "D14.8 explorer vẫn đục — UI dày chữ không cho ảnh nền lọt qua",
    ex && ex.alpha === 1,
    JSON.stringify(ex),
  );

  const png = await send(ws, "Page.captureScreenshot", { format: "png" });
  const { writeFileSync } = await import("node:fs");
  writeFileSync(join(WD, "plans", "terminal-workspace", "_baseline", "ui-glass.png"), Buffer.from(png.data, "base64"));

  ws.close();
} finally {
  child.kill();
  await sleep(800);
}

const failed = results.filter((r) => !r.ok).length;
console.log("");
console.log(`===== D14: ${results.length - failed}/${results.length} PASS =====`);
process.exit(failed === 0 ? 0 : 1);
