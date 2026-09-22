# Xiangqi Studio (象棋研究室)

Xiangqi Studio 是一款现代化 Windows 中国象棋桌面研究工具，基于 Vue 3 + TypeScript + Tauri 2 + Rust 构建，深度接入并深度控制 Pikafish (皮卡鱼) 神经网络引擎。

## 一、核心特性

- **现代国风自适应棋盘**：双轴动态约束自适应算法，窗口拉伸缩放全程零漂移；支持一键侧栏折叠沉浸对弈模式。
- **专业 Pikafish 引擎控制中心**：
  - 动态探测真实 UCI Option 元数据；
  - 线程数 (Threads)、置换表哈希 (Hash)、候选变化分支 (MultiPV) 实时调节与同步；
  - 独立支持四维搜索限制：固定思考时间 (movetime)、固定深度 (depth)、固定节点数 (nodes)、无限分析 (infinite)；
  - 亚洲规则 (AsianRule) / 中国象棋规例 (ChineseRule) / 天规 (SkyRule) 快速切换；
  - 引擎设置与状态 LocalStorage 独立持久化。
- **专业级 6 维 AI 局面分析面板**：
  - 深度/选择深度 (depth/seldepth)、标准化评价值 (score cp/mate)、算力速度 (NPS)、搜索节点数 (nodes)、耗时 (time)、哈希占用率 (hashfull)；
  - MultiPV 候选分支对比与棋盘推荐走法路线切换；
  - 常用搜索模式与候选分支快捷控制栏。
- **纯英文工作区与独立绿色打包**：
  - 项目自包含资源管理，脱机独立运行，支持 Windows 绿色便携使用。

## 二、工程目录与开发

### 权威工作区目录
```text
D:\Qiuizi\project\XiangqiStudio\
```

### 开发环境命令
```powershell
# 1. 安装依赖
pnpm install

# 2. 自动化测试
pnpm test

# 3. 本地热重载开发
pnpm tauri dev

# 4. 构建 Windows 绿色 Release 独立可执行程序
pnpm tauri build --no-bundle
```
