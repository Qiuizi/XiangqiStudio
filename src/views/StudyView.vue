<template>
  <div class="study-view-container">
    <!-- Center Board Area -->
    <div class="study-board-area">
      <ChessBoard
        :grid="gameStore.grid"
        :selected-pos="gameStore.selectedPos"
        :legal-targets="gameStore.legalTargets"
        :last-move="gameStore.lastMove"
        :in-check-king-pos="gameStore.inCheckKingPos"
        :flipped="gameStore.flipped"
        :ai-arrow="gameStore.isStudyAnalyzing ? gameStore.aiArrow : null"
        @select="onBoardSelect"
        @move="onBoardMove"
      />
    </div>

    <!-- Side Tools Panel -->
    <div class="study-tools-panel">
      <div class="panel-card">
        <!-- Header & Submode Tabs -->
        <div class="panel-header">
          <div class="header-title-row">
            <div class="title-with-icon">
              <FlaskConical :size="18" class="header-icon" />
              <h3>残局推演与研究</h3>
            </div>
          </div>
          <p class="panel-desc">支持双方手动推演、人机残局对抗及自由摆棋构建。</p>

          <div class="submode-tabs">
            <button 
              class="submode-tab-btn" 
              :class="{ active: gameStore.studySubMode === 'manual' }"
              @click="switchSubMode('manual')"
            >
              <BookOpen :size="13" />
              <span>手动推演</span>
            </button>
            <button 
              class="submode-tab-btn" 
              :class="{ active: gameStore.studySubMode === 'battle' }"
              @click="switchSubMode('battle')"
            >
              <Swords :size="13" />
              <span>人机对抗</span>
            </button>
            <button 
              class="submode-tab-btn" 
              :class="{ active: gameStore.studySubMode === 'edit' }"
              @click="switchSubMode('edit')"
            >
              <Edit3 :size="13" />
              <span>自由摆棋</span>
            </button>
          </div>
        </div>

        <!-- 1. 双方手动推演模式 (Manual Study) -->
        <div v-if="gameStore.studySubMode === 'manual'" class="mode-body manual-body">
          <!-- Turn Selection -->
          <div class="tool-section">
            <div class="section-label-row">
              <label>当前行棋方 (切换执步)</label>
              <span class="turn-indicator-badge" :class="gameStore.activeColor">
                {{ gameStore.activeColor === 'red' ? '红方走棋' : '黑方走棋' }}
              </span>
            </div>
            <div class="btn-group">
              <button 
                class="choice-btn red-choice" 
                :class="{ active: gameStore.activeColor === 'red' }"
                @click="gameStore.setActiveColor('red')"
              >
                红方走棋
              </button>
              <button 
                class="choice-btn black-choice" 
                :class="{ active: gameStore.activeColor === 'black' }"
                @click="gameStore.setActiveColor('black')"
              >
                黑方走棋
              </button>
            </div>
          </div>

          <!-- Engine Analysis Card -->
          <div class="analysis-card">
            <div class="analysis-header">
              <div class="analysis-title">
                <Cpu :size="15" />
                <span>皮卡鱼深度解局</span>
              </div>
              <span v-if="gameStore.isStudyAnalyzing" class="live-tag">
                <span class="pulse-dot"></span> 实时解盘中
              </span>
            </div>

            <div v-if="gameStore.isStudyAnalyzing" class="analysis-telemetry">
              <div class="telemetry-grid">
                <div class="telemetry-item">
                  <span class="label">算力深度</span>
                  <span class="value">{{ gameStore.engineInfo.depth }} / {{ gameStore.engineInfo.seldepth || '-' }}</span>
                </div>
                <div class="telemetry-item">
                  <span class="label">局面估值</span>
                  <span class="value score" :class="scoreClass">{{ formattedScore }}</span>
                </div>
                <div class="telemetry-item">
                  <span class="label">计算节点</span>
                  <span class="value">{{ ((gameStore.engineInfo.nodes || 0) / 1000).toFixed(0) }}k</span>
                </div>
                <div class="telemetry-item">
                  <span class="label">推荐着法</span>
                  <span class="value move-uci">{{ gameStore.engineInfo.bestMove || '-' }}</span>
                </div>
              </div>
            </div>

            <button 
              class="analysis-toggle-btn"
              :class="{ 'is-active': gameStore.isStudyAnalyzing }"
              @click="gameStore.toggleStudyAnalysis()"
            >
              <Pause v-if="gameStore.isStudyAnalyzing" :size="14" />
              <Play v-else :size="14" />
              <span>{{ gameStore.isStudyAnalyzing ? '停止解盘' : '开启皮卡鱼深度解局' }}</span>
            </button>
          </div>

          <!-- Quick Presets -->
          <div class="tool-section">
            <label>经典残局预设</label>
            <div class="presets-grid">
              <button 
                v-for="(fen, key) in PRESETS" 
                :key="key" 
                class="preset-btn"
                :class="{ active: currentPresetKey === key }"
                @click="selectPreset(key, fen)"
              >
                {{ PRESET_LABELS[key] || key }}
              </button>
            </div>
          </div>

          <!-- Operational Controls -->
          <div class="tool-section actions-row">
            <button 
              class="sub-btn" 
              :disabled="gameStore.history.length === 0"
              @click="gameStore.undo()"
            >
              <Undo2 :size="14" />
              <span>单步悔棋</span>
            </button>
            <button class="sub-btn" @click="resetCurrentPreset">
              <RotateCcw :size="14" />
              <span>恢复局面</span>
            </button>
            <button class="sub-btn" @click="gameStore.flipBoard()">
              <ArrowUpDown :size="14" />
              <span>翻转棋盘</span>
            </button>
          </div>
        </div>

        <!-- 2. 人机残局对抗模式 (Battle Study) -->
        <div v-else-if="gameStore.studySubMode === 'battle'" class="mode-body battle-body">
          <div class="tool-section">
            <label>我方执棋立场</label>
            <div class="btn-group">
              <button 
                class="choice-btn red-choice" 
                :class="{ active: gameStore.playerSide === 'red' }"
                @click="setPlayerSide('red')"
              >
                我执红棋 (AI 执黑)
              </button>
              <button 
                class="choice-btn black-choice" 
                :class="{ active: gameStore.playerSide === 'black' }"
                @click="setPlayerSide('black')"
              >
                我执黑棋 (AI 执红)
              </button>
            </div>
          </div>

          <!-- Battle Status Card -->
          <div class="battle-status-card">
            <div class="battle-status-header">
              <span class="status-label">当前局面状态</span>
              <span class="turn-indicator-badge" :class="gameStore.activeColor">
                {{ isHumanTurn ? '轮到您走棋' : '轮到 AI 思考' }}
              </span>
            </div>

            <div v-if="gameStore.isAiThinking" class="ai-busy-banner">
              <span class="pulse-dot"></span>
              <span>皮卡鱼正在计算第 {{ gameStore.engineInfo.depth }} 层...</span>
            </div>

            <div v-else-if="!isHumanTurn" class="ai-trigger-prompt">
              <p>当前轮到 AI 行棋，点击下方按钮开始解法：</p>
              <button class="ai-trigger-btn" @click="gameStore.triggerStudyAiMove()">
                <Play :size="15" />
                <span>让 AI 走下一步</span>
              </button>
            </div>

            <!-- Error banner -->
            <div v-if="gameStore.isEngineError" class="study-error-banner">
              <AlertTriangle :size="14" />
              <span>{{ gameStore.engineErrorMsg || '引擎异常' }}</span>
              <button class="retry-link" @click="gameStore.retryAiMove()">重试</button>
            </div>
          </div>

          <div class="tool-section actions-row">
            <button 
              class="sub-btn" 
              :disabled="gameStore.history.length === 0 || gameStore.isAiThinking"
              @click="gameStore.undo()"
            >
              <Undo2 :size="14" />
              <span>悔棋回退</span>
            </button>
            <button 
              class="sub-btn" 
              :disabled="gameStore.isAiThinking"
              @click="resetCurrentPreset"
            >
              <RotateCcw :size="14" />
              <span>重新开始</span>
            </button>
            <button class="sub-btn" @click="gameStore.flipBoard()">
              <ArrowUpDown :size="14" />
              <span>翻转视角</span>
            </button>
          </div>
        </div>

        <!-- 3. 自由摆棋编辑模式 (Edit Board) -->
        <div v-else class="mode-body edit-body">
          <div class="tool-section">
            <label>摆棋工具箱 (选中棋子点击棋盘放置)</label>
            <!-- Red Pieces Palette -->
            <div class="palette-row red-palette">
              <button 
                v-for="p in RED_PALETTE" 
                :key="'p_red_' + p.type"
                class="palette-piece-btn red-piece"
                :class="{ selected: selectedPaletteType === p.type && selectedPaletteColor === 'red' }"
                @click="selectPalette(p.type, 'red')"
              >
                {{ p.label }}
              </button>
            </div>

            <!-- Black Pieces Palette -->
            <div class="palette-row black-palette">
              <button 
                v-for="p in BLACK_PALETTE" 
                :key="'p_black_' + p.type"
                class="palette-piece-btn black-piece"
                :class="{ selected: selectedPaletteType === p.type && selectedPaletteColor === 'black' }"
                @click="selectPalette(p.type, 'black')"
              >
                {{ p.label }}
              </button>
            </div>

            <!-- Eraser / Clear tools -->
            <div class="palette-tools-row">
              <button 
                class="palette-tool-btn" 
                :class="{ selected: isEraserActive }"
                @click="toggleEraser"
              >
                <Trash2 :size="13" />
                <span>橡皮擦 (移除单子)</span>
              </button>
              <button class="palette-tool-btn danger" @click="gameStore.clearBoard()">
                <span>清空棋盘</span>
              </button>
              <button class="palette-tool-btn" @click="gameStore.resetToPreset(INITIAL_FEN)">
                <span>标准开局</span>
              </button>
            </div>
          </div>

          <!-- Starting Side for Custom Setup -->
          <div class="tool-section">
            <label>指定先行方</label>
            <div class="btn-group">
              <button 
                class="choice-btn red-choice" 
                :class="{ active: gameStore.activeColor === 'red' }"
                @click="gameStore.setActiveColor('red')"
              >
                红方先行 (w)
              </button>
              <button 
                class="choice-btn black-choice" 
                :class="{ active: gameStore.activeColor === 'black' }"
                @click="gameStore.setActiveColor('black')"
              >
                黑方先行 (b)
              </button>
            </div>
          </div>

          <!-- Finish Editing -->
          <div class="edit-finish-row">
            <button class="finish-btn primary" @click="switchSubMode('manual')">
              <CheckCircle :size="14" />
              <span>完成摆棋并推演</span>
            </button>
            <button class="finish-btn secondary" @click="switchSubMode('battle')">
              <Swords :size="14" />
              <span>以此局面人机对抗</span>
            </button>
          </div>
        </div>

        <!-- Universal FEN Section at Bottom -->
        <div class="tool-section fen-section">
          <div class="fen-header-row">
            <label>FEN 局面串 (实时同步)</label>
            <button class="copy-fen-btn" @click="copyFen">
              <Copy :size="12" />
              <span>复制 FEN</span>
            </button>
          </div>
          <textarea :value="gameStore.currentFen" rows="2" readonly class="fen-display"></textarea>

          <div class="fen-import-row">
            <input 
              v-model="customFenInput" 
              type="text" 
              placeholder="在此粘贴任意残局 FEN 字符串..." 
              class="fen-input"
            />
            <button class="load-fen-btn" @click="loadCustomFen">
              <Upload :size="12" />
              <span>导入</span>
            </button>
          </div>
        </div>

      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { 
  FlaskConical, BookOpen, Swords, Edit3, Cpu, Pause, Play, 
  RotateCcw, Undo2, ArrowUpDown, Copy, Upload, Trash2, 
  CheckCircle, AlertTriangle
} from 'lucide-vue-next';
import { useGameStore, type StudySubMode } from '../stores/gameStore';
import ChessBoard from '../components/chess/ChessBoard.vue';
import type { PieceColor, PieceType, Position } from '../core/chess/types';
import { INITIAL_FEN } from '../core/chess/fen';

const gameStore = useGameStore();

const customFenInput = ref('');
const currentPresetKey = ref<string>('start');

// Editing Palette State
const selectedPaletteType = ref<PieceType | null>(null);
const selectedPaletteColor = ref<PieceColor>('red');
const isEraserActive = ref(false);

const RED_PALETTE: { type: PieceType; label: string }[] = [
  { type: 'k', label: '帅' },
  { type: 'a', label: '仕' },
  { type: 'b', label: '相' },
  { type: 'n', label: '马' },
  { type: 'r', label: '车' },
  { type: 'c', label: '炮' },
  { type: 'p', label: '兵' },
];

const BLACK_PALETTE: { type: PieceType; label: string }[] = [
  { type: 'k', label: '将' },
  { type: 'a', label: '士' },
  { type: 'b', label: '象' },
  { type: 'n', label: '马' },
  { type: 'r', label: '车' },
  { type: 'c', label: '卒' },
  { type: 'p', label: '卒' },
];

const PRESETS: Record<string, string> = {
  start: INITIAL_FEN,
  ma_bing: '4k4/4a4/4ba3/9/9/9/4N4/4B4/4P4/4K4 w - - 0 1',
  pao_bing: '4k4/4a4/4a4/9/9/9/4P4/4C4/9/4K4 w - - 0 1',
  che_bing: '4k4/9/9/9/4r4/4R4/4P4/9/9/4K4 w - - 0 1',
  san_bing: '3k5/4a4/4ba3/9/9/9/2P1P1P2/9/9/4K4 w - - 0 1',
  dan_ma: '4k4/4a4/9/9/9/9/9/9/4N4/4K4 w - - 0 1',
};

const PRESET_LABELS: Record<string, string> = {
  start: '初始全盘',
  ma_bing: '马兵胜单缺象',
  pao_bing: '炮兵胜双士',
  che_bing: '车兵胜单车',
  san_bing: '三兵胜士象全',
  dan_ma: '单马胜单士',
};

const isHumanTurn = computed(() => {
  return gameStore.activeColor === gameStore.playerSide;
});

const formattedScore = computed(() => {
  const info = gameStore.engineInfo;
  if (info.scoreMate !== null) {
    const m = gameStore.activeColor === 'red' ? info.scoreMate : -info.scoreMate;
    return `M${m > 0 ? '+' : ''}${m}`;
  }
  if (info.scoreCp === null) return '0.00';
  const cp = gameStore.activeColor === 'red' ? info.scoreCp : -info.scoreCp;
  return (cp > 0 ? '+' : '') + (cp / 100).toFixed(2);
});

const scoreClass = computed(() => {
  const info = gameStore.engineInfo;
  if (info.scoreMate !== null) {
    const m = gameStore.activeColor === 'red' ? info.scoreMate : -info.scoreMate;
    return m > 0 ? 'score-red' : 'score-black';
  }
  if (info.scoreCp === null) return '';
  const cp = gameStore.activeColor === 'red' ? info.scoreCp : -info.scoreCp;
  return cp >= 0 ? 'score-red' : 'score-black';
});

function switchSubMode(mode: StudySubMode) {
  selectedPaletteType.value = null;
  isEraserActive.value = false;
  gameStore.setStudySubMode(mode);
}

function setPlayerSide(side: PieceColor) {
  gameStore.playerSide = side;
  gameStore.flipped = side === 'black';
  if (gameStore.studySubMode === 'battle') {
    gameStore.checkAiTurn();
  }
}

function selectPreset(key: string, fen: string) {
  currentPresetKey.value = key;
  gameStore.resetToPreset(fen);
}

function resetCurrentPreset() {
  const fen = PRESETS[currentPresetKey.value] || INITIAL_FEN;
  gameStore.resetToPreset(fen);
}

function loadCustomFen() {
  if (!customFenInput.value.trim()) return;
  const res = gameStore.loadCustomFen(customFenInput.value);
  if (!res.success) {
    alert('FEN 格式错误: ' + res.error);
  } else {
    currentPresetKey.value = '';
    customFenInput.value = '';
  }
}

async function copyFen() {
  const fen = gameStore.currentFen;
  try {
    await navigator.clipboard.writeText(fen);
    alert('已复制当前 FEN: ' + fen);
  } catch {
    alert(fen);
  }
}

// Edit Mode Palette Logic
function selectPalette(type: PieceType, color: PieceColor) {
  isEraserActive.value = false;
  selectedPaletteType.value = type;
  selectedPaletteColor.value = color;
}

function toggleEraser() {
  isEraserActive.value = !isEraserActive.value;
  selectedPaletteType.value = null;
}

// Board Intersections Handling
function onBoardSelect(pos: Position) {
  if (gameStore.studySubMode === 'edit') {
    if (isEraserActive.value) {
      gameStore.setPieceAt(pos, null);
    } else if (selectedPaletteType.value) {
      gameStore.setPieceAt(pos, {
        type: selectedPaletteType.value,
        color: selectedPaletteColor.value,
      });
    } else {
      // Pick up piece to move freely
      gameStore.selectSquare(pos);
    }
  } else {
    // Normal select for manual study or battle
    gameStore.selectSquare(pos);
  }
}

function onBoardMove(from: Position, to: Position) {
  if (gameStore.studySubMode === 'edit') {
    // In edit mode, move piece freely
    const piece = gameStore.board.grid[from.rank][from.file];
    if (piece) {
      gameStore.setPieceAt(from, null);
      gameStore.setPieceAt(to, { type: piece.type, color: piece.color });
    }
  } else {
    gameStore.makeUserMove(from, to);
  }
}

onMounted(() => {
  gameStore.enterStudyMode('manual');
});

onUnmounted(() => {
  gameStore.exitStudyMode();
});
</script>

<style scoped>
.study-view-container {
  display: flex;
  flex: 1;
  align-items: flex-start;
  justify-content: center;
  gap: 20px;
  padding: 10px 16px;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  user-select: none;
}

.study-board-area {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow: hidden;
}

.study-tools-panel {
  width: 330px;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  flex-shrink: 0;
}

.panel-card {
  background: rgba(26, 15, 9, 0.85);
  border: 1px solid #4a2d18;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.panel-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-bottom: 1px solid rgba(74, 45, 24, 0.6);
  padding-bottom: 12px;
}

.header-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #d4af37;
}

.header-title-row h3 {
  margin: 0;
  font-size: 16px;
  color: #eed6b3;
  font-weight: 600;
}

.panel-desc {
  margin: 0;
  font-size: 11px;
  color: #9c7b5c;
  line-height: 1.4;
}

/* Submode Tabs */
.submode-tabs {
  display: flex;
  gap: 4px;
  background: rgba(15, 8, 4, 0.7);
  padding: 3px;
  border-radius: 8px;
  border: 1px solid #3d2313;
  margin-top: 4px;
}

.submode-tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 4px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #a88d74;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.submode-tab-btn:hover {
  color: #eed6b3;
}

.submode-tab-btn.active {
  background: linear-gradient(180deg, #6e3e1b 0%, #4a2810 100%);
  color: #fff2d1;
  font-weight: bold;
  border: 1px solid #8e5427;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
}

.mode-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tool-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tool-section label {
  font-size: 11px;
  color: #a88d74;
}

.turn-indicator-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
}

.turn-indicator-badge.red {
  background: rgba(176, 36, 36, 0.2);
  color: #ff7b7b;
  border: 1px solid rgba(176, 36, 36, 0.4);
}

.turn-indicator-badge.black {
  background: rgba(90, 100, 120, 0.2);
  color: #aab8cf;
  border: 1px solid rgba(90, 100, 120, 0.4);
}

.btn-group {
  display: flex;
  gap: 8px;
}

.choice-btn {
  flex: 1;
  padding: 7px;
  border-radius: 6px;
  border: 1px solid #4a2c16;
  background: #190c06;
  color: #eed6b3;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.choice-btn.active.red-choice {
  background: radial-gradient(circle, #7a1515 0%, #4a0d0d 100%);
  border-color: #e04848;
  color: #fff4d6;
  font-weight: bold;
}

.choice-btn.active.black-choice {
  background: radial-gradient(circle, #2f3442 0%, #1e212b 100%);
  border-color: #7b859e;
  color: #cfd4e3;
  font-weight: bold;
}

/* Analysis Card */
.analysis-card {
  background: rgba(18, 9, 4, 0.7);
  border: 1px solid #3d2313;
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.analysis-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.analysis-title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #d4af37;
  font-size: 12px;
  font-weight: 600;
}

.live-tag {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  color: #4cd964;
}

.pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4cd964;
  animation: pulseDot 1.5s infinite;
}

@keyframes pulseDot {
  0% { transform: scale(0.9); opacity: 0.6; }
  50% { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(0.9); opacity: 0.6; }
}

.telemetry-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  background: rgba(10, 5, 2, 0.6);
  padding: 8px;
  border-radius: 6px;
}

.telemetry-item {
  display: flex;
  flex-direction: column;
}

.telemetry-item .label {
  font-size: 10px;
  color: #8c6e54;
}

.telemetry-item .value {
  font-size: 12px;
  color: #eed6b3;
  font-weight: bold;
}

.telemetry-item .value.score-red {
  color: #ff6b6b;
}

.telemetry-item .value.score-black {
  color: #82aaff;
}

.analysis-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid #4a2c16;
  background: #29150a;
  color: #eed6b3;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.analysis-toggle-btn:hover {
  border-color: #d4af37;
  color: #ffd700;
}

.analysis-toggle-btn.is-active {
  background: rgba(176, 36, 36, 0.3);
  border-color: #e04848;
  color: #ff9e9e;
}

/* Presets Grid */
.presets-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.preset-btn {
  padding: 7px 6px;
  border-radius: 6px;
  border: 1px solid #3d2313;
  background: #201007;
  color: #eed6b3;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

.preset-btn:hover {
  border-color: #d4af37;
  color: #ffd700;
}

.preset-btn.active {
  border-color: #d4af37;
  background: rgba(212, 175, 55, 0.15);
  color: #ffd700;
  font-weight: bold;
}

.actions-row {
  display: flex;
  gap: 6px;
}

.sub-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 7px 4px;
  border-radius: 6px;
  border: 1px solid #4a2c16;
  background: #201007;
  color: #eed6b3;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.sub-btn:hover:not(:disabled) {
  border-color: #d4af37;
  color: #ffd700;
}

.sub-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Battle Sub-Mode Styles */
.battle-status-card {
  background: rgba(18, 9, 4, 0.7);
  border: 1px solid #3d2313;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.battle-status-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.status-label {
  font-size: 11px;
  color: #a88d74;
}

.ai-busy-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #d4af37;
  background: rgba(212, 175, 55, 0.1);
  padding: 8px;
  border-radius: 6px;
}

.ai-trigger-prompt {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai-trigger-prompt p {
  margin: 0;
  font-size: 11px;
  color: #eed6b3;
}

.ai-trigger-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px;
  border-radius: 6px;
  border: 1px solid #d4af37;
  background: linear-gradient(180deg, #b02424 0%, #751414 100%);
  color: #fff4d6;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.ai-trigger-btn:hover {
  box-shadow: 0 4px 12px rgba(176, 36, 36, 0.4);
}

.study-error-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #ff6b6b;
  background: rgba(176, 36, 36, 0.15);
  border: 1px solid rgba(176, 36, 36, 0.3);
  padding: 6px 8px;
  border-radius: 6px;
}

.retry-link {
  margin-left: auto;
  border: none;
  background: transparent;
  color: #ffd700;
  text-decoration: underline;
  cursor: pointer;
  font-size: 11px;
}

/* Edit Mode Palette Styles */
.palette-row {
  display: flex;
  gap: 4px;
}

.palette-piece-btn {
  flex: 1;
  padding: 7px 0;
  border-radius: 6px;
  font-family: 'Kaiti', 'STKaiti', serif;
  font-size: 15px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.palette-piece-btn.red-piece {
  background: rgba(122, 21, 21, 0.6);
  color: #fff4d6;
  border-color: #7a1515;
}

.palette-piece-btn.red-piece.selected {
  border-color: #ffd700;
  box-shadow: 0 0 8px rgba(255, 215, 0, 0.6);
  transform: scale(1.08);
}

.palette-piece-btn.black-piece {
  background: rgba(43, 46, 56, 0.8);
  color: #cfd4e3;
  border-color: #4b5266;
}

.palette-piece-btn.black-piece.selected {
  border-color: #ffd700;
  box-shadow: 0 0 8px rgba(255, 215, 0, 0.6);
  transform: scale(1.08);
}

.palette-tools-row {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.palette-tool-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 4px;
  border-radius: 6px;
  border: 1px solid #3d2313;
  background: #201007;
  color: #eed6b3;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.palette-tool-btn.selected {
  border-color: #d4af37;
  background: rgba(212, 175, 55, 0.2);
  color: #ffd700;
}

.palette-tool-btn.danger {
  color: #ff8585;
}

.palette-tool-btn.danger:hover {
  border-color: #ff5252;
}

.edit-finish-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.finish-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.finish-btn.primary {
  background: linear-gradient(180deg, #2d6b38 0%, #1a4221 100%);
  color: #f0fff4;
  border: 1px solid #388e3c;
}

.finish-btn.primary:hover {
  box-shadow: 0 4px 12px rgba(45, 107, 56, 0.4);
}

.finish-btn.secondary {
  background: linear-gradient(180deg, #6e3e1b 0%, #4a2810 100%);
  color: #fff2d1;
  border: 1px solid #8e5427;
}

/* FEN Tools Section */
.fen-section {
  border-top: 1px solid rgba(74, 45, 24, 0.6);
  padding-top: 10px;
}

.fen-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.copy-fen-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  border-radius: 4px;
  border: 1px solid #4a2c16;
  background: #201007;
  color: #eed6b3;
  font-size: 10px;
  cursor: pointer;
}

.copy-fen-btn:hover {
  border-color: #d4af37;
  color: #ffd700;
}

.fen-display {
  background: rgba(12, 6, 3, 0.8);
  border: 1px solid #3d2313;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 10px;
  color: #eed6b3;
  font-family: monospace;
  resize: none;
  line-height: 1.3;
}

.fen-import-row {
  display: flex;
  gap: 6px;
}

.fen-input {
  flex: 1;
  background: rgba(12, 6, 3, 0.8);
  border: 1px solid #3d2313;
  border-radius: 4px;
  padding: 5px 8px;
  font-size: 10px;
  color: #eed6b3;
}

.fen-input:focus {
  outline: none;
  border-color: #d4af37;
}

.load-fen-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: 4px;
  border: 1px solid #d4af37;
  background: #29150a;
  color: #ffd700;
  font-size: 10px;
  cursor: pointer;
  white-space: nowrap;
}

.load-fen-btn:hover {
  background: rgba(212, 175, 55, 0.2);
}

.title-with-icon {
  display: flex;
  align-items: center;
  gap: 8px;
}

</style>
