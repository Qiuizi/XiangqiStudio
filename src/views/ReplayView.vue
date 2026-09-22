<template>
  <div class="replay-view-container">
    <!-- Center Board -->
    <div class="replay-board-area">
      <ChessBoard
        :grid="replayGrid"
        :selected-pos="null"
        :legal-targets="[]"
        :last-move="activeMove"
        :in-check-king-pos="null"
        :flipped="gameStore.flipped"
      />
    </div>

    <!-- Replay Control and Notation Panel -->
    <div class="replay-controls-panel">
      <div class="panel-card">
        <h3>棋谱复盘与推演</h3>
        <p class="panel-desc">逐步回放本局红黑双方每一步着法，研究局势变化。</p>

        <!-- Current Step Info -->
        <div class="step-summary-box">
          <div class="step-num-badge">第 {{ gameStore.currentStep }} 步</div>
          <div class="step-notation-text">
            {{ activeMove ? activeMove.notation : '初始局面' }}
          </div>
        </div>

        <!-- Navigation Buttons -->
        <div class="nav-btn-row">
          <button class="nav-control-btn" :disabled="gameStore.currentStep === 0" @click="goToStep(0)">
            <ChevronsLeft :size="18" />
            <span>起点</span>
          </button>
          <button class="nav-control-btn" :disabled="gameStore.currentStep === 0" @click="goToStep(gameStore.currentStep - 1)">
            <ChevronLeft :size="18" />
            <span>上一步</span>
          </button>
          <button class="nav-control-btn" :disabled="gameStore.currentStep >= gameStore.history.length" @click="goToStep(gameStore.currentStep + 1)">
            <ChevronRight :size="18" />
            <span>下一步</span>
          </button>
          <button class="nav-control-btn" :disabled="gameStore.currentStep >= gameStore.history.length" @click="goToStep(gameStore.history.length)">
            <ChevronsRight :size="18" />
            <span>终点</span>
          </button>
        </div>

        <!-- Moves list table -->
        <div class="replay-list-box">
          <div 
            v-for="(move, idx) in gameStore.history" 
            :key="'rep_' + idx"
            class="replay-item"
            :class="{ active: gameStore.currentStep === idx + 1 }"
            @click="goToStep(idx + 1)"
          >
            <span class="rep-idx">{{ idx + 1 }}.</span>
            <span class="rep-side" :class="move.piece.color">{{ move.piece.color === 'red' ? '红' : '黑' }}</span>
            <span class="rep-notation">{{ move.notation }}</span>
            <span class="rep-uci">({{ move.uci }})</span>
          </div>
          <div v-if="gameStore.history.length === 0" class="empty-hint">
            当前尚无对局历史，请在对战模式走子后再进行复盘。
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-vue-next';
import { useGameStore } from '../stores/gameStore';
import ChessBoard from '../components/chess/ChessBoard.vue';
import { XiangqiBoard } from '../core/chess/board';
import { INITIAL_FEN } from '../core/chess/fen';

const gameStore = useGameStore();

const activeMove = computed(() => {
  if (gameStore.currentStep === 0) return null;
  return gameStore.history[gameStore.currentStep - 1] || null;
});

// Replay board reconstruction at step
const replayGrid = computed(() => {
  const replayBoard = new XiangqiBoard(INITIAL_FEN);
  for (let i = 0; i < gameStore.currentStep; i++) {
    const m = gameStore.history[i];
    if (m) {
      replayBoard.makeMove(m.from, m.to);
    }
  }
  return replayBoard.grid;
});

function goToStep(step: number) {
  gameStore.jumpToStep(step);
}
</script>

<style scoped>
.replay-view-container {
  display: flex;
  flex: 1;
  align-items: flex-start;
  justify-content: center;
  gap: 24px;
  padding: 12px 16px;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.replay-board-area {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow: hidden;
}

.replay-controls-panel {
  width: 320px;
}

.panel-card {
  background: rgba(26, 15, 9, 0.75);
  border: 1px solid #4a2d18;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.panel-card h3 {
  margin: 0;
  font-size: 16px;
  color: #eed6b3;
  font-weight: 600;
}

.panel-desc {
  margin: 0;
  font-size: 12px;
  color: #9c7b5c;
  line-height: 1.5;
}

.step-summary-box {
  background: rgba(18, 9, 5, 0.7);
  border: 1px solid #3d2313;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.step-num-badge {
  padding: 4px 8px;
  border-radius: 4px;
  background: #4a2810;
  color: #ffd700;
  font-size: 12px;
  font-weight: bold;
}

.step-notation-text {
  font-family: 'Kaiti', serif;
  font-size: 18px;
  color: #eed6b3;
  font-weight: bold;
}

.nav-btn-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.nav-control-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  border-radius: 6px;
  border: 1px solid #4a2c16;
  background: #24140b;
  color: #eed6b3;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.nav-control-btn:hover:not(:disabled) {
  border-color: #d4af37;
  color: #ffd700;
}

.nav-control-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.replay-list-box {
  height: 240px;
  overflow-y: auto;
  border: 1px solid #3d2313;
  border-radius: 6px;
  background: rgba(15, 8, 4, 0.6);
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.replay-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.replay-item:hover {
  background: rgba(212, 175, 55, 0.12);
}

.replay-item.active {
  background: #6e3e1b;
  color: #fff4d6;
  font-weight: bold;
}

.rep-idx {
  color: #8c6f54;
  width: 24px;
}

.rep-side.red {
  color: #ff8585;
}

.rep-side.black {
  color: #9cb5db;
}

.rep-notation {
  font-family: 'Kaiti', serif;
  font-size: 14px;
  flex-grow: 1;
}

.rep-uci {
  color: #6e5642;
  font-size: 10px;
}

.empty-hint {
  color: #6e5642;
  padding: 40px 10px;
  font-size: 12px;
  text-align: center;
}
</style>
