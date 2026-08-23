/**
 * D12 — kiểm thanh trên đã dọn, widget explorer/web chạy thật, và thanh tiêu đề panel
 * co lại chứ không đánh mất nút.
 *
 * Lái app thật qua CDP: bấm chuột thật vào dock, đọc DOM thật. Không có nó thì mọi
 * khẳng định về UI chỉ là đoán.
 */
import { spawn } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const EXE = "D:\\Code\\Project\\noname\\app\\src-tauri\\target\\release\\app.exe";
const WD = "D:\\Code\\Project\\noname";
const PORT = 9338;
const SHOT = "D:\\Code\\Project\\noname\\plans\\terminal-workspace\\_baseline\\ui-widgets.png";
const SHOT_NARROW =
  "D:\\Code\\Project\\noname\\plans\\terminal-workspace\\_baseline\\ui-narrow.png";

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
  const r = await send(ws, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception));
  return r.result.value;
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
const click = async (ws, x, y) => {
  await mouse(ws, "mouseMoved", x, y);
  await mouse(ws, "mousePressed", x, y);
  await mouse(ws, "mouseReleased", x, y);
};
const clickDock = async (ws, label) => {
  const r = await evalJs(
    ws,
    `(() => { const b = Array.from(document.querySelectorAll('.dock-item')).find(e => (e.getAttribute('aria-label')||'').startsWith(${JSON.stringify(
      label,
    )})); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; })()`,
  );
  if (!r) throw new Error("khong thay nut dock: " + label);
  await click(ws, r.x, r.y);
};

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

// App tự lưu layout, nên lần chạy trước để lại panel cho lần sau và số panel cứ lớn dần.
// Xoá trước khi đo, nếu không phép thử "panel hẹp" đang đo một bố cục ngẫu nhiên.
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
  await sleep(4500);

  // ── D12.1 thanh trên đã dọn ────────────────────────────────────────────
  const bar = await evalJs(
    ws,
    `({
      music: document.querySelectorAll('.music-pill, .music-bars').length,
      addTerm: document.querySelectorAll('.titlebar-add-terminal-btn').length,
      plusButtons: document.querySelectorAll('.titlebar button').length,
      search: !!document.querySelector('.titlebar-search-btn'),
      clock: !!document.querySelector('.clock-pill'),
      winBtns: document.querySelectorAll('.win-btn').length,
    })`,
  );
  // Phase 13: ô "Tìm lệnh, tệp, cài đặt…" cũng đã bị bỏ theo yêu cầu — nó chiếm giữa
  // thanh chỉ để mở đúng thứ mà Ctrl+K đã mở, và in sẵn "Ctrl+K" ngay bên trong.
  check(
    "D12.1 thanh trên bỏ trình phát nhạc giả, nút '+ Terminal' trùng và ô tìm kiếm thừa",
    bar.music === 0 && bar.addTerm === 0 && !bar.search && bar.winBtns === 3,
    JSON.stringify(bar),
  );

  // ── D12.2 explorer liệt kê thư mục thật ────────────────────────────────
  await clickDock(ws, "Tệp");
  await sleep(1200);
  const ex = await evalJs(
    ws,
    `(() => { const p = document.querySelector('[data-panel-type="explorer"]');
      if (!p) return { ok:false };
      return { ok:true, rows: p.querySelectorAll('.ex-row').length,
               dirs: p.querySelectorAll('.ex-row.dir').length,
               crumbs: p.querySelectorAll('.ex-crumb').length,
               first: p.querySelector('.ex-crumb')?.textContent,
               title: p.querySelector('.panel-head .title')?.textContent }; })()`,
  );
  // `first` phải là ổ đĩa. Ra "?" nghĩa là tiền tố \?\ của canonicalize() chưa bị cắt,
  // và mọi đường dẫn explorer trả về đều mang thêm một chặng rác.
  check(
    "D12.2 Explorer mở được, liệt kê thư mục và đường dẫn đã sạch tiền tố",
    ex.ok && ex.rows > 0 && ex.crumbs > 0 && /^[A-Za-z]:$/.test(ex.first ?? ""),
    JSON.stringify(ex),
  );

  // ── D12.3 bấm thư mục thì đi vào, breadcrumb dài ra ────────────────────
  const before = ex.crumbs;
  const dirPos = await evalJs(
    ws,
    `(() => { const r = document.querySelector('[data-panel-type="explorer"] .ex-row.dir'); if (!r) return null;
      const b = r.getBoundingClientRect(); return { x: b.x + 40, y: b.y + b.height/2 }; })()`,
  );
  if (dirPos) {
    await click(ws, dirPos.x, dirPos.y);
    await sleep(900);
  }
  const after = await evalJs(
    ws,
    `document.querySelectorAll('[data-panel-type="explorer"] .ex-crumb').length`,
  );
  check("D12.3 bấm thư mục thì đi vào được", dirPos !== null && after > before, `${before} → ${after}`);

  // ── D12.4 panel web ────────────────────────────────────────────────────
  await clickDock(ws, "Web");
  await sleep(1200);
  const web = await evalJs(
    ws,
    `(() => { const p = document.querySelector('[data-panel-type="web"]');
      if (!p) return { ok:false };
      return { ok:true, input: !!p.querySelector('.web-bar input'),
               start: !!p.querySelector('.web-start'),
               quick: p.querySelectorAll('.web-quick button').length }; })()`,
  );
  check("D12.4 panel Web mở được, có thanh địa chỉ", web.ok && web.input && web.quick > 0, JSON.stringify(web));

  // ── D12.5 nút chia nằm ở góc trên của block, không còn dưới dock ────────
  const splitPos = await evalJs(
    ws,
    `(() => {
      const dockSplit = Array.from(document.querySelectorAll('.dock-item'))
        .filter(e => (e.getAttribute('aria-label')||'').startsWith('Chia')).length;
      const head = document.querySelector('[data-panel-type="terminal"] .panel-head');
      const btns = head ? Array.from(head.querySelectorAll('.panel-actions button')) : [];
      const split = btns.filter(b => (b.getAttribute('aria-label')||b.title||'').startsWith('Chia'));
      const hr = head?.getBoundingClientRect();
      const inTopRight = split.length === 2 && split.every(b => {
        const r = b.getBoundingClientRect();
        return r.top >= hr.top - 1 && r.bottom <= hr.bottom + 1 && r.x > hr.x + hr.width * 0.5;
      });
      return { dockSplit, splitInHead: split.length, inTopRight };
    })()`,
  );
  check(
    "D12.5 nút chia nằm ở góc trên panel, đã rút khỏi dock",
    splitPos.dockSplit === 0 && splitPos.splitInHead === 2 && splitPos.inTopRight,
    JSON.stringify(splitPos),
  );

  const shot1 = await send(ws, "Page.captureScreenshot", { format: "png" });
  writeFileSync(SHOT, Buffer.from(shot1.data, "base64"));

  // ── D12.6 thu nhỏ: nút phải gom vào menu tràn, không được biến mất ─────
  await send(ws, "Emulation.setDeviceMetricsOverride", {
    width: 620,
    height: 520,
    deviceScaleFactor: 0,
    mobile: false,
  });
  await sleep(1400);

  const narrow = await evalJs(
    ws,
    `(() => {
      const heads = Array.from(document.querySelectorAll('.panel-host:not(.hidden) .panel-head'));
      const rows = heads.map(h => {
        const acts = h.querySelector('.panel-actions');
        const ar = acts.getBoundingClientRect();
        const hr = h.getBoundingClientRect();
        return {
          w: Math.round(hr.width),
          menu: !!h.querySelector('.head-menu-wrap'),
          buttons: acts.querySelectorAll(':scope > button, :scope > .head-menu-wrap > button').length,
          // Nút bị đẩy tràn ra ngoài thanh = mất nút. Đây là chỗ bản cũ hỏng.
          overflowsRight: ar.right > hr.right + 1,
          overflowsLeft: ar.left < hr.left - 1,
        };
      });
      return {
        rows,
        titlebarSearchHidden: !document.querySelector('.titlebar-search-btn')?.offsetParent,
        winBtns: document.querySelectorAll('.win-btn').length,
        tabs: document.querySelectorAll('.tab-pill').length,
      };
    })()`,
  );
  // Hẹp thì nút gom lại (tối thiểu còn đúng nút `⋯`), nhưng không nút nào được đẩy ra
  // ngoài thanh, và không panel nào được nhỏ hơn MIN_PANEL = 140px của geometry.ts.
  const allFit = narrow.rows.every(
    (r) => !r.overflowsRight && !r.overflowsLeft && r.buttons >= 1 && r.w >= 140,
  );
  const gotMenu = narrow.rows.some((r) => r.menu);
  check(
    "D12.6 panel hep: nut gom vao menu tran, khong tran khoi thanh, panel >= 140px",
    allFit && gotMenu,
    JSON.stringify(narrow.rows),
  );
  check(
    "D12.7 cửa sổ hẹp: nút cửa sổ và tab vẫn còn, ô lệnh mới là thứ bị thu",
    narrow.winBtns === 3 && narrow.tabs >= 1,
    `winBtns=${narrow.winBtns} tabs=${narrow.tabs} searchHidden=${narrow.titlebarSearchHidden}`,
  );

  /* Menu tràn phải bấm mở được, và phải chứa đủ hai lệnh chia.
     Phải nhắm đúng một panel *hẹp*: từ phase 13, panel rộng cũng có nút `⋯` (thao tác phụ
     nay nằm trong menu thay vì bày hết ra thanh), nhưng menu của nó chỉ có một mục — lấy
     nhầm nó thì phép đo hoá ra đo chuyện khác. */
  // Bóp thêm một nấc nữa: từ phase 13 layout mặc định là xoắn ốc, nên ở 620px ba panel
  // chia thành ba cột 295px — vẫn trên ngưỡng 270 và chưa panel nào phải gom nút.
  await send(ws, "Emulation.setDeviceMetricsOverride", {
    width: 430, height: 520, deviceScaleFactor: 1, mobile: false,
  });
  await sleep(900);

  const menuBtn = await evalJs(
    ws,
    `(() => { const host = [...document.querySelectorAll('.panel-host:not(.hidden)')]
        .find(h => h.getBoundingClientRect().width < 270 && h.querySelector('.head-menu-wrap > button'));
      const b = host && host.querySelector('.head-menu-wrap > button');
      if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; })()`,
  );
  const layoutNow = await evalJs(
    ws,
    `[...document.querySelectorAll('.panel-host:not(.hidden)')].map(h =>
       h.dataset.panelKey + ':' + h.dataset.panelType + ':' + Math.round(h.getBoundingClientRect().width)).join(' ')`,
  );
  let menuItems = 0;
  if (menuBtn) {
    await click(ws, menuBtn.x, menuBtn.y);
    await sleep(400);
    menuItems = await evalJs(
      ws,
      `document.querySelectorAll('.head-menu button').length`,
    );
  }
  // Menu phải nằm trọn trong khung nhìn: panel hẹp mà menu bị xén thì đọc không ra chữ.
  const menuFits = await evalJs(
    ws,
    `(() => { const m = document.querySelector('.head-menu'); if (!m) return null;
      const r = m.getBoundingClientRect();
      return { inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
               clipped: m.scrollWidth > m.clientWidth + 1 }; })()`,
  );
  check(
    "D12.8 panel hẹp: menu tràn mở được, đủ lệnh, không bị xén",
    menuItems >= 2 && menuFits?.inViewport && !menuFits?.clipped,
    `items=${menuItems} ${JSON.stringify(menuFits)} panels=[${layoutNow}]`,
  );

  const shot2 = await send(ws, "Page.captureScreenshot", { format: "png" });
  writeFileSync(SHOT_NARROW, Buffer.from(shot2.data, "base64"));

  ws.close();
} finally {
  child.kill();
  await sleep(800);
}

const failed = results.filter((r) => !r.ok);
console.log("");
console.log(`===== D12: ${results.length - failed.length}/${results.length} PASS =====`);
process.exit(failed.length === 0 ? 0 : 1);
