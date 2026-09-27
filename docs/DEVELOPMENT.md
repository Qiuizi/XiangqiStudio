# Xiangqi Studio (象棋研究室) V0.1 验收与开发全记录

## 一、实际执行的测试与验收结果

| 测试类别 | 测试内容 | 验证手段 | 结果 |
| :--- | :--- | :--- | :---: |
| **原生程序启动** | 启动 `xiangqistudio.exe` | 检查 Windows GUI 窗口创建、WebView2 加载、无控制台黑框 | **通过** |
| **大厅与对局界面** | 游戏大厅、三栏对局、残局研究、棋谱复盘视图切换 | 浏览器与桌面窗口实机交互 | **通过** |
| **棋盘几何与样式** | 9×10 交叉点实木网格、九宫斜线、十字星位、楚河汉界印章 | SVG 坐标变换及点位检验 | **通过** |
| **棋子与落点交互** | 棋子选中呼吸光环、合法落点高亮圆点、吃子虚线框、落子音效 | 鼠标点击交互与动态状态更新 | **通过** |
| **传统中文记谱法** | 炮二平五、马8进7、车一进一、相七进五、仕六进五等记谱翻译 | 单元测试 (`tests/notation.test.ts`) | **通过 (5/5)** |
| **中国象棋核心规则** | 马腿阻挡、象眼阻挡、炮翻山吃子、将帅照面、应将限制、FEN 往返 | 单元测试 (`tests/rules.test.ts`) | **通过 (7/7)** |
| **真实 Pikafish 对战** | 连续 20 个半回合实战（玩家执红 vs Pikafish 执黑）、悔棋恢复、换边先行 | 实时引擎联调测试 (`tests/engine_simulation.test.ts`) | **通过 (2/2)** |
| **进程生命周期守护** | 应用退出后检查 `Win32_Process` | 查询 `xiangqistudio.exe` 和 `pikafish*.exe` | **通过 (无残留)** |

---

## 二、测试中发现的问题与修复记录

### 1. Pikafish 在 Windows 下读取中文路径 NNUE 失败
- **问题现象**：Stockfish/Pikafish C++ 核心在 Windows 上使用标准 ANSI `fopen` 读取权重文件，当传入绝对路径 `旧版引擎目录\...` 时，因路径中包含非 ASCII 中文字符导致引擎报错 `The network file was not loaded successfully` 并强制退出。
- **根本原因**：C++ 运行时未启用 UTF-8 编码页时，绝对路径中的中文导致文件句柄打开失败。
- **修复方案**：在 Rust 启动 Pikafish 时，已将子进程的 CWD (`current_dir`) 严格设置为引擎所在目录，通过发送相对路径 `setoption name EvalFile value pikafish.nnue` 进行加载，彻底规避了 Windows 中文路径编码缺陷。
- **修复文件**：[`XiangqiStudio/src-tauri/src/engine.rs`](../src-tauri/src/engine.rs)

### 2. UCI 异步事件与取消搜索的时序竞争 (Race Condition)
- **问题现象**：在引擎正在计算时，若用户点击“悔棋”或“重新开始”，Pikafish 收到 `stop` 指令后仍会吐出上一次旧局面的 `bestmove`。如果前端没有比对搜索任务标识，可能会错误地将旧局面的推荐步执行在悔棋后的新局面中，引发“连续走棋”或“幽灵落子”。
- **修复方案**：
  1. 在 Rust 端引入单调递增的原子计数器 `SEARCH_COUNTER`，每次发起新搜索或中止搜索时分配新的 `search_id`。
  2. 广播 `engine-bestmove` 时携带 `{ search_id, is_ai_move, bestmove }`。
  3. 前端 Pinia 状态机维护 `activeAiSearchId`，仅当返回的 `search_id` 与当前活跃思考任务完全匹配时才触发棋盘落子，所有因 `stop` 退出的迟滞 `bestmove` 均被安全过滤。
- **修复文件**：[`XiangqiStudio/src-tauri/src/engine.rs`](../src-tauri/src/engine.rs)、[`XiangqiStudio/src/stores/gameStore.ts`](../src/stores/gameStore.ts)

### 3. 多级相对路径寻址缺陷
- **问题现象**：当直接双击运行 `XiangqiStudio/src-tauri/target/debug/xiangqistudio.exe` 时，原有的单层 `../皮卡鱼-Pikafish` 无法穿透至工作区根目录，导致引擎可执行文件查找失败。
- **修复方案**：在 Rust 实现了向上逐级遍历 6 层父目录与当前工作目录的鲁棒查找器 `find_pikafish_executable`，同时支持按优先级自动查找 `pikafish-bmi2.exe`、`pikafish-avx2.exe`、`pikafish-sse41-popcnt.exe`。
- **修复文件**：[`XiangqiStudio/src-tauri/src/engine.rs`](../src-tauri/src/engine.rs)

### 4. 纯网页端预览时的 Tauri 内核兼容处理
- **问题现象**：在普通外部浏览器调试前端界面时，因缺乏 `window.__TAURI_INTERNALS__` 会抛出未捕获异常。
- **修复方案**：封装 `isTauri()` 环境守卫，在桌面原生环境下驱动 Rust 引擎，在普通浏览器中平滑降级为离线单机双人对弈模式。
- **修复文件**：[`XiangqiStudio/src/stores/gameStore.ts`](../src/stores/gameStore.ts)

### 5. 双击启动报错 "localhost refused to connect (ERR_CONNECTION_REFUSED)" 修复
- **根本原因**：
  1. Tauri 的构建系统严格区分**开发模式 (Dev)** 与 **打包构建 (Build)**。
  2. 此前仅使用 `cargo build` 生成的二进制文件属于 Debug 开发模式，Tauri 默认将其配置为连接 `build.devUrl`（即 `http://localhost:1420`）。如果未事先启动 Vite 开发服务器，WebView2 将显示连接被拒绝。
  3. 独立的正式程序必须通过 `pnpm tauri build`（或 `pnpm tauri build --debug --no-bundle`）编译，Tauri 才会自动执行 `pnpm build` 并将编译生成的前端资源包 (`dist/index.html` 及静态文件) **完整嵌入到 exe 二进制文件内部**，通过自定义协议载入，彻底摆脱对本地 Web 开发服务器的依赖。
- **修复方案**：
  1. 在 `src-tauri/tauri.conf.json` 的 `bundle.resources` 中配置 `"resources/*"` 资源打包清单。
  2. 将必要的皮卡鱼引擎与权重文件同步部署至 `resources/` 目录。
  3. 执行 `pnpm tauri build --no-bundle`（正式 Release 独立版）与 `pnpm tauri build --debug --no-bundle`（调试独立版）。
  4. 验证在彻底关闭 Vite 开发服务器的状态下，双击 exe 均可原生秒级加载游戏大厅与棋盘界面，并成功拉起 Pikafish。
- **修复文件**：[`XiangqiStudio/src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json)、[`XiangqiStudio/src-tauri/src/engine.rs`](../src-tauri/src/engine.rs)

---

## 三、当前功能边界与待后续完善规则

1. **长将与长捉判负规则（暂未由前端自主裁决）**：
   - 当前纯本地离线双人对局中，仅裁决绝杀、困毙与六十回合自然限着和棋；
   - 在人机对战模式中，由 Pikafish 引擎内建的 `AsianRule` / `ChineseRule` 规则库保证其自身不会走出违规长将；但若人类玩家在人机对战中反复长将，前端尚未强行裁定判负，后续版本可引入“三次同形判断”状态机。
2. **多分支棋谱树保存与导出 PGN/XQF**：
   - 当前支持完整的走法栈历史推演、FEN 局面导出与自定义导入，尚未加入文件保存为 `.pgn` 或 `.xqf` 文件的对话框导出，后续可在 M4 阶段扩展。

---

## 四、当前可执行文件位置与启动说明

### 1. 正式 Release 独立可执行程序（推荐日常使用，性能最高、体积最小）
```text
<project-root>\src-tauri\target\release\xiangqistudio.exe
```
* **特点**：全前端资源内嵌，开启 LTO 与二进制代码裁剪优化，无需开发服务器，双击即玩。
* **随附资源**：同级目录及 `resources/` 下已部署好 `pikafish-bmi2.exe`、`pikafish-avx2.exe`、`pikafish.nnue`，支持完全绿色便携运行。

### 2. 开发热重载模式（仅在二次开发代码时使用）
```powershell
cd <project-root>
pnpm tauri dev
```

### 3. 自动化测试执行
```powershell
cd <project-root>
pnpm test
```
包含中文记谱法测试（5 项）、象棋法定规则测试（7 项）、Pikafish UCI 选项与搜索限制测试（3 项）、真实 Pikafish 20 半回合实战对战（2 项），全套测试全部通过。
