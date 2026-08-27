mod audio;
mod fs_cmd;
mod pty;
mod storage;
mod system;
mod wallpaper;
mod watcher;
mod window_cmd;

use pty::session::SessionId;
use pty::PtyManager;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{Manager, State};
use watcher::WatcherManager;

/// Gom output PTY trong khoảng này rồi mới đẩy qua Channel.
/// 12 ms ≈ một khung hình ở 60–120 Hz; nhỏ hơn thì tốn IPC mà mắt không thấy khác.
const FLUSH_MS: u64 = 12;

#[tauri::command]
fn pty_spawn(
    app: tauri::AppHandle,
    mgr: State<'_, PtyManager>,
    shell: Option<String>,
    cwd: Option<String>,
    rows: u16,
    cols: u16,
    on_data: Channel<InvokeResponseBody>,
) -> Result<SessionId, String> {
    let id = mgr
        .spawn(shell, cwd, rows, cols, on_data, FLUSH_MS)
        .map_err(|e| e.to_string())?;

    // Ghi nối, không ghi đè: số **lần** spawn mới là thứ nói được panel có bị dựng lại hay
    // không. Đếm shell đang sống thì không phân biệt nổi — shell bị kill rồi spawn lại vẫn
    // ra đúng bằng số panel.
    let log_path = std::env::temp_dir().join("pty_spawn.log");
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
        use std::io::Write;
        let _ = writeln!(f, "spawned id={id} rows={rows} cols={cols}");
    }

    // Hook đo đạc: gõ sẵn một lệnh vào session đầu tiên.
    // Chỉ bật khi có biến môi trường, nên không ảnh hưởng lúc chạy bình thường.
    // Cần nó vì tiêu chí B7 phải đổ 47,7 MB mà không có ai ngồi gõ.
    if let Ok(cmd) = std::env::var("NONAME_BOOT_CMD") {
        let handle = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(3500));
            let mgr = handle.state::<PtyManager>();
            let _ = mgr.write(id, cmd.as_bytes());
            let _ = mgr.write(id, b"\r\n");
        });
    }

    Ok(id)
}

#[tauri::command]
fn pty_write(mgr: State<'_, PtyManager>, session_id: SessionId, data: Vec<u8>) -> Result<(), String> {
    mgr.write(session_id, &data).map_err(|e| e.to_string())
}

#[tauri::command]
fn pty_resize(
    mgr: State<'_, PtyManager>,
    session_id: SessionId,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    mgr.resize(session_id, rows, cols).map_err(|e| e.to_string())
}

/// Frontend gọi sau khi xterm đã ghi xong chunk — nhả cửa sổ trượt ra.
#[tauri::command]
fn pty_ack(mgr: State<'_, PtyManager>, session_id: SessionId, count: usize) {
    mgr.ack(session_id, count);
}

#[tauri::command]
fn pty_kill(mgr: State<'_, PtyManager>, session_id: SessionId) {
    mgr.kill(session_id);
}


/// Số panel mở sẵn lúc khởi động. Hook đo đạc cho D4/D5; mặc định 1 nên chạy thường không đổi gì.
#[tauri::command]
fn boot_panels() -> u32 {
    std::env::var("NONAME_PANELS")
        .ok()
        .and_then(|v| v.parse().ok())
        .filter(|n| *n >= 1 && *n <= 16)
        .unwrap_or(1)
}

/// Hook đo đạc cho E2–E5: mở file preview lúc khởi động nếu có biến môi trường NONAME_PREVIEW_FILE.
#[tauri::command]
fn boot_preview() -> Option<String> {
    std::env::var("NONAME_PREVIEW_FILE").ok().filter(|s| !s.is_empty())
}

/// Hook đo đạc, anh em với `NONAME_BOOT_CMD`: frontend báo màu nó vừa sinh ra.
/// Không có biến môi trường thì đây là no-op, nên không tốn gì lúc chạy bình thường.
#[tauri::command]
fn theme_report(app: tauri::AppHandle, report: serde_json::Value) {
    let Ok(path) = std::env::var("NONAME_THEME_DUMP") else {
        return;
    };
    let text = serde_json::to_string_pretty(&report).unwrap_or_default();
    let _ = std::fs::write(&path, text);
    if std::env::var("NONAME_THEME_EXIT").is_ok() {
        app.exit(0);
    }
}

/// Ghi lỗi runtime của frontend ra đĩa.
///
/// Bản release của WebView2 không mở được devtools, nên một lỗi JS lúc khởi động chỉ
/// biểu hiện ra ngoài dưới dạng "cửa sổ trắng, không có shell nào" — không đủ để lần ra
/// nguyên nhân. Ghi ra file là cách rẻ nhất để lỗi đó nói được nó là lỗi gì.
#[tauri::command]
fn frontend_error(message: String) {
    use std::io::Write;
    let path = std::env::temp_dir().join("noname_frontend_error.log");
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(f, "{message}");
    }
}

#[tauri::command]
fn pty_alive(mgr: State<'_, PtyManager>, session_id: SessionId) -> bool {
    mgr.is_alive(session_id)
}

#[tauri::command]
fn app_window_set_vibrancy(window: tauri::Window, enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if enabled {
            if window_vibrancy::apply_acrylic(&window, Some((16, 18, 24, 120))).is_err() {
                window_vibrancy::apply_mica(&window, Some(true)).map_err(|e| e.to_string())?;
            }
        } else {
            let _ = window_vibrancy::clear_acrylic(&window);
            let _ = window_vibrancy::clear_mica(&window);
        }
    }
    Ok(())
}

/// Báo WebView2 ưu tiên thu hồi cache khi cửa sổ mất focus. Đây là mức mục tiêu native,
/// không suspend JavaScript nên terminal vẫn đọc output và ACK luồng PTY bình thường.
#[cfg(target_os = "windows")]
fn set_webview_memory_target(window: &tauri::Window, low: bool) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
    };
    use windows::core::Interface;

    let Some(webview) = window.app_handle().get_webview_window(window.label()) else {
        return;
    };

    let _ = webview.with_webview(move |platform| {
        let Ok(core) = (unsafe { platform.controller().CoreWebView2() }) else {
            return;
        };
        let Ok(core_v19) = core.cast::<ICoreWebView2_19>() else {
            return;
        };
        let target = if low {
            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
        } else {
            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
        };
        let _ = unsafe { core_v19.SetMemoryUsageTargetLevel(target) };
    });
}

/// Chặn các browser accelerator mà WebView2 xử lý trước DOM. Nếu chỉ nghe `keydown`
/// trong React thì F5/F11 vẫn lọt khi focus nằm trong iframe khác origin, còn F12 có thể
/// mở inspector trước khi frontend kịp huỷ sự kiện.
#[cfg(target_os = "windows")]
fn install_webview_shortcuts(window: &tauri::WebviewWindow) {
    use tauri::Emitter;
    use webview2_com::AcceleratorKeyPressedEventHandler;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN, COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN,
        COREWEBVIEW2_PHYSICAL_KEY_STATUS,
    };

    let event_window = window.clone();
    let _ = window.with_webview(move |platform| {
        let controller = platform.controller();

        // Wry already defaults this to false in release builds. Set it explicitly here so
        // a future feature/config change cannot accidentally expose production DevTools.
        #[cfg(not(debug_assertions))]
        if let Ok(core) = unsafe { controller.CoreWebView2() } {
            if let Ok(settings) = unsafe { core.Settings() } {
                let _ = unsafe { settings.SetAreDevToolsEnabled(false) };
            }
        }

        let handler = AcceleratorKeyPressedEventHandler::create(Box::new(move |_sender, args| {
            let Some(args) = args else {
                return Ok(());
            };

            let mut kind = COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN;
            unsafe { args.KeyEventKind(&mut kind)? };
            if kind != COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN
                && kind != COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN
            {
                return Ok(());
            }

            let mut status = COREWEBVIEW2_PHYSICAL_KEY_STATUS::default();
            unsafe { args.PhysicalKeyStatus(&mut status)? };
            if status.WasKeyDown.as_bool() {
                return Ok(());
            }

            let mut key = 0_u32;
            unsafe { args.VirtualKey(&mut key)? };
            let action = match key {
                0x74 => Some("reload-web"),        // VK_F5
                0x7A => Some("toggle-fullscreen"), // VK_F11
                _ => None,
            };

            if let Some(action) = action {
                unsafe { args.SetHandled(true)? };
                let _ = event_window.emit("app-shortcut", action);
                return Ok(());
            }

            // Debug builds keep F12 available to developers. The shipped executable both
            // disables DevTools above and consumes the accelerator itself as defence-in-depth.
            #[cfg(not(debug_assertions))]
            if key == 0x7B {
                // VK_F12
                unsafe { args.SetHandled(true)? };
            }

            Ok(())
        }));

        let mut token = 0;
        let _ = unsafe { controller.add_AcceleratorKeyPressed(&handler, &mut token) };
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .manage(PtyManager::default())
        .manage(WatcherManager::default())
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            if let Some(win) = app.get_webview_window("main") {
                #[cfg(target_os = "windows")]
                {
                    install_webview_shortcuts(&win);
                    // Áp dụng Acrylic blur / Mica cho Windows 11/10
                    if let Err(_) = window_vibrancy::apply_acrylic(&win, Some((16, 18, 24, 120))) {
                        let _ = window_vibrancy::apply_mica(&win, Some(true));
                    }
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Đóng cửa sổ mà không dọn thì `pwsh.exe` sống tiếp (tiêu chí B4 / D4).
            match event {
                #[cfg(target_os = "windows")]
                tauri::WindowEvent::Focused(focused) => {
                    set_webview_memory_target(window, !focused);
                }
                tauri::WindowEvent::Destroyed | tauri::WindowEvent::CloseRequested { .. } => {
                    if let Some(mgr) = window.try_state::<PtyManager>() {
                        mgr.kill_all();
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            pty_spawn,
            pty_write,
            pty_resize,
            pty_ack,
            pty_kill,
            pty_alive,
            frontend_error,
            system::system_info,
            system::system_metrics,
            audio::audio_levels,
            audio::audio_set_active,
            audio::media_set_active,
            audio::now_playing,
            wallpaper::wallpaper_path,
            wallpaper::wallpaper_pick,
            wallpaper::sysfetch_logo_pick,
            theme_report,
            boot_panels,
            boot_preview,
            fs_cmd::fs_read_text,
            fs_cmd::fs_stat,
            fs_cmd::fs_open_external,
            fs_cmd::fs_reveal,
            fs_cmd::fs_resolve_path,
            fs_cmd::fs_list_dir,
            fs_cmd::fs_cwd,
            fs_cmd::fs_list_drives,
            watcher::watch_file,
            watcher::unwatch_file,
            storage::storage_save_state,
            storage::storage_load_state,
            window_cmd::app_window_minimize,
            window_cmd::app_window_toggle_maximize,
            window_cmd::app_window_is_maximized,
            window_cmd::app_window_close,
            window_cmd::app_window_set_fullscreen,
            window_cmd::app_window_system_menu,
            app_window_set_vibrancy
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
