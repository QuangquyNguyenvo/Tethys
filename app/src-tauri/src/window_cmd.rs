//! Hành vi cửa sổ kiểu Windows cho một cửa sổ `decorations: false`.
//!
//! Hai thứ Tauri/tao **không** làm đúng khi tự vẽ titlebar:
//!
//! 1. **Fullscreen vẫn để lộ taskbar.** `set_fullscreen(true)` chỉ phóng cửa sổ ra bằng
//!    màn hình. Nhưng taskbar là cửa sổ topmost — nó chỉ chịu chui xuống khi *shell* nhận
//!    ra đây là một fullscreen window. Phép thử của shell nhìn vào **style** của cửa sổ,
//!    không nhìn vào kích thước: còn `WS_THICKFRAME`/`WS_CAPTION` thì nó vẫn coi đây là
//!    một cửa sổ thường được kéo cho to bằng màn hình. Nên phải tự gỡ style, đúng công
//!    thức `FullscreenHandler` của Chromium — kể cả bước "đang maximize thì restore trước",
//!    vì bật fullscreen từ trạng thái maximize là ca hỏng hay gặp nhất.
//! 2. **Chuột phải lên titlebar không ra menu hệ thống.** Titlebar tự vẽ thì vùng đó là
//!    client area, Windows không sinh `WM_NCRBUTTONUP`, nên menu Restore/Move/Size/Close
//!    biến mất. Tự gọi `TrackPopupMenu` trên `GetSystemMenu` là dựng lại đúng menu gốc,
//!    đúng ngôn ngữ hệ thống.
//!
//! Ngoài Windows, mọi thứ rơi về API sẵn có của Tauri.

use std::collections::HashMap;
use std::sync::Mutex;

/// Style + vị trí cửa sổ trước khi vào fullscreen, để lúc thoát trả lại y nguyên.
#[cfg(target_os = "windows")]
struct Saved {
    style: isize,
    ex_style: isize,
    placement: windows::Win32::UI::WindowsAndMessaging::WINDOWPLACEMENT,
    maximized: bool,
}

#[derive(Default)]
pub struct WindowState {
    #[cfg(target_os = "windows")]
    fullscreen: Mutex<HashMap<isize, Saved>>,
    #[cfg(not(target_os = "windows"))]
    _unused: Mutex<HashMap<isize, ()>>,
}

#[cfg(target_os = "windows")]
mod win {
    use super::Saved;
    use windows::Win32::Foundation::{HWND, LPARAM, POINT, WPARAM};
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnableMenuItem, GetCursorPos, GetSystemMenu, GetWindowLongPtrW, GetWindowPlacement,
        IsZoomed, PostMessageW, SetForegroundWindow, SetWindowLongPtrW, SetWindowPlacement,
        SetWindowPos, TrackPopupMenu, GWL_EXSTYLE, GWL_STYLE, MF_DISABLED, MF_ENABLED, MF_GRAYED,
        SC_CLOSE, SC_MAXIMIZE, SC_MINIMIZE, SC_MOVE, SC_RESTORE, SC_SIZE, SWP_FRAMECHANGED,
        SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER, SWP_NOSIZE, SWP_NOZORDER, TPM_LEFTALIGN,
        TPM_RETURNCMD, TPM_RIGHTBUTTON, WINDOWPLACEMENT, WM_SYSCOMMAND, WS_CAPTION,
        WS_EX_CLIENTEDGE, WS_EX_DLGMODALFRAME, WS_EX_STATICEDGE, WS_EX_WINDOWEDGE, WS_THICKFRAME,
    };

    /// Lấy `HWND` mà không phụ thuộc Tauri đang link bản `windows` nào: đi vòng qua `isize`
    /// nên cả kiểu con trỏ (0.5x trở lên) lẫn kiểu số (bản cũ) đều ra cùng một giá trị.
    pub fn hwnd_of(window: &tauri::Window) -> Result<HWND, String> {
        let raw = window.hwnd().map_err(|e| e.to_string())?;
        Ok(HWND(raw.0 as _))
    }

    pub fn key_of(hwnd: HWND) -> isize {
        hwnd.0 as isize
    }

    pub fn enter(hwnd: HWND) -> Saved {
        unsafe {
            let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
            let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            let maximized = IsZoomed(hwnd).as_bool();

            let mut placement = WINDOWPLACEMENT {
                length: std::mem::size_of::<WINDOWPLACEMENT>() as u32,
                ..Default::default()
            };
            let _ = GetWindowPlacement(hwnd, &mut placement);

            // Restore trước khi gỡ style. Đổi style của một cửa sổ đang maximize thì Windows
            // giữ lại rect maximize (đã trừ taskbar) và ta phóng ra từ một mốc sai.
            if maximized {
                let _ = PostMessageW(Some(hwnd), WM_SYSCOMMAND, WPARAM(SC_RESTORE as usize), LPARAM(0));
            }

            SetWindowLongPtrW(
                hwnd,
                GWL_STYLE,
                style & !((WS_CAPTION.0 | WS_THICKFRAME.0) as isize),
            );
            SetWindowLongPtrW(
                hwnd,
                GWL_EXSTYLE,
                ex_style
                    & !((WS_EX_DLGMODALFRAME.0
                        | WS_EX_WINDOWEDGE.0
                        | WS_EX_CLIENTEDGE.0
                        | WS_EX_STATICEDGE.0) as isize),
            );

            // `rcMonitor`, không phải `rcWork`: `rcWork` đã trừ taskbar, dùng nó là tự
            // chừa lại đúng dải mà fullscreen phải nuốt.
            let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
            let mut info = MONITORINFO {
                cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                ..Default::default()
            };
            let rect = if GetMonitorInfoW(monitor, &mut info).as_bool() {
                info.rcMonitor
            } else {
                placement.rcNormalPosition
            };

            let _ = SetWindowPos(
                hwnd,
                None,
                rect.left,
                rect.top,
                rect.right - rect.left,
                rect.bottom - rect.top,
                SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
            );

            Saved {
                style,
                ex_style,
                placement,
                maximized,
            }
        }
    }

    pub fn leave(hwnd: HWND, saved: &Saved) {
        unsafe {
            SetWindowLongPtrW(hwnd, GWL_STYLE, saved.style);
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, saved.ex_style);
            let _ = SetWindowPos(
                hwnd,
                None,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOOWNERZORDER | SWP_FRAMECHANGED,
            );
            let mut placement = saved.placement;
            let _ = SetWindowPlacement(hwnd, &mut placement);
            if saved.maximized {
                let _ = PostMessageW(
                    Some(hwnd),
                    WM_SYSCOMMAND,
                    WPARAM(SC_MAXIMIZE as usize),
                    LPARAM(0),
                );
            }
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

/// Trả về trạng thái fullscreen **sau** khi bật/tắt.
#[tauri::command]
pub fn app_window_toggle_fullscreen(
    window: tauri::Window,
    state: tauri::State<'_, WindowState>,
) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let hwnd = win::hwnd_of(&window)?;
        let key = win::key_of(hwnd);
        let mut map = state.fullscreen.lock().map_err(|e| e.to_string())?;
        if let Some(saved) = map.remove(&key) {
            win::leave(hwnd, &saved);
            Ok(false)
        } else {
            map.insert(key, win::enter(hwnd));
            Ok(true)
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = state;
        let next = !window.is_fullscreen().map_err(|e| e.to_string())?;
        window.set_fullscreen(next).map_err(|e| e.to_string())?;
        Ok(next)
    }
}
