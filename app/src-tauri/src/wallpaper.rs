//! Tìm file ảnh nền của Windows để sinh bảng màu.
//!
//! Không dùng `SystemParametersInfo(SPI_GETDESKWALLPAPER)` vì hàm đó trả về đường dẫn rỗng
//! khi ảnh nền đến từ Spotlight hoặc slideshow — đúng hai trường hợp hay gặp nhất.

use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Bản sao Windows tự tạo mỗi khi đổi ảnh nền. Không có phần mở rộng nhưng vẫn là ảnh hợp lệ.
/// Đây là chỗ duy nhất còn ảnh khi giá trị registry trỏ vào file đã bị xoá.
fn transcoded() -> Option<PathBuf> {
    let appdata = std::env::var_os("APPDATA")?;
    let p = Path::new(&appdata)
        .join("Microsoft")
        .join("Windows")
        .join("Themes")
        .join("TranscodedWallpaper");
    p.is_file().then_some(p)
}

#[cfg(target_os = "windows")]
fn from_registry() -> Option<PathBuf> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let key = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Control Panel\\Desktop")
        .ok()?;
    let raw: String = key.get_value("WallPaper").ok()?;
    if raw.trim().is_empty() {
        return None;
    }
    let p = PathBuf::from(raw);
    p.is_file().then_some(p)
}

#[cfg(not(target_os = "windows"))]
fn from_registry() -> Option<PathBuf> {
    None
}

/// Ảnh do người dùng (hoặc bài kiểm) chỉ định, thắng cả registry.
/// Nhờ nó kiểm được "đổi ảnh thì màu đổi" mà không phải sửa ảnh nền thật của máy.
fn from_env() -> Option<PathBuf> {
    let p = PathBuf::from(std::env::var_os("NONAME_WALLPAPER")?);
    p.is_file().then_some(p)
}

/// Đường dẫn ảnh nền hiện tại. Frontend đưa qua `convertFileSrc` rồi vẽ lên canvas để lượng tử hoá.
#[tauri::command]
pub fn wallpaper_path() -> Result<String, String> {
    from_env()
        .or_else(from_registry)
        .or_else(transcoded)
        .map(|p| p.to_string_lossy().into_owned())
        .ok_or_else(|| "Wallpaper not found".to_string())
}

/// Mở hộp chọn ảnh của Windows. Chỉ trả đường dẫn, tuyệt đối không đổi wallpaper Desktop.
/// Ảnh này là nền riêng của workspace và frontend dùng nó để sinh cả bảng màu Material You.
#[tauri::command]
pub fn wallpaper_pick() -> Option<String> {
    rfd::FileDialog::new()
        .add_filter("Wallpaper images", &["png", "jpg", "jpeg", "webp", "bmp", "gif"])
        .pick_file()
        .map(|path| path.to_string_lossy().into_owned())
}

/// Chọn ảnh hiển thị thay logo ASCII ở panel sysfetch. Ảnh được sao chép vào thư mục
/// cấu hình của Tethys để việc di chuyển/xoá file gốc không làm mất logo đã lưu.
#[tauri::command]
pub fn sysfetch_logo_pick(app: AppHandle) -> Result<Option<String>, String> {
    let Some(source) = rfd::FileDialog::new()
        .add_filter("Logo images", &["png", "jpg", "jpeg", "webp", "bmp", "gif"])
        .pick_file()
    else {
        return Ok(None);
    };

    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .filter(|value| matches!(value.as_str(), "png" | "jpg" | "jpeg" | "webp" | "bmp" | "gif"))
        .ok_or_else(|| "Unsupported logo image format".to_string())?;
    let logo_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?
        .join("assets");
    std::fs::create_dir_all(&logo_dir).map_err(|error| error.to_string())?;

    let target = logo_dir.join(format!("sysfetch-logo.{extension}"));
    let temporary = logo_dir.join("sysfetch-logo.tmp");
    std::fs::copy(&source, &temporary).map_err(|error| error.to_string())?;
    if target.exists() {
        std::fs::remove_file(&target).map_err(|error| error.to_string())?;
    }
    if let Err(error) = std::fs::rename(&temporary, &target) {
        let _ = std::fs::remove_file(&temporary);
        return Err(error.to_string());
    }
    if !target.is_file() {
        return Err("The selected logo could not be saved".to_string());
    }

    // Chỉ dọn các bản logo managed cũ sau khi bản mới đã được ghi thành công.
    if let Ok(entries) = std::fs::read_dir(&logo_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let is_old_logo = path != target
                && path.is_file()
                && path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .is_some_and(|name| name.starts_with("sysfetch-logo."));
            if is_old_logo {
                let _ = std::fs::remove_file(path);
            }
        }
    }

    Ok(Some(target.to_string_lossy().into_owned()))
}

#[cfg(test)]
mod tests {
    /// C3 — máy nào cũng phải có ít nhất một trong hai nguồn: registry hoặc TranscodedWallpaper.
    /// Test này fail nghĩa là app sẽ rơi vào bảng màu dự phòng, không phải màu từ ảnh nền.
    #[test]
    fn tim_duoc_anh_nen_co_that() {
        let p = super::wallpaper_path().expect("wallpaper not found");
        let path = std::path::Path::new(&p);
        assert!(path.is_file(), "returned path is not a file: {p}");
        let size = std::fs::metadata(path).unwrap().len();
        assert!(size > 1024, "wallpaper file is too small ({size} bytes)");
        println!("wallpaper: {p} ({size} bytes)");
    }
}
