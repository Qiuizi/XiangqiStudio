use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{watch, Mutex, Notify, OwnedMutexGuard};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

static ENGINE_PID: AtomicU32 = AtomicU32::new(0);
static STOP_WAIT_MS: AtomicU64 = AtomicU64::new(1500);

fn stop_wait_budget() -> Duration {
    Duration::from_millis(STOP_WAIT_MS.load(Ordering::Relaxed))
}

fn remember_engine_pid(pid: u32) {
    if pid != 0 {
        ENGINE_PID.store(pid, Ordering::SeqCst);
    }
}

fn clear_engine_pid(pid: u32) {
    let _ = ENGINE_PID.compare_exchange(pid, 0, Ordering::SeqCst, Ordering::SeqCst);
}

fn force_kill_pid(pid: u32) {
    if pid == 0 {
        return;
    }
    #[cfg(unix)]
    unsafe {
        extern "C" {
            fn kill(pid: i32, sig: i32) -> i32;
            fn waitpid(pid: i32, status: *mut i32, options: i32) -> i32;
        }
        if kill(pid as i32, 9) == 0 {
            let mut status = 0;
            for _ in 0..20 {
                let waited = waitpid(pid as i32, &mut status, 1);
                if waited != 0 {
                    break;
                }
                std::thread::sleep(Duration::from_millis(10));
            }
        }
    }
    #[cfg(windows)]
    unsafe {
        extern "system" {
            fn OpenProcess(access: u32, inherit: i32, pid: u32) -> *mut core::ffi::c_void;
            fn TerminateProcess(handle: *mut core::ffi::c_void, code: u32) -> i32;
            fn WaitForSingleObject(handle: *mut core::ffi::c_void, millis: u32) -> u32;
            fn CloseHandle(handle: *mut core::ffi::c_void) -> i32;
        }
        const PROCESS_TERMINATE: u32 = 0x0001;
        const SYNCHRONIZE: u32 = 0x00100000;
        let handle = OpenProcess(PROCESS_TERMINATE | SYNCHRONIZE, 0, pid);
        if !handle.is_null() {
            TerminateProcess(handle, 1);
            WaitForSingleObject(handle, 2000);
            CloseHandle(handle);
        }
    }
}

/// Kill the live Pikafish process without waiting on the async runtime.
/// Used when the window or the process is already going away.
pub fn kill_lingering_engine() {
    let pid = ENGINE_PID.swap(0, Ordering::SeqCst);
    force_kill_pid(pid);
}

pub type EngineEmitter = Arc<dyn Fn(&str, serde_json::Value) + Send + Sync>;

fn emit_event(emit: &EngineEmitter, event: &str, payload: impl Serialize) {
    match serde_json::to_value(&payload) {
        Ok(value) => emit(event, value),
        Err(err) => eprintln!("[UCI] failed to serialize {event}: {err}"),
    }
}

fn emitter_from_app(app: &AppHandle) -> EngineEmitter {
    let app = app.clone();
    Arc::new(move |event, payload| {
        let _ = app.emit(event, payload);
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UciOptionMeta {
    pub name: String,
    pub option_type: String, // "spin", "check", "combo", "string", "button"
    pub default: Option<String>,
    pub min: Option<i64>,
    pub max: Option<i64>,
    pub vars: Vec<String>,
    pub current_value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineInfoPayload {
    pub search_id: u64,
    pub depth: u32,
    pub seldepth: Option<u32>,
    pub score_cp: Option<i32>,
    pub score_mate: Option<i32>,
    pub nodes: Option<u64>,
    pub nps: Option<u64>,
    pub time_ms: Option<u64>,
    pub hashfull: Option<u32>,
    pub multipv: Option<u32>,
    pub pv: Vec<String>,
    pub cur_move: Option<String>,
    pub cur_move_num: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineBestMovePayload {
    pub search_id: u64,
    pub is_ai_move: bool,
    pub bestmove: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineStatusPayload {
    pub ready: bool,
    pub running: bool,
    pub searching: bool,
    pub engine_name: String,
    pub engine_author: String,
    pub engine_path: String,
    pub nnue_path: String,
    pub options_count: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SearchPhase {
    Idle,
    Searching,
    Stopping,
}

#[derive(Debug, Clone)]
pub struct ActiveSearch {
    pub search_id: u64,
    pub is_ai_move: bool,
    pub aborted: bool,
}

pub struct EngineState {
    pub child: Option<Child>,
    pub stdin: Option<ChildStdin>,
    pub engine_path: Option<PathBuf>,
    pub nnue_path: Option<PathBuf>,
    pub is_searching: bool,
    pub search_phase: SearchPhase,
    pub phase_tx: watch::Sender<SearchPhase>,
    pub phase_rx: watch::Receiver<SearchPhase>,
    pub engine_name: String,
    pub engine_author: String,
    pub current_search_id: u64,
    pub active_search: Option<ActiveSearch>,
    pub stop_notify: Arc<Notify>,
    pub options: Vec<UciOptionMeta>,
    pub current_options_map: HashMap<String, String>,
    /// Bumped every time the child process is replaced. Reader tasks capture the
    /// value from when they were spawned and must not touch a newer session.
    pub generation: u64,
    /// True after `go` until the matching `bestmove` (or process exit).
    pub go_outstanding: bool,
    pub op_lock: Arc<Mutex<()>>,
}

pub type SharedEngine = Arc<Mutex<EngineState>>;

static SEARCH_COUNTER: AtomicU64 = AtomicU64::new(1);

impl EngineState {
    pub fn new() -> Self {
        let (phase_tx, phase_rx) = watch::channel(SearchPhase::Idle);
        Self {
            child: None,
            stdin: None,
            engine_path: None,
            nnue_path: None,
            is_searching: false,
            search_phase: SearchPhase::Idle,
            phase_tx,
            phase_rx,
            engine_name: "Pikafish".to_string(),
            engine_author: "the Pikafish developers".to_string(),
            current_search_id: 0,
            active_search: None,
            stop_notify: Arc::new(Notify::new()),
            options: Vec::new(),
            current_options_map: HashMap::new(),
            generation: 0,
            go_outstanding: false,
            op_lock: Arc::new(Mutex::new(())),
        }
    }

    pub fn get_status(&self, app: Option<&AppHandle>) -> EngineStatusPayload {
        let path_str = self
            .engine_path
            .as_ref()
            .map(|p| p.to_string_lossy().to_string())
            .or_else(|| find_pikafish_executable(app).map(|p| p.to_string_lossy().to_string()))
            .unwrap_or_default();

        let nnue_str = self
            .nnue_path
            .as_ref()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        EngineStatusPayload {
            ready: self.stdin.is_some(),
            running: self.child.is_some(),
            searching: self.is_searching,
            engine_name: self.engine_name.clone(),
            engine_author: self.engine_author.clone(),
            engine_path: path_str,
            nnue_path: nnue_str,
            options_count: self.options.len(),
        }
    }
}

pub fn clean_path(p: PathBuf) -> PathBuf {
    let s = p.to_string_lossy().to_string();
    if let Some(stripped) = s.strip_prefix(r"\\?\\") {
        PathBuf::from(stripped)
    } else {
        p
    }
}

pub fn find_pikafish_executable(app: Option<&AppHandle>) -> Option<PathBuf> {
    let engine_names = [
        "pikafish-bmi2.exe",
        "pikafish-avx2.exe",
        "pikafish-avx512.exe",
        "pikafish-sse41-popcnt.exe",
        "pikafish.exe",
    ];

    // 1. Check Tauri resource directory if packaged
    if let Some(handle) = app {
        if let Ok(res_dir) = handle.path().resource_dir() {
            for name in &engine_names {
                let candidates = [
                    res_dir.join(name),
                    res_dir.join("resources").join(name),
                    res_dir.join("resources").join("pikafish").join(name),
                    res_dir.join("bin").join(name),
                ];
                for cand in &candidates {
                    if cand.exists() {
                        return Some(clean_path(cand.clone()));
                    }
                }
            }
        }
    }

    // 2. Check current executable directory and walk up 5 parent levels
    if let Ok(exe_path) = std::env::current_exe() {
        let mut cur = exe_path.parent();
        for _ in 0..5 {
            if let Some(p) = cur {
                for name in &engine_names {
                    let candidates = [
                        p.join("resources").join(name),
                        p.join("resources").join("pikafish").join(name),
                        p.join("src-tauri").join("resources").join(name),
                        p.join(name),
                        p.join("bin").join(name),
                    ];
                    for cand in &candidates {
                        if cand.exists() {
                            if let Ok(abs) = std::fs::canonicalize(cand) {
                                return Some(clean_path(abs));
                            }
                            return Some(clean_path(cand.clone()));
                        }
                    }
                }
                cur = p.parent();
            } else {
                break;
            }
        }
    }

    // 3. Check current working directory and walk up 5 parent levels
    if let Ok(cwd) = std::env::current_dir() {
        let mut cur = Some(cwd.as_path());
        for _ in 0..5 {
            if let Some(p) = cur {
                for name in &engine_names {
                    let candidates = [
                        p.join("resources").join(name),
                        p.join("resources").join("pikafish").join(name),
                        p.join("src-tauri").join("resources").join(name),
                        p.join(name),
                    ];
                    for cand in &candidates {
                        if cand.exists() {
                            if let Ok(abs) = std::fs::canonicalize(cand) {
                                return Some(clean_path(abs));
                            }
                            return Some(clean_path(cand.clone()));
                        }
                    }
                }
                cur = p.parent();
            } else {
                break;
            }
        }
    }

    None
}

pub fn parse_uci_option(line: &str) -> Option<UciOptionMeta> {
    let trimmed = line.trim();
    if !trimmed.starts_with("option name ") {
        return None;
    }
    let rest = &trimmed["option name ".len()..];
    let type_idx = rest.find(" type ")?;
    let name = rest[..type_idx].trim().to_string();
    let after_type = &rest[type_idx + " type ".len()..];
    let tokens: Vec<&str> = after_type.split_whitespace().collect();
    if tokens.is_empty() {
        return None;
    }
    let option_type = tokens[0].to_string();
    let mut default = None;
    let mut min = None;
    let mut max = None;
    let mut vars = Vec::new();

    let mut i = 1;
    while i < tokens.len() {
        match tokens[i] {
            "default" => {
                if i + 1 < tokens.len() {
                    let mut def_parts = Vec::new();
                    let mut j = i + 1;
                    while j < tokens.len()
                        && tokens[j] != "min"
                        && tokens[j] != "max"
                        && tokens[j] != "var"
                    {
                        def_parts.push(tokens[j]);
                        j += 1;
                    }
                    default = Some(def_parts.join(" "));
                    i = j;
                    continue;
                }
            }
            "min" => {
                if i + 1 < tokens.len() {
                    min = tokens[i + 1].parse().ok();
                    i += 1;
                }
            }
            "max" => {
                if i + 1 < tokens.len() {
                    max = tokens[i + 1].parse().ok();
                    i += 1;
                }
            }
            "var" => {
                if i + 1 < tokens.len() {
                    vars.push(tokens[i + 1].to_string());
                    i += 1;
                }
            }
            _ => {}
        }
        i += 1;
    }

    Some(UciOptionMeta {
        name,
        option_type,
        default,
        min,
        max,
        vars,
        current_value: None,
    })
}

async fn lock_ops(shared: &SharedEngine) -> OwnedMutexGuard<()> {
    let op = shared.lock().await.op_lock.clone();
    op.lock_owned().await
}

struct CachedInfo {
    payload: EngineInfoPayload,
    emitted: bool,
}

fn drain_unsent(cache: &mut HashMap<u32, CachedInfo>) -> Vec<EngineInfoPayload> {
    let mut pending: Vec<EngineInfoPayload> = cache
        .drain()
        .filter_map(|(_, entry)| {
            if entry.emitted {
                None
            } else {
                Some(entry.payload)
            }
        })
        .collect();
    pending.sort_by_key(|info| info.multipv.unwrap_or(1));
    pending
}

fn info_is_useful(payload: &EngineInfoPayload) -> bool {
    payload.depth > 0
        || payload.score_cp.is_some()
        || payload.score_mate.is_some()
        || !payload.pv.is_empty()
}

fn validate_uci_field(label: &str, text: &str, allow_empty: bool) -> Result<(), String> {
    if !allow_empty && text.is_empty() {
        return Err(format!("{label}不能为空"));
    }
    if text.bytes().any(|byte| byte == b'\n' || byte == b'\r') {
        return Err(format!("{label}含有换行，已拒绝写入引擎"));
    }
    Ok(())
}

fn take_bestmove(state: &mut EngineState, bestmove: String) -> Option<EngineBestMovePayload> {
    state.go_outstanding = false;
    state.is_searching = false;
    state.search_phase = SearchPhase::Idle;
    let _ = state.phase_tx.send(SearchPhase::Idle);
    state.stop_notify.notify_waiters();
    match state.active_search.take() {
        Some(active) if !active.aborted => Some(EngineBestMovePayload {
            search_id: active.search_id,
            is_ai_move: active.is_ai_move,
            bestmove,
        }),
        Some(active) => {
            eprintln!(
                "[UCI Lifecycle] Discarded bestmove '{}' for aborted search ID {}",
                bestmove, active.search_id
            );
            None
        }
        None => {
            eprintln!(
                "[UCI Lifecycle] Discarded bestmove '{}' with no active search",
                bestmove
            );
            None
        }
    }
}

fn release_reader(state: &mut EngineState, reader_generation: u64) -> bool {
    if state.generation != reader_generation {
        return false;
    }
    state.is_searching = false;
    state.go_outstanding = false;
    state.search_phase = SearchPhase::Idle;
    let _ = state.phase_tx.send(SearchPhase::Idle);
    state.active_search = None;
    if let Some(pid) = state.child.as_ref().and_then(|proc| proc.id()) {
        clear_engine_pid(pid);
    }
    state.child = None;
    state.stdin = None;
    state.stop_notify.notify_waiters();
    true
}

fn retire_current_process(state: &mut EngineState) -> (Option<Child>, Option<ChildStdin>, bool) {
    state.generation = state.generation.wrapping_add(1);
    state.current_search_id = SEARCH_COUNTER.fetch_add(1, Ordering::SeqCst);
    state.active_search = None;
    state.is_searching = false;
    state.go_outstanding = false;
    state.search_phase = SearchPhase::Idle;
    let _ = state.phase_tx.send(SearchPhase::Idle);
    state.options.clear();
    let child = state.child.take();
    let stdin = state.stdin.take();
    if let Some(pid) = child.as_ref().and_then(|proc| proc.id()) {
        clear_engine_pid(pid);
    }
    state.stop_notify.notify_waiters();
    let had_process = child.is_some() || stdin.is_some();
    (child, stdin, had_process)
}

async fn reap_process(stdin: Option<ChildStdin>, child: Option<Child>) {
    if let Some(mut sin) = stdin {
        let _ = tokio::time::timeout(Duration::from_millis(200), async {
            let _ = sin.write_all(b"quit\n").await;
            let _ = sin.flush().await;
        })
        .await;
    }
    if let Some(mut child) = child {
        if tokio::time::timeout(Duration::from_millis(400), child.wait())
            .await
            .is_err()
        {
            let _ = child.start_kill();
            let _ = tokio::time::timeout(Duration::from_secs(2), child.wait()).await;
        }
    }
}

fn spawn_stdout_reader(
    shared: SharedEngine,
    emit: EngineEmitter,
    stdout: tokio::process::ChildStdout,
    reader_generation: u64,
) {
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        let mut last_info_emit_by_pv: HashMap<u32, Instant> = HashMap::new();
        let mut latest_info_by_pv: HashMap<u32, CachedInfo> = HashMap::new();
        let mut tracked_search_id: u64 = 0;
        let mut initial_ready_emitted = false;

        while let Ok(Some(line)) = lines.next_line().await {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            if trimmed.starts_with("id name ") {
                let mut st = shared.lock().await;
                if st.generation != reader_generation {
                    continue;
                }
                let name = trimmed.trim_start_matches("id name ").to_string();
                st.engine_name = name.clone();
                drop(st);
                emit_event(&emit, "engine-name", name);
            } else if trimmed.starts_with("id author ") {
                let mut st = shared.lock().await;
                if st.generation != reader_generation {
                    continue;
                }
                st.engine_author = trimmed.trim_start_matches("id author ").to_string();
            } else if trimmed.starts_with("option name ") {
                if let Some(meta) = parse_uci_option(trimmed) {
                    let mut st = shared.lock().await;
                    if st.generation != reader_generation {
                        continue;
                    }
                    st.options.push(meta);
                }
            } else if trimmed == "uciok" {
                let mut st = shared.lock().await;
                if st.generation != reader_generation {
                    continue;
                }
                let options_clone = st.options.clone();
                let has_nnue = st.nnue_path.is_some();
                let saved_options = st.current_options_map.clone();
                if let Some(ref mut sin) = st.stdin {
                    if has_nnue {
                        let _ = sin
                            .write_all(b"setoption name EvalFile value pikafish.nnue\n")
                            .await;
                    }
                    for (k, v) in saved_options {
                        if validate_uci_field("选项名", &k, false).is_err()
                            || validate_uci_field("选项值", &v, true).is_err()
                        {
                            eprintln!("[UCI] skip saved option with illegal whitespace: {k}");
                            continue;
                        }
                        let cmd = if v.is_empty() {
                            format!("setoption name {k}\n")
                        } else {
                            format!("setoption name {k} value {v}\n")
                        };
                        let _ = sin.write_all(cmd.as_bytes()).await;
                    }
                    let _ = sin.write_all(b"isready\n").await;
                    let _ = sin.flush().await;
                }
                drop(st);
                emit_event(&emit, "engine-options", options_clone);
            } else if trimmed == "readyok" {
                let st = shared.lock().await;
                if st.generation != reader_generation {
                    continue;
                }
                drop(st);
                if !initial_ready_emitted {
                    initial_ready_emitted = true;
                    eprintln!(
                        "[UCI Lifecycle] Engine initial readyok received -> emitting engine-ready"
                    );
                    emit_event(&emit, "engine-ready", true);
                } else {
                    eprintln!("[UCI Lifecycle] Internal readyok acknowledged");
                }
            } else if trimmed.starts_with("info ") {
                if let Some(mut payload) = parse_info_line(trimmed) {
                    if !info_is_useful(&payload) {
                        continue;
                    }
                    let st = shared.lock().await;
                    if st.generation != reader_generation {
                        continue;
                    }
                    let active = match st.active_search.clone() {
                        Some(active) if !active.aborted => active,
                        _ => continue,
                    };
                    drop(st);

                    if active.search_id != tracked_search_id {
                        tracked_search_id = active.search_id;
                        last_info_emit_by_pv.clear();
                        latest_info_by_pv.clear();
                    }
                    payload.search_id = active.search_id;
                    let line_num = payload.multipv.unwrap_or(1);
                    let now = Instant::now();
                    let last_emit = last_info_emit_by_pv.get(&line_num).copied();
                    let should_emit = match last_emit {
                        None => true,
                        Some(prev_time) => {
                            now.duration_since(prev_time) >= Duration::from_millis(80)
                        }
                    };
                    let emitted = if should_emit {
                        let st = shared.lock().await;
                        let still_current = st.generation == reader_generation
                            && st.active_search.as_ref().is_some_and(|search| {
                                search.search_id == active.search_id && !search.aborted
                            });
                        drop(st);
                        if still_current {
                            last_info_emit_by_pv.insert(line_num, now);
                            emit_event(&emit, "engine-info", &payload);
                            true
                        } else {
                            false
                        }
                    } else {
                        false
                    };
                    latest_info_by_pv.insert(line_num, CachedInfo { payload, emitted });
                }
            } else if trimmed.starts_with("bestmove ") {
                let parts: Vec<&str> = trimmed.split_whitespace().collect();
                if parts.len() >= 2 {
                    let bestmove = parts[1].to_string();
                    let mut st = shared.lock().await;
                    if st.generation != reader_generation {
                        continue;
                    }
                    let published = take_bestmove(&mut st, bestmove);
                    drop(st);
                    if published.is_some() {
                        for info in drain_unsent(&mut latest_info_by_pv) {
                            emit_event(&emit, "engine-info", info);
                        }
                        if let Some(payload) = published {
                            emit_event(&emit, "engine-bestmove", payload);
                        }
                    } else {
                        latest_info_by_pv.clear();
                    }
                    last_info_emit_by_pv.clear();
                }
            }
        }

        let mut st = shared.lock().await;
        let emit_stopped = release_reader(&mut st, reader_generation);
        drop(st);
        if emit_stopped {
            emit_event(&emit, "engine-status", "stopped");
        }
    });
}

async fn spawn_engine_locked(
    shared: SharedEngine,
    emit: EngineEmitter,
    program: PathBuf,
    args: Vec<String>,
    work_dir: PathBuf,
) -> Result<String, String> {
    if !program.exists() {
        return Err(format!("引擎文件不存在: {:?}", program));
    }

    let (old_child, old_stdin, had_process) = {
        let mut state = shared.lock().await;
        retire_current_process(&mut state)
    };
    if had_process {
        emit_event(&emit, "engine-status", "stopped");
    }
    reap_process(old_stdin, old_child).await;

    let nnue_candidate = work_dir.join("pikafish.nnue");
    let nnue_path = if nnue_candidate.exists() {
        Some(clean_path(nnue_candidate))
    } else {
        None
    };

    let mut std_cmd = std::process::Command::new(&program);
    std_cmd.args(&args);
    std_cmd.current_dir(&work_dir);
    std_cmd.stdin(Stdio::piped());
    std_cmd.stdout(Stdio::piped());
    std_cmd.stderr(Stdio::piped());

    #[cfg(windows)]
    std_cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = Command::from(std_cmd)
        .spawn()
        .map_err(|e| format!("启动皮卡鱼失败: {}", e))?;

    let stdin = child.stdin.take().ok_or("无法获取引擎 stdin")?;
    let stdout = child.stdout.take().ok_or("无法获取引擎 stdout")?;
    let stderr = child.stderr.take();
    let pid = child.id().unwrap_or(0);

    let reader_generation = {
        let mut state = shared.lock().await;
        state.child = Some(child);
        state.stdin = Some(stdin);
        state.engine_path = Some(program.clone());
        state.nnue_path = nnue_path;
        state.is_searching = false;
        state.go_outstanding = false;
        state.search_phase = SearchPhase::Idle;
        let _ = state.phase_tx.send(SearchPhase::Idle);
        state.active_search = None;
        if let Some(ref mut sin) = state.stdin {
            let _ = sin.write_all(b"uci\n").await;
            let _ = sin.flush().await;
        }
        remember_engine_pid(pid);
        state.generation
    };

    if let Some(err_pipe) = stderr {
        tokio::spawn(async move {
            let err_reader = BufReader::new(err_pipe);
            let mut err_lines = err_reader.lines();
            while let Ok(Some(line)) = err_lines.next_line().await {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    eprintln!("[Pikafish stderr] {}", trimmed);
                }
            }
        });
    }

    spawn_stdout_reader(shared, emit, stdout, reader_generation);
    Ok(program.to_string_lossy().to_string())
}

pub async fn start_engine_internal(
    app: AppHandle,
    shared: SharedEngine,
    custom_path: Option<String>,
) -> Result<String, String> {
    let program = clean_path(if let Some(cp) = custom_path {
        PathBuf::from(cp)
    } else {
        find_pikafish_executable(Some(&app)).ok_or_else(|| {
            "未找到皮卡鱼 (Pikafish) 可执行文件，请检查 resources/ 目录".to_string()
        })?
    });
    let work_dir = program
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();
    let emit = emitter_from_app(&app);
    let _ops = lock_ops(&shared).await;
    spawn_engine_locked(shared, emit, program, Vec::new(), work_dir).await
}

#[cfg(test)]
pub async fn start_engine_process(
    shared: SharedEngine,
    emit: EngineEmitter,
    program: PathBuf,
    args: Vec<String>,
    work_dir: PathBuf,
) -> Result<String, String> {
    let _ops = lock_ops(&shared).await;
    spawn_engine_locked(shared, emit, program, args, work_dir).await
}

pub fn parse_info_line(line: &str) -> Option<EngineInfoPayload> {
    let tokens: Vec<&str> = line.split_whitespace().collect();
    if tokens.is_empty() || tokens[0] != "info" {
        return None;
    }

    let mut depth = 0;
    let mut seldepth = None;
    let mut multipv = None;
    let mut score_cp = None;
    let mut score_mate = None;
    let mut nodes: Option<u64> = None;
    let mut nps: Option<u64> = None;
    let mut time_ms = None;
    let mut hashfull = None;
    let mut pv = Vec::new();
    let mut cur_move = None;
    let mut cur_move_num = None;

    let mut i = 1;
    while i < tokens.len() {
        match tokens[i] {
            "depth" => {
                if i + 1 < tokens.len() {
                    depth = tokens[i + 1].parse().unwrap_or(0);
                    i += 1;
                }
            }
            "seldepth" => {
                if i + 1 < tokens.len() {
                    seldepth = tokens[i + 1].parse().ok();
                    i += 1;
                }
            }
            "multipv" => {
                if i + 1 < tokens.len() {
                    multipv = tokens[i + 1].parse().ok();
                    i += 1;
                }
            }
            "score" => {
                if i + 2 < tokens.len() {
                    let kind = tokens[i + 1];
                    let val: i32 = tokens[i + 2].parse().unwrap_or(0);
                    if kind == "cp" {
                        score_cp = Some(val);
                    } else if kind == "mate" {
                        score_mate = Some(val);
                    }
                    i += 2;
                }
            }
            "nodes" => {
                if i + 1 < tokens.len() {
                    nodes = tokens[i + 1].parse().ok();
                    i += 1;
                }
            }
            "nps" => {
                if i + 1 < tokens.len() {
                    nps = tokens[i + 1].parse().ok();
                    i += 1;
                }
            }
            "time" => {
                if i + 1 < tokens.len() {
                    time_ms = tokens[i + 1].parse().ok();
                    i += 1;
                }
            }
            "hashfull" => {
                if i + 1 < tokens.len() {
                    hashfull = tokens[i + 1].parse().ok();
                    i += 1;
                }
            }
            "currmove" => {
                if i + 1 < tokens.len() {
                    cur_move = Some(tokens[i + 1].to_string());
                    i += 1;
                }
            }
            "currmovenumber" => {
                if i + 1 < tokens.len() {
                    cur_move_num = tokens[i + 1].parse().ok();
                    i += 1;
                }
            }
            "pv" => {
                for &m in &tokens[i + 1..] {
                    pv.push(m.to_string());
                }
                break;
            }
            _ => {}
        }
        i += 1;
    }

    Some(EngineInfoPayload {
        search_id: 0,
        depth,
        seldepth,
        score_cp,
        score_mate,
        nodes,
        nps,
        time_ms,
        hashfull,
        multipv,
        pv,
        cur_move,
        cur_move_num,
    })
}

pub async fn wait_for_idle(
    mut rx: watch::Receiver<SearchPhase>,
    timeout_dur: Duration,
) -> Result<(), &'static str> {
    let wait = async {
        loop {
            if *rx.borrow_and_update() == SearchPhase::Idle {
                return Ok(());
            }
            if rx.changed().await.is_err() {
                return Err("engine phase channel closed");
            }
        }
    };
    match tokio::time::timeout(timeout_dur, wait).await {
        Ok(result) => result,
        Err(_) => Err("Timeout waiting for engine to become idle"),
    }
}

async fn ensure_engine_idle(shared: &SharedEngine) -> Result<(), String> {
    let phase_rx = {
        let mut state = shared.lock().await;
        if !state.go_outstanding {
            if state.search_phase != SearchPhase::Idle {
                state.search_phase = SearchPhase::Idle;
                let _ = state.phase_tx.send(SearchPhase::Idle);
            }
            return Ok(());
        }
        if state.search_phase == SearchPhase::Searching {
            if let Some(active) = state.active_search.as_mut() {
                active.aborted = true;
            }
            match state.stdin.as_mut() {
                Some(sin) => {
                    sin.write_all(b"stop\n").await.map_err(|e| e.to_string())?;
                    sin.flush().await.map_err(|e| e.to_string())?;
                }
                None => return Err("引擎未就绪，无法停止正在进行的搜索".into()),
            }
            state.search_phase = SearchPhase::Stopping;
            let _ = state.phase_tx.send(SearchPhase::Stopping);
        }
        state.phase_rx.clone()
    };

    let _ = wait_for_idle(phase_rx, stop_wait_budget()).await;
    if shared.lock().await.go_outstanding {
        return Err("引擎未能及时结束上一步搜索，已拒绝重叠的 go".into());
    }
    Ok(())
}

pub fn validate_fen_for_engine(fen: &str) -> Result<(), String> {
    let clean = fen.trim();
    if clean.is_empty() {
        return Err("FEN 字符串不能为空".to_string());
    }
    let parts: Vec<&str> = clean.split_whitespace().collect();
    if parts.is_empty() {
        return Err("FEN 格式错误".to_string());
    }
    let rows: Vec<&str> = parts[0].split('/').collect();
    if rows.len() != 10 {
        return Err(format!("FEN 行数错误: 期望 10 行，实际 {} 行", rows.len()));
    }
    let mut red_k = 0;
    let mut black_k = 0;
    let mut counts: HashMap<char, usize> = HashMap::new();
    let mut total_pieces = 0;

    for (r_idx, row) in rows.iter().enumerate() {
        let mut col_count = 0;
        for ch in row.chars() {
            if ch.is_ascii_digit() {
                let d = ch.to_digit(10).unwrap() as usize;
                if d < 1 || d > 9 {
                    return Err(format!("第 {} 行数字非法: {}", r_idx + 1, d));
                }
                col_count += d;
            } else if "kabnrcpKABNRCP".contains(ch) {
                col_count += 1;
                total_pieces += 1;
                *counts.entry(ch).or_insert(0) += 1;
                if ch == 'K' {
                    red_k += 1;
                }
                if ch == 'k' {
                    black_k += 1;
                }
            } else {
                return Err(format!("第 {} 行含有非法字符: {}", r_idx + 1, ch));
            }
        }
        if col_count != 9 {
            return Err(format!(
                "第 {} 行总列数错误: 期望 9 列，实际 {} 列",
                r_idx + 1,
                col_count
            ));
        }
    }

    if red_k != 1 {
        return Err(format!("红帅数量非法: 必须恰有 1 个，实际 {} 个", red_k));
    }
    if black_k != 1 {
        return Err(format!("黑将数量非法: 必须恰有 1 个，实际 {} 个", black_k));
    }

    if *counts.get(&'R').unwrap_or(&0) > 2 {
        return Err("红车数量超限 (最多 2 个)".into());
    }
    if *counts.get(&'r').unwrap_or(&0) > 2 {
        return Err("黑车数量超限 (最多 2 个)".into());
    }
    if *counts.get(&'N').unwrap_or(&0) > 2 {
        return Err("红马数量超限 (最多 2 个)".into());
    }
    if *counts.get(&'n').unwrap_or(&0) > 2 {
        return Err("黑马数量超限 (最多 2 个)".into());
    }
    if *counts.get(&'C').unwrap_or(&0) > 2 {
        return Err("红炮数量超限 (最多 2 个)".into());
    }
    if *counts.get(&'c').unwrap_or(&0) > 2 {
        return Err("黑炮数量超限 (最多 2 个)".into());
    }
    if *counts.get(&'B').unwrap_or(&0) > 2 {
        return Err("红相数量超限 (最多 2 个)".into());
    }
    if *counts.get(&'b').unwrap_or(&0) > 2 {
        return Err("黑象数量超限 (最多 2 个)".into());
    }
    if *counts.get(&'A').unwrap_or(&0) > 2 {
        return Err("红仕数量超限 (最多 2 个)".into());
    }
    if *counts.get(&'a').unwrap_or(&0) > 2 {
        return Err("黑士数量超限 (最多 2 个)".into());
    }
    if *counts.get(&'P').unwrap_or(&0) > 5 {
        return Err("红兵数量超限 (最多 5 个)".into());
    }
    if *counts.get(&'p').unwrap_or(&0) > 5 {
        return Err("黑卒数量超限 (最多 5 个)".into());
    }

    if total_pieces > 32 {
        return Err(format!(
            "棋子总数超限: 最多 32 个，实际 {} 个",
            total_pieces
        ));
    }

    Ok(())
}

pub async fn search_position_internal(
    shared: SharedEngine,
    fen: String,
    moves: Vec<String>,
    search_type: Option<String>,
    limit_value: Option<u64>,
    movetime_ms: Option<u64>,
    depth: Option<u32>,
    is_ai_move: bool,
    search_id_opt: Option<u64>,
) -> Result<u64, String> {
    if let Err(err_msg) = validate_fen_for_engine(&fen) {
        eprintln!(
            "[UCI Safety Boundary] Refusing search on invalid FEN: {}",
            err_msg
        );
        return Err(format!("引擎安全边界拦截: {}", err_msg));
    }

    let _ops = lock_ops(&shared).await;
    ensure_engine_idle(&shared).await?;

    let mut state = shared.lock().await;
    if state.go_outstanding {
        return Err("引擎仍未空闲，已拒绝重叠的 go".into());
    }
    let search_id = search_id_opt.unwrap_or_else(|| SEARCH_COUNTER.fetch_add(1, Ordering::SeqCst));
    state.current_search_id = search_id;
    eprintln!(
        "[UCI Search] Starting search: ID={}, is_ai_move={}, type={:?}, limit={:?}, fen='{}'",
        search_id, is_ai_move, search_type, limit_value, fen
    );

    let sin = state.stdin.as_mut().ok_or("引擎未就绪")?;

    let pos_cmd = if moves.is_empty() {
        format!("position fen {}\n", fen)
    } else {
        format!("position fen {} moves {}\n", fen, moves.join(" "))
    };

    let go_cmd = match search_type.as_deref() {
        Some("movetime") => {
            let ms = limit_value.or(movetime_ms).unwrap_or(1000);
            format!("go movetime {}\n", ms)
        }
        Some("depth") => {
            let d = limit_value.map(|v| v as u32).or(depth).unwrap_or(15);
            format!("go depth {}\n", d)
        }
        Some("nodes") => {
            let n = limit_value.unwrap_or(100000);
            format!("go nodes {}\n", n)
        }
        Some("infinite") => {
            if is_ai_move {
                "go movetime 1500\n".to_string()
            } else {
                "go infinite\n".to_string()
            }
        }
        _ => {
            if let Some(ms) = movetime_ms {
                format!("go movetime {}\n", ms)
            } else if let Some(d) = depth {
                format!("go depth {}\n", d)
            } else {
                "go movetime 1000\n".to_string()
            }
        }
    };

    sin.write_all(pos_cmd.as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    sin.write_all(go_cmd.as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    sin.flush().await.map_err(|e| e.to_string())?;
    eprintln!(
        "[UCI Search] Stdin sent: pos='{}' | go='{}'",
        pos_cmd.trim(),
        go_cmd.trim()
    );

    state.is_searching = true;
    state.go_outstanding = true;
    state.search_phase = SearchPhase::Searching;
    state.active_search = Some(ActiveSearch {
        search_id,
        is_ai_move,
        aborted: false,
    });
    let _ = state.phase_tx.send(SearchPhase::Searching);

    Ok(search_id)
}

pub async fn stop_search_internal(shared: SharedEngine) -> Result<(), String> {
    let _ops = lock_ops(&shared).await;
    ensure_engine_idle(&shared).await
}

async fn set_engine_options_locked(
    shared: &SharedEngine,
    options: Vec<(String, String)>,
) -> Result<(), String> {
    for (name, value) in &options {
        validate_uci_field("选项名", name, false)?;
        validate_uci_field("选项值", value, true)?;
    }

    ensure_engine_idle(shared).await?;

    let mut state = shared.lock().await;
    if state.go_outstanding {
        return Err("引擎仍在搜索，拒绝修改选项".into());
    }
    let mut commands = Vec::with_capacity(options.len());
    for (name, val) in &options {
        let cmd = if val.is_empty() {
            format!("setoption name {name}\n")
        } else {
            format!("setoption name {name} value {val}\n")
        };
        commands.push(cmd);
    }
    {
        let sin = state.stdin.as_mut().ok_or("引擎未就绪")?;
        for cmd in &commands {
            sin.write_all(cmd.as_bytes())
                .await
                .map_err(|e| e.to_string())?;
        }
        sin.write_all(b"isready\n")
            .await
            .map_err(|e| e.to_string())?;
        sin.flush().await.map_err(|e| e.to_string())?;
    }
    for (name, val) in options {
        if let Some(opt) = state.options.iter_mut().find(|opt| opt.name == name) {
            opt.current_value = Some(val.clone());
        }
        state.current_options_map.insert(name, val);
    }
    Ok(())
}

pub async fn set_engine_options_internal(
    shared: SharedEngine,
    options: Vec<(String, String)>,
) -> Result<(), String> {
    let _ops = lock_ops(&shared).await;
    set_engine_options_locked(&shared, options).await
}

pub async fn get_engine_options_internal(
    shared: SharedEngine,
) -> Result<Vec<UciOptionMeta>, String> {
    let state = shared.lock().await;
    Ok(state.options.clone())
}

pub async fn restart_engine_internal(
    app: AppHandle,
    shared: SharedEngine,
    custom_path: Option<String>,
) -> Result<String, String> {
    start_engine_internal(app, shared, custom_path).await
}

async fn stop_engine_locked(shared: &SharedEngine, emit: &EngineEmitter) -> Result<(), String> {
    let (child, stdin, had_process) = {
        let mut state = shared.lock().await;
        retire_current_process(&mut state)
    };
    if had_process {
        emit_event(emit, "engine-status", "stopped");
    }
    reap_process(stdin, child).await;
    Ok(())
}

pub async fn stop_engine_internal(app: AppHandle, shared: SharedEngine) -> Result<(), String> {
    let emit = emitter_from_app(&app);
    let _ops = lock_ops(&shared).await;
    stop_engine_locked(&shared, &emit).await
}

#[cfg(test)]
pub async fn stop_engine_with_emitter(
    shared: SharedEngine,
    emit: EngineEmitter,
) -> Result<(), String> {
    let _ops = lock_ops(&shared).await;
    stop_engine_locked(&shared, &emit).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::Ordering;
    use std::sync::Arc;
    use std::sync::Mutex as StdMutex;
    use std::time::Duration;
    use tokio::sync::Mutex;

    fn engine_test_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: StdMutex<()> = StdMutex::new(());
        LOCK.lock().unwrap()
    }

    struct RestoreWait;
    impl Drop for RestoreWait {
        fn drop(&mut self) {
            STOP_WAIT_MS.store(1500, Ordering::Relaxed);
        }
    }

    fn fresh_state() -> SharedEngine {
        Arc::new(Mutex::new(EngineState::new()))
    }

    #[test]
    fn stale_reader_exit_does_not_clear_the_replacement_session() {
        let mut state = EngineState::new();
        state.generation = 2;
        state.go_outstanding = true;
        state.is_searching = true;
        state.search_phase = SearchPhase::Searching;
        state.active_search = Some(ActiveSearch {
            search_id: 9,
            is_ai_move: true,
            aborted: false,
        });

        assert!(!release_reader(&mut state, 1));
        assert!(state.go_outstanding);
        assert_eq!(state.active_search.as_ref().unwrap().search_id, 9);

        assert!(release_reader(&mut state, 2));
        assert!(!state.go_outstanding);
        assert!(state.active_search.is_none());
        assert_eq!(state.search_phase, SearchPhase::Idle);
    }

    #[test]
    fn aborted_bestmove_is_not_published_and_clears_the_go() {
        let mut state = EngineState::new();
        state.go_outstanding = true;
        state.search_phase = SearchPhase::Searching;
        state.active_search = Some(ActiveSearch {
            search_id: 4,
            is_ai_move: true,
            aborted: true,
        });
        assert!(take_bestmove(&mut state, "a9a8".into()).is_none());
        assert!(!state.go_outstanding);
        assert_eq!(state.search_phase, SearchPhase::Idle);
        assert!(state.active_search.is_none());
    }

    #[test]
    fn live_bestmove_keeps_its_own_search_id() {
        let mut state = EngineState::new();
        state.go_outstanding = true;
        state.active_search = Some(ActiveSearch {
            search_id: 4,
            is_ai_move: false,
            aborted: false,
        });
        let published = take_bestmove(&mut state, "h2e2".into()).unwrap();
        assert_eq!(published.search_id, 4);
        assert_eq!(published.bestmove, "h2e2");
        assert!(!published.is_ai_move);
    }

    #[test]
    fn uci_option_text_rejects_newlines() {
        assert!(validate_uci_field("选项值", "AsianRule", true).is_ok());
        assert!(validate_uci_field("选项值", "", true).is_ok());
        assert!(validate_uci_field("选项名", "", false).is_err());
        assert!(validate_uci_field("选项值", "ok\nquit", true).is_err());
        assert!(validate_uci_field("选项值", "bad\rvalue", true).is_err());
    }

    #[test]
    fn final_unsent_multipv_line_is_flushed() {
        let mut cache = HashMap::new();
        cache.insert(
            1,
            CachedInfo {
                payload: EngineInfoPayload {
                    search_id: 3,
                    depth: 8,
                    seldepth: None,
                    score_cp: Some(15),
                    score_mate: None,
                    nodes: None,
                    nps: None,
                    time_ms: None,
                    hashfull: None,
                    multipv: Some(1),
                    pv: vec!["h2e2".into()],
                    cur_move: None,
                    cur_move_num: None,
                },
                emitted: true,
            },
        );
        cache.insert(
            2,
            CachedInfo {
                payload: EngineInfoPayload {
                    search_id: 3,
                    depth: 8,
                    seldepth: None,
                    score_cp: Some(4),
                    score_mate: None,
                    nodes: None,
                    nps: None,
                    time_ms: None,
                    hashfull: None,
                    multipv: Some(2),
                    pv: vec!["b0c2".into()],
                    cur_move: None,
                    cur_move_num: None,
                },
                emitted: false,
            },
        );
        let pending = drain_unsent(&mut cache);
        assert!(cache.is_empty());
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].multipv, Some(2));
        assert_eq!(pending[0].pv, vec!["b0c2".to_string()]);
    }

    #[test]
    fn info_without_depth_score_or_pv_is_ignored() {
        let chatter = parse_info_line("info string nnue loaded").unwrap();
        assert!(!info_is_useful(&chatter));
        let scored = parse_info_line("info depth 6 score cp 12 pv h2e2").unwrap();
        assert!(info_is_useful(&scored));
        assert_eq!(scored.depth, 6);
        assert_eq!(scored.score_cp, Some(12));
    }

    #[tokio::test]
    async fn overlapping_go_is_refused_until_the_previous_bestmove() {
        let _guard = engine_test_lock();
        let _restore = RestoreWait;
        STOP_WAIT_MS.store(80, Ordering::Relaxed);

        let shared = fresh_state();
        {
            let mut state = shared.lock().await;
            state.go_outstanding = true;
            state.search_phase = SearchPhase::Stopping;
            let _ = state.phase_tx.send(SearchPhase::Stopping);
            state.active_search = Some(ActiveSearch {
                search_id: 1,
                is_ai_move: false,
                aborted: true,
            });
        }

        let err = search_position_internal(
            shared.clone(),
            "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1".into(),
            Vec::new(),
            Some("movetime".into()),
            Some(100),
            None,
            None,
            false,
            Some(2),
        )
        .await
        .unwrap_err();
        assert!(err.contains("拒绝重叠的 go"), "{err}");
        let state = shared.lock().await;
        assert!(state.go_outstanding);
        assert_eq!(state.active_search.as_ref().unwrap().search_id, 1);
        assert!(state.stdin.is_none());
    }

    #[tokio::test]
    async fn bestmove_unblocks_the_next_search_without_adopting_the_old_move() {
        let _guard = engine_test_lock();
        let _restore = RestoreWait;
        STOP_WAIT_MS.store(1000, Ordering::Relaxed);

        let shared = fresh_state();
        {
            let mut state = shared.lock().await;
            state.go_outstanding = true;
            state.search_phase = SearchPhase::Stopping;
            let _ = state.phase_tx.send(SearchPhase::Stopping);
            state.active_search = Some(ActiveSearch {
                search_id: 1,
                is_ai_move: true,
                aborted: true,
            });
        }
        let shared_bg = shared.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(30)).await;
            let mut state = shared_bg.lock().await;
            assert!(take_bestmove(&mut state, "a9a8".into()).is_none());
        });

        ensure_engine_idle(&shared).await.unwrap();
        let state = shared.lock().await;
        assert!(!state.go_outstanding);
        assert!(state.active_search.is_none());
    }

    #[tokio::test]
    async fn replacement_process_ignores_the_previous_engines_bestmove() {
        let _guard = engine_test_lock();
        let dir = std::env::temp_dir().join(format!("xq-fake-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let script_path = dir.join("fake_uci.py");
        std::fs::write(
            &script_path,
            r#"import sys, threading, time
lock = threading.Lock()
token = 0

def long_search(my):
    print("info depth 4 score cp 25 pv a0a1", flush=True)
    while True:
        time.sleep(0.02)
        with lock:
            if token != my:
                break
    time.sleep(2.0)
    print("bestmove a9a8", flush=True)

def short_search(my):
    time.sleep(0.04)
    print("info depth 3 score cp 10 pv h2e2", flush=True)
    with lock:
        if token != my:
            return
    print("bestmove h2e2", flush=True)

for raw in sys.stdin:
    line = raw.strip()
    if line == "uci":
        print("id name FakeFish", flush=True)
        print("uciok", flush=True)
    elif line == "isready":
        print("readyok", flush=True)
    elif line == "stop":
        with lock:
            token += 1
    elif line.startswith("go"):
        with lock:
            token += 1
            my = token
        if "infinite" in line:
            threading.Thread(target=long_search, args=(my,), daemon=True).start()
        else:
            threading.Thread(target=short_search, args=(my,), daemon=True).start()
    elif line == "quit":
        break
"#,
        )
        .unwrap();

        let events = Arc::new(StdMutex::new(Vec::<(String, serde_json::Value)>::new()));
        let events_emit = events.clone();
        let emit: EngineEmitter = Arc::new(move |name, payload| {
            events_emit
                .lock()
                .unwrap()
                .push((name.to_string(), payload));
        });
        let shared = fresh_state();
        let python = which_python();
        start_engine_process(
            shared.clone(),
            emit.clone(),
            python,
            vec!["-u".into(), script_path.to_string_lossy().to_string()],
            dir.clone(),
        )
        .await
        .unwrap();

        wait_for_event(&events, "engine-ready").await;

        let fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";
        let first = search_position_internal(
            shared.clone(),
            fen.into(),
            Vec::new(),
            Some("infinite".into()),
            None,
            None,
            None,
            false,
            Some(11),
        )
        .await
        .unwrap();
        assert_eq!(first, 11);

        let overlapped = search_position_internal(
            shared.clone(),
            fen.into(),
            Vec::new(),
            Some("movetime".into()),
            Some(50),
            None,
            None,
            true,
            Some(12),
        )
        .await;
        assert!(
            overlapped.is_err(),
            "second go must wait for the first bestmove"
        );

        tokio::time::timeout(Duration::from_secs(4), async {
            loop {
                if !shared.lock().await.go_outstanding {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(30)).await;
            }
        })
        .await
        .expect("engine did not become idle");

        let leaked = events.lock().unwrap().iter().any(|(name, payload)| {
            name == "engine-bestmove"
                && payload.get("bestmove").and_then(|v| v.as_str()) == Some("a9a8")
        });
        assert!(!leaked, "aborted search published a9a8");

        let third = search_position_internal(
            shared.clone(),
            fen.into(),
            Vec::new(),
            Some("movetime".into()),
            Some(40),
            None,
            None,
            false,
            Some(13),
        )
        .await
        .unwrap();
        assert_eq!(third, 13);

        tokio::time::timeout(Duration::from_secs(3), async {
            loop {
                let found = events.lock().unwrap().iter().any(|(name, payload)| {
                    name == "engine-bestmove"
                        && payload.get("search_id").and_then(|v| v.as_u64()) == Some(13)
                        && payload.get("bestmove").and_then(|v| v.as_str()) == Some("h2e2")
                });
                if found {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .expect("third search did not receive its own bestmove");

        let _ = stop_engine_with_emitter(shared, emit).await;
        kill_lingering_engine();
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn which_python() -> PathBuf {
        for name in ["python3", "python", "py"] {
            let Ok(output) = std::process::Command::new(name)
                .arg("-c")
                .arg("import sys; print(sys.executable)")
                .output()
            else {
                continue;
            };
            if !output.status.success() {
                continue;
            }
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if Path::new(&path).exists() {
                return PathBuf::from(path);
            }
        }
        panic!("python3 is required for the fake UCI engine test");
    }

    async fn wait_for_event(events: &Arc<StdMutex<Vec<(String, serde_json::Value)>>>, name: &str) {
        tokio::time::timeout(Duration::from_secs(3), async {
            loop {
                if events
                    .lock()
                    .unwrap()
                    .iter()
                    .any(|(event, _)| event == name)
                {
                    return;
                }
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .unwrap_or_else(|_| panic!("timed out waiting for {name}"));
    }
}
