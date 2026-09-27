# Xiangqi Studio V0.3.4 — 残局研究模式无法继续走棋专项修复报告

## 一、问题根因定位

在 Xiangqi Studio V0.3.3 及更早版本中，用户进入【残局研究】页面后，红方走出一步后黑方无法继续走棋，整个推演流程卡死。经过对源码、状态流与控制流的排查，定位出如下四个复合根因：

### 1. 视图切换未同步全局游戏模式（`gameMode` 丢失同步）
* **根因**：在 `App.vue` 中，用户在顶部导航栏或大厅中切换到 `study`（残局研究）视图时，仅仅变更了 `currentView.value = 'study'`，未通知 `gameStore` 进入研究模式。
* **后果**：`gameStore.gameMode` 仍停留在默认的 `'pve'`（人机对弈）模式，棋盘组件依然遵循人机对弈的严格规则进行交互拦截。

### 2. 回合判定逻辑硬编码限制（`isUserTurn` 锁死黑方）
* **根因**：在原有 `isUserTurn` 计算属性中：
  ```typescript
  const isUserTurn = computed(() => {
    if (gameMode.value === 'replay') return false;
    if (gameMode.value === 'pvp') return true;
    // 默认回退到 PVE 逻辑：
    return activeColor.value === playerSide.value && !isAiThinking.value;
  });
  ```
  因为 `gameMode` 仍为 `'pve'`，且默认 `playerSide = 'red'`。
* **后果**：红方走出第一步后，棋盘底层状态更新 `board.activeColor = 'black'`。此时 `activeColor !== playerSide`，导致 `isUserTurn` 立即变成 `false`！
* 当用户接下来点击任何黑棋时：
  ```typescript
  function selectSquare(pos: Position) {
    if (!isUserTurn.value) return; // 🚫 被直接拦截，无法点选黑子！
  ```
  任何黑方的走棋操作 `makeUserMove` 也被直接 `return`，造成黑方无法走棋的“假死”现象。

### 3. 辅助分析与实际落子的职责混淆
* **根因**：残局研究原有的【皮卡鱼深度解局】按钮直接调用了 `triggerAnalysis(false)`（即 `is_ai_move: false`），该模式仅通过引擎搜索绘制黄色的推荐候选走法箭头，并不执行 `board.makeMove()`。
* **后果**：用户看到棋盘上出现了黑方候选箭头，误以为 AI 已经完成决策，但由于没有实际落子，棋盘局面未推进，导致用户更加困惑为何无法继续后续推演。

### 4. 摆棋编辑缺乏响应式状态感知
* **根因**：自由摆棋放置棋子直接操作了 `board.value.grid`，由于未改变数组引用且未触发状态机版本计数，导致 Vue 计算属性 `currentFen` 及棋盘重绘无法即时、稳定地更新。

---

## 二、残局研究子模式设计与架构

为了彻底解决上述矛盾，同时满足残局研究的多样化需求，V0.3.4 将【残局研究】明确划分为三个独立的子模式（`StudySubMode`）：

```
                  ┌─────────────────────────────────────────┐
                  │          GameMode = 'study'             │
                  └────────────────────┬────────────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
  【双方手动推演】               【人机残局对抗】               【自由摆棋构建】
(subMode: 'manual')           (subMode: 'battle')           (subMode: 'edit')
 ├─ 红黑双方交替手动执子        ├─ 人类执一方，AI 执另一方     ├─ 棋子托盘 (帅/将/车/马/炮/兵/卒)
 ├─ 双方均允许点击与走子        ├─ 玩家走子后自动触发 AI 搜索   ├─ 橡皮擦、清空棋盘、重置局面
 ├─ 可开启/关闭实时分析引擎     ├─ AI 搜毕自动执行落子并交还回合 ├─ 指定任意方先行 (红先/黑先)
 └─ 悔棋：单步撤销 (撤销当前步)  └─ 悔棋：双步撤销 (撤销人机回合) └─ FEN 实时双向同步与输入载入
```

### 状态隔离保障
* `enterStudyMode(subMode)`：进入研究模式，重置引擎搜索与看门狗，设置 `gameMode = 'study'`。
* `exitStudyMode()`：退出研究模式，安全停止引擎分析并恢复默认状态。
* `setStudySubMode(mode)`：平滑切换子模式，清空选中焦点与摆棋工具，停止正在进行的后台计算。

---

## 三、双方手动推演实现方案（彻底消除回合锁死）

### 1. `isUserTurn` 权限开放
在 `src/stores/gameStore.ts` 中针对 `'study'` 模式进行子模式分支处理：
```typescript
const isUserTurn = computed(() => {
  if (gameMode.value === 'replay') return false;
  if (gameMode.value === 'pvp') return true;
  if (gameMode.value === 'study') {
    if (studySubMode.value === 'manual' || studySubMode.value === 'edit') {
      return true; // 手动推演与自由摆棋：永远允许用户交互，不锁死任何一方！
    }
    if (studySubMode.value === 'battle') {
      return activeColor.value === playerSide.value && !isAiThinking.value;
    }
    return true;
  }
  // PVE 人机模式
  return activeColor.value === playerSide.value && !isAiThinking.value;
});
```

### 2. 轮流点选与落子交互闭环
* 当 `activeColor === 'red'` 时，用户点击红棋触发 `selectSquare`，高亮合法落点并允许移动。落子后 `board.activeColor` 自动变为 `'black'`。
* 当 `activeColor === 'black'` 时，`isUserTurn` 依然为 `true`，用户点击黑棋即可立即选中黑子，高亮黑方的合法走法并顺利移动。
* 若用户开启了【实时分析】，每一步推演后系统在后台以非阻塞方式调用皮卡鱼计算局面评估分和最佳候选走法箭头，不干扰用户随时继续落子。

---

## 四、人机对抗闭环实现方案（残局人机实战）

在【人机残局对抗】模式中，用户可挑选任意经典残局或自定义残局与皮卡鱼一决高下：

1. **自动触发搜索**：
   在 `checkAiTurn()` 中增加对抗模式判断：
   ```typescript
   if (gameMode.value === 'study' && studySubMode.value === 'battle' && activeColor.value !== playerSide.value) {
     const over = board.value.isGameOver();
     if (!over.isOver) {
       triggerAnalysis(true); // is_ai_move = true 驱动引擎思考走子
     }
   }
   ```
2. **安全落子与交还回合**：
   引擎计算完成后触发 `executeAiMove(bestMove)`，解析 UCI 走法、验证合法性后执行 `board.makeMove()`，并播放落子/吃子/将军音效。落子后 `board.activeColor` 重新切回人类玩家方，`isUserTurn` 立即恢复为 `true`。
3. **支持随时换边**：
   在界面点击【执红方】或【执黑方】时，若轮到 AI 执棋，系统立即唤醒引擎走第一步，实现黑方先行残局或中途接管残局的无缝对抗。

---

## 五、自由摆棋与 FEN 联动实现方案

1. **红黑棋子全托盘**：
   在自由摆棋面板中提供红方 7 种棋子（帅仕相马车炮兵）与黑方 7 种棋子（将士象马车卒），外加【橡皮擦】工具与【清空棋盘】按键。
2. **点击放置与擦除**：
   * 选中托盘棋子后，点击棋盘任意交叉点即可放置对应棋子；
   * 激活橡皮擦后，点击任意棋子即可将其擦除；
   * 支持通过【清空棋盘】一键初始化为空白 90 交叉点棋盘。
3. **响应式 FEN 与状态同步**：
   引入 `boardVersion` 计数器，在任何摆棋操作（`setPieceAt`、`clearBoard`、`setActiveColor`）后自增，驱动 `currentFen` 与 `grid` 计算属性更新全新的数组快照，确保界面、剪贴板导出与引擎同步毫秒级响应。
4. **一键载入残局与推演**：
   摆好棋子后，可直接点击【开始推演】无缝切换至“手动推演”模式，或点击【人机对抗】立即让皮卡鱼与用户对局。

---

## 六、分析与落子的界限明确

| 维度 | 实时分析（深度解局） | 引擎落子（人机对抗） |
| :--- | :--- | :--- |
| **触发方式** | 点击【开始分析】或推演后自动更新 | 对抗模式下轮到 AI 执棋时自动触发，或点击【请求 AI 走棋】 |
| **底层参数** | `is_ai_move: false` | `is_ai_move: true` |
| **棋盘表现** | 仅在棋盘上绘制金色/黄色候选箭头，棋子不发生位移 | 棋子实际产生物理位移与吃子，记录对局历史，推进回合 |
| **UI 反馈** | 实时显示深度（Depth）、评估分（Score）、算力（NPS） | 状态机显示“AI 正在思考...”，落子后显示“请您走棋” |
| **控制权** | 用户随时可以下发走法中断分析 | AI 思考期间锁定人类点击，走毕立即释放控制权 |

---

## 七、残局悔棋与回退逻辑

残局研究不同子模式下，悔棋的需求本质完全不同：
1. **手动推演模式**：用户是在手动摆弄局面、尝试正误解法，因此悔棋严格采用**单步撤销（1 Ply）**。每次点击【悔棋】仅撤回盘面上最后走出的那一步棋，并将执棋方交还给上一方。
2. **人机对抗模式**：
   * 若当前是人类回合（AI 已经走完棋）：点击【悔棋】自动**撤回两步（2 Plies）**，即同时撤销 AI 的应手和人类上一回合的走棋，让局面退回人类思考时刻。
   * 若当前是 AI 思考中（人类刚走完，AI 尚未落子）：立即安全中断 AI 搜索并**仅撤回一步（1 Ply）**，棋盘立即恢复可操作状态，绝不锁死。

---

## 八、代码修改清单

| 文件路径 | 修改性质 | 核心修改说明 |
| :--- | :--- | :--- |
| `src/stores/gameStore.ts` | 核心逻辑 | 1. 增加 `StudySubMode = 'manual' \| 'battle' \| 'edit'` 与 `isStudyAnalyzing` 状态。<br>2. 修复 `isUserTurn` 计算属性，在研究模式下按子模式精准判定。<br>3. 实现 `boardVersion` 响应式版本机制，确保 FEN 与棋子即时重绘。<br>4. 实现 `enterStudyMode`、`exitStudyMode`、`setStudySubMode`、`setActiveColor`、`resetToPreset`、`loadCustomFen`、`triggerStudyAiMove`、`toggleStudyAnalysis`、`setPieceAt`、`clearBoard` 等完整控制 API。<br>5. 优化 `undo()` 实现手动推演单步撤销与对抗模式双步撤销隔离。 |
| `src/views/StudyView.vue` | 界面与交互 | 1. 重构研究视图右侧面板，设计三级子模式切换选项卡（📖 手动推演、⚔️ 人机对抗、🛠️ 自由摆棋）。<br>2. 新增实时解局分析监控卡片（深度、评估分、节点、NPS、开关）。<br>3. 新增完整 14 子力调色板与橡皮擦、清空棋盘、一键推演/对抗流转。<br>4. 绑定生命周期 `enterStudyMode` 与 `exitStudyMode`。 |
| `src/App.vue` | 路由与生命周期 | 在 `onHeaderChangeView` 与 `onLobbySelectView` 中增加视图导航守卫，进入 `study` 时自动初始化为手动推演模式，离开时调用 `exitStudyMode`。 |
| `tests/study_mode_v034.test.ts` | 自动化测试 | 新增 5 大维度专项测试：<br>1. 双方手动推演交替走棋无锁死测试。<br>2. FEN 实时响应与残局预设载入测试。<br>3. 自由摆棋清空、放置、擦除、换边与 FEN 联动测试。<br>4. 残局推演双模式悔棋隔离验证。<br>5. 人机残局对抗真实 Pikafish 联动走棋测试。 |

---

## 九、自动化与真实验证结果

### 1. 自动化全套单元与集成测试（Vitest 100% 通过）
运行 `npx vitest run`，全部 7 个测试套件、31 个测试用例全部通过：
```
 ✓ tests/engine_analysis_v032.test.ts (4 tests) 6ms
 ✓ tests/notation.test.ts (5 tests) 8ms
 ✓ tests/rules.test.ts (7 tests) 11ms
 ✓ tests/study_mode_v034.test.ts (5 tests) 674ms
   ✓ Xiangqi Studio V0.3.4 — 残局研究模式专项综合测试 (5)
     ✓ 1. 双方手动推演：红黑双方可无限无锁轮流走棋 (彻底解决黑方走棋卡死)
     ✓ 2. FEN 实时响应与经典残局局面载入同步
     ✓ 3. 自由摆棋模式：清空棋盘、放置/擦除棋子、指定先行方与 FEN 联动
     ✓ 4. 残局推演悔棋隔离：手动推演单步撤销 vs 对抗模式双步撤销
     ✓ 5. 人机残局对抗模式：真实 Pikafish 引擎落子与双方持续交替对弈 600ms
 ✓ tests/engine_simulation.test.ts (2 tests) 1075ms
 ✓ tests/engine_options_v03.test.ts (3 tests) 1991ms
 ✓ tests/stability_search_v033.test.ts (5 tests) 3104ms

 Test Files  7 passed (7)
      Tests  31 passed (31)
```

### 2. 前端与后端编译检查
* `vue-tsc --noEmit && vite build`：通过，打包输出干净。
* `cargo check`：通过，Rust 底层引擎桥接无编译警告与错误。

---

## 十、最终交付物与使用说明

### 1. 产物路径
* 最终免安装 Release 可执行程序：
  `<project-root>\src-tauri\target\release\xiangqistudio.exe`
* 引擎与权重文件就绪状态：
  `src-tauri/resources/pikafish-bmi2.exe` (已嵌入并正确引用)
  `src-tauri/resources/pikafish.nnue` (已嵌入并正确引用)

### 2. 使用说明
1. **启动程序**：运行 `xiangqistudio.exe`，在首页大厅点击【残局研究】或顶部栏切换至【残局研究】。
2. **双方手动推演**：
   * 默认进入【手动推演】模式；
   * 可点击右侧经典残局（如“马兵胜单缺象”、“炮兵胜双士”等）；
   * 红方走棋后，直接点击黑方棋子，即可看到黑方合法走法并走子，红黑双方可无限制轮流推演；
   * 点击【开启实时分析】可让皮卡鱼在后台实时评估每一步的优劣并指示最佳走法。
3. **人机残局对抗**：
   * 点击选项卡【人机对抗】；
   * 选择自己执红或执黑；
   * 走出一步后，皮卡鱼将自动思考并在棋盘上实际落子，落子后立即交还控制权。
4. **自由摆棋**：
   * 点击选项卡【自由摆棋】；
   * 可先点击【清空棋盘】，然后从红黑棋子托盘点选棋子并在棋盘上放置；
   * 放置完毕后，指定先行方，点击【开始推演】或【人机对抗】立即进入实战！
