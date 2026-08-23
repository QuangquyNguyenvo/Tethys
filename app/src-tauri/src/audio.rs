//! Mức âm thanh thật của Windows qua WASAPI loopback.
//!
//! Loopback đọc bản mix mà endpoint loa mặc định đang phát, không mở microphone và không
//! ghi âm ra đĩa. Frontend chỉ nhận 56 giá trị biên độ đã lượng tử hoá để dựng sóng ASCII.

use serde::Serialize;
use std::sync::{Arc, Mutex, OnceLock};

const BARS: usize = 56;
const HEIGHT: u8 = 7;

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

#[cfg(target_os = "windows")]
fn capture_forever(state: Arc<Mutex<AudioState>>) {
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

    // Thread worker sống suốt vòng đời app, nên chỉ cân bằng COM một lần. Nếu endpoint đổi
    // hay Audio Service restart thì phần dưới reconnect, không tăng thêm COM init count.
    if unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).ok() }.is_err() {
        return;
    }
    loop {
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
        // RMS + căn nhẹ để âm thanh nhỏ vẫn nhìn thấy, nhưng giới hạn tuyệt đối ở 7 hàng.
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
