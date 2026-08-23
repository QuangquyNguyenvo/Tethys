use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

#[derive(Clone, Serialize, Deserialize)]
pub struct FileChangedPayload {
    pub path: String,
}

pub struct WatcherManager {
    watcher: Arc<Mutex<Option<RecommendedWatcher>>>,
    watched_paths: Arc<Mutex<HashMap<PathBuf, usize>>>,
}

impl Default for WatcherManager {
    fn default() -> Self {
        Self {
            watcher: Arc::new(Mutex::new(None)),
            watched_paths: Arc::new(Mutex::new(HashMap::new())),
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
        if let Some(references) = paths.get_mut(&p) {
            *references += 1;
            return Ok(());
        }

        let mut w_lock = self.watcher.lock().map_err(|e| e.to_string())?;
        if let Some(ref mut watcher) = *w_lock {
            watcher
                .watch(&p, RecursiveMode::NonRecursive)
                .map_err(|e| e.to_string())?;
            paths.insert(p, 1);
        }
        Ok(())
    }

    pub fn unwatch(&self, path: &str) -> Result<(), String> {
        let Ok(p) = Path::new(path).canonicalize() else {
            return Ok(());
        };

        let mut paths = self.watched_paths.lock().map_err(|e| e.to_string())?;
        let should_unwatch = match paths.get_mut(&p) {
            Some(references) if *references > 1 => {
                *references -= 1;
                false
            }
            Some(_) => {
                paths.remove(&p);
                true
            }
            None => false,
        };
        let no_paths_left = paths.is_empty();
        if should_unwatch {
            let mut w_lock = self.watcher.lock().map_err(|e| e.to_string())?;
            if let Some(ref mut watcher) = *w_lock {
                let _ = watcher.unwatch(&p);
            }
            // notify owns an OS watcher thread. Drop it after the final preview closes;
            // ensure_watcher recreates it transparently the next time a file is opened.
            if no_paths_left {
                *w_lock = None;
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
