<template>
  <div class="right-tab-panel">
    <!-- 顶部标签页导航 -->
    <div class="tabs-header">
      <button 
        class="tab-btn" 
        :class="{ active: activeTab === 'history' }"
        @click="activeTab = 'history'"
      >
        <ListOrdered :size="14" />
        <span>对局棋谱</span>
      </button>

      <button 
        class="tab-btn" 
        :class="{ active: activeTab === 'engine' }"
        @click="activeTab = 'engine'"
      >
        <Cpu :size="14" />
        <span>AI 分析</span>
      </button>

      <button 
        class="tab-btn" 
        :class="{ active: activeTab === 'fen' }"
        @click="activeTab = 'fen'"
      >
        <FileCode :size="14" />
        <span>FEN 工具</span>
      </button>
    </div>

    <!-- 标签 1：对局棋谱与着法记录 -->
    <div v-show="activeTab === 'history'" class="tab-content history-content">
      <div class="history-table-container">
        <table class="history-table">
          <thead>
            <tr>
              <th width="36">步</th>
              <th>红方着法</th>
              <th>黑方着法</th>
            </tr>
          </thead>
          <tbody>
            <tr 
              v-for="(row, idx) in moveRows" 
              :key="'row_' + idx"
              :class="{ 'is-current-row': isCurrentRow(idx) }"
            >
              <td class="col-idx">{{ idx + 1 }}</td>
              <td 
                class="col-move red-move"
                :class="{ active: isMoveActive(idx * 2) }"
                @click="jumpTo(idx * 2 + 1)"
              >
                {{ row.red?.notation || '-' }}
              </td>
              <td 
                class="col-move black-move"
                :class="{ active: isMoveActive(idx * 2 + 1) }"
                @click="row.black && jumpTo(idx * 2 + 2)"
              >
                {{ row.black?.notation || '-' }}
              </td>
            </tr>
            <tr v-if="moveRows.length === 0">
              <td colspan="3" class="empty-hint">暂无走子记录，点击棋子开始对弈</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 棋谱历史步数步进条（底部吸底） -->
      <div class="history-nav-bar">
        <button class="nav-icon-btn" :disabled="gameStore.currentStep === 0" title="回到起点" @click="jumpTo(0)">
          <ChevronsLeft :size="15" />
        </button>
        <button class="nav-icon-btn" :disabled="gameStore.currentStep === 0" title="上一步" @click="jumpTo(gameStore.currentStep - 1)">
          <ChevronLeft :size="15" />
        </button>
        <span class="nav-step-text">{{ gameStore.currentStep }} / {{ gameStore.history.length }} 步</span>
        <button class="nav-icon-btn" :disabled="gameStore.currentStep >= gameStore.history.length" title="下一步" @click="jumpTo(gameStore.currentStep + 1)">
          <ChevronRight :size="15" />
        </button>
        <button class="nav-icon-btn" :disabled="gameStore.currentStep >= gameStore.history.length" title="最新局面" @click="jumpTo(gameStore.history.length)">
          <ChevronsRight :size="15" />
        </button>
      </div>
    </div>

    <!-- 标签 2：Pikafish 专业局面深度研究面板 -->
    <div v-show="activeTab === 'engine'" class="tab-content engine-content">
      <div class="engine-info-card">
        <!-- 头部状态与设置入口 -->
        <div class="engine-card-header">
          <div class="engine-title-box">
            <span class="engine-label">计算引擎</span>
            <span class="engine-title">{{ gameStore.engineName }}</span>
          </div>
          <div class="engine-header-right">
            <span class="engine-status-pill" :class="{ running: gameStore.isAiThinking || gameStore.isAnalyzing, error: gameStore.isEngineError }">
              {{ gameStore.isEngineError ? '引擎异常' : gameStore.isAiThinking ? 'AI 思考中' : gameStore.isAnalyzing ? '实时解算中' : '计算就绪' }}
            </span>
            <button class="settings-gear-btn" title="打开引擎高级配置" @click="showSettingsModal = true">
              <Settings :size="14" />
            </button>
          </div>
        </div>

        <!-- 快速搜索配置工具条 (V0.3.1 常用参数快捷控制) -->
        <div class="quick-engine-ctrl">
          <div class="quick-row">
            <span class="quick-label">分析模式</span>
            <div class="quick-btn-group" title="设置右侧 AI 辅助分析的限制条件（对弈模式 AI 走子限制请在高级配置中调整）">
              <button 
                class="quick-mode-btn" 
                :class="{ active: engineSettings.analysisSearchType === 'infinite' }"
                @click="setQuickSearchType('infinite')"
              >无限</button>
              <button 
                class="quick-mode-btn" 
                :class="{ active: engineSettings.analysisSearchType === 'depth' }"
                @click="setQuickSearchType('depth')"
              >定深</button>
              <button 
                class="quick-mode-btn" 
                :class="{ active: engineSettings.analysisSearchType === 'movetime' }"
                @click="setQuickSearchType('movetime')"
              >定时</button>
              <button 
                class="quick-mode-btn" 
                :class="{ active: engineSettings.analysisSearchType === 'nodes' }"
                @click="setQuickSearchType('nodes')"
              >节点</button>
            </div>

            <span class="quick-label quick-multipv-label">候选</span>
            <div class="quick-btn-group">
              <button 
                v-for="pv in [1, 2, 3, 5]" 
                :key="pv"
                class="quick-pv-btn" 
                :class="{ active: engineSettings.multiPv === pv }"
                @click="setQuickMultiPv(pv)"
              >{{ pv }}线</button>
            </div>
          </div>

          <div v-if="engineSettings.analysisSearchType !== 'infinite'" class="quick-row quick-limit-row">
            <span class="quick-label">限制</span>
            <div class="quick-limit-inputs">
              <template v-if="engineSettings.analysisSearchType === 'depth'">
                <input 
                  type="number" 
                  v-model.number="engineSettings.analysisDepth" 
                  @change="onQuickParamChange"
                  min="1" 
                  max="100" 
                  class="quick-num-input" 
                />
                <span class="quick-unit">层深度</span>
              </template>
              <template v-else-if="engineSettings.analysisSearchType === 'movetime'">
                <input 
                  type="number" 
                  :value="engineSettings.analysisMovetimeMs / 1000" 
                  @input="e => engineSettings.analysisMovetimeMs = Math.round(Number((e.target as HTMLInputElement).value) * 1000)"
                  @change="onQuickParamChange"
                  min="0.5" 
                  max="60" 
                  step="0.5" 
                  class="quick-num-input" 
                />
                <span class="quick-unit">秒计算</span>
              </template>
              <template v-else-if="engineSettings.analysisSearchType === 'nodes'">
                <input 
                  type="number" 
                  :value="Math.round(engineSettings.analysisNodes / 1000)" 
                  @input="e => engineSettings.analysisNodes = Math.round(Number((e.target as HTMLInputElement).value) * 1000)"
                  @change="onQuickParamChange"
                  min="10" 
                  max="1000000" 
                  step="100" 
                  class="quick-num-input" 
                />
                <span class="quick-unit">k 节点</span>
              </template>
            </div>
          </div>
        </div>

        <!-- 专业搜索数据仪表盘 (6项核心指标) -->
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">搜索深度</span>
            <span class="stat-val">
              {{ gameStore.engineInfo.depth }}{{ gameStore.engineInfo.seldepth ? ` / ${gameStore.engineInfo.seldepth}` : '' }} 层
            </span>
          </div>
          <div class="stat-item">
            <span class="stat-label">红方视角评分</span>
            <span class="stat-val highlight" :class="scoreClass">
              {{ formattedScore }}
            </span>
          </div>
          <div class="stat-item">
            <span class="stat-label">算力速率</span>
            <span class="stat-val">{{ formattedNps }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">计算节点</span>
            <span class="stat-val">{{ formattedNodes }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">解算耗时</span>
            <span class="stat-val">{{ ((gameStore.engineInfo.timeMs || 0) / 1000).toFixed(1) }} s</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">哈希占用率</span>
            <span class="stat-val">{{ gameStore.engineInfo.hashfull ? (gameStore.engineInfo.hashfull / 10).toFixed(1) + '%' : '-' }}</span>
          </div>
        </div>

        <!-- 多候选变化 (MultiPV) 列表 -->
        <div class="multipv-section">
          <div class="multipv-header">
            <span>候选走法对比 (MultiPV)</span>
            <span class="multipv-sub">{{ candidateLines.length }} 条路线</span>
          </div>

          <div class="multipv-list">
            <div 
              v-for="line in candidateLines" 
              :key="'pv_' + line.multipv"
              class="multipv-item"
              :class="{ selected: gameStore.selectedMultiPv === line.multipv }"
              @click="gameStore.selectMultiPvLine(line.multipv)"
            >
              <div class="multipv-rank-col">
                <span class="rank-badge">#{{ line.multipv }}</span>
              </div>
              <div class="multipv-main-col">
                <div class="multipv-move-row">
                  <span class="first-move-uci">{{ line.bestMove || (line.pv[0] || '-') }}</span>
                  <span class="move-score" :class="getLineScoreClass(line)">
                    {{ formatLineScore(line) }}
                  </span>
                </div>
                <div class="pv-chain-text" :title="line.pv.join(' ')">
                  {{ line.pv.slice(0, 6).join('  ') || '计算中...' }}
                </div>
              </div>
            </div>

            <div v-if="candidateLines.length === 0" class="no-pv-hint">
              {{ gameStore.isAnalyzing ? '正在展开博弈树计算...' : '点击下方“开始分析”唤醒引擎解算' }}
            </div>
          </div>
        </div>

        <!-- 底部控制动作条 -->
        <div class="engine-action-row">
          <template v-if="gameStore.isAiThinking">
            <button class="analysis-toggle-btn is-ai-busy" disabled>
              <Pause :size="14" />
              <span>AI 思考行棋中...</span>
            </button>
          </template>
          <template v-else>
            <button 
              class="analysis-toggle-btn" 
              :class="{ 'is-stopping': gameStore.isAnalyzing }"
              :disabled="gameStore.isAiThinking"
              :title="gameStore.isAiThinking ? 'AI 正在对弈计算中，不可开启辅助分析' : ''"
              @click="toggleLiveAnalysis"
            >
              <Pause v-if="gameStore.isAnalyzing" :size="14" />
              <Play v-else :size="14" />
              <span>{{ gameStore.isAnalyzing ? '停止分析' : '开始分析' }}</span>
            </button>

            <button 
              v-if="gameStore.isAnalyzing" 
              class="restart-analysis-btn" 
              title="以当前参数重新解算" 
              @click="restartAnalysis"
            >
              <RotateCcw :size="13" />
              <span>重算</span>
            </button>
          </template>

          <button class="engine-cfg-btn" @click="showSettingsModal = true">
            <Settings :size="13" />
            <span>设置</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 标签 3：FEN 串与工具 -->
    <div v-show="activeTab === 'fen'" class="tab-content fen-content">
      <div class="fen-box">
        <label>当前局面 FEN 串</label>
        <textarea :value="currentFen" rows="3" readonly class="fen-textarea"></textarea>
        <div class="fen-tools-row">
          <button class="tool-btn" @click="copyFen">
            <Copy :size="13" />
            <span>复制 FEN</span>
          </button>
        </div>
      </div>

      <div class="fen-box">
        <label>载入指定 FEN 局面</label>
        <textarea v-model="customFenInput" rows="3" placeholder="在此粘贴标准象棋 FEN 字符串..." class="fen-textarea"></textarea>
        <div class="fen-tools-row">
          <button class="tool-btn primary-tool" @click="loadCustomFen">
            <Upload :size="13" />
            <span>加载局面并复位</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 引擎设置弹窗 -->
    <EngineSettingsModal v-model="showSettingsModal" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { 
  ListOrdered, Cpu, FileCode, ChevronLeft, ChevronRight, 
  ChevronsLeft, ChevronsRight, Copy, Upload, Settings, 
  Play, Pause, RotateCcw
} from 'lucide-vue-next';
import { useGameStore, type MultiPvLine } from '../../stores/gameStore';
import { useEngineSettingsStore } from '../../stores/engineSettingsStore';
import type { Move } from '../../core/chess/types';
import EngineSettingsModal from './EngineSettingsModal.vue';

const gameStore = useGameStore();
const engineSettings = useEngineSettingsStore();
const activeTab = ref<'history' | 'engine' | 'fen'>('history');
const customFenInput = ref('');
const showSettingsModal = ref(false);

// Group history moves into pairs (Red, Black)
interface MoveRow {
  red: Move;
  black?: Move;
}

const moveRows = computed<MoveRow[]>(() => {
  const rows: MoveRow[] = [];
  const hist = gameStore.history;
  for (let i = 0; i < hist.length; i += 2) {
    rows.push({
      red: hist[i],
      black: hist[i + 1] || undefined,
    });
  }
  return rows;
});

function isCurrentRow(rowIdx: number): boolean {
  const step = gameStore.currentStep;
  return Math.floor((step - 1) / 2) === rowIdx;
}

function isMoveActive(moveIndex: number): boolean {
  return gameStore.currentStep === moveIndex + 1;
}

function jumpTo(step: number) {
  gameStore.jumpToStep(step);
}

// Normalized score from Red's perspective
const formattedScore = computed(() => {
  const info = gameStore.engineInfo;
  const isRedTurn = gameStore.activeColor === 'red';

  if (info.scoreMate !== null) {
    const mateFromRed = isRedTurn ? info.scoreMate : -info.scoreMate;
    return `M${mateFromRed > 0 ? '+' : ''}${mateFromRed}`;
  }
  if (info.scoreCp === null) return '0.00';
  const cpFromRed = isRedTurn ? info.scoreCp : -info.scoreCp;
  const pawns = cpFromRed / 100;
  return (pawns > 0 ? '+' : '') + pawns.toFixed(2);
});

const scoreClass = computed(() => {
  const info = gameStore.engineInfo;
  const isRedTurn = gameStore.activeColor === 'red';

  if (info.scoreMate !== null) {
    const mateFromRed = isRedTurn ? info.scoreMate : -info.scoreMate;
    return mateFromRed > 0 ? 'text-red' : 'text-blue';
  }
  if (info.scoreCp === null) return '';
  const cpFromRed = isRedTurn ? info.scoreCp : -info.scoreCp;
  return cpFromRed > 50 ? 'text-red' : cpFromRed < -50 ? 'text-blue' : '';
});

// Unit-aware formatting for nodes and nps
const formattedNodes = computed(() => {
  const n = gameStore.engineInfo.nodes || 0;
  if (n >= 1000000) {
    return (n / 1000000).toFixed(2) + ' M';
  }
  return (n / 1000).toFixed(0) + ' k';
});

const formattedNps = computed(() => {
  const n = gameStore.engineInfo.nps || 0;
  if (n >= 1000000) {
    return (n / 1000000).toFixed(2) + ' MN/s';
  }
  return (n / 1000).toFixed(0) + ' kN/s';
});

// Quick search parameters control handlers
async function setQuickSearchType(type: 'movetime' | 'depth' | 'nodes' | 'infinite') {
  engineSettings.analysisSearchType = type;
  engineSettings.saveToStorage();
  if (gameStore.isAnalyzing) {
    gameStore.triggerAnalysis(false);
  }
}

async function setQuickMultiPv(pv: number) {
  engineSettings.multiPv = pv;
  engineSettings.saveToStorage();
  await engineSettings.applySettings();
  if (gameStore.isAnalyzing) {
    gameStore.triggerAnalysis(false);
  }
}

function onQuickParamChange() {
  engineSettings.saveToStorage();
  if (gameStore.isAnalyzing) {
    gameStore.triggerAnalysis(false);
  }
}

function restartAnalysis() {
  gameStore.triggerAnalysis(false);
}

// MultiPV candidate lines
const candidateLines = computed<MultiPvLine[]>(() => {
  const lines = gameStore.engineInfo.multipvLines;
  if (lines.length > 0) {
    return lines;
  }
  // Fallback single line if multipv was 1
  if (gameStore.engineInfo.bestMove || gameStore.engineInfo.pv.length > 0) {
    return [{
      multipv: 1,
      depth: gameStore.engineInfo.depth,
      scoreCp: gameStore.engineInfo.scoreCp,
      scoreMate: gameStore.engineInfo.scoreMate,
      nodes: gameStore.engineInfo.nodes,
      nps: gameStore.engineInfo.nps,
      pv: gameStore.engineInfo.pv,
      bestMove: gameStore.engineInfo.bestMove || (gameStore.engineInfo.pv[0] || ''),
    }];
  }
  return [];
});

function formatLineScore(line: MultiPvLine): string {
  const isRedTurn = gameStore.activeColor === 'red';
  if (line.scoreMate !== null && line.scoreMate !== undefined) {
    const m = isRedTurn ? line.scoreMate : -line.scoreMate;
    return `M${m > 0 ? '+' : ''}${m}`;
  }
  if (line.scoreCp === null || line.scoreCp === undefined) return '0.00';
  const cp = isRedTurn ? line.scoreCp : -line.scoreCp;
  return (cp > 0 ? '+' : '') + (cp / 100).toFixed(2);
}

function getLineScoreClass(line: MultiPvLine): string {
  const isRedTurn = gameStore.activeColor === 'red';
  if (line.scoreMate !== null && line.scoreMate !== undefined) {
    const m = isRedTurn ? line.scoreMate : -line.scoreMate;
    return m > 0 ? 'text-red' : 'text-blue';
  }
  if (line.scoreCp === null || line.scoreCp === undefined) return '';
  const cp = isRedTurn ? line.scoreCp : -line.scoreCp;
  return cp > 50 ? 'text-red' : cp < -50 ? 'text-blue' : '';
}

function toggleLiveAnalysis() {
  if (gameStore.isAnalyzing) {
    gameStore.stopAnalysis();
  } else {
    gameStore.triggerAnalysis(false);
  }
}

const currentFen = computed(() => gameStore.board.getFen());

async function copyFen() {
  try {
    await navigator.clipboard.writeText(currentFen.value);
    alert('已复制当前局面 FEN 到剪贴板');
  } catch {
    alert(currentFen.value);
  }
}

function loadCustomFen() {
  if (!customFenInput.value.trim()) return;
  try {
    gameStore.board.reset(customFenInput.value.trim());
    gameStore.history.length = 0;
    gameStore.currentStep = 0;
    if (gameStore.autoAnalysis || gameStore.isAnalyzing) {
      gameStore.triggerAnalysis(false);
    }
  } catch (e) {
    alert('无效的 FEN 字符串');
  }
}
</script>

<style scoped>
.right-tab-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: rgba(28, 15, 9, 0.85);
  border-radius: 12px;
  border: 1px solid #4a2d18;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  user-select: none;
  box-sizing: border-box;
}

.tabs-header {
  display: flex;
  background: rgba(18, 9, 5, 0.9);
  border-bottom: 1px solid #422613;
  flex-shrink: 0;
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 10px 4px;
  border: none;
  background: transparent;
  color: #9c7f66;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s ease;
}

.tab-btn:hover {
  color: #eed6b3;
}

.tab-btn.active {
  color: #ffd700;
  border-bottom-color: #d4af37;
  background: rgba(212, 175, 55, 0.08);
}

.tab-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 10px;
  min-height: 0;
}

/* 棋谱历史表格容器 */
.history-table-container {
  flex: 1;
  overflow-y: auto;
  border: 1px solid #3d2313;
  border-radius: 6px;
  background: rgba(15, 8, 4, 0.55);
  min-height: 200px;
}

.history-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.history-table th {
  background: #221208;
  color: #8c6f54;
  padding: 6px;
  font-weight: 500;
  border-bottom: 1px solid #3d2313;
  position: sticky;
  top: 0;
  z-index: 2;
}

.history-table td {
  padding: 6px 8px;
  text-align: center;
  border-bottom: 1px solid rgba(61, 35, 19, 0.4);
}

.col-idx {
  color: #6e5642;
  font-size: 11px;
}

.col-move {
  cursor: pointer;
  font-family: 'Kaiti', 'STKaiti', serif;
  font-size: 13px;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.col-move.red-move {
  color: #ff9494;
}

.col-move.black-move {
  color: #cfd8ea;
}

.col-move:hover {
  background: rgba(212, 175, 55, 0.15);
}

.col-move.active {
  background: #6e3e1b;
  color: #fff4d6;
  font-weight: bold;
}

.empty-hint {
  color: #6e5642;
  padding: 40px 10px;
  font-size: 12px;
}

.history-nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(18, 9, 5, 0.7);
  border: 1px solid #3d2313;
  flex-shrink: 0;
}

.nav-icon-btn {
  background: transparent;
  border: none;
  color: #eed6b3;
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: 4px;
}

.nav-icon-btn:hover:not(:disabled) {
  background: #4a2d18;
  color: #ffd700;
}

.nav-icon-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.nav-step-text {
  font-size: 11px;
  color: #a88d74;
}

/* Engine Tab */
.engine-info-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
}

.engine-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 6px;
  border-bottom: 1px solid #3d2313;
  flex-shrink: 0;
}

.engine-title-box {
  display: flex;
  flex-direction: column;
}

.engine-label {
  font-size: 10px;
  color: #8c6f54;
}

.engine-title {
  font-size: 13px;
  font-weight: bold;
  color: #eed6b3;
}

.engine-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.engine-status-pill {
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 10px;
  background: rgba(56, 107, 69, 0.2);
  border: 1px solid #386b45;
  color: #8ed69d;
}

.engine-status-pill.running {
  background: rgba(212, 175, 55, 0.2);
  border-color: #d4af37;
  color: #ffd700;
  animation: pulseGold 1.5s infinite;
}

.settings-gear-btn {
  background: rgba(42, 22, 12, 0.8);
  border: 1px solid #5a341a;
  border-radius: 4px;
  color: #eed6b3;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.settings-gear-btn:hover {
  border-color: #d4af37;
  color: #ffd700;
}

/* Quick Engine Controls (V0.3.1) */
.quick-engine-ctrl {
  background: rgba(18, 9, 5, 0.75);
  border: 1px solid #4a2914;
  border-radius: 6px;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex-shrink: 0;
}

.quick-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.quick-label {
  font-size: 10px;
  color: #a88d74;
  white-space: nowrap;
  min-width: 24px;
}

.quick-multipv-label {
  margin-left: auto;
}

.quick-btn-group {
  display: flex;
  gap: 3px;
}

.quick-mode-btn, .quick-pv-btn {
  background: #241309;
  border: 1px solid #452410;
  border-radius: 3px;
  color: #eed6b3;
  font-size: 10px;
  padding: 2px 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.quick-mode-btn:hover, .quick-pv-btn:hover {
  border-color: #a87232;
  color: #ffd700;
}

.quick-mode-btn.active, .quick-pv-btn.active {
  background: #61280d;
  border-color: #d4af37;
  color: #ffd700;
  font-weight: bold;
}

.quick-limit-inputs {
  display: flex;
  align-items: center;
  gap: 4px;
}

.quick-num-input {
  width: 52px;
  background: #120703;
  border: 1px solid #4a2814;
  border-radius: 3px;
  color: #ffd700;
  font-size: 10px;
  font-weight: bold;
  padding: 2px 4px;
  text-align: center;
}

.quick-unit {
  font-size: 10px;
  color: #8c6f54;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
  flex-shrink: 0;
}

.stat-item {
  background: rgba(18, 9, 5, 0.6);
  border: 1px solid #3d2313;
  padding: 5px 6px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-label {
  font-size: 9px;
  color: #8c6f54;
}

.stat-val {
  font-size: 11px;
  font-weight: 600;
  color: #eed6b3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-val.text-red {
  color: #ff6b6b;
}

.stat-val.text-blue {
  color: #7099e0;
}

/* MultiPV Section */
.multipv-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 120px;
  overflow: hidden;
}

.multipv-header {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #a88d74;
}

.multipv-sub {
  color: #ffd700;
  font-size: 10px;
}

.multipv-list {
  flex: 1;
  overflow-y: auto;
  border: 1px solid #3d2313;
  border-radius: 6px;
  background: rgba(15, 8, 4, 0.7);
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.multipv-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 5px;
  background: rgba(30, 16, 10, 0.6);
  border: 1px solid #3d2313;
  cursor: pointer;
  transition: all 0.2s;
}

.multipv-item:hover {
  background: rgba(54, 28, 16, 0.8);
  border-color: #6d4020;
}

.multipv-item.selected {
  border-color: #d4af37;
  background: rgba(70, 36, 18, 0.9);
  box-shadow: 0 0 8px rgba(212, 175, 55, 0.25);
}

.rank-badge {
  font-size: 10px;
  font-weight: bold;
  padding: 1px 5px;
  border-radius: 3px;
  background: #241308;
  color: #ffd700;
  border: 1px solid #5a341a;
}

.multipv-main-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.multipv-move-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.first-move-uci {
  font-family: monospace;
  font-weight: bold;
  font-size: 12px;
  color: #eed6b3;
}

.move-score {
  font-size: 11px;
  font-weight: bold;
}

.pv-chain-text {
  font-size: 10px;
  color: #8c6f54;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: monospace;
}

.no-pv-hint {
  color: #6e5642;
  font-size: 11px;
  text-align: center;
  padding: 30px 10px;
}

.engine-action-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
}

.analysis-toggle-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: 6px;
  border: 1px solid #d4af37;
  background: linear-gradient(180deg, #852a12 0%, #521609 100%);
  color: #fff4d6;
  font-size: 11px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.analysis-toggle-btn:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.analysis-toggle-btn.is-stopping {
  background: #3d2212;
  border-color: #6b4020;
  color: #eed6b3;
}

.analysis-toggle-btn.is-ai-busy {
  background: #2b180d;
  border-color: #4a2814;
  color: #a88d74;
  cursor: not-allowed;
  opacity: 0.85;
}

.restart-analysis-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 7px 9px;
  border-radius: 6px;
  border: 1px solid #6b4020;
  background: #2b160b;
  color: #eed6b3;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.restart-analysis-btn:hover {
  border-color: #d4af37;
  color: #ffd700;
  background: #3d2010;
}

.engine-cfg-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 10px;
  border-radius: 6px;
  border: 1px solid #4a2c16;
  background: #24140b;
  color: #eed6b3;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.engine-cfg-btn:hover {
  border-color: #d4af37;
  color: #ffd700;
}

/* FEN tab */
.fen-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.fen-box label {
  font-size: 11px;
  color: #a88d74;
}

.fen-textarea {
  background: rgba(15, 8, 4, 0.7);
  border: 1px solid #3d2313;
  border-radius: 6px;
  padding: 8px;
  font-size: 11px;
  color: #eed6b3;
  font-family: monospace;
  resize: none;
}

.fen-tools-row {
  display: flex;
  justify-content: flex-end;
}

.tool-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid #5c381c;
  background: #3d2212;
  color: #eed6b3;
  font-size: 11px;
  cursor: pointer;
}

.tool-btn.primary-tool {
  background: #6e3e1b;
  border-color: #d4af37;
  color: #fff4d6;
}

@keyframes pulseGold {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.engine-status-pill.error {
  background: rgba(211, 47, 47, 0.2);
  color: #ff5252;
  border-color: rgba(211, 47, 47, 0.5);
}

</style>
