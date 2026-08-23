use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

#[derive(Clone, Serialize, Deserialize)]
pub struct FileChangedPayload {
    pub path: String,
}

pub struct WatcherManager {
    watcher: Arc<Mutex<Option<RecommendedWatcher>>>,
    watched_paths: Arc<Mutex<HashSet<PathBuf>>>,
}

impl Default for WatcherManager {
    fn default() -> Self {
        Self {
            watcher: Arc::new(Mutex::new(None)),
            watched_paths: Arc::new(Mutex::new(HashSet::new())),
        }
    }
}

impl WatcherManager {
    fn ensure_watcher(&self, app: AppHandle) -> Result<(), String> {
        let mut w_lock = self.watcher.lock().map_err(|e| e.to_string())?;
        if w_lock.is_none() {
            let app_clone = app.clone();
            let watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
                if let Ok(event) = res {
                    match event.kind {
                        EventKind::Modify(_) | EventKind::Create(_) => {
                            for path in event.paths {
                                let path_str = path.to_string_lossy().to_string();
                                let clean = path_str.strip_prefix(r"\\?\").unwrap_or(&path_str).to_string();
                                let _ = app_clone.emit("preview:file-changed", FileChangedPayload {
                                    path: clean,
                                });
                            }
                        }
                        _ => {}
                    }
                }
            })
            .map_err(|e| e.to_string())?;

            *w_lock = Some(watcher);
        }
        Ok(())
    }

    pub fn watch(&self, app: AppHandle, path: &str) -> Result<(), String> {
        self.ensure_watcher(app)?;
        let p = Path::new(path).canonicalize().map_err(|e| e.to_string())?;

        let mut paths = self.watched_paths.lock().map_err(|e| e.to_string())?;
        if !paths.contains(&p) {
            let mut w_lock = self.watcher.lock().map_err(|e| e.to_string())?;
            if let Some(ref mut watcher) = *w_lock {
                watcher
                    .watch(&p, RecursiveMode::NonRecursive)
                    .map_err(|e| e.to_string())?;
                paths.insert(p);
            }
        }
        Ok(())
    }

    pub fn unwatch(&self, path: &str) -> Result<(), String> {
        let Ok(p) = Path::new(path).canonicalize() else {
            return Ok(());
        };

        let mut paths = self.watched_paths.lock().map_err(|e| e.to_string())?;
        if paths.remove(&p) {
            let mut w_lock = self.watcher.lock().map_err(|e| e.to_string())?;
            if let Some(ref mut watcher) = *w_lock {
                let _ = watcher.unwatch(&p);
            }
        }
        Ok(())
    }
}

#[tauri::command]
pub fn watch_file(
    app: AppHandle,
    state: State<'_, WatcherManager>,
    path: String,
) -> Result<(), String> {
    state.watch(app, &path)
}

#[tauri::command]
pub fn unwatch_file(
    state: State<'_, WatcherManager>,
    path: String,
) -> Result<(), String> {
    state.unwatch(&path)
}
