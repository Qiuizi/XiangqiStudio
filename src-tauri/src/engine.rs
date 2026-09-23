use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{watch, Mutex, Notify};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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

pub async fn start_engine_internal(
    app: AppHandle,
    shared: SharedEngine,
    custom_path: Option<String>,
) -> Result<String, String> {
    let mut state = shared.lock().await;

    // If already running, stop it first
    if let Some(mut child) = state.child.take() {
        let _ = child.kill().await;
    }
    state.stdin = None;
    state.is_searching = false;
    state.active_search = None;
    state.options.clear();

    let target_path = clean_path(if let Some(cp) = custom_path {
        PathBuf::from(cp)
    } else {
        find_pikafish_executable(Some(&app))
            .ok_or_else(|| "未找到皮卡鱼 (Pikafish) 可执行文件，请检查 resources/ 目录".to_string())?
    });

    if !target_path.exists() {
        return Err(format!("引擎文件不存在: {:?}", target_path));
    }

    let work_dir = target_path.parent().unwrap_or_else(|| Path::new("."));

    // Look for pikafish.nnue in engine directory
    let nnue_candidate = work_dir.join("pikafish.nnue");
    if nnue_candidate.exists() {
        state.nnue_path = Some(clean_path(nnue_candidate));
    } else {
        state.nnue_path = None;
    }

    let mut std_cmd = std::process::Command::new(&target_path);
    std_cmd.current_dir(work_dir);
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

    state.child = Some(child);
    state.stdin = Some(stdin);
    state.engine_path = Some(target_path.clone());

    // Send UCI handshake
    if let Some(ref mut sin) = state.stdin {
        let _ = sin.write_all(b"uci\n").await;
        let _ = sin.flush().await;
    }

    // Spawn stderr background reader
    if let Some(err_pipe) = stderr {
        tokio::spawn(async move {
            let reader = BufReader::new(err_pipe);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    eprintln!("[Pikafish stderr] {}", trimmed);
                }
            }
        });
    }

    // Spawn background reader loop for stdout
    let shared_clone = shared.clone();
    let app_clone = app.clone();

    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        let mut last_info_emit_by_pv: std::collections::HashMap<u32, Instant> = std::collections::HashMap::new();
        let mut latest_info_by_pv: std::collections::HashMap<u32, EngineInfoPayload> = std::collections::HashMap::new();
        let mut tracked_search_id: u64 = 0;

        while let Ok(Some(line)) = lines.next_line().await {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            if trimmed.starts_with("id name ") {
                let name = trimmed.trim_start_matches("id name ").to_string();
                let mut st = shared_clone.lock().await;
                st.engine_name = name.clone();
                let _ = app_clone.emit("engine-name", name);
            } else if trimmed.starts_with("id author ") {
                let author = trimmed.trim_start_matches("id author ").to_string();
                let mut st = shared_clone.lock().await;
                st.engine_author = author.clone();
            } else if trimmed.starts_with("option name ") {
                if let Some(meta) = parse_uci_option(trimmed) {
                    let mut st = shared_clone.lock().await;
                    st.options.push(meta);
                }
            } else if trimmed == "uciok" {
                let mut st = shared_clone.lock().await;
                let options_clone = st.options.clone();
                let has_nnue = st.nnue_path.is_some();
                let saved_options = st.current_options_map.clone();

                let _ = app_clone.emit("engine-options", options_clone);

                if let Some(ref mut sin) = st.stdin {
                    // Set NNUE file if found
                    if has_nnue {
                        let _ = sin.write_all(b"setoption name EvalFile value pikafish.nnue\n").await;
                    }
                    // Apply any saved options
                    for (k, v) in saved_options {
                        let cmd = if v.is_empty() {
                            format!("setoption name {}\n", k)
                        } else {
                            format!("setoption name {} value {}\n", k, v)
                        };
                        let _ = sin.write_all(cmd.as_bytes()).await;
                    }
                    let _ = sin.write_all(b"isready\n").await;
                    let _ = sin.flush().await;
                }
            } else if trimmed == "readyok" {
                // True readiness after NNUE and hash table are initialized
                let _ = app_clone.emit("engine-ready", true);
            } else if trimmed.starts_with("info ") {
                if let Some(mut payload) = parse_info_line(trimmed) {
                    let st = shared_clone.lock().await;
                    let active_opt = st.active_search.clone();
                    drop(st);

                    if let Some(active) = active_opt {
                        if !active.aborted {
                            // If a new search ID has started, reset per-search MultiPV tracking
                            if active.search_id != tracked_search_id {
                                tracked_search_id = active.search_id;
                                last_info_emit_by_pv.clear();
                                latest_info_by_pv.clear();
                            }

                            payload.search_id = active.search_id;
                            let line_num = payload.multipv.unwrap_or(1);
                            latest_info_by_pv.insert(line_num, payload.clone());

                            let now = Instant::now();
                            let last_emit = last_info_emit_by_pv.get(&line_num).copied();

                            // Per-MultiPV independent throttling (80ms minimum interval per line)
                            // Guarantees all MultiPV lines (1, 2, ...) have equal emit opportunities
                            // and completely eliminates starvation of MultiPV 2+.
                            let should_emit = match last_emit {
                                None => true,
                                Some(prev_time) => now.duration_since(prev_time) >= Duration::from_millis(80),
                            };

                            if should_emit {
                                last_info_emit_by_pv.insert(line_num, now);
                                let _ = app_clone.emit("engine-info", payload);
                            }
                        }
                    }
                }
            } else if trimmed.starts_with("bestmove ") {
                let parts: Vec<&str> = trimmed.split_whitespace().collect();
                if parts.len() >= 2 {
                    let bestmove = parts[1].to_string();
                    let mut st = shared_clone.lock().await;
                    let active_opt = st.active_search.take();
                    st.is_searching = false;
                    st.search_phase = SearchPhase::Idle;
                    let _ = st.phase_tx.send(SearchPhase::Idle);
                    let notify = st.stop_notify.clone();
                    drop(st);

                    // Flush any pending latest MultiPV lines before emitting bestmove
                    for (line_num, cached_payload) in latest_info_by_pv.drain() {
                        let last_emit = last_info_emit_by_pv.get(&line_num);
                        if last_emit.map_or(true, |t| t.elapsed() >= Duration::from_millis(30)) {
                            let _ = app_clone.emit("engine-info", cached_payload);
                        }
                    }
                    last_info_emit_by_pv.clear();

                    // Notify any legacy thread waiting for the engine to stop
                    notify.notify_waiters();

                    if let Some(active) = active_opt {
                        if !active.aborted {
                            let payload = EngineBestMovePayload {
                                search_id: active.search_id,
                                is_ai_move: active.is_ai_move,
                                bestmove,
                            };
                            let _ = app_clone.emit("engine-bestmove", payload);
                        } else {
                            eprintln!(
                                "[UCI Lifecycle] Discarded bestmove '{}' for aborted search ID {}",
                                bestmove, active.search_id
                            );
                        }
                    }
                }
            }
        }

        // When stdout ends, engine exited
        let mut st = shared_clone.lock().await;
        st.is_searching = false;
        st.search_phase = SearchPhase::Idle;
        let _ = st.phase_tx.send(SearchPhase::Idle);
        st.active_search = None;
        st.child = None;
        st.stdin = None;
        let notify = st.stop_notify.clone();
        drop(st);

        notify.notify_waiters();
        let _ = app_clone.emit("engine-status", "stopped");
    });

    Ok(target_path.to_string_lossy().to_string())
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

pub async fn wait_for_idle(mut rx: watch::Receiver<SearchPhase>, timeout_dur: Duration) -> Result<(), &'static str> {
    if *rx.borrow() == SearchPhase::Idle {
        return Ok(());
    }
    let res = tokio::time::timeout(timeout_dur, async {
        while *rx.borrow_and_update() != SearchPhase::Idle {
            if rx.changed().await.is_err() {
                return;
            }
        }
    }).await;
    match res {
        Ok(_) => Ok(()),
        Err(_) => Err("Timeout waiting for engine to become idle"),
    }
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
) -> Result<u64, String> {
    // 1. If currently searching or stopping, cleanly abort and wait for engine to reach Idle
    let phase_rx = {
        let mut state = shared.lock().await;
        if state.search_phase != SearchPhase::Idle {
            if state.search_phase == SearchPhase::Searching {
                if let Some(ref mut active) = state.active_search {
                    active.aborted = true;
                }
                if let Some(ref mut sin) = state.stdin {
                    let _ = sin.write_all(b"stop\n").await;
                    let _ = sin.flush().await;
                }
                state.search_phase = SearchPhase::Stopping;
                let _ = state.phase_tx.send(SearchPhase::Stopping);
            }
            Some(state.phase_rx.clone())
        } else {
            None
        }
    };

    if let Some(rx) = phase_rx {
        // Wait up to 1500ms for Pikafish to output bestmove for the stopped search
        let _ = wait_for_idle(rx, Duration::from_millis(1500)).await;
    }

    // 2. Start new search on guaranteed idle engine
    let mut state = shared.lock().await;
    let search_id = SEARCH_COUNTER.fetch_add(1, Ordering::SeqCst);
    state.current_search_id = search_id;

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
                // Safety: AI match moves must NEVER be infinite!
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

    state.is_searching = true;
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
    let phase_rx = {
        let mut state = shared.lock().await;
        if state.search_phase == SearchPhase::Searching {
            if let Some(ref mut active) = state.active_search {
                active.aborted = true;
            }
            if let Some(ref mut sin) = state.stdin {
                let _ = sin.write_all(b"stop\n").await;
                let _ = sin.flush().await;
            }
            state.search_phase = SearchPhase::Stopping;
            let _ = state.phase_tx.send(SearchPhase::Stopping);
            Some(state.phase_rx.clone())
        } else if state.search_phase == SearchPhase::Stopping {
            Some(state.phase_rx.clone())
        } else {
            None
        }
    };

    if let Some(rx) = phase_rx {
        let _ = wait_for_idle(rx, Duration::from_millis(1500)).await;
    }

    Ok(())
}

pub async fn set_engine_options_internal(
    shared: SharedEngine,
    options: Vec<(String, String)>,
) -> Result<(), String> {
    // Stop searching first if currently active
    let stop_notify = {
        let mut state = shared.lock().await;
        if state.is_searching {
            if let Some(ref mut active) = state.active_search {
                active.aborted = true;
            }
            if let Some(ref mut sin) = state.stdin {
                let _ = sin.write_all(b"stop\n").await;
                let _ = sin.flush().await;
            }
            state.is_searching = false;
            Some(state.stop_notify.clone())
        } else {
            None
        }
    };

    if let Some(notify) = stop_notify {
        let _ = tokio::time::timeout(Duration::from_millis(500), notify.notified()).await;
    }

    let mut state = shared.lock().await;
    let mut commands = Vec::new();
    for (name, val) in options {
        let cmd = if val.is_empty() {
            format!("setoption name {}\n", name)
        } else {
            format!("setoption name {} value {}\n", name, val)
        };
        commands.push(cmd);
        state.current_options_map.insert(name.clone(), val.clone());
        if let Some(opt) = state.options.iter_mut().find(|o| o.name == name) {
            opt.current_value = Some(val);
        }
    }

    let sin = state.stdin.as_mut().ok_or("引擎未就绪")?;
    for cmd in commands {
        sin.write_all(cmd.as_bytes())
            .await
            .map_err(|e| e.to_string())?;
    }
    sin.write_all(b"isready\n").await.map_err(|e| e.to_string())?;
    sin.flush().await.map_err(|e| e.to_string())?;

    Ok(())
}

pub async fn get_engine_options_internal(shared: SharedEngine) -> Result<Vec<UciOptionMeta>, String> {
    let state = shared.lock().await;
    Ok(state.options.clone())
}

pub async fn restart_engine_internal(
    app: AppHandle,
    shared: SharedEngine,
    custom_path: Option<String>,
) -> Result<String, String> {
    stop_engine_internal(shared.clone()).await?;
    start_engine_internal(app, shared, custom_path).await
}

pub async fn stop_engine_internal(shared: SharedEngine) -> Result<(), String> {
    let mut state = shared.lock().await;
    state.current_search_id = SEARCH_COUNTER.fetch_add(1, Ordering::SeqCst);
    if let Some(ref mut active) = state.active_search {
        active.aborted = true;
    }
    state.active_search = None;
    state.is_searching = false;
    state.search_phase = SearchPhase::Idle;
    let _ = state.phase_tx.send(SearchPhase::Idle);

    if let Some(ref mut sin) = state.stdin {
        let _ = sin.write_all(b"quit\n").await;
        let _ = sin.flush().await;
    }
    if let Some(mut child) = state.child.take() {
        let _ = child.kill().await;
    }
    state.stdin = None;
    state.stop_notify.notify_waiters();
    Ok(())
}
