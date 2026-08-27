use serde::Serialize;

/// Phần **không đổi** trong một phiên chạy: đọc một lần lúc mở panel.
/// Tách khỏi `SystemMetrics` vì mấy trường này phải mò registry — làm việc đó mỗi giây
/// chỉ để hiện lại đúng một chuỗi y hệt là phí I/O thuần tuý.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub os: String,
    pub version: String,
    pub kernel: String,
    pub arch: String,
    pub hostname: String,
    pub user: String,
    pub shell: String,
    pub cpu: String,
    pub cores: usize,
    pub gpu: String,
}

/// Phần **đổi liên tục**: gọi lại mỗi giây.
///
/// Mấy trường `Option` đều là **tốc độ**, mà tốc độ chỉ tính được bằng hiệu hai lần đọc —
/// nên lần gọi đầu tiên chúng là `None` chứ không phải `0`. Bịa số 0 ra thì đồ thị có một
/// cột thấp giả ở đầu, và người đọc không phân biệt được "chưa đo" với "thật sự rảnh".
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemMetrics {
    pub memory_total: u64,
    pub memory_available: u64,
    pub uptime_seconds: u64,
    /// Phần trăm CPU bận trong khoảng giữa hai lần gọi.
    pub cpu_usage: Option<f64>,
    /// Byte/giây, cộng trên mọi ổ vật lý.
    pub disk_read: Option<f64>,
    pub disk_write: Option<f64>,
    /// Byte/giây, cộng trên mọi card mạng đang lên (bỏ loopback).
    pub net_rx: Option<f64>,
    pub net_tx: Option<f64>,
}

/* Mốc của lần đo trước.

   Mọi thứ trong đây là bộ đếm cộng dồn từ lúc khởi động máy. Một lần đọc đơn lẻ không nói
   lên gì cả; phải giữ lại mốc trước rồi trừ. `at` để chia ra byte/giây theo thời gian
   **thật** đã trôi — không lấy 1000ms của `setInterval` làm mẫu số, vì timer của trình
   duyệt trượt tuỳ tải máy, mà chính lúc máy tải nặng là lúc con số cần đúng nhất. */
#[cfg(target_os = "windows")]
#[derive(Clone, Copy)]
struct Sample {
    at: std::time::Instant,
    cpu: Option<(u64, u64, u64)>,
    disk: Option<(u64, u64)>,
    net: Option<(u64, u64)>,
}

#[cfg(target_os = "windows")]
static PREV: std::sync::Mutex<Option<Sample>> = std::sync::Mutex::new(None);

#[cfg(target_os = "windows")]
fn registry_text(path: &str, value: &str) -> Option<String> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;
    RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(path)
        .ok()?
        .get_value::<String, _>(value)
        .ok()
        .filter(|text| !text.trim().is_empty())
}

#[cfg(target_os = "windows")]
fn registry_u32(path: &str, value: &str) -> Option<u32> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;
    RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(path)
        .ok()?
        .get_value::<u32, _>(value)
        .ok()
}

/// Card màn hình đầu tiên trong lớp thiết bị Display của Windows.
/// Không dùng DXGI vì chỉ cần đúng cái tên hãng đặt, mà tên đó nằm sẵn ở registry.
#[cfg(target_os = "windows")]
fn display_adapter() -> Option<String> {
    const CLASS: &str = r"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";
    for slot in 0..4 {
        if let Some(name) = registry_text(&format!(r"{CLASS}\{slot:04}"), "DriverDesc") {
            return Some(name);
        }
    }
    None
}

#[cfg(target_os = "windows")]
const CURRENT_VERSION: &str = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion";

/// Windows 11 vẫn trả `ProductName = Windows 10 ...` trên nhiều máy vì registry key này
/// được giữ lại để tương thích. Build 22000 trở lên là Windows 11, nên đây là nguồn phân
/// biệt đúng hơn chuỗi marketing cũ đó.
#[cfg(target_os = "windows")]
fn display_windows_name(product_name: String, build: &str) -> String {
    if build.parse::<u32>().is_ok_and(|number| number >= 22_000) {
        product_name.replacen("Windows 10", "Windows 11", 1)
    } else {
        product_name
    }
}

/// Chú thích ở `SystemInfo` nói mấy trường này không đổi trong một phiên chạy — vậy thì
/// đọc chúng đúng một lần. Trước đây mỗi lần panel được dựng lại (đổi workspace, mở lại
/// sysfetch) là một lượt mở bốn khoá registry nữa để nhận về đúng những chuỗi cũ.
static INFO: std::sync::OnceLock<SystemInfo> = std::sync::OnceLock::new();

#[tauri::command]
pub fn system_info() -> SystemInfo {
    INFO.get_or_init(read_system_info).clone()
}

fn read_system_info() -> SystemInfo {
    #[cfg(target_os = "windows")]
    {
        let build = registry_text(CURRENT_VERSION, "CurrentBuildNumber").unwrap_or_default();
        let ubr = registry_u32(CURRENT_VERSION, "UBR");

        return SystemInfo {
            os: display_windows_name(
                registry_text(CURRENT_VERSION, "ProductName").unwrap_or_else(|| "Windows".into()),
                &build,
            ),
            version: registry_text(CURRENT_VERSION, "DisplayVersion").unwrap_or_default(),
            kernel: match (build.as_str(), ubr) {
                ("", _) => String::new(),
                (b, Some(u)) => format!("10.0.{b}.{u}"),
                (b, None) => format!("10.0.{b}"),
            },
            arch: std::env::consts::ARCH.into(),
            hostname: std::env::var("COMPUTERNAME").unwrap_or_else(|_| "localhost".into()),
            user: std::env::var("USERNAME").unwrap_or_else(|_| "user".into()),
            shell: crate::pty::session::default_shell(),
            cpu: registry_text(r"HARDWARE\DESCRIPTION\System\CentralProcessor\0", "ProcessorNameString")
                .unwrap_or_else(|| "Windows processor".into())
                .trim()
                .to_string(),
            cores: std::thread::available_parallelism().map(|count| count.get()).unwrap_or(1),
            gpu: display_adapter().unwrap_or_default(),
        };
    }

    #[cfg(not(target_os = "windows"))]
    SystemInfo {
        os: std::env::consts::OS.into(),
        version: String::new(),
        kernel: String::new(),
        arch: std::env::consts::ARCH.into(),
        hostname: std::env::var("HOSTNAME").unwrap_or_else(|_| "localhost".into()),
        user: std::env::var("USER").unwrap_or_else(|_| "user".into()),
        shell: std::env::var("SHELL").unwrap_or_else(|_| "sh".into()),
        cpu: "Processor".into(),
        cores: std::thread::available_parallelism().map(|count| count.get()).unwrap_or(1),
        gpu: String::new(),
    }
}

/// Ba bộ đếm thời gian CPU tính từ lúc boot, đơn vị 100ns.
#[cfg(target_os = "windows")]
fn cpu_ticks() -> Option<(u64, u64, u64)> {
    use windows_sys::Win32::Foundation::FILETIME;
    use windows_sys::Win32::System::Threading::GetSystemTimes;

    let ticks = |ft: FILETIME| ((ft.dwHighDateTime as u64) << 32) | ft.dwLowDateTime as u64;
    let mut idle: FILETIME = unsafe { std::mem::zeroed() };
    let mut kernel: FILETIME = unsafe { std::mem::zeroed() };
    let mut user: FILETIME = unsafe { std::mem::zeroed() };
    if unsafe { GetSystemTimes(&mut idle, &mut kernel, &mut user) } == 0 {
        return None;
    }
    Some((ticks(idle), ticks(kernel), ticks(user)))
}

/// Tổng byte đọc/ghi trên mọi ổ vật lý, tính từ lúc boot.
///
/// Mở thiết bị với `dwDesiredAccess = 0`: chỉ hỏi metadata chứ không đọc dữ liệu, nên
/// **không cần quyền admin**. Xin `GENERIC_READ` ở đây là hỏng ngay — Windows sẽ đòi
/// elevation và cả hàng disk biến mất khỏi panel.
#[cfg(target_os = "windows")]
fn disk_bytes() -> Option<(u64, u64)> {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
    };
    use windows_sys::Win32::System::Ioctl::{DISK_PERFORMANCE, IOCTL_DISK_PERFORMANCE};
    use windows_sys::Win32::System::IO::DeviceIoControl;

    /* Số hiệu ổ nào mở được thì lần sau chỉ mở đúng những cái đó.
       Máy điển hình có một hoặc hai ổ, nên bảy trong tám lần `CreateFileW` mỗi vòng đo là
       gõ cửa một chỗ không có ai — mà vẫn phải trả giá một lời gọi hệ thống. Dò đủ dãy
       đúng một lần rồi nhớ lấy.

       Cắm thêm ổ giữa chừng thì nó không xuất hiện cho tới lần chạy sau; đó là cái giá
       chấp nhận được cho một dòng số liệu đọc chơi. */
    static DRIVES: std::sync::OnceLock<Vec<u32>> = std::sync::OnceLock::new();

    const PROBE_RANGE: [u32; 8] = [0, 1, 2, 3, 4, 5, 6, 7];

    let (mut read, mut written) = (0u64, 0u64);
    let mut any = false;
    let mut found: Vec<u32> = Vec::new();
    let probing = DRIVES.get().is_none();

    for index in DRIVES.get().map(|d| d.as_slice()).unwrap_or(&PROBE_RANGE).iter().copied() {
        let path: Vec<u16> = format!(r"\\.\PhysicalDrive{index}")
            .encode_utf16()
            .chain([0])
            .collect();
        let handle = unsafe {
            CreateFileW(
                path.as_ptr(),
                0,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                std::ptr::null(),
                OPEN_EXISTING,
                0,
                std::ptr::null_mut(),
            )
        };
        if handle == INVALID_HANDLE_VALUE {
            // Số hiệu trống ở giữa dãy là chuyện bình thường, cứ thử tiếp cái sau.
            continue;
        }

        let mut perf: DISK_PERFORMANCE = unsafe { std::mem::zeroed() };
        let mut returned = 0u32;
        let ok = unsafe {
            DeviceIoControl(
                handle,
                IOCTL_DISK_PERFORMANCE,
                std::ptr::null(),
                0,
                &mut perf as *mut _ as *mut _,
                std::mem::size_of::<DISK_PERFORMANCE>() as u32,
                &mut returned,
                std::ptr::null_mut(),
            )
        };
        unsafe { CloseHandle(handle) };

        if ok != 0 {
            read += perf.BytesRead.max(0) as u64;
            written += perf.BytesWritten.max(0) as u64;
            any = true;
            if probing {
                found.push(index);
            }
        }
    }

    if probing {
        let _ = DRIVES.set(found);
    }

    any.then_some((read, written))
}

/// Tổng octet vào/ra trên mọi interface đang lên, tính từ lúc boot.
#[cfg(target_os = "windows")]
fn net_octets() -> Option<(u64, u64)> {
    use windows_sys::Win32::NetworkManagement::IpHelper::{FreeMibTable, GetIfTable2, MIB_IF_TABLE2};

    /// `IF_TYPE_SOFTWARE_LOOPBACK` — lưu lượng vòng lại chính máy. Cộng vào chỉ tổ thổi
    /// phồng con số mà chẳng có gói nào thật sự ra khỏi máy.
    const LOOPBACK: u32 = 24;
    /// `IfOperStatusUp`.
    const UP: i32 = 1;

    let mut table: *mut MIB_IF_TABLE2 = std::ptr::null_mut();
    if unsafe { GetIfTable2(&mut table) } != 0 || table.is_null() {
        return None;
    }

    let (mut rx, mut tx) = (0u64, 0u64);
    unsafe {
        let count = (*table).NumEntries as usize;
        let rows = std::slice::from_raw_parts((*table).Table.as_ptr(), count);
        for row in rows {
            if row.Type != LOOPBACK && row.OperStatus == UP {
                rx += row.InOctets;
                tx += row.OutOctets;
            }
        }
        FreeMibTable(table as *const _);
    }
    Some((rx, tx))
}

/// `io` bật thì mới đo ổ đĩa và card mạng.
///
/// Hai phép đo đó không rẻ: `disk_bytes` mở tới tám handle thiết bị vật lý rồi gửi một
/// `DeviceIoControl` cho mỗi cái, `net_octets` xin Windows dựng cả bảng interface rồi giải
/// phóng nó. Cả hai chạy **mỗi giây** trong khi panel sysfetch không in ra dòng nào cho
/// chúng — bốn trường ấy được truyền qua IPC rồi bị bỏ đi. Mặc định tắt; nơi nào thật sự
/// vẽ chúng thì tự bật.
#[tauri::command]
pub fn system_metrics(io: Option<bool>) -> SystemMetrics {
    let io = io.unwrap_or(false);

    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::System::SystemInformation::{
            GetTickCount64, GlobalMemoryStatusEx, MEMORYSTATUSEX,
        };

        let mut memory: MEMORYSTATUSEX = unsafe { std::mem::zeroed() };
        memory.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
        let ok = unsafe { GlobalMemoryStatusEx(&mut memory) != 0 };

        let now = Sample {
            at: std::time::Instant::now(),
            cpu: cpu_ticks(),
            disk: io.then(disk_bytes).flatten(),
            net: io.then(net_octets).flatten(),
        };

        let mut guard = PREV.lock().unwrap_or_else(|e| e.into_inner());
        let prev = *guard;
        *guard = Some(now);
        drop(guard);

        let elapsed = prev.map(|p| now.at.duration_since(p.at).as_secs_f64()).unwrap_or(0.0);
        /* Khoảng hợp lệ, hai đầu đều có lý do.

           Bằng 0: hai lời gọi rơi đúng một khoảnh khắc, phép chia ra vô cực.

           Quá 5 giây: giao diện ngừng hỏi khi cửa sổ mất focus, nên mốc trước có thể là từ
           một tiếng trước. Chia cho quãng đó ra con số trung bình của cả tiếng — đúng về số
           học, nhưng nó được dán vào ô "Load" như thể là hiện tại. Coi như chưa có mốc và
           đợi nhịp sau còn thành thật hơn. */
        let fresh = elapsed > 0.0 && elapsed < 5.0;
        let rate = |before: u64, after: u64| -> Option<f64> {
            fresh.then(|| after.saturating_sub(before) as f64 / elapsed)
        };
        let pair = |before: Option<(u64, u64)>, after: Option<(u64, u64)>| match (before, after) {
            (Some(b), Some(a)) => (rate(b.0, a.0), rate(b.1, a.1)),
            _ => (None, None),
        };
        let (disk_read, disk_write) = pair(prev.and_then(|p| p.disk), now.disk);
        let (net_rx, net_tx) = pair(prev.and_then(|p| p.net), now.net);

        return SystemMetrics {
            memory_total: if ok { memory.ullTotalPhys } else { 0 },
            memory_available: if ok { memory.ullAvailPhys } else { 0 },
            uptime_seconds: unsafe { GetTickCount64() / 1_000 },
            // `kernel` của Windows **đã gồm cả thời gian idle**, nên tổng là kernel + user
            // còn phần bận là tổng trừ idle. Trừ nhầm chỗ này là ra con số luôn quá cao.
            cpu_usage: match (prev.filter(|_| fresh).and_then(|p| p.cpu), now.cpu) {
                (Some(b), Some(a)) => {
                    let total = a.1.saturating_sub(b.1) + a.2.saturating_sub(b.2);
                    let busy = total.saturating_sub(a.0.saturating_sub(b.0));
                    (total > 0).then(|| (busy as f64 / total as f64 * 100.0).clamp(0.0, 100.0))
                }
                _ => None,
            },
            disk_read,
            disk_write,
            net_rx,
            net_tx,
        };
    }

    #[cfg(not(target_os = "windows"))]
    let _ = io;
    #[cfg(not(target_os = "windows"))]
    SystemMetrics {
        memory_total: 0,
        memory_available: 0,
        uptime_seconds: 0,
        cpu_usage: None,
        disk_read: None,
        disk_write: None,
        net_rx: None,
        net_tx: None,
    }
}
