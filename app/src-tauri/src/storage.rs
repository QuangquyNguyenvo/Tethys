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

#[tauri::command]
pub fn storage_save_state(app: AppHandle, state: AppSavedState) -> Result<(), String> {
    let path = get_state_file(&app)?;
    let tmp_path = path.with_extension("tmp");
    let json = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    fs::write(&tmp_path, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp_path, &path).map_err(|e| e.to_string())?;
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
