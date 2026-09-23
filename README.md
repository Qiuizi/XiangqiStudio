# Xiangqi Studio (象棋研究室)

<p align="center">
  <img src="./src-tauri/icons/128x128.png" alt="Xiangqi Studio Logo" width="100" height="100" />
</p>

<p align="center">
  <strong>现代化高质感 Windows 中国象棋桌面研究工具</strong><br>
  深度接入并实时控制 <strong>Pikafish (皮卡鱼)</strong> 神经网络引擎 · 兼具人机对战、残局演练、变化研究与棋谱复盘
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2-24C8D8?logo=tauri&logoColor=white" alt="Tauri 2" />
  <img src="https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vuedotjs&logoColor=white" alt="Vue 3" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Rust-2021-DEA584?logo=rust&logoColor=white" alt="Rust" />
  <img src="https://img.shields.io/badge/Engine-Pikafish%20NNUE-E25555?logo=electron&logoColor=white" alt="Pikafish Engine" />
  <img src="https://img.shields.io/badge/License-GPL--3.0-blue.svg" alt="License: GPL-3.0" />
</p>

---

## 📖 简介 (Introduction)

**Xiangqi Studio (象棋研究室)** 是一款专为中国象棋爱好者、业余棋手及专业研究者打造的现代桌面研究应用。前端采用 **Vue 3 + TypeScript** 与古雅典雅的实木国风微质感设计，后端基于 **Rust (Tauri 2)** 原生轻量运行框架，通过严密的异步 UCI 通信生命周期管理，深度驱动当今顶级开源象棋神经网络引擎 **Pikafish (皮卡鱼)**。

项目彻底摆脱了传统象棋软件界面陈旧、缩放模糊、操作阻塞、引擎调度冲突等痛点，提供丝滑、稳定、专业的象棋人机博弈与对局研究环境。

---

## ✨ 核心特性 (Key Features)

### 1. ⚔️ 普通人机对战 (Battle & Play)
* **智能 AI 对手**：红黑双方自由选边，AI 思考走子行云流水，杜绝高算力下的界面卡顿与时序冲突；
* **稳定搜索状态机**：具备 Search ID 隔离机制、双向看门狗机制与异常自愈状态机，悔棋、换边、重试从不锁死棋局；
* **真实规例与音效**：内置完整中国象棋合规校验（长捉长将判定、绝杀困毙判定、自然限着判定），配以清脆厚重的实木走子、吃子与将军原声音效。

### 2. 🧩 残局研究与人机对抗 (Endgame Study)
* **自由排子摆局**：支持从标准开局、常用经典残局或自定义局面（FEN）快速载入；
* **深度解局分析**：一键开启皮卡鱼实时解局，棋盘浮现金色引擎推荐走法箭头；分析停止时黄色箭头立即清理，整洁无残留；
* **人机残局对抗**：在任意摆设的残局下，随时切换为人机对打模式，亲自检验破解方案。

### 3. 📜 复盘打谱与变化研究 (Replay & Variations)
* **双工作模式切换**：
  * **【🔍 棋谱回放】**：只读安全浏览，支持起点/上一步/下一步/终点精确步进，防止误触走子修改记录；
  * **【✏️ 手动打谱】**：棋盘完全可交互，红黑交替自由走子，无需先在对弈模式走棋即可直接从初始盘面打谱推演；
* **树状棋谱（Variation Tree）**：
  * 在历史任意局面走出新招，系统**自动派生变化分支（Variations）**，原主线完好无损，绝不覆盖；
  * 具备分支切换胶囊与一键【返回主线】导航；
* **状态绝对隔离**：复盘打谱拥有专属的象棋规则实例与步数树，在复盘中研究走子绝不影响正在进行的对战局势。

### 4. 🧠 6 维专业 AI 分析看板 (AI Analysis Dashboard)
* **四维搜索限制自由切换**：定深（depth）、定时（movetime）、节点（nodes）、无限分析（infinite）；
* **多候选路线并发（MultiPV）**：支持 1 线、2 线、3 线、5 线并发对比，候选变着优劣一目了然；
* **全景指标实时监控**：搜索深度（depth/seldepth）、标准化评分（score cp/mate）、算力速率（NPS）、搜索节点数（nodes）、解算耗时、哈希占用率（hashfull）；
* **自适应响应式布局**：针对不同 Windows 分辨率（1366×768、1490×1020、1920×1080、4K 等）精细化栅格排版，杜绝文字挤压与截断。

---

## 🛠️ 技术栈与架构 (Architecture)

```
XiangqiStudio/
├── src/                          # 前端展示层 (Vue 3 + TypeScript + Pinia)
│   ├── components/
│   │   ├── chess/                # 象棋主网格 SVG、棋子木纹、走法提示与评估条
│   │   └── game/                 # 右侧多标签控制面板、AI看板、引擎高级配置
│   ├── core/
│   │   ├── chess/                # 中国象棋纯逻辑规则引擎 (FEN、坐标、中文记谱、规则判定)
│   │   └── sound.ts              # 实木音效管理器
│   ├── stores/
│   │   ├── gameStore.ts          # 普通对弈与残局研究主状态机
│   │   ├── replayStore.ts        # 独立的树状棋谱复盘状态机 (绝对隔离)
│   │   └── engineSettingsStore.ts# Pikafish UCI 参数动态持久化配置
│   └── views/                    # 大厅、对战、复盘、残局四重视图
├── src-tauri/                    # 原生层 (Rust + Tauri 2)
│   ├── src/
│   │   ├── engine.rs             # Pikafish 进程生命周期、UCI 协议调度、异步事件分发
│   │   └── lib.rs                # Tauri 插件、状态管理与 IPC 路由
│   └── resources/                # 嵌入式引擎二进制 (pikafish.exe) 与 NNUE 权重
└── tests/                        # Vitest 自动化测试套件 (54 个单元与集成用例)
```

---

## 🚀 快速开始与使用 (Getting Started)

### 下载运行 (Windows)
你可以直接从 GitHub Releases 下载已打包的官方版本：
1. **安装版 (推荐)**：下载 `XiangqiStudio-v0.4.0-Windows-x64-Setup.exe`，按向导一键安装，自动创建桌面快捷方式；
2. **便携版 (免安装)**：下载 `XiangqiStudio-v0.4.0-Windows-Portable.zip`，解压到任意英文路径，双击 `xiangqistudio.exe` 即可直接运行。

*系统要求*：Windows 10 / Windows 11 (x64)，支持 AVX2 或 BMI2 指令集（近十年的 Intel / AMD 主流 CPU 均默认支持）。

---

## 💻 源码编译与开发指南 (Build from Source)

### 环境依赖
* [Node.js](https://nodejs.org/) (v18+ 或 v20 LTS)
* [pnpm](https://pnpm.io/) 或 `npm`
* [Rust](https://rustup.rs/) (1.75+，需安装 MSVC 工具链)
* [Tauri 2 CLI](https://tauri.app/)

### 步骤
```powershell
# 1. 克隆代码仓库
git clone https://github.com/Qiuizi/XiangqiStudio.git
cd XiangqiStudio

# 2. 安装前端依赖
npm install

# 3. 运行自动化测试 (确认 54 个测试全部通过)
npm test

# 4. 启动本地热重载桌面调试
npm run tauri dev

# 5. 构建正式生产 Release 安装包
npm run tauri build
```
打包成功后，安装包与二进制文件将生成于 `src-tauri/target/release/bundle/` 目录。

---

## 🧪 测试与质量保证 (Testing & Quality)

项目拥有健全的自动化测试覆盖率，涵盖象棋规则边界、UCI 协议生命周期、高频中断与多状态隔离等核心场景：

```text
 ✓ tests/replay_study_v04.test.ts (5 tests)         # 复盘打谱、非法拦截、分支派生与状态隔离
 ✓ tests/study_arrow_cleanup_v035.test.ts (6 tests) # 残局研究关闭分析后箭头实时清理
 ✓ tests/first_move_ai_v035.test.ts (3 tests)       # 首步 AI 搜索与落子时序防卡死
 ✓ tests/render_performance_v034.test.ts (4 tests)  # MultiPV 成对流分发与 UI 卡顿防抖
 ✓ tests/freeze_diagnosis_v034.test.ts (5 tests)    # 20 回合人机对弈与连续悔棋鲁棒性
 ✓ tests/stability_search_v033.test.ts (5 tests)    # 真实引擎 30 半回合对局与任务隔离
 ✓ tests/engine_options_v03.test.ts (3 tests)       # 线程/哈希/规则 UCI 选项生效验证
 ✓ tests/engine_simulation.test.ts (2 tests)        # 真实皮卡鱼长时对抗仿真
 ✓ tests/rules.test.ts (11 tests)                   # 中国象棋着法合法性校验
 ✓ tests/notation.test.ts (6 tests)                 # 标准中文竞赛记谱与 UCI 转换

Test Files  12 passed (12)
     Tests  54 passed (54)
```

---

## 🤝 开源致谢与免责声明 (Credits & Acknowledgements)

* **[Pikafish (皮卡鱼)](https://github.com/official-pikafish/Pikafish)**：目前全球棋力最强的开源中国象棋神经网络引擎，遵循 GPL-3.0 协议。特别向 **Pikafish 开发团队**、**Stockfish 团队** 以及所有为中国象棋计算机博弈做出贡献的作者致以崇高的敬意！
* **[Tauri](https://tauri.app/)**：轻量、安全、高性能的跨平台桌面应用开发框架。
* **[Lucide Icons](https://lucide.dev/)**：美观清爽的现代化矢量图标库。

---

## 📄 开源许可证 (License)

本项目遵循 **[GNU General Public License v3.0 (GPL-3.0)](./LICENSE)** 开源协议。
你可以自由使用、修改与分发本软件，但必须遵守 GPL-3.0 条款，保持衍生代码开源并附带相同许可证。
