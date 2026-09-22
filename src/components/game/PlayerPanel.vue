<template>
  <div class="player-panel">
    <!-- 1. 顶部区域：红黑双方对弈信息卡 -->
    <div class="players-section">
      <!-- 红方选手卡 -->
      <div 
        class="player-card red-card"
        :class="{ 'is-active-turn': gameStore.activeColor === 'red' }"
      >
        <div class="card-avatar red-avatar">
          <span>帥</span>
        </div>
        <div class="card-info">
          <div class="player-title-row">
            <span class="player-name">
              {{ gameStore.playerSide === 'red' && gameStore.gameMode === 'pve' ? '玩家 (执红)' : gameStore.gameMode === 'pve' ? '皮卡鱼 AI (执红)' : '红方玩家' }}
            </span>
            <span v-if="gameStore.activeColor === 'red'" class="turn-indicator red-indicator">
              行棋中
            </span>
          </div>
          <div class="player-sub-text">
            <span class="side-tag red-tag">先行</span>
            <span class="motto-text">进取如火 · 执红当先</span>
          </div>
        </div>
      </div>

      <!-- VS 对弈衔接装饰条 -->
      <div class="versus-divider">
        <span class="divider-line"></span>
        <span class="versus-badge">楚汉对决</span>
        <span class="divider-line"></span>
      </div>

      <!-- 黑方选手卡 -->
      <div 
        class="player-card black-card"
        :class="{ 'is-active-turn': gameStore.activeColor === 'black' }"
      >
        <div class="card-avatar black-avatar">
          <span>將</span>
        </div>
        <div class="card-info">
          <div class="player-title-row">
            <span class="player-name">
              {{ gameStore.playerSide === 'black' && gameStore.gameMode === 'pve' ? '玩家 (执黑)' : gameStore.gameMode === 'pve' ? '皮卡鱼 AI (执黑)' : '黑方玩家' }}
            </span>
            <span v-if="gameStore.activeColor === 'black'" class="turn-indicator black-indicator">
              {{ gameStore.isAiThinking ? '计算中' : '行棋中' }}
            </span>
          </div>
          <div class="player-sub-text">
            <span class="side-tag black-tag">后手</span>
            <span v-if="gameStore.isAiThinking" class="ai-thinking-text">
              正在搜索深度 {{ gameStore.engineInfo.depth }}...
            </span>
            <span v-else class="motto-text">沉稳如水 · 计策深远</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. 中间区域：对局阶段与盘况印鉴 -->
    <div class="match-status-card">
      <div class="status-header">
        <span class="status-header-title">盘况信息</span>
        <span class="status-badge" :class="matchStatusBadgeClass">
          {{ matchStatusText }}
        </span>
      </div>

      <div class="status-grid">
        <div class="status-grid-item">
          <span class="item-label">当前回合</span>
          <span class="item-value">第 {{ gameStore.board.fullMove }} 回合</span>
        </div>
        <div class="status-grid-item">
          <span class="item-label">当前走棋</span>
          <span class="item-value" :class="gameStore.activeColor === 'red' ? 'color-red' : 'color-black'">
            {{ gameStore.activeColor === 'red' ? '红方行棋' : '黑方行棋' }}
          </span>
        </div>
      </div>
    </div>

    <!-- 3. 底部区域：对局功能操作（主次分级清晰） -->
    <div class="actions-container">
      <!-- 第一行：常用对弈交互功能（悔棋、走法指引、翻转棋盘） -->
      <div class="primary-actions-row">
        <button 
          class="sub-action-btn"
          :disabled="gameStore.history.length === 0"
          title="悔棋回退一步"
          @click="gameStore.undo()"
        >
          <Undo2 :size="15" />
          <span>悔棋</span>
        </button>

        <button 
          class="sub-action-btn hint-btn"
          :class="{ 'hint-active': gameStore.autoAnalysis }"
          title="开启/隐藏 AI 推荐走法箭头"
          @click="toggleAiHint"
        >
          <Lightbulb :size="15" />
          <span>{{ gameStore.autoAnalysis ? '隐藏指引' : '走法指引' }}</span>
        </button>

        <button 
          class="sub-action-btn"
          title="翻转黑红棋盘视角"
          @click="gameStore.flipBoard()"
        >
          <ArrowUpDown :size="15" />
          <span>翻转</span>
        </button>
      </div>

      <!-- 第二行：对局管理操作（未开始对局 vs 激战中对局状态自适应） -->
      <div class="match-lifecycle-row">
        <!-- 未落子开局阶段 -->
        <button 
          v-if="gameStore.history.length === 0"
          class="main-game-btn start-btn"
          @click="showNewGameModal = true"
        >
          <Swords :size="16" />
          <span>开局设置 / 换边</span>
        </button>

        <!-- 激战进行中阶段 -->
        <div v-else class="battle-actions-group">
          <button 
            class="battle-btn restart-btn"
            @click="showNewGameModal = true"
          >
            <RotateCcw :size="14" />
            <span>重新开局</span>
          </button>
          <button 
            class="battle-btn resign-btn"
            @click="handleResign"
          >
            <Flag :size="14" />
            <span>认输</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 开局设置弹窗 -->
    <div v-if="showNewGameModal" class="modal-backdrop" @click.self="showNewGameModal = false">
      <div class="modal-card">
        <div class="modal-header">
          <Swords :size="18" class="modal-icon" />
          <h3>新对局设定</h3>
        </div>

        <div class="modal-body">
          <div class="setting-group">
            <label>对弈模式</label>
            <div class="select-row">
              <button 
                class="option-chip" 
                :class="{ selected: selectedMode === 'pve' }" 
                @click="selectedMode = 'pve'"
              >
                人机对弈 (Pikafish)
              </button>
              <button 
                class="option-chip" 
                :class="{ selected: selectedMode === 'pvp' }" 
                @click="selectedMode = 'pvp'"
              >
                双人同屏对战
              </button>
            </div>
          </div>

          <div v-if="selectedMode === 'pve'" class="setting-group">
            <label>玩家执子</label>
            <div class="select-row">
              <button 
                class="option-chip red-chip" 
                :class="{ selected: selectedSide === 'red' }" 
                @click="selectedSide = 'red'"
              >
                执红先行
              </button>
              <button 
                class="option-chip black-chip" 
                :class="{ selected: selectedSide === 'black' }" 
                @click="selectedSide = 'black'"
              >
                执黑后手
              </button>
            </div>
          </div>

          <div v-if="selectedMode === 'pve'" class="setting-group">
            <label>皮卡鱼思考时间</label>
            <div class="select-row">
              <button 
                v-for="time in [1000, 2000, 3000, 5000]" 
                :key="time"
                class="option-chip small-chip" 
                :class="{ selected: selectedTime === time }" 
                @click="selectedTime = time"
              >
                {{ time / 1000 }} 秒
              </button>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="modal-cancel-btn" @click="showNewGameModal = false">取消</button>
          <button class="modal-confirm-btn" @click="confirmNewGame">确定开始</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { 
  Undo2, ArrowUpDown, Lightbulb, Swords, 
  RotateCcw, Flag 
} from 'lucide-vue-next';
import { useGameStore, type GameMode } from '../../stores/gameStore';
import type { PieceColor } from '../../core/chess/types';

const gameStore = useGameStore();

const showNewGameModal = ref(false);
const selectedMode = ref<GameMode>('pve');
const selectedSide = ref<PieceColor>('red');
const selectedTime = ref<number>(1000);

// 对局状态计算与文案判定
const matchStatusText = computed(() => {
  const over = gameStore.board.isGameOver();
  if (over.isOver) {
    return over.winner === 'red' ? '红方获胜' : over.winner === 'black' ? '黑方获胜' : '和棋';
  }
  if (gameStore.board.isInCheck()) {
    return '将军！';
  }
  if (gameStore.history.length === 0) {
    return '开局就绪';
  }
  return '激战中';
});

const matchStatusBadgeClass = computed(() => {
  const over = gameStore.board.isGameOver();
  if (over.isOver) return 'badge-win';
  if (gameStore.board.isInCheck()) return 'badge-check';
  if (gameStore.history.length === 0) return 'badge-ready';
  return 'badge-battle';
});

function toggleAiHint() {
  gameStore.toggleAnalysis();
}

function confirmNewGame() {
  gameStore.aiThinkingTimeMs = selectedTime.value;
  gameStore.newGame(selectedMode.value, selectedSide.value);
  showNewGameModal.value = false;
}

function handleResign() {
  if (confirm('确定要认输并结束当前对局吗？')) {
    gameStore.newGame(gameStore.gameMode, gameStore.playerSide);
  }
}
</script>

<style scoped>
.player-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  box-sizing: border-box;
  user-select: none;
}

/* 1. 双方选手卡 */
.players-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(28, 15, 9, 0.82);
  border: 1px solid #4a2d18;
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}

.player-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(42, 24, 15, 0.6);
  border: 1px solid #452916;
  position: relative;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.player-card.is-active-turn {
  border-color: #d4af37;
  background: rgba(70, 40, 24, 0.9);
  box-shadow: 0 0 14px rgba(212, 175, 55, 0.3), inset 0 0 8px rgba(212, 175, 55, 0.1);
}

.card-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Kaiti', 'STKaiti', serif;
  font-size: 20px;
  font-weight: bold;
  flex-shrink: 0;
  border: 1.5px solid #d4af37;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
}

.red-avatar {
  background: radial-gradient(circle, #b02424 0%, #680d0d 100%);
  color: #fff4d6;
}

.black-avatar {
  background: radial-gradient(circle, #383a42 0%, #151619 100%);
  color: #f0ede6;
}

.card-info {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-width: 0;
}

.player-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.player-name {
  font-size: 13px;
  font-weight: 600;
  color: #eed6b3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.turn-indicator {
  font-size: 10px;
  font-weight: bold;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid;
}

.red-indicator {
  background: rgba(176, 36, 36, 0.35);
  border-color: #e04848;
  color: #ff9e9e;
}

.black-indicator {
  background: rgba(60, 64, 75, 0.5);
  border-color: #8c92a4;
  color: #dbe0f0;
}

.player-sub-text {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  margin-top: 3px;
}

.side-tag {
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 600;
}

.red-tag {
  background: rgba(176, 36, 36, 0.3);
  color: #ff9494;
}

.black-tag {
  background: rgba(60, 64, 75, 0.4);
  color: #cfd4e3;
}

.motto-text {
  color: #9c7b5c;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ai-thinking-text {
  color: #ffd700;
  font-weight: 500;
  animation: pulseText 1.5s infinite;
}

.versus-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 2px 0;
}

.divider-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, #4a2c16, transparent);
}

.versus-badge {
  font-size: 10px;
  color: #9c7b5c;
  font-family: 'Kaiti', serif;
  letter-spacing: 2px;
}

/* 2. 盘况信息卡 */
.match-status-card {
  background: rgba(24, 13, 7, 0.82);
  border: 1px solid #4a2d18;
  border-radius: 10px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.status-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #3d2313;
  padding-bottom: 6px;
}

.status-header-title {
  font-size: 11px;
  color: #8c6f54;
  font-weight: 600;
}

.status-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: bold;
}

.badge-ready {
  background: rgba(60, 120, 80, 0.25);
  color: #8de0a6;
  border: 1px solid #3d8c58;
}

.badge-battle {
  background: rgba(180, 120, 30, 0.25);
  color: #ffd700;
  border: 1px solid #b8860b;
}

.badge-check {
  background: rgba(220, 40, 40, 0.3);
  color: #ff6666;
  border: 1px solid #e03030;
  animation: pulseCheck 1s infinite alternate ease-in-out;
}

.badge-win {
  background: rgba(212, 175, 55, 0.3);
  color: #fff2b2;
  border: 1px solid #d4af37;
}

.status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.status-grid-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-label {
  font-size: 10px;
  color: #8c6f54;
}

.item-value {
  font-size: 12px;
  color: #eed6b3;
  font-weight: 500;
}

.color-red {
  color: #ff8585;
  font-weight: bold;
}

.color-black {
  color: #9cb5db;
  font-weight: bold;
}

/* 3. 对局操作区域 */
.actions-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.primary-actions-row {
  display: grid;
  grid-template-columns: 1fr 1.2fr 1fr;
  gap: 6px;
}

.sub-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 4px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid #4a2c16;
  background: linear-gradient(180deg, #3d2212 0%, #29150a 100%);
  color: #eed6b3;
  transition: all 0.2s ease;
}

.sub-action-btn:hover:not(:disabled) {
  border-color: #d4af37;
  color: #ffd700;
  transform: translateY(-1px);
}

.sub-action-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.hint-btn.hint-active {
  background: rgba(212, 175, 55, 0.2);
  border-color: #d4af37;
  color: #ffd700;
  box-shadow: 0 0 8px rgba(212, 175, 55, 0.3);
}

.match-lifecycle-row {
  width: 100%;
}

.main-game-btn.start-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid #d4af37;
  background: linear-gradient(180deg, #a62424 0%, #691111 100%);
  color: #fff4d6;
  font-size: 13px;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(166, 36, 36, 0.4);
  transition: all 0.2s ease;
}

.main-game-btn.start-btn:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.battle-actions-group {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 6px;
}

.battle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid #4a2c16;
  transition: all 0.2s ease;
}

.restart-btn {
  background: #361f10;
  color: #eed6b3;
}

.restart-btn:hover {
  border-color: #d4af37;
  color: #ffd700;
}

.resign-btn {
  background: rgba(60, 20, 20, 0.6);
  border-color: #692828;
  color: #ff9999;
}

.resign-btn:hover {
  background: rgba(90, 25, 25, 0.8);
  border-color: #ff4d4d;
  color: #fff;
}

/* Modal 样式 */
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-card {
  width: 360px;
  background: #24140b;
  border: 1px solid #5a341a;
  border-radius: 12px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.8);
  overflow: hidden;
}

.modal-header {
  padding: 12px 16px;
  border-bottom: 1px solid #422512;
  background: #1c0e07;
  color: #eed6b3;
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-icon {
  color: #ffd700;
}

.modal-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.modal-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.setting-group label {
  font-size: 11px;
  color: #a88d74;
}

.select-row {
  display: flex;
  gap: 8px;
}

.option-chip {
  flex: 1;
  padding: 7px;
  font-size: 11px;
  border-radius: 6px;
  border: 1px solid #4a2c16;
  background: #190c06;
  color: #eed6b3;
  cursor: pointer;
  transition: all 0.2s;
}

.option-chip.selected {
  border-color: #d4af37;
  background: #4a2810;
  color: #fff4d6;
  font-weight: bold;
}

.red-chip.selected {
  background: #7a1515;
  border-color: #e04848;
}

.black-chip.selected {
  background: #2b2e38;
  border-color: #7b7f8c;
}

.modal-footer {
  padding: 10px 16px;
  border-top: 1px solid #422512;
  background: #1c0e07;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.modal-cancel-btn {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid #4a2c16;
  background: transparent;
  color: #a88d74;
  cursor: pointer;
  font-size: 12px;
}

.modal-confirm-btn {
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid #d4af37;
  background: linear-gradient(180deg, #b02424 0%, #751414 100%);
  color: #fff4d6;
  font-weight: bold;
  cursor: pointer;
  font-size: 12px;
}

@keyframes pulseText {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

@keyframes pulseCheck {
  0% { transform: scale(1); }
  100% { transform: scale(1.05); }
}
</style>
