//! Cầu nối giữa chrome React và WebView2 thật của native browser overlay.
//!
//! Overlay là một `WebviewWindow` không viền do frontend tạo (xem `NativeBrowserSurface.tsx`).
//! Không có nó thì mọi lệnh ở đây trả lỗi có cấu trúc để `WebPanel` quay về iframe.
//!
//! Vì sao phải đi vòng qua COM: `WebviewWindow` của Tauri chỉ cho `eval`, không cho
//! back/forward/reload hay đọc URL thật của trang khác origin. Chỉ `ICoreWebView2` mới
//! biết trang đang ở đâu sau khi người dùng bấm link *bên trong* trang.

use serde::Serialize;

/// Trạng thái trang mà chrome React vẽ ra. Không bao giờ đoán: mọi field đọc từ WebView2.
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserState {
    pub label: String,
    pub url: String,
    pub title: String,
    pub loading: bool,
    pub can_go_back: bool,
    pub can_go_forward: bool,
}

/// Một vùng bị khoét khỏi overlay, theo pixel vật lý tính từ góc trên trái của overlay.
/// Đây là chỗ một hòn đảo UI của shell (dock, thanh trên) đang nổi lên trên trang web.
#[derive(Clone, Copy, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShapeHole {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
    pub radius: i32,
}

/// Chỉ http/https được phép tới WebView2. `javascript:`, `file:`, `data:` bị chặn ở đây
/// chứ không chỉ ở frontend — backend là ranh giới tin cậy cuối cùng.
fn check_web_url(url: &str) -> Result<(), String> {
    let lowered = url.trim().to_ascii_lowercase();
    if lowered.starts_with("http://") || lowered.starts_with("https://") {
        Ok(())
    } else {
        Err(format!("blocked non-web url: {url}"))
    }
}

#[cfg(target_os = "windows")]
mod imp {
    use super::{check_web_url, BrowserState};
    use std::collections::HashSet;
    use std::sync::Mutex;
    use tauri::{Emitter, Manager};
    use webview2_com::take_pwstr;
    use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2, ICoreWebView2_19};
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Controller, COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN,
        COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN, COREWEBVIEW2_PHYSICAL_KEY_STATUS,
    };
    use webview2_com::{
        AcceleratorKeyPressedEventHandler, DocumentTitleChangedEventHandler,
        HistoryChangedEventHandler, NavigationCompletedEventHandler,
        NavigationStartingEventHandler, NewWindowRequestedEventHandler, ProcessFailedEventHandler,
        SourceChangedEventHandler,
    };
    use windows::core::{Interface, BOOL, PCWSTR, PWSTR};

    /// Cửa sổ nào đã gắn event handler rồi. StrictMode/HMR gọi attach nhiều lần là chuyện
    /// bình thường; gắn hai lần thì mỗi lần điều hướng sẽ emit hai event.
    #[derive(Default)]
    pub struct BrowserRegistry {
        attached: Mutex<HashSet<String>>,
    }

    impl BrowserRegistry {
        fn claim(&self, label: &str) -> bool {
            let mut set = self.attached.lock().unwrap_or_else(|e| e.into_inner());
            set.insert(label.to_string())
        }

        fn release(&self, label: &str) {
            let mut set = self.attached.lock().unwrap_or_else(|e| e.into_inner());
            set.remove(label);
        }
    }

    /// Quên một label khi cửa sổ của nó bị đóng, để label dùng lại vẫn attach được.
    pub fn forget(app: &tauri::AppHandle, label: &str) {
        if let Some(registry) = app.try_state::<BrowserRegistry>() {
            registry.release(label);
        }
    }

    /// Chạy `f` trên main thread với `ICoreWebView2` của overlay rồi mang kết quả về.
    ///
    /// `with_webview` chỉ *xếp hàng* công việc lên main thread, nên hàm này phải chờ.
    /// Vì vậy mọi command gọi nó đều là `async`: command đồng bộ của Tauri chạy ngay trên
    /// main thread và sẽ tự khoá chính nó ở đây.
    fn with_core<T, F>(app: &tauri::AppHandle, label: &str, f: F) -> Result<T, String>
    where
        F: FnOnce(&ICoreWebView2) -> Result<T, String> + Send + 'static,
        T: Send + 'static,
    {
        let window = app
            .get_webview_window(label)
            .ok_or_else(|| format!("native browser window is gone: {label}"))?;
        let (tx, rx) = std::sync::mpsc::channel();
        window
            .with_webview(move |platform| {
                let result = match unsafe { platform.controller().CoreWebView2() } {
                    Ok(core) => f(&core),
                    Err(err) => Err(err.to_string()),
                };
                let _ = tx.send(result);
            })
            .map_err(|e| e.to_string())?;
        rx.recv_timeout(std::time::Duration::from_secs(5))
            .map_err(|_| format!("native browser did not respond: {label}"))?
    }

    /// Bản `with_core` cho những thứ chỉ có trên controller (accelerator key).
    fn with_controller<F>(app: &tauri::AppHandle, label: &str, f: F) -> Result<(), String>
    where
        F: FnOnce(&ICoreWebView2Controller) -> Result<(), String> + Send + 'static,
    {
        let window = app
            .get_webview_window(label)
            .ok_or_else(|| format!("native browser window is gone: {label}"))?;
        let (tx, rx) = std::sync::mpsc::channel();
        window
            .with_webview(move |platform| {
                let _ = tx.send(f(&platform.controller()));
            })
            .map_err(|e| e.to_string())?;
        rx.recv_timeout(std::time::Duration::from_secs(5))
            .map_err(|_| format!("native browser did not respond: {label}"))?
    }

    fn read_string(read: impl FnOnce(*mut PWSTR) -> windows::core::Result<()>) -> String {
        let mut raw = PWSTR::null();
        match read(&mut raw) {
            Ok(()) => take_pwstr(raw),
            Err(_) => String::new(),
        }
    }

    fn read_state(label: &str, core: &ICoreWebView2, loading: Option<bool>) -> BrowserState {
        let url = read_string(|out| unsafe { core.Source(out) });
        let title = read_string(|out| unsafe { core.DocumentTitle(out) });
        let mut back = BOOL(0);
        let mut forward = BOOL(0);
        let _ = unsafe { core.CanGoBack(&mut back) };
        let _ = unsafe { core.CanGoForward(&mut forward) };
        BrowserState {
            label: label.to_string(),
            url,
            title,
            loading: loading.unwrap_or(false),
            can_go_back: back.as_bool(),
            can_go_forward: forward.as_bool(),
        }
    }

    /// Chỉ main shell cần biết; overlay là trang của người khác, không gửi event vào đó.
    fn emit_state(app: &tauri::AppHandle, state: &BrowserState) {
        let _ = app.emit_to("main", "browser-state", state);
    }

    /// Phím mà Tethys giành lại từ trang, gửi về main shell dưới dạng mô tả phím.
    #[derive(Clone, serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ShortcutEvent {
        label: String,
        key: String,
        code: String,
        ctrl: bool,
        alt: bool,
        shift: bool,
    }

    /// VK của Windows → cặp `key`/`code` của DOM, để main shell dựng lại đúng
    /// `KeyboardEvent` mà bảng phím tắt trong `App.tsx` đang so.
    fn key_and_code(vk: u32) -> Option<(String, String)> {
        let pair = match vk {
            0x09 => ("Tab".to_string(), "Tab".to_string()),
            0x0D => ("Enter".to_string(), "Enter".to_string()),
            0x25 => ("ArrowLeft".to_string(), "ArrowLeft".to_string()),
            0x26 => ("ArrowUp".to_string(), "ArrowUp".to_string()),
            0x27 => ("ArrowRight".to_string(), "ArrowRight".to_string()),
            0x28 => ("ArrowDown".to_string(), "ArrowDown".to_string()),
            0x30..=0x39 => {
                let digit = (b'0' + (vk - 0x30) as u8) as char;
                (digit.to_string(), format!("Digit{digit}"))
            }
            0x60..=0x69 => {
                let digit = (b'0' + (vk - 0x60) as u8) as char;
                (digit.to_string(), format!("Numpad{digit}"))
            }
            0x41..=0x5A => {
                let upper = (b'A' + (vk - 0x41) as u8) as char;
                (upper.to_ascii_lowercase().to_string(), format!("Key{upper}"))
            }
            0x70..=0x7B => {
                let name = format!("F{}", vk - 0x6F);
                (name.clone(), name)
            }
            0xBC => (",".to_string(), "Comma".to_string()),
            0xDB => ("[".to_string(), "BracketLeft".to_string()),
            0xDD => ("]".to_string(), "BracketRight".to_string()),
            _ => return None,
        };
        Some(pair)
    }

    /// Danh sách trắng, không phải danh sách đen: chỉ đúng những tổ hợp `App.tsx` thật sự
    /// gán mới bị lấy khỏi trang. Ctrl+C/F/R/L/P và mọi thứ còn lại vẫn là của trang.
    fn shell_shortcut(vk: u32, ctrl: bool, alt: bool, shift: bool) -> Option<(String, String)> {
        let (key, code) = key_and_code(vk)?;
        let digit_1_to_9 = |prefix: &str| {
            code.strip_prefix(prefix)
                .and_then(|rest| rest.parse::<u8>().ok())
                .is_some_and(|n| (1..=9).contains(&n))
        };
        let taken = match () {
            _ if !ctrl && !alt && !shift => code == "F1" || code == "F11",
            _ if alt && !ctrl && !shift => {
                code == "Enter"
                    || code == "KeyT"
                    || code == "KeyW"
                    || digit_1_to_9("Digit")
                    || digit_1_to_9("Numpad")
            }
            _ if ctrl && alt && !shift => code.starts_with("Arrow"),
            _ if ctrl && shift && !alt => matches!(
                code.as_str(),
                "KeyP" | "KeyE" | "KeyO" | "KeyD" | "KeyW" | "BracketLeft" | "BracketRight"
            ),
            _ if ctrl && !alt && !shift => matches!(
                code.as_str(),
                "KeyK" | "KeyT" | "KeyW" | "Tab" | "Comma" | "Digit1" | "Digit3" | "Numpad1"
                    | "Numpad3"
            ),
            _ => false,
        };
        taken.then_some((key, code))
    }

    fn modifier_down(vk: i32) -> bool {
        use windows::Win32::UI::Input::KeyboardAndMouse::GetKeyState;
        unsafe { GetKeyState(vk) }.lt(&0)
    }

    /// Gắn handler cho một overlay. Gọi lại trên cùng label là no-op.
    ///
    /// Token của handler không được tháo thủ công: chúng sống trong `ICoreWebView2`, mà
    /// interface đó không `Send` nên không giữ được ngoài main thread. WebView2 tự giải
    /// phóng toàn bộ handler khi controller của cửa sổ bị huỷ, nên chỉ cần quên label đi.
    pub fn attach(app: tauri::AppHandle, label: String) -> Result<(), String> {
        if !app.state::<BrowserRegistry>().claim(&label) {
            return Ok(());
        }

        let handle = app.clone();
        let attached_label = label.clone();
        let result = with_core(&app, &label, move |core| {
            let mut token = 0_i64;

            let started = {
                let app = handle.clone();
                let label = attached_label.clone();
                NavigationStartingEventHandler::create(Box::new(move |sender, _args| {
                    if let Some(core) = sender {
                        emit_state(&app, &read_state(&label, &core, Some(true)));
                    }
                    Ok(())
                }))
            };
            unsafe { core.add_NavigationStarting(&started, &mut token) }
                .map_err(|e| e.to_string())?;

            let completed = {
                let app = handle.clone();
                let label = attached_label.clone();
                NavigationCompletedEventHandler::create(Box::new(move |sender, _args| {
                    if let Some(core) = sender {
                        emit_state(&app, &read_state(&label, &core, Some(false)));
                    }
                    Ok(())
                }))
            };
            unsafe { core.add_NavigationCompleted(&completed, &mut token) }
                .map_err(|e| e.to_string())?;

            // SourceChanged bắt điều hướng trong cùng document (history.pushState), thứ mà
            // NavigationStarting/Completed không thấy.
            let source = {
                let app = handle.clone();
                let label = attached_label.clone();
                SourceChangedEventHandler::create(Box::new(move |sender, _args| {
                    if let Some(core) = sender {
                        emit_state(&app, &read_state(&label, &core, None));
                    }
                    Ok(())
                }))
            };
            unsafe { core.add_SourceChanged(&source, &mut token) }.map_err(|e| e.to_string())?;

            let title = {
                let app = handle.clone();
                let label = attached_label.clone();
                DocumentTitleChangedEventHandler::create(Box::new(move |sender, _args| {
                    if let Some(core) = sender {
                        emit_state(&app, &read_state(&label, &core, None));
                    }
                    Ok(())
                }))
            };
            unsafe { core.add_DocumentTitleChanged(&title, &mut token) }
                .map_err(|e| e.to_string())?;

            let history = {
                let app = handle.clone();
                let label = attached_label.clone();
                HistoryChangedEventHandler::create(Box::new(move |sender, _args| {
                    if let Some(core) = sender {
                        emit_state(&app, &read_state(&label, &core, None));
                    }
                    Ok(())
                }))
            };
            unsafe { core.add_HistoryChanged(&history, &mut token) }.map_err(|e| e.to_string())?;

            // `window.open` và target=_blank: một cửa sổ WebView2 mới sẽ không có ai bám
            // vào tile nào, nên nó đi ra trình duyệt mặc định thay vì trôi nổi trên desktop.
            let popup = {
                let app = handle.clone();
                NewWindowRequestedEventHandler::create(Box::new(move |_sender, args| {
                    let Some(args) = args else { return Ok(()) };
                    unsafe { args.SetHandled(true)? };
                    let uri = read_string(|out| unsafe { args.Uri(out) });
                    if check_web_url(&uri).is_ok() {
                        use tauri_plugin_opener::OpenerExt;
                        let _ = app.opener().open_url(uri, None::<&str>);
                    }
                    Ok(())
                }))
            };
            unsafe { core.add_NewWindowRequested(&popup, &mut token) }.map_err(|e| e.to_string())?;

            // Renderer chết thì overlay còn đó nhưng trắng trơn. Báo lên để panel đóng nó
            // và quay về iframe kèm thông báo, thay vì để người dùng nhìn một ô trống.
            let failed = {
                let app = handle.clone();
                let label = attached_label.clone();
                ProcessFailedEventHandler::create(Box::new(move |_sender, _args| {
                    let _ = app.emit_to("main", "browser-failed", &label);
                    Ok(())
                }))
            };
            unsafe { core.add_ProcessFailed(&failed, &mut token) }.map_err(|e| e.to_string())?;

            Ok(())
        });

        if result.is_err() {
            app.state::<BrowserRegistry>().release(&label);
            return result;
        }

        // Phím tắt của Tethys phải sống cả khi focus nằm trong trang. Overlay là WebView2
        // riêng nên `keydown` của main shell không bao giờ thấy chúng; chặn ở tầng
        // accelerator rồi kể lại cho main shell là đường duy nhất.
        let key_app = app.clone();
        let key_label = label.clone();
        let keys = with_controller(&app, &label, move |controller| {
            let handler = AcceleratorKeyPressedEventHandler::create(Box::new(move |_sender, args| {
                let Some(args) = args else { return Ok(()) };

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

                let mut vk = 0_u32;
                unsafe { args.VirtualKey(&mut vk)? };

                const VK_SHIFT: i32 = 0x10;
                const VK_CONTROL: i32 = 0x11;
                const VK_MENU: i32 = 0x12;
                let ctrl = modifier_down(VK_CONTROL);
                let alt = modifier_down(VK_MENU);
                let shift = modifier_down(VK_SHIFT);

                if let Some((key, code)) = shell_shortcut(vk, ctrl, alt, shift) {
                    unsafe { args.SetHandled(true)? };
                    let _ = key_app.emit_to(
                        "main",
                        "browser-key",
                        ShortcutEvent {
                            label: key_label.clone(),
                            key,
                            code,
                            ctrl,
                            alt,
                            shift,
                        },
                    );
                }
                Ok(())
            }));

            let mut token = 0_i64;
            unsafe { controller.add_AcceleratorKeyPressed(&handler, &mut token) }
                .map_err(|e| e.to_string())
        });

        // Attach chỉ được coi là xong khi *cả hai* nửa đã gắn. Giữ label trong khi nửa sau
        // hỏng sẽ khiến lần attach lại im lặng trả Ok mà phím tắt vẫn chết.
        if keys.is_err() {
            app.state::<BrowserRegistry>().release(&label);
        }
        keys
    }

    pub fn navigate(app: tauri::AppHandle, label: String, url: String) -> Result<(), String> {
        check_web_url(&url)?;
        with_core(&app, &label, move |core| {
            let wide: Vec<u16> = url.encode_utf16().chain(std::iter::once(0)).collect();
            unsafe { core.Navigate(PCWSTR(wide.as_ptr())) }.map_err(|e| e.to_string())
        })
    }

    pub fn reload(app: tauri::AppHandle, label: String) -> Result<(), String> {
        with_core(&app, &label, move |core| {
            unsafe { core.Reload() }.map_err(|e| e.to_string())
        })
    }

    pub fn go(app: tauri::AppHandle, label: String, forward: bool) -> Result<(), String> {
        with_core(&app, &label, move |core| {
            let call = if forward {
                unsafe { core.GoForward() }
            } else {
                unsafe { core.GoBack() }
            };
            call.map_err(|e| e.to_string())
        })
    }

    pub fn stop(app: tauri::AppHandle, label: String) -> Result<(), String> {
        with_core(&app, &label, move |core| {
            unsafe { core.Stop() }.map_err(|e| e.to_string())
        })
    }

    pub fn state(app: tauri::AppHandle, label: String) -> Result<BrowserState, String> {
        let owned = label.clone();
        with_core(&app, &label, move |core| Ok(read_state(&owned, core, None)))
    }

    /// Cắt cửa sổ overlay cho vừa cái tile: bo hai góc **dưới**, và khoét đi những vùng mà
    /// UI của shell đang nổi lên trên.
    ///
    /// Hai bài toán, một lời giải, vì cả hai đều không thể giải bằng CSS — đây là cửa sổ của
    /// hệ điều hành, nó không nằm trong DOM và `z-index` không với tới:
    ///
    /// 1. **Góc.** Panel Tethys bo 18px, cửa sổ Windows thì vuông; dán vào là thò ra hai cái
    ///    tai vuông ở đáy. Mẹo toạ độ: round-rect được dựng cao hơn cửa sổ đúng `2 * radius`
    ///    về phía trên, nên phần bo của hai góc trên nằm ngoài vùng nhìn thấy.
    /// 2. **Lỗ.** Dock và thanh trên nổi trên canvas. Cửa sổ owned luôn vẽ trên owner, nên
    ///    cách duy nhất để chúng lộ ra là cắt đúng vùng đó khỏi overlay.
    pub fn set_shape(
        app: tauri::AppHandle,
        label: String,
        radius: i32,
        holes: Vec<super::ShapeHole>,
    ) -> Result<(), String> {
        use windows::Win32::Graphics::Gdi::{
            CombineRgn, CreateRectRgn, CreateRoundRectRgn, DeleteObject, SetWindowRgn, HRGN, RGN_DIFF,
        };
        use windows::Win32::UI::WindowsAndMessaging::GetClientRect;

        let window = app
            .get_webview_window(&label)
            .ok_or_else(|| format!("native browser window is gone: {label}"))?;
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;

        let mut rect = windows::Win32::Foundation::RECT::default();
        unsafe { GetClientRect(hwnd, &mut rect) }.map_err(|e| e.to_string())?;
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width <= 0 || height <= 0 {
            return Ok(());
        }

        let radius = radius.clamp(0, width.min(height) / 2);
        if radius == 0 && holes.is_empty() {
            // Không cắt gì thì gỡ region cũ ra, đừng để lại hình cắt của lần trước.
            unsafe { SetWindowRgn(hwnd, None, true) };
            return Ok(());
        }

        let base = if radius > 0 {
            unsafe {
                CreateRoundRectRgn(0, -2 * radius, width + 1, height + 1, 2 * radius, 2 * radius)
            }
        } else {
            unsafe { CreateRectRgn(0, 0, width + 1, height + 1) }
        };
        if base.is_invalid() {
            return Err("could not build the window region".to_string());
        }

        for hole in holes {
            if hole.w <= 0 || hole.h <= 0 {
                continue;
            }
            let r = hole.radius.clamp(0, hole.w.min(hole.h) / 2);
            let cut = unsafe {
                if r > 0 {
                    CreateRoundRectRgn(
                        hole.x,
                        hole.y,
                        hole.x + hole.w,
                        hole.y + hole.h,
                        2 * r,
                        2 * r,
                    )
                } else {
                    CreateRectRgn(hole.x, hole.y, hole.x + hole.w, hole.y + hole.h)
                }
            };
            if cut.is_invalid() {
                continue;
            }
            unsafe { CombineRgn(Some(base), Some(base), Some(cut), RGN_DIFF) };
            // `CombineRgn` chép kết quả vào `base`; region tạm phải tự xoá, nếu không mỗi
            // khung hình dock trượt là một GDI object rò ra.
            let _ = unsafe { DeleteObject(HRGN::from(cut).into()) };
        }

        // SetWindowRgn nhận quyền sở hữu region; không được xoá nó sau lời gọi này.
        unsafe { SetWindowRgn(hwnd, Some(base), true) };
        Ok(())
    }

    /// Panel ẩn hạ mục tiêu bộ nhớ của renderer; panel hiện lên thì trả về Normal.
    /// Không dùng chung với `TrySuspend`: hai cơ chế này chồng nhau gây trang trắng.
    pub fn set_memory_target(app: tauri::AppHandle, label: String, low: bool) -> Result<(), String> {
        use webview2_com::Microsoft::Web::WebView2::Win32::{
            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
        };
        with_core(&app, &label, move |core| {
            let core_v19 = core
                .cast::<ICoreWebView2_19>()
                .map_err(|_| "WebView2 runtime is too old for memory targeting".to_string())?;
            let target = if low {
                COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
            } else {
                COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
            };
            unsafe { core_v19.SetMemoryUsageTargetLevel(target) }.map_err(|e| e.to_string())
        })
    }
}

#[cfg(not(target_os = "windows"))]
mod imp {
    use super::BrowserState;

    #[derive(Default)]
    pub struct BrowserRegistry;

    fn unsupported<T>() -> Result<T, String> {
        Err("native browser is only implemented on Windows".to_string())
    }

    pub fn forget(_app: &tauri::AppHandle, _label: &str) {}

    pub fn attach(_app: tauri::AppHandle, _label: String) -> Result<(), String> {
        unsupported()
    }

    pub fn navigate(_app: tauri::AppHandle, _label: String, url: String) -> Result<(), String> {
        super::check_web_url(&url)?;
        unsupported()
    }

    pub fn reload(_app: tauri::AppHandle, _label: String) -> Result<(), String> {
        unsupported()
    }

    pub fn go(_app: tauri::AppHandle, _label: String, _forward: bool) -> Result<(), String> {
        unsupported()
    }

    pub fn stop(_app: tauri::AppHandle, _label: String) -> Result<(), String> {
        unsupported()
    }

    pub fn state(_app: tauri::AppHandle, _label: String) -> Result<BrowserState, String> {
        unsupported()
    }

    pub fn set_memory_target(
        _app: tauri::AppHandle,
        _label: String,
        _low: bool,
    ) -> Result<(), String> {
        unsupported()
    }

    pub fn set_shape(
        _app: tauri::AppHandle,
        _label: String,
        _radius: i32,
        _holes: Vec<super::ShapeHole>,
    ) -> Result<(), String> {
        unsupported()
    }
}

pub use imp::{forget, BrowserRegistry};

// Command đều `async`: `with_core` phải chờ main thread trả lời, mà command đồng bộ của
// Tauri lại chạy *trên* main thread — gọi từ đó là tự khoá.

#[tauri::command]
pub async fn browser_attach(app: tauri::AppHandle, label: String) -> Result<(), String> {
    imp::attach(app, label)
}

#[tauri::command]
pub async fn browser_navigate(
    app: tauri::AppHandle,
    label: String,
    url: String,
) -> Result<(), String> {
    imp::navigate(app, label, url)
}

#[tauri::command]
pub async fn browser_reload(app: tauri::AppHandle, label: String) -> Result<(), String> {
    imp::reload(app, label)
}

#[tauri::command]
pub async fn browser_go(app: tauri::AppHandle, label: String, forward: bool) -> Result<(), String> {
    imp::go(app, label, forward)
}

#[tauri::command]
pub async fn browser_stop(app: tauri::AppHandle, label: String) -> Result<(), String> {
    imp::stop(app, label)
}

#[tauri::command]
pub async fn browser_state(app: tauri::AppHandle, label: String) -> Result<BrowserState, String> {
    imp::state(app, label)
}

/// Cắt overlay cho vừa tile: bo góc dưới và khoét chỗ cho UI nổi của shell. Đồng bộ, vì
/// nó chỉ đụng USER32/GDI trên main thread chứ không chờ WebView2 trả lời như các command khác.
#[tauri::command]
pub fn browser_set_shape(
    app: tauri::AppHandle,
    label: String,
    radius: i32,
    holes: Vec<ShapeHole>,
) -> Result<(), String> {
    imp::set_shape(app, label, radius, holes)
}

/// Đếm cửa sổ overlay đang sống. Hook đo đạc cho phase 4 — chỉ bật khi có
/// `TETHYS_BROWSER_STATS`, nên chạy bình thường thì nó không tồn tại về mặt hành vi.
///
/// Đây là con số duy nhất đáng tin để nói "không quá một native window cho mỗi panel":
/// đếm bên frontend chỉ thấy ý định, còn đây là những cửa sổ Tauri thật sự đang giữ.
#[tauri::command]
pub fn browser_stats(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    use tauri::Manager;
    if std::env::var("TETHYS_BROWSER_STATS").is_err() {
        return Err("browser stats are disabled".to_string());
    }
    let mut labels: Vec<String> = app
        .webview_windows()
        .keys()
        .filter(|label| label.starts_with("browser-"))
        .cloned()
        .collect();
    labels.sort();

    if let Ok(path) = std::env::var("TETHYS_BROWSER_STATS_LOG") {
        use std::io::Write;
        if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
            let _ = writeln!(file, "windows={} labels={:?}", labels.len(), labels);
        }
    }
    Ok(labels)
}

#[tauri::command]
pub async fn browser_set_memory_target(
    app: tauri::AppHandle,
    label: String,
    low: bool,
) -> Result<(), String> {
    imp::set_memory_target(app, label, low)
}
