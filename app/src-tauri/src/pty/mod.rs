pub mod session;

use anyhow::{anyhow, Result};
use session::{PtySession, SessionId};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use tauri::ipc::{Channel, InvokeResponseBody};

/// Nhiều session cùng lúc ngay từ đầu — phase 04 sẽ có nhiều panel,
/// và đổi từ một-session sang nhiều-session sau đó thì phải viết lại nửa module.
#[derive(Default)]
pub struct PtyManager {
    next_id: AtomicU32,
    sessions: Mutex<HashMap<SessionId, PtySession>>,
}

impl PtyManager {
    pub fn spawn(
        &self,
        shell: Option<String>,
        cwd: Option<String>,
        rows: u16,
        cols: u16,
        on_data: Channel<InvokeResponseBody>,
        flush_ms: u64,
    ) -> Result<SessionId> {
        let s = PtySession::spawn(shell, cwd, rows, cols, on_data, flush_ms)?;
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        self.sessions.lock().unwrap().insert(id, s);
        Ok(id)
    }

    fn with<T>(&self, id: SessionId, f: impl FnOnce(&mut PtySession) -> Result<T>) -> Result<T> {
        let mut map = self.sessions.lock().unwrap();
        let s = map.get_mut(&id).ok_or_else(|| anyhow!("session {id} không tồn tại"))?;
        f(s)
    }

    pub fn write(&self, id: SessionId, data: &[u8]) -> Result<()> {
        self.with(id, |s| s.write(data))
    }

    pub fn resize(&self, id: SessionId, rows: u16, cols: u16) -> Result<()> {
        self.with(id, |s| s.resize(rows, cols))
    }

    pub fn ack(&self, id: SessionId, k: usize) {
        // Ack tới session đã đóng là chuyện bình thường (chunk cuối về sau khi kill).
        if let Ok(map) = self.sessions.lock() {
            if let Some(s) = map.get(&id) {
                s.ack(k);
            }
        }
    }

    pub fn is_alive(&self, id: SessionId) -> bool {
        self.sessions.lock().unwrap().get(&id).map(|s| s.is_alive()).unwrap_or(false)
    }

    /// `Drop` của `PtySession` lo việc kill — bỏ khỏi map là đủ.
    pub fn kill(&self, id: SessionId) {
        self.sessions.lock().unwrap().remove(&id);
    }

    pub fn kill_all(&self) {
        self.sessions.lock().unwrap().clear();
    }
}
