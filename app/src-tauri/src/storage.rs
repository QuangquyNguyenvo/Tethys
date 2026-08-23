use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppSavedState {
    pub layout: Option<serde_json::Value>,
    pub panels: Option<serde_json::Value>,
    pub focused: Option<String>,
    pub theme_opts: Option<serde_json::Value>,
    #[serde(default)]
    pub workspaces: Option<serde_json::Value>,
    #[serde(default)]
    pub active_workspace_id: Option<String>,
}

fn get_state_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("state.json"))
}

/// Replace the previous state without the Windows-specific `rename` failure when the
/// destination already exists. `MOVEFILE_WRITE_THROUGH` keeps the save durable before
/// the command resolves back to the frontend.
#[cfg(target_os = "windows")]
fn replace_state_file(from: &std::path::Path, to: &std::path::Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let from_wide: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
    let to_wide: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
    let flags = MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH;
    if unsafe { MoveFileExW(from_wide.as_ptr(), to_wide.as_ptr(), flags) } == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn replace_state_file(from: &std::path::Path, to: &std::path::Path) -> Result<(), String> {
    fs::rename(from, to).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn storage_save_state(app: AppHandle, state: AppSavedState) -> Result<(), String> {
    let path = get_state_file(&app)?;
    let tmp_path = path.with_extension("tmp");
    let json = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    fs::write(&tmp_path, json).map_err(|e| e.to_string())?;
    replace_state_file(&tmp_path, &path)?;
    Ok(())
}

#[tauri::command]
pub fn storage_load_state(app: AppHandle) -> Result<Option<AppSavedState>, String> {
    let path = get_state_file(&app)?;
    if !path.is_file() {
        return Ok(None);
    }
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let state: AppSavedState = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    Ok(Some(state))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_an_existing_state_file() {
        let unique = format!(
            "tethys-storage-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
        );
        let dir = std::env::temp_dir().join(unique);
        fs::create_dir_all(&dir).unwrap();
        let target = dir.join("state.json");
        let temporary = dir.join("state.tmp");
        fs::write(&target, "old state").unwrap();
        fs::write(&temporary, "new state").unwrap();

        replace_state_file(&temporary, &target).unwrap();

        assert_eq!(fs::read_to_string(&target).unwrap(), "new state");
        assert!(!temporary.exists());
        fs::remove_dir_all(dir).unwrap();
    }
}
