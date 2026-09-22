<template>
  <div class="game-view-container" :class="{ 'left-collapsed': isLeftCollapsed, 'right-collapsed': isRightCollapsed }">
    <!-- Left Column: Players and Match Controls (Top-aligned, Collapsible) -->
    <aside class="column-left" :class="{ collapsed: isLeftCollapsed }">
      <div v-show="!isLeftCollapsed" class="panel-wrapper">
        <PlayerPanel />
      </div>
      <button 
        class="sidebar-toggle-btn left-toggle" 
        :title="isLeftCollapsed ? '展开对局控制面板' : '折叠对局控制面板'"
        @click="isLeftCollapsed = !isLeftCollapsed"
      >
        <ChevronLeft v-if="!isLeftCollapsed" :size="14" />
        <ChevronRight v-else :size="14" />
        <span v-if="isLeftCollapsed" class="vertical-tag">对局面板</span>
      </button>
    </aside>

    <!-- Center Column: Master Board and Evaluation Bar (Top-aligned, Priority Space) -->
    <main class="column-center">
      <div class="board-arena">
        <EvalBar 
          :score-cp="gameStore.engineInfo.scoreCp" 
          :score-mate="gameStore.engineInfo.scoreMate" 
        />
        <ChessBoard
          :grid="gameStore.grid"
          :selected-pos="gameStore.selectedPos"
          :legal-targets="gameStore.legalTargets"
          :last-move="gameStore.lastMove"
          :in-check-king-pos="gameStore.inCheckKingPos"
          :flipped="gameStore.flipped"
          :ai-arrow="gameStore.autoAnalysis ? gameStore.aiArrow : null"
          @select="onSelectSquare"
          @move="onMakeMove"
        />
      </div>
    </main>

    <!-- Right Column: Notation History & AI Engine Stats (Top-aligned, Collapsible) -->
    <aside class="column-right" :class="{ collapsed: isRightCollapsed }">
      <button 
        class="sidebar-toggle-btn right-toggle" 
        :title="isRightCollapsed ? '展开棋谱与分析' : '折叠棋谱与分析'"
        @click="isRightCollapsed = !isRightCollapsed"
      >
        <ChevronRight v-if="!isRightCollapsed" :size="14" />
        <ChevronLeft v-else :size="14" />
        <span v-if="isRightCollapsed" class="vertical-tag">棋谱分析</span>
      </button>
      <div v-show="!isRightCollapsed" class="panel-wrapper">
        <RightTabPanel />
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { useGameStore } from '../stores/gameStore';
import PlayerPanel from '../components/game/PlayerPanel.vue';
import ChessBoard from '../components/chess/ChessBoard.vue';
import EvalBar from '../components/chess/EvalBar.vue';
import RightTabPanel from '../components/game/RightTabPanel.vue';
import type { Position } from '../core/chess/types';

const gameStore = useGameStore();

const isLeftCollapsed = ref(false);
const isRightCollapsed = ref(false);

function onSelectSquare(pos: Position) {
  gameStore.selectSquare(pos);
}

function onMakeMove(from: Position, to: Position) {
  gameStore.makeUserMove(from, to);
}

onMounted(() => {
  // If engine is not initialized yet, trigger initialization
  gameStore.initEngine();
});
</script>

<style scoped>
.game-view-container {
  display: flex;
  flex: 1;
  align-items: flex-start;
  justify-content: center;
  gap: 16px;
  padding: 10px 16px;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  position: relative;
}

/* 侧栏容器公共样式 */
.column-left,
.column-right {
  display: flex;
  flex-direction: row;
  height: 100%;
  position: relative;
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
}

.panel-wrapper {
  flex: 1;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
}

/* 滚动条精致化 */
.panel-wrapper::-webkit-scrollbar {
  width: 4px;
}
.panel-wrapper::-webkit-scrollbar-thumb {
  background: #4a2c16;
  border-radius: 2px;
}

/* 左侧面板宽度 */
.column-left {
  width: 275px;
}
.column-left.collapsed {
  width: 28px;
}

/* 右侧面板宽度 */
.column-right {
  width: 320px;
}
.column-right.collapsed {
  width: 28px;
}

/* 侧边栏折叠/展开按钮 */
.sidebar-toggle-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 48px;
  background: rgba(42, 22, 12, 0.85);
  border: 1px solid #5a341a;
  border-radius: 6px;
  color: #a88d74;
  cursor: pointer;
  padding: 0;
  margin: auto 0;
  transition: all 0.2s ease;
  z-index: 10;
  user-select: none;
  flex-shrink: 0;
}

.left-toggle {
  margin-left: 4px;
}
.right-toggle {
  margin-right: 4px;
}

.column-left.collapsed .sidebar-toggle-btn,
.column-right.collapsed .sidebar-toggle-btn {
  width: 26px;
  height: 96px;
  background: rgba(36, 18, 10, 0.95);
  border-color: #7d4924;
  gap: 6px;
}

.sidebar-toggle-btn:hover {
  background: #5a3014;
  color: #ffd700;
  border-color: #d4af37;
}

.vertical-tag {
  writing-mode: vertical-rl;
  font-size: 10px;
  letter-spacing: 2px;
  color: #eed6b3;
  font-family: 'Kaiti', serif;
}

/* 中央棋盘区域：绝对优先弹性占满 */
.column-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  position: relative;
}

.board-arena {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  position: relative;
  margin-bottom: 28px;
  /* 柔和的实木棋盘环境暗金聚光光晕 */
  filter: drop-shadow(0 14px 36px rgba(0, 0, 0, 0.75));
}

/* 响应式断点适配 */
@media (max-width: 1260px) {
  .column-left {
    width: 245px;
  }
  .column-right {
    width: 280px;
  }
  .game-view-container {
    gap: 10px;
    padding: 8px 10px;
  }
}

@media (max-width: 1080px) {
  /* 屏幕过窄时自动缩小侧栏，优先保证中央棋盘有足够大视野 */
  .column-right:not(.collapsed) {
    width: 260px;
  }
}
</style>
