//! Mức âm thanh thật của Windows qua WASAPI loopback.
//!
//! Loopback đọc bản mix mà endpoint loa mặc định đang phát, không mở microphone và không
//! ghi âm ra đĩa. Frontend chỉ nhận 64 giá trị biên độ đã lượng tử hoá để dựng sóng ASCII.

use serde::Serialize;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

const BARS: usize = 64;
const HEIGHT: u8 = 8;

struct AudioState {
    levels: [u8; BARS],
}

impl Default for AudioState {
    fn default() -> Self {
        Self { levels: [0; BARS] }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioLevels {
    pub levels: Vec<u8>,
}

static STATE: OnceLock<Arc<Mutex<AudioState>>> = OnceLock::new();
static AUDIO_CONSUMERS: AtomicUsize = AtomicUsize::new(0);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NowPlaying {
    pub title: String,
    pub artist: String,
}

#[derive(Default)]
struct MediaState {
    now_playing: Option<NowPlaying>,
    empty_polls: u8,
}

static MEDIA_STATE: OnceLock<Arc<Mutex<MediaState>>> = OnceLock::new();
static MEDIA_CONSUMERS: AtomicUsize = AtomicUsize::new(0);

fn state() -> Arc<Mutex<AudioState>> {
    STATE
        .get_or_init(|| {
            let state = Arc::new(Mutex::new(AudioState::default()));
            let worker = Arc::clone(&state);
            std::thread::spawn(move || capture_forever(worker));
            state
        })
        .clone()
}

#[tauri::command]
pub fn audio_levels() -> AudioLevels {
    let audio_state = state();
    let guard = audio_state.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    AudioLevels { levels: guard.levels.to_vec() }
}

/// Audio capture is only useful while a visible sysfetch waveform is mounted. A reference
/// count keeps multiple panels safe while allowing the capture worker to sleep otherwise.
#[tauri::command]
pub fn audio_set_active(active: bool) {
    if active {
        AUDIO_CONSUMERS.fetch_add(1, Ordering::Relaxed);
        let _ = state();
        return;
    }

    let mut current = AUDIO_CONSUMERS.load(Ordering::Relaxed);
    while current != 0 {
        match AUDIO_CONSUMERS.compare_exchange_weak(
            current,
            current - 1,
            Ordering::Relaxed,
            Ordering::Relaxed,
        ) {
            Ok(_) => return,
            Err(next) => current = next,
        }
    }
}

fn audio_is_active() -> bool {
    AUDIO_CONSUMERS.load(Ordering::Relaxed) > 0
}

/// WinRT media enumeration is only needed while a visible sysfetch panel can show it.
#[tauri::command]
pub fn media_set_active(active: bool) {
    if active {
        MEDIA_CONSUMERS.fetch_add(1, Ordering::Relaxed);
        return;
    }

    let mut current = MEDIA_CONSUMERS.load(Ordering::Relaxed);
    while current != 0 {
        match MEDIA_CONSUMERS.compare_exchange_weak(
            current,
            current - 1,
            Ordering::Relaxed,
            Ordering::Relaxed,
        ) {
            Ok(_) => return,
            Err(next) => current = next,
        }
    }
}

fn media_is_active() -> bool {
    MEDIA_CONSUMERS.load(Ordering::Relaxed) > 0
}

/// Metadata lấy từ Windows media session (Spotify, trình duyệt, MusicBee, ...).
/// Worker tách riêng để lời gọi từ giao diện luôn trả ngay, không bị chờ WinRT.
#[tauri::command]
pub fn now_playing() -> Option<NowPlaying> {
    let media_state = MEDIA_STATE
        .get_or_init(|| {
            let state = Arc::new(Mutex::new(MediaState::default()));
            let worker = Arc::clone(&state);
            std::thread::spawn(move || media_forever(worker));
            state
        })
        .clone();
    let now_playing = media_state
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .now_playing
        .clone();
    now_playing
}

#[cfg(target_os = "windows")]
fn media_forever(state: Arc<Mutex<MediaState>>) {
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

    if unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).ok() }.is_err() {
        return;
    }
    loop {
        if !media_is_active() {
            std::thread::sleep(std::time::Duration::from_millis(250));
            continue;
        }
        let next = current_media().ok().flatten();
        let mut guard = state.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(now_playing) = next {
            guard.now_playing = Some(now_playing);
            guard.empty_polls = 0;
        } else {
            // WinRT đôi lúc trả session rỗng trong lúc tab đổi video. Giữ bài cuối 8 giây
            // để ticker không chớp tắt, nhưng vẫn tự xoá khi người dùng dừng hẳn nhạc.
            guard.empty_polls = guard.empty_polls.saturating_add(1);
            if guard.empty_polls >= 4 {
                guard.now_playing = None;
            }
        }
        drop(guard);
        std::thread::sleep(std::time::Duration::from_secs(2));
    }
}

#[cfg(not(target_os = "windows"))]
fn media_forever(_state: Arc<Mutex<MediaState>>) {
    std::thread::park();
}

#[cfg(target_os = "windows")]
fn current_media() -> windows::core::Result<Option<NowPlaying>> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;

    let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.get()?;
    let sessions = manager.GetSessions()?;
    let mut fallback = None;

    for index in 0..sessions.Size()? {
        let Ok(session) = sessions.GetAt(index) else { continue };
        let Some((is_playing, media)) = session_media(&session) else { continue };
        if is_playing {
            return Ok(Some(media));
        }
        fallback.get_or_insert(media);
    }
    Ok(fallback)
}

#[cfg(target_os = "windows")]
fn session_media(session: &windows::Media::Control::GlobalSystemMediaTransportControlsSession) -> Option<(bool, NowPlaying)> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus;

    let properties = session.TryGetMediaPropertiesAsync().ok()?.get().ok()?;
    let title = properties.Title().ok()?.to_string();
    if title.trim().is_empty() {
        return None;
    }
    let is_playing = session
        .GetPlaybackInfo()
        .ok()
        .and_then(|info| info.PlaybackStatus().ok())
        .is_some_and(|status| status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing);
    Some((is_playing, NowPlaying {
        title,
        artist: properties.Artist().map(|artist| artist.to_string()).unwrap_or_default(),
    }))
}

#[cfg(target_os = "windows")]
fn capture_forever(state: Arc<Mutex<AudioState>>) {
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

    // Thread worker sống suốt vòng đời app, nên chỉ cân bằng COM một lần. Nếu endpoint đổi
    // hay Audio Service restart thì phần dưới reconnect, không tăng thêm COM init count.
    if unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).ok() }.is_err() {
        return;
    }
    loop {
        if !audio_is_active() {
            set_levels(&state, [0; BARS]);
            std::thread::sleep(std::time::Duration::from_millis(250));
            continue;
        }
        // Ví dụ đổi thiết bị phát hoặc audio service vừa restart: mở lại sau một nhịp,
        // thay vì để wave đứng mãi cho tới khi người dùng khởi động lại app.
        if capture_default_output(&state).is_err() {
            std::thread::sleep(std::time::Duration::from_secs(1));
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn capture_forever(_state: Arc<Mutex<AudioState>>) {
    std::thread::park();
}

#[cfg(target_os = "windows")]
fn capture_default_output(state: &Arc<Mutex<AudioState>>) -> Result<(), String> {
    use windows::Win32::Media::Audio::{
        eConsole, eRender, IAudioCaptureClient, IAudioClient, IMMDeviceEnumerator,
        AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK,
        MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{CoCreateInstance, CoTaskMemFree, CLSCTX_ALL};

    let enumerator: IMMDeviceEnumerator = unsafe {
        CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|err| err.to_string())?
    };
    let device = unsafe {
        enumerator
            .GetDefaultAudioEndpoint(eRender, eConsole)
            .map_err(|err| err.to_string())?
    };
    let client: IAudioClient = unsafe {
        device.Activate(CLSCTX_ALL, None).map_err(|err| err.to_string())?
    };
    let raw_format = unsafe { client.GetMixFormat().map_err(|err| err.to_string())? };
    let format = unsafe { *raw_format };
    let initialized = unsafe {
        client.Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            AUDCLNT_STREAMFLAGS_LOOPBACK,
            0,
            0,
            raw_format,
            None,
        )
    };
    unsafe { CoTaskMemFree(Some(raw_format.cast())) };
    initialized.map_err(|err| err.to_string())?;

    let capture: IAudioCaptureClient = unsafe { client.GetService().map_err(|err| err.to_string())? };
    unsafe { client.Start().map_err(|err| err.to_string())? };

    loop {
        if !audio_is_active() {
            let _ = unsafe { client.Stop() };
            set_levels(state, [0; BARS]);
            return Ok(());
        }
        let mut packet = unsafe { capture.GetNextPacketSize().map_err(|err| err.to_string())? };
        while packet != 0 {
            let (mut data, mut frames, mut flags) = (std::ptr::null_mut(), 0u32, 0u32);
            unsafe {
                capture
                    .GetBuffer(&mut data, &mut frames, &mut flags, None, None)
                    .map_err(|err| err.to_string())?
            };
            if flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 == 0 && !data.is_null() {
                update_levels(state, data, frames, &format);
            } else {
                set_levels(state, [0; BARS]);
            }
            unsafe { capture.ReleaseBuffer(frames).map_err(|err| err.to_string())? };
            packet = unsafe { capture.GetNextPacketSize().map_err(|err| err.to_string())? };
        }
        std::thread::sleep(std::time::Duration::from_millis(18));
    }
}

#[cfg(target_os = "windows")]
fn update_levels(
    state: &Arc<Mutex<AudioState>>,
    data: *const u8,
    frames: u32,
    format: &windows::Win32::Media::Audio::WAVEFORMATEX,
) {
    let channels = usize::from(format.nChannels.max(1));
    let bytes_per_sample = usize::from(format.nBlockAlign) / channels;
    let samples = frames as usize * channels;
    if samples == 0 || !(bytes_per_sample == 2 || bytes_per_sample == 4) {
        return;
    }

    let source = unsafe { std::slice::from_raw_parts(data, samples * bytes_per_sample) };
    let mut next = [0u8; BARS];
    for (bar, target) in next.iter_mut().enumerate() {
        let start = bar * samples / BARS;
        let end = ((bar + 1) * samples / BARS).max(start + 1).min(samples);
        let energy = source
            .chunks_exact(bytes_per_sample)
            .skip(start)
            .take(end - start)
            .map(|sample| match bytes_per_sample {
                2 => i16::from_le_bytes([sample[0], sample[1]]) as f32 / i16::MAX as f32,
                _ => f32::from_le_bytes([sample[0], sample[1], sample[2], sample[3]]),
            })
            .filter(|sample| sample.is_finite())
            .map(|sample| sample * sample)
            .sum::<f32>()
            / (end - start) as f32;
        // RMS + căn nhẹ để âm thanh nhỏ vẫn nhìn thấy, nhưng giới hạn tuyệt đối ở 8 hàng.
        *target = (energy.sqrt().sqrt() * (HEIGHT as f32 + 1.0)).round().clamp(0.0, HEIGHT as f32) as u8;
    }
    set_levels(state, next);
}

fn set_levels(state: &Arc<Mutex<AudioState>>, next: [u8; BARS]) {
    let mut guard = state.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    // Giảm độ giật nhưng vẫn phản hồi ngay khi beat tăng.
    for (current, incoming) in guard.levels.iter_mut().zip(next) {
        *current = if incoming >= *current { incoming } else { (*current * 3 + incoming) / 4 };
    }
}
