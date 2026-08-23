import { useEffect, useRef, useState } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { ImageAddon } from "@xterm/addon-image";
import type { ITheme } from "@xterm/xterm";
import { registerFileLinkProvider } from "./links";
import { Osc133Tracker, type CommandBlock } from "./osc133";
import { useSessions } from "../store/sessions";

export type PtyState = "starting" | "running" | "exited" | "error";

export type PtyOptions = {
  shell?: string;
  cwd?: string;
  /** Font terminal — chốt theo font thật có trên máy, không phải font tưởng tượng. */
  fontFamily?: string;
  fontSize?: number;
  /** Bảng màu sinh từ ảnh nền (phase 03). Đổi lúc đang chạy được. */
  theme?: ITheme;
  /** Khoá panel — chỉ dùng để biết có nên giành focus lúc mở hay không. */
  panelKey?: string;
  /** Panel ở workspace đang nhìn thấy. Panel ẩn không cần ping backend mỗi giây. */
  panelVisible?: boolean;
};

/**
 * Nối một `Terminal` của xterm.js với một PTY ở Rust.
 *
 * Điểm khác spike: **có ack**. Rust chỉ cho tối đa 16 chunk bay cùng lúc và chờ
 * frontend báo đã ghi xong. Không có nó, đổ 47,7 MB làm RAM đỉnh lên ~750 MB.
 */
export function usePty(host: React.RefObject<HTMLDivElement | null>, opts: PtyOptions = {}) {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [state, setState] = useState<PtyState>("starting");
  const [error, setError] = useState("");
  const [blocks, setBlocks] = useState<CommandBlock[]>([]);
  /** Dòng lệnh đang chạy theo OSC 133 C/D. */
  const [running, setRunning] = useState<string | null>(null);
  /** Thư mục shell đang đứng, theo OSC 7. Đổi theo mỗi lần `cd`. */
  const [cwd, setCwd] = useState<string | undefined>(opts.cwd);
  const cwdRef = useRef<string | undefined>(opts.cwd);
  const panelVisibleRef = useRef(opts.panelVisible !== false);
  const flushRef = useRef<() => void>(() => {});
  const termRef = useRef<Terminal | null>(null);
  const trackerRef = useRef<Osc133Tracker | null>(null);

  useEffect(() => {
    // Không đặt guard "đã mount rồi thì thôi": StrictMode chạy mount → cleanup →
    // mount lại, guard sẽ chặn lần hai và để lại terminal đã bị dispose.
    // Cleanup dưới đây dọn đủ nên chạy lại là an toàn.
    if (!host.current) return;

    const term = new Terminal({
      allowProposedApi: true,
      // Bắt buộc để nền terminal ăn được alpha (thấy ảnh nền phía sau). xterm chốt cờ này
      // lúc `open()` và không đổi lại được, nên bật sẵn — kéo thanh trong suốt lúc đang
      // chạy vẫn ăn ngay, khỏi phải mở lại panel.
      allowTransparency: true,
      fontFamily:
        opts.fontFamily ??
        '"CaskaydiaCove Nerd Font","Cascadia Mono",Consolas,monospace',
      fontSize: opts.fontSize ?? 15,
      cursorBlink: true,
      scrollback: 10000,
      // Cả 16 màu ANSI đều sinh từ ảnh nền, chroma đã nhân 1,7 lần so với chrome (U3).
      theme: opts.theme,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    // Unicode 11 để chữ rộng (CJK, emoji) không lệch cột — tiêu chí B5.
    const uni = new Unicode11Addon();
    term.loadAddon(uni);
    term.unicode.activeVersion = "11";
    // Ảnh inline từ các công cụ tương thích SIXEL hoặc iTerm Inline Image Protocol.
    // Giới hạn có chủ đích: mỗi panel giữ tối đa 32 MB ảnh để scrollback không ăn RAM vô hạn.
    term.loadAddon(new ImageAddon({
      pixelLimit: 4_194_304,
      storageLimit: 32,
      sixelSizeLimit: 8_000_000,
      iipSizeLimit: 8_000_000,
    }));

    term.open(host.current);
    try {
      const gl = new WebglAddon();
      gl.onContextLoss(() => gl.dispose());
      term.loadAddon(gl);
    } catch {
      // Không có WebGL thì xterm tự dùng DOM renderer — chậm hơn, vẫn chạy.
    }
    fit.fit();
    termRef.current = term;
    // Móc để bài kiểm tự động đọc được trạng thái thật của xterm (`hasSelection`, buffer…).
    // Không có nó thì mọi phép đo về terminal đều phải suy ra từ pixel hoặc từ DOM, và
    // những thứ như "có đang bôi đen không" thì WebGL renderer chẳng để lại dấu vết nào.
    (host.current as unknown as { __term?: Terminal }).__term = term;

    let id: number | null = null;
    let disposed = false;

    // Hàng đợi cho những gì phải gửi xuống Rust trước khi biết `sessionId`.
    //
    // Đây không phải tối ưu vặt, mà là chỗ sửa một bug làm chết hẳn terminal:
    // ConPTY được mở với cờ `PSUEDOCONSOLE_INHERIT_CURSOR`, nên việc đầu tiên nó làm là
    // gửi `ESC[6n` (Device Status Report) và **chặn tiến trình con** cho tới khi terminal
    // trả lời vị trí con trỏ. Bản trước gắn `term.onData` bên trong `.then()` của
    // `pty_spawn`; 4 byte đó thường về trước khi promise resolve, xterm sinh câu trả lời
    // khi chưa có ai nghe, và câu trả lời rơi mất. Shell nằm im vĩnh viễn ở bước nối
    // console — nhìn ra ngoài là "panel trống, không có prompt", `pty_alive` vẫn báo sống.
    // Mở nhiều panel một lúc (khôi phục layout đã lưu) thì mọi panel trừ cái cuối đều dính.
    const pendingIn: number[] = [];
    let pendingAcks = 0;

    const flush = () => {
      if (id === null) return;
      // Output acknowledgements must never pause in a hidden workspace. Otherwise the
      // backend's back-pressure window fills, throttling the shell until another chunk
      // happens to arrive after the panel is visible again.
      if (panelVisibleRef.current && pendingIn.length > 0) {
        const data = pendingIn.splice(0, pendingIn.length);
        invoke("pty_write", { sessionId: id, data }).catch(() => {});
      }
      if (pendingAcks > 0) {
        const count = pendingAcks;
        pendingAcks = 0;
        invoke("pty_ack", { sessionId: id, count }).catch(() => {});
      }
    };
    flushRef.current = flush;

    // Gắn TRƯỚC khi spawn. Xem chú thích trên.
    term.onData((d) => {
      const bytes = new TextEncoder().encode(d);
      for (let i = 0; i < bytes.length; i++) pendingIn.push(bytes[i]);
      flush();
    });

    const channel = new Channel<ArrayBuffer>();
    channel.onmessage = (buf) => {
      term.write(new Uint8Array(buf), () => {
        pendingAcks++;
        flush();
      });
    };

    const cols = term.cols > 0 ? term.cols : 80;
    const rows = term.rows > 0 ? term.rows : 24;

    invoke<number>("pty_spawn", {
      shell: opts.shell ?? null,
      cwd: opts.cwd ?? null,
      rows,
      cols,
      onData: channel,
    })
      .then((newId) => {
        if (disposed) {
          invoke("pty_kill", { sessionId: newId }).catch(() => {});
          return;
        }
        id = newId;
        setSessionId(newId);
        setState("running");
        flush();
        // Chỉ panel đang được chọn mới giành con trỏ, nếu không panel mount sau cùng
        // sẽ cướp focus của panel user vừa bấm vào.
        if (!opts.panelKey || useSessions.getState().focused === opts.panelKey) term.focus();
      })
      .catch((e) => {
        setError(String(e));
        setState("error");
      });

    // `fit()` chạy ngay mỗi khung hình để canvas không bị co giãn méo, nhưng `pty_resize`
    // thì hoãn 90ms. Bản trước gộp cả hai vào một `requestAnimationFrame`, nên kéo gutter
    // hay chạy hoạt ảnh trượt panel là bắn IPC mỗi khung — shell vẽ lại prompt liên tục.
    let resizeTimer: number | null = null;
    let resizeFrame: number | null = null;
    const fitAtNextFrame = () => {
      resizeFrame = null;
      try {
        fit.fit();
      } catch {
        /* container chưa có kích thước */
      }
      if (id !== null && term.rows > 0 && term.cols > 0) {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
          invoke("pty_resize", { sessionId: id, rows: term.rows, cols: term.cols }).catch(() => {});
        }, 90);
      }
    };
    const handleResize = () => {
      // ResizeObserver can batch several geometry changes before a paint (especially while
      // dragging a divider). Fit once at the next compositor frame, then keep the existing
      // debounced PTY resize so the shell itself is not redrawn for every pixel moved.
      if (resizeFrame === null) resizeFrame = requestAnimationFrame(fitAtNextFrame);
    };

    const ro = new ResizeObserver(() => {
      handleResize();
    });
    ro.observe(host.current);
    window.addEventListener("resize", handleResize);

    const poll = setInterval(async () => {
      if (id === null || !panelVisibleRef.current) return;
      const alive = await invoke<boolean>("pty_alive", { sessionId: id }).catch(() => true);
      if (!alive) setState("exited");
    }, 1000);

    // Cố ý KHÔNG dùng `term.onTitleChange` (OSC 0/2) để đặt tên panel: ConPTY khởi động
    // với tiêu đề console *thừa kế từ tiến trình cha*, nên panel vừa mở đã mang một cái
    // tên chẳng liên quan (đo được: "shore"). Tên app lấy từ OSC 133;C — do chính shell
    // của ta phát ra lúc bấm Enter — chắc chắn hơn hẳn.
    const tracker = new Osc133Tracker(
      term,
      (newBlocks) => setBlocks(newBlocks),
      (cmd) => setRunning(cmd),
    );
    trackerRef.current = tracker;

    // OSC 7 — shell báo thư mục hiện tại sau mỗi prompt. Đây là nguồn duy nhất biết được
    // `cd` đã đi đâu; `opts.cwd` chỉ là thư mục lúc *mở* panel và đứng yên mãi mãi.
    const oscCwd = term.parser.registerOscHandler(7, (data) => {
      const m = /^file:\/\/[^/]*\/(.*)$/.exec(data.trim());
      if (m) {
        try {
          const path = decodeURIComponent(m[1]).replace(/\//g, "\\").replace(/\\+$/, "");
          if (path) {
            cwdRef.current = path;
            setCwd(path);
          }
        } catch {
          /* đường dẫn mã hoá hỏng — bỏ qua, thà giữ giá trị cũ */
        }
      }
      return true;
    });

    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      // Ctrl+C: đang bôi đen thì copy, không bôi đen thì để nguyên cho shell ngắt lệnh.
      // Đây là quy ước của mọi terminal Linux; bản trước luôn gửi ^C nên không copy nổi.
      if (e.type === "keydown" && e.ctrlKey && !e.altKey && !e.shiftKey && e.key === "c") {
        if (term.hasSelection()) {
          navigator.clipboard.writeText(term.getSelection()).catch(() => {});
          term.clearSelection();
          e.preventDefault();
          return false;
        }
        // Không bôi đen: để nguyên `0x03` đi xuống shell như mọi terminal.
        //
        // ⚠️ Byte đó **không ngắt được lệnh đang chạy** trên ConPTY ở đây — lỗi có sẵn, đã
        // đo kỹ và ghi vào CHECKLIST (phase 14, mục Deviations). Ở prompt trống thì nó vẫn
        // đúng việc: PSReadLine dùng chính ký tự này để xoá dòng đang gõ.
        return true;
      }
      // Ctrl+Shift+C / Ctrl+Shift+V — bản tường minh, không phụ thuộc có bôi đen hay không.
      if (e.type === "keydown" && e.ctrlKey && e.shiftKey && (e.key === "C" || e.key === "c")) {
        navigator.clipboard.writeText(term.getSelection()).catch(() => {});
        e.preventDefault();
        return false;
      }
      if (e.type === "keydown" && e.ctrlKey && e.shiftKey && (e.key === "V" || e.key === "v")) {
        navigator.clipboard.readText().then((t) => t && term.paste(t)).catch(() => {});
        e.preventDefault();
        return false;
      }
      if (e.ctrlKey && e.type === "keydown") {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          tracker.jumpToPreviousCommand();
          return false;
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          tracker.jumpToNextCommand();
          return false;
        }
      }
      return true;
    });

    const linkDisposable = registerFileLinkProvider(term, () => cwdRef.current, (resolvedPath) => {
      useSessions.getState().openPreview(resolvedPath, "row");
    }, (url) => {
      useSessions.getState().openWeb(url, "row");
    });

    return () => {
      disposed = true;
      clearInterval(poll);
      ro.disconnect();
      window.removeEventListener("resize", handleResize);
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      if (resizeTimer) clearTimeout(resizeTimer);
      flushRef.current = () => {};
      linkDisposable.dispose();
      oscCwd.dispose();
      if (id !== null) invoke("pty_kill", { sessionId: id }).catch(() => {});
      term.dispose();
    };
  }, []);

  useEffect(() => {
    panelVisibleRef.current = opts.panelVisible !== false;
    if (panelVisibleRef.current) flushRef.current();
  }, [opts.panelVisible]);

  // Đổi ảnh nền hoặc đổi scheme thì bảng màu mới phải vào ngay, không đợi mở lại terminal.
  useEffect(() => {
    if (termRef.current && opts.theme) termRef.current.options.theme = opts.theme;
  }, [opts.theme]);

  const copyLastOutput = () => {
    if (!trackerRef.current) return;
    const all = trackerRef.current.getBlocks();
    if (all.length > 0) {
      const last = all[all.length - 1];
      const text = trackerRef.current.getBlockOutput(last);
      navigator.clipboard.writeText(text);
    }
  };

  const jumpPrev = () => trackerRef.current?.jumpToPreviousCommand();
  const jumpNext = () => trackerRef.current?.jumpToNextCommand();

  return {
    sessionId,
    state,
    error,
    term: termRef,
    blocks,
    running,
    cwd,
    copyLastOutput,
    jumpPrev,
    jumpNext,
  };
}
