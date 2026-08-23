// SPIKE — code vứt đi. Mục đích duy nhất: đo 4 ẩn số ở PROJECT_CONTEXT.md §8.
// Không refactor, không test, không đưa vào codebase chính.

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{Manager, State};

struct Pty {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    #[allow(dead_code)]
    child: Box<dyn Child + Send + Sync>,
    alive: Arc<AtomicBool>,
}

#[derive(Default)]
struct AppState {
    pty: Mutex<Option<Pty>>,
    /// Tổng byte đã đọc từ PTY — để tính throughput ở phía Rust, không tin số của JS.
    bytes: Arc<AtomicU64>,
    /// Số lần flush qua Channel — chia bytes/flush ra cỡ chunk trung bình thật.
    flushes: Arc<AtomicU64>,
}

/// pwsh 7 nếu có trên PATH, không thì Windows PowerShell 5.1.
fn pick_shell() -> String {
    let candidates = ["pwsh.exe", "powershell.exe"];
    let paths = std::env::var_os("PATH");
    for c in candidates {
        if let Some(p) = &paths {
            if std::env::split_paths(p).any(|d| d.join(c).is_file()) {
                return c.to_string();
            }
        }
    }
    "powershell.exe".to_string()
}

#[derive(serde::Serialize)]
struct StartInfo {
    shell: String,
    /// Ngưỡng thật trong tauri 2.11: Raw < 1024 byte đi qua eval + JSON array
    /// (chậm hơn cả string), >= 1024 mới đi đường fetch nhị phân. Xem ipc/channel.rs:163.
    raw_threshold: usize,
    /// Bật bằng biến môi trường SPIKE_AUTOBENCH — để `bench.ps1` chạy A3/A7 không cần người gõ.
    autobench: bool,
    flush_ms: u64,
    min_bytes: usize,
    /// SPIKE_HOLD_SEC: giữ app sống thêm sau khi bench xong, để đo RAM đã ổn định.
    /// Đỉnh tức thời không phân biệt được rò rỉ thật với GC chậm.
    hold_sec: u64,
    /// SPIKE_BLUR: bật sẵn overlay backdrop-filter để đo A5 mà không cần bấm tay.
    blur: bool,
}

#[tauri::command]
fn pty_start(
    state: State<'_, AppState>,
    rows: u16,
    cols: u16,
    flush_ms: u64,
    min_bytes: usize,
    on_data: Channel<InvokeResponseBody>,
) -> Result<StartInfo, String> {
    let mut slot = state.pty.lock().unwrap();
    if slot.is_some() {
        return Err("PTY đã chạy".into());
    }

    // Env thắng tham số từ JS — bench.ps1 điều khiển toàn bộ sweep từ bên ngoài.
    let flush_ms: u64 = std::env::var("SPIKE_FLUSH_MS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(flush_ms);
    let min_bytes: usize = std::env::var("SPIKE_MIN_BYTES")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(min_bytes);
    let autobench = std::env::var("SPIKE_AUTOBENCH").is_ok();
    let hold_sec: u64 = std::env::var("SPIKE_HOLD_SEC")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    let blur = std::env::var("SPIKE_BLUR").is_ok();

    let sys = native_pty_system();
    let pair = sys
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let shell = pick_shell();
    let mut cmd = CommandBuilder::new(&shell);
    if let Ok(cwd) = std::env::current_dir() {
        cmd.cwd(cwd);
    }
    cmd.env("TERM", "xterm-256color");

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    // Bỏ slave đi để reader nhận EOF khi shell thoát.
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let alive = Arc::new(AtomicBool::new(true));
    let buf = Arc::new(Mutex::new(Vec::<u8>::with_capacity(1 << 16)));
    let bytes = state.bytes.clone();
    let flushes = state.flushes.clone();

    // ── thread đọc: chỉ gom, chỉ tự flush khi đã đủ min_bytes ───────────────
    {
        let buf = buf.clone();
        let ch = on_data.clone();
        let alive = alive.clone();
        let flushes = flushes.clone();
        std::thread::spawn(move || {
            let mut chunk = vec![0u8; 1 << 16];
            loop {
                match reader.read(&mut chunk) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        bytes.fetch_add(n as u64, Ordering::Relaxed);
                        let out = {
                            let mut b = buf.lock().unwrap();
                            b.extend_from_slice(&chunk[..n]);
                            if b.len() >= min_bytes {
                                Some(std::mem::replace(&mut *b, Vec::with_capacity(1 << 16)))
                            } else {
                                None
                            }
                        };
                        if let Some(out) = out {
                            flushes.fetch_add(1, Ordering::Relaxed);
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

    // ── thread hẹn giờ: đẩy phần dư để chunk nhỏ không kẹt chờ đủ min_bytes ─
    {
        let buf = buf.clone();
        let ch = on_data.clone();
        let alive = alive.clone();
        std::thread::spawn(move || {
            while alive.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(flush_ms.max(1)));
                let out = {
                    let mut b = buf.lock().unwrap();
                    if b.is_empty() {
                        None
                    } else {
                        Some(std::mem::replace(&mut *b, Vec::with_capacity(1 << 16)))
                    }
                };
                if let Some(out) = out {
                    flushes.fetch_add(1, Ordering::Relaxed);
                    if ch.send(InvokeResponseBody::Raw(out)).is_err() {
                        break;
                    }
                }
            }
        });
    }

    *slot = Some(Pty { master: pair.master, writer, child, alive });

    Ok(StartInfo { shell, raw_threshold: 1024, autobench, flush_ms, min_bytes, hold_sec, blur })
}

#[tauri::command]
fn pty_write(state: State<'_, AppState>, data: Vec<u8>) -> Result<(), String> {
    let mut slot = state.pty.lock().unwrap();
    let pty = slot.as_mut().ok_or("PTY chưa chạy")?;
    pty.writer.write_all(&data).map_err(|e| e.to_string())?;
    pty.writer.flush().map_err(|e| e.to_string())
}

#[tauri::command]
fn pty_resize(state: State<'_, AppState>, rows: u16, cols: u16) -> Result<(), String> {
    let slot = state.pty.lock().unwrap();
    let pty = slot.as_ref().ok_or("PTY chưa chạy")?;
    pty.master
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
struct Stats {
    bytes: u64,
    flushes: u64,
    alive: bool,
}

/// Số đo lấy từ Rust, không lấy từ JS — JS đơ thì số của JS cũng sai theo.
#[tauri::command]
fn pty_stats(state: State<'_, AppState>) -> Stats {
    Stats {
        bytes: state.bytes.load(Ordering::Relaxed),
        flushes: state.flushes.load(Ordering::Relaxed),
        alive: state
            .pty
            .lock()
            .unwrap()
            .as_ref()
            .map(|p| p.alive.load(Ordering::Relaxed))
            .unwrap_or(false),
    }
}

#[tauri::command]
fn pty_stats_reset(state: State<'_, AppState>) {
    state.bytes.store(0, Ordering::Relaxed);
    state.flushes.store(0, Ordering::Relaxed);
}

/// Frontend gọi khi bench xong: ghi báo cáo ra file rồi thoát, để `bench.ps1` chạy tiếp
/// giá trị min_bytes kế tiếp. Không có bước này thì A7 phải làm tay 4 lần.
#[tauri::command]
fn bench_done(app: tauri::AppHandle, report: serde_json::Value) -> Result<(), String> {
    let dir = std::env::var("SPIKE_OUT").unwrap_or_else(|_| ".".to_string());
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let tag = report
        .get("min_bytes")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let path = std::path::Path::new(&dir).join(format!("bench-{tag}.json"));
    let text = serde_json::to_string_pretty(&report).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    eprintln!("bench ghi vào {}", path.display());
    app.exit(0);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .setup(|app| {
            let win = app.get_webview_window("main").unwrap();
            // §7.6 — Mica. Lỗi thì kệ, spike vẫn chạy được để đo phần còn lại.
            #[cfg(target_os = "windows")]
            if let Err(e) = window_vibrancy::apply_mica(&win, Some(true)) {
                eprintln!("apply_mica thất bại: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pty_start,
            pty_write,
            pty_resize,
            pty_stats,
            pty_stats_reset,
            bench_done
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
