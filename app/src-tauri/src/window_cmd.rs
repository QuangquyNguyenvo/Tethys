//! Hành vi cửa sổ kiểu Windows cho một cửa sổ `decorations: false`.
//!
//! Chuột phải lên titlebar không ra menu hệ thống. Titlebar tự vẽ thì vùng đó là
//!    client area, Windows không sinh `WM_NCRBUTTONUP`, nên menu Restore/Move/Size/Close
//!    biến mất. Tự gọi `TrackPopupMenu` trên `GetSystemMenu` là dựng lại đúng menu gốc,
//!    đúng ngôn ngữ hệ thống.
//!
//! Fullscreen phải đi qua API Tauri/Tao: trên Windows nó không chỉ đổi rect/style mà còn
//! gọi `ITaskbarList2::MarkFullscreenWindow`, là tín hiệu chính thức để Shell hạ taskbar.

#[cfg(target_os = "windows")]
mod win {
    use windows::Win32::Foundation::{HWND, LPARAM, POINT, WPARAM};
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnableMenuItem, GetCursorPos, GetSystemMenu, IsZoomed, PostMessageW, SetForegroundWindow,
        SetWindowPos, TrackPopupMenu, MF_DISABLED, MF_ENABLED, MF_GRAYED, SC_CLOSE, SC_MAXIMIZE,
        SC_MINIMIZE, SC_MOVE, SC_RESTORE, SC_SIZE, SWP_NOACTIVATE, SWP_NOZORDER, TPM_LEFTALIGN,
        TPM_RETURNCMD, TPM_RIGHTBUTTON, WM_SYSCOMMAND,
    };

    /// Lấy `HWND` mà không phụ thuộc Tauri đang link bản `windows` nào: đi vòng qua `isize`
    /// nên cả kiểu con trỏ (0.5x trở lên) lẫn kiểu số (bản cũ) đều ra cùng một giá trị.
    pub fn hwnd_of(window: &tauri::Window) -> Result<HWND, String> {
        let raw = window.hwnd().map_err(|e| e.to_string())?;
        Ok(HWND(raw.0 as _))
    }

    /// Kéo cửa sổ phủ trọn màn hình vật lý đang chứa nó.
    ///
    /// Cần cái này vì `rcMonitor` (cả màn hình) khác `rcWork` (đã trừ taskbar), và với một
    /// cửa sổ không viền thì Windows rất hay chọn `rcWork` giùm ta. Gọi sau khi Tao đã đổi
    /// style xong: đây là lời cuối cùng về hình chữ nhật, không phải lời đầu tiên.
    pub fn cover_monitor(hwnd: HWND) {
        unsafe {
            let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
            let mut info = MONITORINFO {
                cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                ..Default::default()
            };
            if !GetMonitorInfoW(monitor, &mut info).as_bool() {
                return;
            }
            let r = info.rcMonitor;
            let _ = SetWindowPos(
                hwnd,
                None,
                r.left,
                r.top,
                r.right - r.left,
                r.bottom - r.top,
                SWP_NOZORDER | SWP_NOACTIVATE,
            );
        }
    }

    pub fn system_menu(hwnd: HWND) {
        unsafe {
            let menu = GetSystemMenu(hwnd, false);
            if menu.is_invalid() {
                return;
            }
            let maximized = IsZoomed(hwnd).as_bool();
            let set = |item: u32, on: bool| {
                let _ = EnableMenuItem(
                    menu,
                    item,
                    if on { MF_ENABLED } else { MF_GRAYED | MF_DISABLED },
                );
            };
            set(SC_RESTORE, maximized);
            set(SC_MOVE, !maximized);
            set(SC_SIZE, !maximized);
            set(SC_MINIMIZE, true);
            set(SC_MAXIMIZE, !maximized);
            set(SC_CLOSE, true);

            let mut point = POINT::default();
            if GetCursorPos(&mut point).is_err() {
                return;
            }
            // Menu bật lên bám theo foreground window; không kéo cửa sổ lên trước thì nó
            // đóng ngay ở click kế tiếp mà không kịp trả về lệnh nào.
            let _ = SetForegroundWindow(hwnd);
            let picked = TrackPopupMenu(
                menu,
                TPM_RETURNCMD | TPM_RIGHTBUTTON | TPM_LEFTALIGN,
                point.x,
                point.y,
                Some(0),
                hwnd,
                None,
            );
            if picked.0 != 0 {
                let _ = PostMessageW(
                    Some(hwnd),
                    WM_SYSCOMMAND,
                    WPARAM(picked.0 as usize),
                    LPARAM(0),
                );
            }
        }
    }
}

#[tauri::command]
pub fn app_window_minimize(window: tauri::Window) {
    let _ = window.minimize();
}

#[tauri::command]
pub fn app_window_toggle_maximize(window: tauri::Window) -> Result<bool, String> {
    let is_max = window.is_maximized().unwrap_or(false);
    if is_max {
        window.unmaximize().map_err(|e| e.to_string())?;
    } else {
        window.maximize().map_err(|e| e.to_string())?;
    }
    Ok(!is_max)
}

#[tauri::command]
pub fn app_window_is_maximized(window: tauri::Window) -> bool {
    window.is_maximized().unwrap_or(false)
}

#[tauri::command]
pub fn app_window_close(window: tauri::Window) {
    let _ = window.close();
}

/// Chuột phải lên vùng titlebar tự vẽ → menu hệ thống thật của Windows.
#[tauri::command]
pub fn app_window_system_menu(window: tauri::Window) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let hwnd = win::hwnd_of(&window)?;
        win::system_menu(hwnd);
    }
    #[cfg(not(target_os = "windows"))]
    let _ = window;
    Ok(())
}

/// Nhớ cửa sổ có đang maximize hay không ngay trước khi vào fullscreen, để thoát ra thì
/// trả lại đúng trạng thái cũ chứ không rơi về kích thước cửa sổ nhỏ.
#[cfg(target_os = "windows")]
static WAS_MAXIMIZED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Đặt trạng thái fullscreen rõ ràng thay vì tự đảo trạng thái hiện tại.
///
/// `set_fullscreen` của Tao xếp thay đổi cửa sổ lên UI thread. Nếu hai lệnh toggle đến
/// sát nhau, lệnh sau có thể đọc trạng thái vừa được lệnh trước cập nhật rồi xếp thao tác
/// ngược lại. Lệnh idempotent này khiến sự kiện F11 trùng luôn hội tụ về cùng trạng thái.
///
/// Trên Windows còn hai chuyện nữa phải làm, và cả hai đều xoay quanh cùng một điều:
/// **`WS_MAXIMIZE` không tự mất khi ta vào fullscreen.**
///
/// 1. Cửa sổ không viền mà đang maximize thì Windows ghim nó vào `rcWork` — vùng làm việc
///    đã trừ taskbar. Cờ đó còn nguyên sau khi đổi sang fullscreen, nên mọi lần cửa sổ
///    được đo lại nó lại bị kéo về đúng vùng ấy: fullscreen mà vẫn chừa một dải trống ở
///    cạnh có taskbar. Bỏ maximize *trước* là cách duy nhất để cờ đó không còn ở đó.
/// 2. Ngay cả khi đã bỏ, `SetWindowPos` cuối cùng vẫn đáng gọi: nó nói thẳng hình chữ
///    nhật là `rcMonitor` — cả màn hình — nên không phụ thuộc vào việc Tao chọn cái nào.
#[tauri::command]
pub fn app_window_set_fullscreen(
    window: tauri::Window,
    fullscreen: bool,
) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    if fullscreen {
        let maximized = window.is_maximized().unwrap_or(false);
        WAS_MAXIMIZED.store(maximized, std::sync::atomic::Ordering::Relaxed);
        if maximized {
            window.unmaximize().map_err(|e| e.to_string())?;
        }
    }

    window
        .set_fullscreen(fullscreen)
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    {
        if fullscreen {
            if let Ok(hwnd) = win::hwnd_of(&window) {
                win::cover_monitor(hwnd);
            }
        } else if WAS_MAXIMIZED.swap(false, std::sync::atomic::Ordering::Relaxed) {
            window.maximize().map_err(|e| e.to_string())?;
        }
    }

    Ok(fullscreen)
}
