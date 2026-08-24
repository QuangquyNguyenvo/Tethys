use anyhow::{anyhow, Result};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;
use tauri::ipc::{Channel, InvokeResponseBody};

pub type SessionId = u32;

/// Số chunk tối đa được phép "đang bay" giữa Rust và xterm.js.
/// Spike không có giới hạn này và RAM đỉnh lên 713–754 MB khi đổ 47,7 MB
/// (sau 25 s vẫn 632 MB) — xem `phase-01-spike.md`.
const MAX_IN_FLIGHT: usize = 16;

/// Frontend reload hoặc chết giữa chừng thì không ai ack nữa.
/// Hết hạn chờ thì cứ gửi tiếp — thà phình RAM còn hơn treo cứng terminal.
const ACK_TIMEOUT: Duration = Duration::from_secs(2);

const READ_BUF: usize = 1 << 16;

/// Cửa sổ trượt: chặn ngay tại thread đọc PTY.
/// Chặn ở đây là **có chủ ý** — nó lan ngược qua ConPTY tới chính shell,
/// nên tiến trình đang xả output sẽ bị ghì lại thay vì để ta nuốt không kịp.
struct Flow {
    n: Mutex<usize>,
    cv: Condvar,
}

impl Flow {
    fn new() -> Self {
        Flow { n: Mutex::new(0), cv: Condvar::new() }
    }

    fn acquire(&self) {
        let mut n = self.n.lock().unwrap();
        while *n >= MAX_IN_FLIGHT {
            let (guard, timeout) = self.cv.wait_timeout(n, ACK_TIMEOUT).unwrap();
            n = guard;
            if timeout.timed_out() {
                break;
            }
        }
        *n += 1;
    }

    fn release(&self, k: usize) {
        let mut n = self.n.lock().unwrap();
        *n = n.saturating_sub(k);
        self.cv.notify_all();
    }
}

pub struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
    flow: Arc<Flow>,
    alive: Arc<AtomicBool>,
}

/// pwsh 7 nếu có trên PATH, không thì Windows PowerShell 5.1.
pub fn default_shell() -> String {
    for c in ["pwsh.exe", "powershell.exe"] {
        if let Some(paths) = std::env::var_os("PATH") {
            if std::env::split_paths(&paths).any(|d| d.join(c).is_file()) {
                return c.to_string();
            }
        }
    }
    "powershell.exe".to_string()
}

impl PtySession {
    pub fn spawn(
        shell: Option<String>,
        cwd: Option<String>,
        rows: u16,
        cols: u16,
        on_data: Channel<InvokeResponseBody>,
        flush_ms: u64,
    ) -> Result<Self> {
        let pair = native_pty_system()
            .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| anyhow!("openpty: {e}"))?;

        let shell = shell.unwrap_or_else(default_shell);
        let mut cmd = CommandBuilder::new(&shell);
        if shell.contains("powershell") || shell.contains("pwsh") {
            // Prompt phát OSC 133 A/B/D. Còn C — "lệnh bắt đầu chạy" — phải phát từ chỗ
            // người dùng bấm Enter, và `AddToHistoryHandler` là hook chạy đúng lúc đó.
            // Nhờ C mà thanh tiêu đề panel gọi được tên app đang chạy thay vì luôn "pwsh".
            //
            // Đã thử `AddToHistoryHandler` trước và phải bỏ: PSReadLine gọi nó thêm một
            // lượt khi **nạp file lịch sử lúc khởi động**, nên panel vừa mở đã tưởng đang
            // chạy lệnh cuối của phiên trước (đo được: tiêu đề hiện "Start-Sleep" ngay khi
            // mở). Bám vào phím Enter thì chỉ có người gõ mới kích hoạt được.
            //
            // Phải tự kiểm cú pháp trước khi phát: Enter giữa một khối chưa đóng ngoặc là
            // xuống dòng chứ không phải chạy lệnh, phát C ở đó thì panel kẹt "đang chạy"
            // vĩnh viễn vì chẳng bao giờ có D tương ứng.
            let mut script = String::from(
                r#"$global:__prompt_orig = $function:prompt; function prompt { $exit = $LASTEXITCODE; $e = [char]27; $cwd = $executionContext.SessionState.Path.CurrentLocation.Path; Write-Host -NoNewline "$e]133;D;$exit`a$e]7;file:///$($cwd.Replace([char]92,'/'))`a$e]133;A`a"; $p = if ($global:__prompt_orig) { & $global:__prompt_orig } else { "PS $($executionContext.SessionState.Path.CurrentLocation)> " }; Write-Host -NoNewline "$e]133;B`a"; return $p }; try { Set-PSReadLineKeyHandler -Chord Enter -ScriptBlock { $l = $null; $c = $null; [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$l, [ref]$c); [Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine(); if ($l -and $l.Trim()) { $errs = $null; [void][System.Management.Automation.Language.Parser]::ParseInput($l, [ref]$null, [ref]$errs); if (-not ($errs | Where-Object { $_.IncompleteInput })) { $e = [char]27; $one = $l.Replace([char]13, ' ').Replace([char]10, ' '); [Console]::Write("$e]133;C;$one`a") } } } } catch {}"#,
            );
            // Windows PowerShell 5.1 (rơi về khi không có `pwsh` trên PATH) không có `$PSStyle`
            // — tính năng của PowerShell 7.2+ — nên `Get-ChildItem`/`dir`/`ls` ra chữ trắng
            // trơn, không một mã ANSI nào.
            //
            // Đã thử đè hàm `Out-Default` trước và phải bỏ: engine echo kết quả một statement
            // top-level (gõ `ls` rồi Enter, không gán biến, không pipe tiếp) không đi qua tra
            // cứu lệnh theo tên — nó gọi thẳng `OutDefaultCommand` nội bộ, nên hàm cùng tên
            // không chặn được đường đó (đã đo: hàm chỉ chạy khi *tự tay* pipe vào `Out-Default`).
            //
            // Đổi hướng: đè alias `ls`/`dir` sang một hàm tự in màu. Hàm soi
            // `$MyInvocation.PipelinePosition` so với `PipelineLength` — đứng cuối pipeline
            // (gõ trần, không pipe tiếp) mới tô màu rồi in; còn bị pipe tiếp
            // (`ls | Where-Object …`) thì trả nguyên object `FileInfo`/`DirectoryInfo`, không
            // đụng gì — script khác gọi `dir`/`ls` để lọc/pipe không bị vỡ.
            script.push_str(
                r#"; if (-not $PSStyle) { function global:Show-ColorDir { $items = Get-ChildItem @args; $isTerminal = $MyInvocation.PipelinePosition -ge $MyInvocation.PipelineLength; if (-not $isTerminal) { return $items }; $e = [char]27; foreach ($i in $items) { $n = $i.Name; if ($i.PSIsContainer) { Write-Host "$e[1;34m$n$e[0m" } elseif ($i.Extension -match '\.(exe|bat|cmd|ps1|psm1)$') { Write-Host "$e[1;32m$n$e[0m" } elseif ($i.Extension -match '\.(zip|7z|rar|gz|tar)$') { Write-Host "$e[1;31m$n$e[0m" } else { Write-Host $n } } }; Set-Alias -Name ls -Value Show-ColorDir -Scope Global -Option AllScope -Force; Set-Alias -Name dir -Value Show-ColorDir -Scope Global -Option AllScope -Force }"#,
            );
            // `NONAME_BOOT_CMD` được `pty_spawn` gửi sau khi frontend đã đăng ký Channel.
            // Không chạy ở đây: chạy cả hai đường sẽ nhân đôi workload benchmark và có thể
            // xả output trước khi xterm kịp ack, làm số throughput không còn đáng tin.
            cmd.args(["-NoLogo", "-NoExit", "-Command", &script]);
        }
        match cwd {
            Some(d) => cmd.cwd(d),
            None => {
                if let Ok(d) = std::env::current_dir() {
                    cmd.cwd(d);
                }
            }
        }
        cmd.env("TERM", "xterm-256color");

        let child = pair.slave.spawn_command(cmd).map_err(|e| anyhow!("spawn {shell}: {e}"))?;
        // Bỏ slave để reader nhận EOF khi shell thoát.
        drop(pair.slave);

        let mut reader = pair.master.try_clone_reader().map_err(|e| anyhow!("reader: {e}"))?;
        let writer = pair.master.take_writer().map_err(|e| anyhow!("writer: {e}"))?;

        let flow = Arc::new(Flow::new());
        let alive = Arc::new(AtomicBool::new(true));
        let buf = Arc::new(Mutex::new(Vec::<u8>::with_capacity(READ_BUF)));

        // ── thread đọc ───────────────────────────────────────────────────────
        // Chỉ gom. Ngưỡng gom đặt trên 16 KB mới có tác dụng: ConPTY trả dữ liệu
        // theo đợt ~16 KB nên mọi ngưỡng nhỏ hơn bị vượt ngay lập tức (A7).
        {
            let buf = buf.clone();
            let ch = on_data.clone();
            let alive = alive.clone();
            let flow = flow.clone();
            std::thread::spawn(move || {
                let mut chunk = vec![0u8; READ_BUF];
                loop {
                    match reader.read(&mut chunk) {
                        Ok(0) | Err(_) => break,
                        Ok(n) => {
                            let out = {
                                let mut b = buf.lock().unwrap();
                                b.extend_from_slice(&chunk[..n]);
                                if b.len() >= READ_BUF {
                                    Some(std::mem::replace(&mut *b, Vec::with_capacity(READ_BUF)))
                                } else {
                                    None
                                }
                            };
                            if let Some(out) = out {
                                flow.acquire();
                                if ch.send(InvokeResponseBody::Raw(out)).is_err() {
                                    break;
                                }
                            }
                        }
                    }
                }
                alive.store(false, Ordering::Relaxed);
            });
        }

        // ── thread hẹn giờ ───────────────────────────────────────────────────
        // Tách riêng vì `read()` là blocking: gộp chung một vòng lặp thì phần dư
        // sẽ nằm chờ tới khi có byte mới, tức prompt hiện chậm.
        {
            let buf = buf.clone();
            let ch = on_data.clone();
            let alive = alive.clone();
            let flow = flow.clone();
            std::thread::spawn(move || {
                while alive.load(Ordering::Relaxed) {
                    std::thread::sleep(Duration::from_millis(flush_ms.max(1)));
                    let out = {
                        let mut b = buf.lock().unwrap();
                        if b.is_empty() {
                            None
                        } else {
                            Some(std::mem::replace(&mut *b, Vec::with_capacity(READ_BUF)))
                        }
                    };
                    if let Some(out) = out {
                        flow.acquire();
                        if ch.send(InvokeResponseBody::Raw(out)).is_err() {
                            break;
                        }
                    }
                }
            });
        }

        Ok(PtySession { master: pair.master, writer, child, flow, alive })
    }

    pub fn write(&mut self, data: &[u8]) -> Result<()> {
        self.writer.write_all(data)?;
        self.writer.flush()?;
        Ok(())
    }

    pub fn resize(&self, rows: u16, cols: u16) -> Result<()> {
        self.master
            .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| anyhow!("resize: {e}"))
    }

    /// Frontend báo đã ghi xong `k` chunk vào xterm.
    pub fn ack(&self, k: usize) {
        self.flow.release(k);
    }

    pub fn is_alive(&self) -> bool {
        self.alive.load(Ordering::Relaxed)
    }

}

impl Drop for PtySession {
    /// Không có cái này thì đóng panel sẽ để lại `pwsh.exe` mồ côi (tiêu chí B4).
    fn drop(&mut self) {
        self.alive.store(false, Ordering::Relaxed);
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
