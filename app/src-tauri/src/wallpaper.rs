//! Tìm file ảnh nền của Windows để sinh bảng màu.
//!
//! Không dùng `SystemParametersInfo(SPI_GETDESKWALLPAPER)` vì hàm đó trả về đường dẫn rỗng
//! khi ảnh nền đến từ Spotlight hoặc slideshow — đúng hai trường hợp hay gặp nhất.

use std::path::{Path, PathBuf};

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
        .ok_or_else(|| "Khong tim thay anh nen".to_string())
}

/// Mở hộp chọn ảnh của Windows. Chỉ trả đường dẫn, tuyệt đối không đổi wallpaper Desktop.
/// Ảnh này là nền riêng của workspace và frontend dùng nó để sinh cả bảng màu Material You.
#[tauri::command]
pub fn wallpaper_pick() -> Option<String> {
    rfd::FileDialog::new()
        .add_filter("Ảnh nền", &["png", "jpg", "jpeg", "webp", "bmp", "gif"])
        .pick_file()
        .map(|path| path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    /// C3 — máy nào cũng phải có ít nhất một trong hai nguồn: registry hoặc TranscodedWallpaper.
    /// Test này fail nghĩa là app sẽ rơi vào bảng màu dự phòng, không phải màu từ ảnh nền.
    #[test]
    fn tim_duoc_anh_nen_co_that() {
        let p = super::wallpaper_path().expect("khong tim thay anh nen");
        let path = std::path::Path::new(&p);
        assert!(path.is_file(), "duong dan tra ve khong phai file: {p}");
        let size = std::fs::metadata(path).unwrap().len();
        assert!(size > 1024, "file anh nen qua nho ({size} byte), kho la anh that");
        println!("anh nen: {p} ({size} byte)");
    }
}
