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
    use windows::Win32::UI::WindowsAndMessaging::{
        EnableMenuItem, GetCursorPos, GetSystemMenu, IsZoomed, PostMessageW, SetForegroundWindow,
        TrackPopupMenu, MF_DISABLED, MF_ENABLED, MF_GRAYED, SC_CLOSE, SC_MAXIMIZE, SC_MINIMIZE,
        SC_MOVE, SC_RESTORE, SC_SIZE, TPM_LEFTALIGN, TPM_RETURNCMD, TPM_RIGHTBUTTON,
        WM_SYSCOMMAND,
    };

    /// Lấy `HWND` mà không phụ thuộc Tauri đang link bản `windows` nào: đi vòng qua `isize`
    /// nên cả kiểu con trỏ (0.5x trở lên) lẫn kiểu số (bản cũ) đều ra cùng một giá trị.
    pub fn hwnd_of(window: &tauri::Window) -> Result<HWND, String> {
        let raw = window.hwnd().map_err(|e| e.to_string())?;
        Ok(HWND(raw.0 as _))
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

/// Đặt trạng thái fullscreen rõ ràng thay vì tự đảo trạng thái hiện tại.
///
/// `set_fullscreen` của Tao xếp thay đổi cửa sổ lên UI thread. Nếu hai lệnh toggle đến
/// sát nhau, lệnh sau có thể đọc trạng thái vừa được lệnh trước cập nhật rồi xếp thao tác
/// ngược lại. Lệnh idempotent này khiến sự kiện F11 trùng luôn hội tụ về cùng trạng thái.
#[tauri::command]
pub fn app_window_set_fullscreen(
    window: tauri::Window,
    fullscreen: bool,
) -> Result<bool, String> {
    window
        .set_fullscreen(fullscreen)
        .map_err(|e| e.to_string())?;
    Ok(fullscreen)
}
