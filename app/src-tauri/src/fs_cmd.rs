use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const MAX_READ_BYTES: u64 = 5 * 1024 * 1024; // 5 MB

#[derive(Debug, Serialize, Deserialize)]
pub struct FileStat {
    pub size_bytes: u64,
    pub modified_ms: u64,
    pub is_file: bool,
}

#[tauri::command]
pub fn fs_read_text(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("File does not exist: {path}"));
    }

    let meta = fs::metadata(p).map_err(|e| e.to_string())?;
    if meta.len() > MAX_READ_BYTES {
        return Err(format!(
            "File is too large to preview directly ({} MB > 5 MB)",
            meta.len() / (1024 * 1024)
        ));
    }

    fs::read_to_string(p).map_err(|e| format!("Could not read UTF-8 content: {e}"))
}

#[tauri::command]
pub fn fs_stat(path: String) -> Result<FileStat, String> {
    let p = Path::new(&path);
    let meta = fs::metadata(p).map_err(|e| e.to_string())?;
    let modified_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    Ok(FileStat {
        size_bytes: meta.len(),
        modified_ms,
        is_file: meta.is_file(),
    })
}

#[tauri::command]
pub fn fs_open_external(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    // URL không phải file. `open_path("https://…")` có thể bị Windows hiểu là một đường
    // dẫn hỏng nên nút "mở bằng trình duyệt" trông như không làm gì.
    if path.starts_with("https://") || path.starts_with("http://") {
        app.opener()
            .open_url(path, None::<&str>)
            .map_err(|e| e.to_string())
    } else {
        app.opener()
            .open_path(path, None::<&str>)
            .map_err(|e| e.to_string())
    }
}

/// Mở File Explorer của Windows và **chọn sẵn** mục này, khác với `fs_open_external` —
/// cái kia gọi tới trình mặc định của loại tệp, tức là bấm vào một `.ts` sẽ mở editor.
#[tauri::command]
pub fn fs_reveal(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fs_resolve_path(base: Option<String>, target: String) -> Result<String, String> {
    let raw_target = target.trim().trim_matches(|c| c == '\'' || c == '"');
    let target_path = Path::new(raw_target);

    let candidate = if target_path.is_absolute() {
        target_path.to_path_buf()
    } else if let Some(ref b) = base {
        Path::new(b).join(target_path)
    } else {
        std::env::current_dir()
            .unwrap_or_default()
            .join(target_path)
    };

    if candidate.exists() {
        let canonical = candidate.canonicalize().map_err(|e| e.to_string())?;
        let s = canonical.to_string_lossy().to_string();
        let clean = s.strip_prefix(r"\\?\").unwrap_or(&s).to_string();
        Ok(clean)
    } else {
        Err(format!("File does not exist: {}", candidate.display()))
    }
}

#[derive(Debug, Serialize)]
pub struct DirEntryInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size_bytes: u64,
    pub modified_ms: u64,
}

#[derive(Debug, Serialize)]
pub struct DirListing {
    /// Đường dẫn đã chuẩn hoá của chính thư mục đang xem.
    pub path: String,
    /// `None` khi đang ở gốc ổ đĩa — explorer dùng nó để tắt nút "lên trên".
    pub parent: Option<String>,
    pub entries: Vec<DirEntryInfo>,
}

fn clean(p: &Path) -> String {
    let s = p.to_string_lossy().to_string();
    s.strip_prefix(r"\\?\").unwrap_or(&s).to_string()
}

/// Liệt kê một thư mục cho panel Explorer.
///
/// Thư mục xếp trước file, mỗi nhóm sắp theo tên không phân biệt hoa thường — đúng thứ tự
/// mà file manager nào cũng dùng, để mắt không phải tự sắp lại.
#[tauri::command]
pub fn fs_list_dir(path: Option<String>) -> Result<DirListing, String> {
    let dir = match path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p),
        _ => std::env::current_dir().map_err(|e| e.to_string())?,
    };

    let dir = dir.canonicalize().unwrap_or(dir);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", clean(&dir)));
    }

    let mut entries: Vec<DirEntryInfo> = Vec::new();
    for item in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let Ok(item) = item else { continue };
        let name = item.file_name().to_string_lossy().to_string();
        // Ẩn file dot: thư mục dự án nào cũng đầy .git/.vscode, hiện hết thì danh sách vô dụng.
        if name.starts_with('.') {
            continue;
        }
        let meta = match item.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let modified_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        entries.push(DirEntryInfo {
            name,
            path: clean(&item.path()),
            is_dir: meta.is_dir(),
            size_bytes: if meta.is_dir() { 0 } else { meta.len() },
            modified_ms,
        });
    }

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(DirListing {
        path: clean(&dir),
        parent: dir.parent().map(clean),
        entries,
    })
}

/// Thư mục làm việc hiện tại — điểm xuất phát mặc định của Explorer.
#[tauri::command]
pub fn fs_cwd() -> String {
    std::env::current_dir().map(|p| clean(&p)).unwrap_or_default()
}
