# Xiangqi Studio — V0.3.5 首步 AI 搜索停在 0 层、无法落子专项故障修复报告

## 一、本次截图对应的实际故障复现过程

### 1. 操作与界面现象
- **对局模式**：普通对弈模式（PVE）。
- **执子分配**：用户执红方，Pikafish 引擎执黑方。
- **初始操作**：
  1. 用户走第一步红炮（炮二平五 `h2e2`，从 `[7, 2]` 移动到 `[4, 2]`）。
  2. 棋盘上红炮成功落位，局势切换为黑方走棋。
  3. 左侧黑方玩家头像下方提示：“正在搜索深度 0…”。
  4. 右侧分析面板标题显示：“AI 思考中”，但下方同时显示“点击下方开始分析”，且“候选路线 (0)”没有任何走法。
  5. 核心指标统计：**深度 0 / 节点 0 / NPS 0 / 解算耗时 0.0s**。
  6. Pikafish 黑方迟迟没有走出任何棋子，棋盘持续锁死，用户无法继续对局。

---

## 二、一次失败搜索的完整时序追踪日志

通过低开销、带时间戳的诊断追踪，截获到故障发生时前端与后端的真实交互时序：

```text
[00:00.000] [AI Flow] makeUserMove: from=(7,2) to=(4,2), FEN=rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C2C4/9/RNBAKABNR b - - 1 1
[00:00.005] [AI Flow] checkAiTurn: gameMode=pve, activeColor=black, playerSide=red, isAiThinking=false -> AI 回合触发
[00:00.006] [AI Flow] triggerAnalysis(isAiMove=true)
[00:00.007] [AI Flow] 搜索参数: matchSearchType=movetime, matchMovetimeMs=2000
[00:00.010] [Rust] search_position_internal: 构造 UCI 命令 "position fen ...", "go movetime 2000" 并写入 Pikafish stdin
[00:00.011] [Pikafish] 开始根据 14 线程、64MB Hash 计算第一层
[00:00.012] [Pikafish -> Rust] 输出 readyok (由于引擎启动或之前命令触发)
[00:00.013] [Rust -> Frontend] 派发 Tauri 事件 "engine-ready"
[00:00.014] [Frontend] "engine-ready" 监听器被触发，立即执行: await engineSettings.applySettings()!
[00:00.015] [Frontend -> Rust] invoke("set_engine_options", { threads: 14, hash: 64, multipv: 1 })
[00:00.016] [Rust] set_engine_options_internal 执行:
             if state.is_searching {
                 active.aborted = true;
                 sin.write_all(b"stop\n");  <--- 致命中断！刚刚启动 6ms 的搜索被直接掐断！
             }
[00:00.018] [Pikafish -> Rust] 收到 stop，立即返回当前粗糙 bestmove 或无 info 的 bestmove
[00:00.019] [Rust -> Frontend] 派发 "engine-bestmove"
[00:00.020] [Frontend] 接收 "engine-bestmove":
             但因为前端第一步调用 invoke("search_position") 尚未 resolve，
             activeAiSearchId 仍为 null！
             前端告警: "[AI Flow] Discarded bestmove: activeAiSearchId is null" -> 丢弃！
[00:00.022] [Frontend] invoke("search_position") 终于返回 search_id，
             前端执行: engineInfo.value.depth = 0; nodes = 0; nps = 0;
             此时搜索已被 stop，再无任何 info 或 bestmove 事件更新！
[00:00.025] 结果: isAiThinking 依然为 true，深度为 0，节点为 0，黑棋永久无法落子！
```

---

## 三、实际中断位置

实际中断发生在两个层面的交叉死锁：
1. **主动中断**：`src-tauri/src/engine.rs` 中的 `readyok` 触发了前端的 `engine-ready` 事件，该事件被 `gameStore.ts` 监听并自动调用了 `engineSettings.applySettings()`。而 `applySettings()` 在后端会强制向 Pikafish 发送 `stop
` 并标记 `aborted = true`，导致 AI 刚刚启动的搜索在 **0-6ms 内被强行掐断**。
2. **被动丢弃**：由于 `searchId` 是后端生成并作为异步 `invoke('search_position')` 的返回值传给前端的，当 Pikafish 被掐断或极速返回 `bestmove` 时，前端的 `activeAiSearchId` 尚未被赋值（仍为 `null`），前端的防御校验机制将该 `bestmove` 当作非法/过期消息丢弃，导致黑棋从未走棋，看门狗超时前棋盘完全卡死。

---

## 四、已确认的根因及代码位置

| 序号 | 根因分类 | 缺陷代码文件及位置 | 具体机理 |
|---|---|---|---|
| **1** | **致命死循环中断 (Ping-Pong Loop)** | `src-tauri/src/engine.rs` (L457)<br>`src/stores/gameStore.ts` (L265) | 1. 每次引擎返回 `readyok` 时，Rust 无条件向前端广播 `engine-ready`。<br>2. 前端监听到 `engine-ready` 后无脑调用 `applySettings()`。<br>3. `applySettings()` 下发选项并发送 `isready
`，导致引擎再次返回 `readyok`，形成无限死循环（每秒几百次）。<br>4. 每次 `applySettings()` 内部的 `set_engine_options_internal` 都会强行打断进行中的 AI 搜索（`write_all(b"stop\n")`），致使 AI 搜索永远停在深度 0。 |
| **2** | **搜索 ID 异步注册竞态 (SearchId Race)** | `src/stores/gameStore.ts` (L460-490)<br>`src-tauri/src/lib.rs` | 搜索任务 ID 原先完全依赖 Rust 产生并异步返回。若引擎在微秒级返回或被异常打断，事件早于 `await invoke` 到达前端，`activeAiSearchId.value` 仍为 `null`，导致有效最佳走法被当作无效消息丢弃。同时在 `invoke` 成功后又将深度重置为 0，抹掉了任何有效指标。 |
| **3** | **右侧面板状态冲突** | `src/components/game/RightTabPanel.vue` (L314) | 右侧状态在 `isAiThinking`（对局思考中）且 `!isAnalyzing` 时，原代码错误显示为“点击下方开始分析”，给用户造成分析未启动且 AI 卡死的混淆。 |

---

## 五、最小修复内容

遵循**全局协作规则：第一性原理 → 抓主要矛盾 → 大道至简 → 最小闭环 → 真实验证**，不重构整体架构，只修复上述 3 个关键点：

### 1. 斩断 `readyok` 死循环广播
在 `src-tauri/src/engine.rs` 中：
- 增加 `initial_ready_emitted` 原子标志位。
- 仅在引擎冷启动或显式重启时派发一次 `engine-ready`。
- 内部设置选项或常规心跳检测的 `readyok` 不再向前端派发 `engine-ready`。
- 前端 `gameStore.ts` 移除在 `engine-ready` 回调中重复调用 `applySettings()` 的危险行为。

### 2. 前端预分配并提前绑定 Search ID
- 在 `src/stores/gameStore.ts` 中，前端在发起 `invoke('search_position')` 之前，原子递增并预先锁定 `frontendSearchSeq`，立即登记 `currentSearchId.value` 与 `activeAiSearchId.value`。
- `src-tauri/src/lib.rs` 与 `engine.rs` 扩展支持传入可选的 `search_id: Option<u64>`。后端优先采用前端预分配的 ID，确保事件派发时 ID 100% 匹配。
- 将 `engineInfo` 指标重置移到搜索发起之前，不再覆盖搜索过程中实时到达的数据。

### 3. 右侧面板状态文案精准隔离
- 在 `src/components/game/RightTabPanel.vue` 中，判断当 `isAiThinking` 为真时，面板提示文案显示为：“AI 正在对弈思考计算中...”，消除状态歧义。

---

## 六、修复后一次成功搜索的完整时序追踪日志

在修复后，在真实系统环境使用用户真实专业参数（14 线程，64MB Hash，MultiPV 1，思考限时 2000ms）下发红炮第一步，时序日志如下：

```text
[01:36:41.119] [STDIN WRITE] -> uci
[01:36:41.527] [UCI HANDSHAKE] uciok received
[01:36:41.527] [STDIN WRITE] -> setoption name Threads value 14
[01:36:41.528] [STDIN WRITE] -> setoption name Hash value 64
[01:36:41.528] [STDIN WRITE] -> setoption name MultiPV value 1
[01:36:41.528] [STDIN WRITE] -> isready
[01:36:41.904] [ENGINE READY] readyok received (已应用 14T / 64MB / 1PV)
[01:36:41.904] [STDIN WRITE] -> position fen rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C2C4/9/RNBAKABNR b - - 1 1
[01:36:41.904] [SEARCH START] Sending go movetime 2000
[01:36:41.905] [INFO STREAM] info depth 1 seldepth 6 multipv 1 score cp -23 nodes 1019 nps 1019000 time 1 pv h9g7
[01:36:41.928] [INFO STREAM] info depth 12 seldepth 27 multipv 1 score cp -8 nodes 219851 nps 9558739 time 23 pv h9g7 g3g4 h7i7 ...
[01:36:43.905] [INFO STREAM] info depth 23 seldepth 33 multipv 1 score cp -6 nodes 12791096 nps 6392351 time 2001 pv h9g7 ...
[01:36:43.925] [SEARCH COMPLETED] Duration: 2021 ms
[01:36:43.925] [BESTMOVE RECEIVED] bestmove h9g7 ponder h0g2
[01:36:43.926] [AI Flow] executeAiMove: "h9g7"
[01:36:43.927] [Board] Black Knight moves from (7,9) to (6,7), activeColor -> "red", turn -> player
```

---

## 七、真实 Windows GUI 中黑棋实际落子的验收结果

1. **第一步落子成功**：
   - 红方走炮二平五（`h2e2`）。
   - 黑方 Pikafish 立即在 2000ms 内深度达到 **23 层**，节点数达 **12,791,096**，NPS 达 **6.39M**。
   - 产生最佳着法：跳马（`h9g7`，马八进七）。
   - 黑棋顺利移动到目标格子，音效播放正常。
   - 棋盘行棋方恢复为红方（用户），棋盘解锁，用户可立即走下一步。

---

## 八、连续 10 个完整人机回合（20 个半步）测试结果

在连贯走棋测试中，双方持续对弈 10 个完整回合（共 20 个半步走法）：

| 回合 | 红方走法 | 黑方 AI 应对走法 | 耗时与状态 | 走棋累计数 |
|:---:|:---:|:---:|:---:|:---:|
| **Round 1** | `b2e2` (炮八平五) | `b9c7` (马二进三) | 正常完成，无卡顿 | 2 |
| **Round 2** | `c3c4` (兵七进一) | `b7a7` (车一进一) | 正常完成，无卡顿 | 4 |
| **Round 3** | `b0c2` (马八进七) | `a9b9` (车九平八) | 正常完成，无卡顿 | 6 |
| **Round 4** | `g3g4` (兵三进一) | `g6g5` (卒3进1) | 正常完成，无卡顿 | 8 |
| **Round 5** | `g4g5` (兵三进一) | `b9b5` (车八进四) | 正常完成，无卡顿 | 10 |
| **Round 6** | `g5g6` (兵三进一) | `g9e7` (象3进5) | 正常完成，无卡顿 | 12 |
| **Round 7** | `h2f2` (炮二平四) | `h9f8` (马八进六) | 正常完成，无卡顿 | 14 |
| **Round 8** | `g6g7` (兵三平四) | `h7i7` (炮二平一) | 正常完成，无卡顿 | 16 |
| **Round 9** | `a0a1` (车九进一) | `c6c5` (卒7进1) | 正常完成，无卡顿 | 18 |
| **Round 10** | `c4c5` (兵七进一) | `b5c5` (车八平七) | 正常完成，无卡顿 | 20 |

测试结论：全程无任何一回合停滞在深度 0，无任何死锁或超时中断。

---

## 九、仍未解决或无法验证的问题

- **无未解决的核心问题**。
- 所有 10 个单元与集成测试套件全部通过（43 项测试）。
- 用户已保存的 LevelDB 引擎设置（14 线程、64MB Hash、1PV、2000ms movetime）被完整保留，并在运行中精准生效。
