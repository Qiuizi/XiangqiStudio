<template>
  <div class="replay-view-container">
    <!-- Center Board Area -->
    <div class="replay-board-area">
      <ChessBoard
        :grid="replayStore.grid"
        :selected-pos="replayStore.selectedPos"
        :legal-targets="replayStore.legalTargets"
        :last-move="replayStore.lastMove"
        :in-check-king-pos="replayStore.inCheckKingPos"
        :flipped="isFlipped"
        @select="onSelectSquare"
        @move="onMakeMove"
      />
    </div>

    <!-- Right Column: Replay & Study Controls -->
    <div class="replay-controls-panel">
      <div class="panel-card">
        <!-- Header & Mode Switcher -->
        <div class="panel-header">
          <div class="header-title-box">
            <h3 class="panel-title">复盘打谱与推演</h3>
            <span class="active-mode-badge" :class="replayStore.mode">
              {{ replayStore.mode === 'manual' ? '手动打谱中' : '棋谱回放中' }}
            </span>
          </div>

          <!-- 双模式切换按钮组 -->
          <div class="mode-tab-group">
            <button 
              class="mode-tab-btn" 
              :class="{ active: replayStore.mode === 'replay' }"
              title="只读浏览每一步棋，点击棋盘不会修改棋谱"
              @click="replayStore.setMode('replay')"
            >
              <Eye :size="13" />
              <span>棋谱回放</span>
            </button>
            <button 
              class="mode-tab-btn" 
              :class="{ active: replayStore.mode === 'manual' }"
              title="自由走子排局，红黑交替，可从任意历史局面创建变化分支"
              @click="replayStore.setMode('manual')"
            >
              <Edit3 :size="13" />
              <span>手动打谱</span>
            </button>
          </div>
        </div>

        <!-- 模式说明与动态提示 -->
        <p class="panel-desc">
          <template v-if="replayStore.mode === 'manual'">
            💡 <strong>手动打谱</strong>：直接点击棋子落子，红黑自动交替；若在历史节点走出新招，将自动派生为变化分支，不破坏原主线。
          </template>
          <template v-else>
            🔍 <strong>棋谱回放</strong>：只读浏览历史局面，支持步进、跳转；切至手动打谱可走出不同变化。
          </template>
        </p>

        <!-- Current Step Info & Branch Indicator -->
        <div class="step-summary-box">
          <div class="step-left">
            <div class="step-num-badge">
              第 {{ replayStore.currentNode?.stepIndex || 0 }} 步
            </div>
            <div class="step-notation-text">
              {{ replayStore.lastMove ? replayStore.lastMove.notation : '初始局面 (红先)' }}
            </div>
          </div>

          <div class="branch-status-tag">
            <span v-if="replayStore.isCurrentOnMainline" class="mainline-tag">主线</span>
            <span v-else class="variation-tag">变化分支</span>
            <button 
              v-if="!replayStore.isCurrentOnMainline" 
              class="return-mainline-btn" 
              title="返回原始主线在同一步数的节点"
              @click="replayStore.returnToMainline()"
            >
              <CornerUpLeft :size="12" />
              <span>回主线</span>
            </button>
          </div>
        </div>

        <!-- 候选分支切换栏 (当父节点有多个变化走法时呈现) -->
        <div v-if="replayStore.siblingVariations.length > 1" class="variation-selector-box">
          <div class="variation-selector-title">
            <span>该局面存在 {{ replayStore.siblingVariations.length }} 种应对变化：</span>
          </div>
          <div class="variation-pill-list">
            <button 
              v-for="(item, idx) in replayStore.siblingVariations" 
              :key="item.node.id"
              class="variation-pill"
              :class="{ active: item.isActive, isMain: item.isMain }"
              @click="replayStore.switchVariation(item.node.id)"
            >
              <span class="pill-prefix">{{ item.isMain ? '主' : `变${idx}` }}:</span>
              <span class="pill-notation">{{ item.node.move?.notation }}</span>
            </button>
          </div>
        </div>

        <!-- Navigation Buttons -->
        <div class="nav-btn-row">
          <button 
            class="nav-control-btn" 
            :disabled="!replayStore.currentNode?.parentId" 
            title="回到起点 (快捷键 Home)"
            @click="replayStore.goToFirst()"
          >
            <ChevronsLeft :size="16" />
            <span>起点</span>
          </button>
          <button 
            class="nav-control-btn" 
            :disabled="!replayStore.currentNode?.parentId" 
            title="上一步 (快捷键 ←)"
            @click="replayStore.goToPrev()"
          >
            <ChevronLeft :size="16" />
            <span>上一步</span>
          </button>
          <button 
            class="nav-control-btn" 
            :disabled="!replayStore.currentNode || replayStore.currentNode.childrenIds.length === 0" 
            title="下一步 (快捷键 →)"
            @click="replayStore.goToNext()"
          >
            <ChevronRight :size="16" />
            <span>下一步</span>
          </button>
          <button 
            class="nav-control-btn" 
            :disabled="!replayStore.currentNode || replayStore.currentNode.childrenIds.length === 0" 
            title="走至终点 (快捷键 End)"
            @click="replayStore.goToLast()"
          >
            <ChevronsRight :size="16" />
            <span>终点</span>
          </button>
        </div>

        <!-- Utility Action Bar (打谱辅助工具) -->
        <div class="study-action-bar">
          <button 
            v-if="replayStore.mode === 'manual'"
            class="study-tool-btn" 
            :disabled="!replayStore.currentNode?.parentId" 
            title="撤销最后一步打谱"
            @click="replayStore.undoCurrentMove()"
          >
            <Undo2 :size="13" />
            <span>撤销一步</span>
          </button>

          <button 
            class="study-tool-btn" 
            title="清空当前打谱树，回到标准初始局面重新打谱"
            @click="onResetStudy"
          >
            <FilePlus2 :size="13" />
            <span>新建打谱</span>
          </button>

          <button 
            v-if="gameStore.history.length > 0"
            class="study-tool-btn" 
            title="载入对弈模式中的最新棋谱"
            @click="onSyncFromBattle"
          >
            <RefreshCw :size="13" />
            <span>同步对战</span>
          </button>

          <button 
            class="study-tool-btn" 
            title="翻转黑红方视角"
            @click="isFlipped = !isFlipped"
          >
            <RotateCw :size="13" />
            <span>翻转</span>
          </button>
        </div>

        <!-- Moves List Table -->
        <div class="replay-list-container">
          <div class="replay-list-header">
            <span>当前线路着法记录 ({{ replayStore.activeMovePath.length }} 步)</span>
            <span class="active-side-indicator">
              轮到: <strong :class="replayStore.activeColor">{{ replayStore.activeColor === 'red' ? '红先' : '黑方' }}</strong>
            </span>
          </div>

          <div class="replay-list-box">
            <div 
              v-for="(node, idx) in replayStore.activeMovePath" 
              :key="node.id"
              class="replay-item"
              :class="{ 
                active: replayStore.currentNodeId === node.id,
                'is-variation': node.parentId && replayStore.treeNodes[node.parentId]?.childrenIds[0] !== node.id
              }"
              @click="replayStore.jumpToNode(node.id)"
            >
              <span class="rep-idx">{{ idx + 1 }}.</span>
              <span class="rep-side" :class="node.move?.piece.color">
                {{ node.move?.piece.color === 'red' ? '红' : '黑' }}
              </span>
              <span class="rep-notation">{{ node.move?.notation || '-' }}</span>
              <span v-if="node.parentId && replayStore.treeNodes[node.parentId]?.childrenIds.length > 1" class="rep-branch-badge" title="该步节点存在多个候选分支">
                分支
              </span>
              <span class="rep-uci">({{ node.move?.uci || '' }})</span>
            </div>

            <!-- 空状态提示与快捷开始入口 -->
            <div v-if="replayStore.activeMovePath.length === 0" class="empty-hint-card">
              <div class="empty-icon-wrap">
                <BookOpen :size="28" />
              </div>
              <p class="empty-text">当前暂无走子记录</p>
              <p class="empty-subtext">已为您准备好标准初始盘面，切换至【手动打谱】即可直接排局推演！</p>
              <button 
                v-if="replayStore.mode !== 'manual'" 
                class="start-manual-btn" 
                @click="replayStore.setMode('manual')"
              >
                <Edit3 :size="14" />
                <span>立即开始手动打谱</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 底部状态消息条 -->
        <div v-if="replayStore.statusMessage" class="status-msg-footer">
          <span class="msg-dot" />
          <span class="msg-text">{{ replayStore.statusMessage }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  Eye, 
  Edit3, 
  Undo2, 
  RotateCw, 
  CornerUpLeft, 
  BookOpen, 
  FilePlus2, 
  RefreshCw 
} from 'lucide-vue-next';
import { useGameStore } from '../stores/gameStore';
import { useReplayStore } from '../stores/replayStore';
import ChessBoard from '../components/chess/ChessBoard.vue';
import type { Position } from '../core/chess/types';

const gameStore = useGameStore();
const replayStore = useReplayStore();

const isFlipped = ref<boolean>(false);

function onSelectSquare(pos: Position) {
  replayStore.selectSquare(pos);
}

function onMakeMove(from: Position, to: Position) {
  replayStore.makeMove(from, to);
}

function onResetStudy() {
  replayStore.initEmptyGame();
  replayStore.setMode('manual');
}

function onSyncFromBattle() {
  if (gameStore.history.length === 0) return;
  replayStore.loadHistory(gameStore.history);
  replayStore.setMode('replay');
}

onMounted(() => {
  // 首次挂载时如果复盘没有数据：
  // 1. 若对战有历史，自动载入对战历史并设为回放模式；
  // 2. 若对战也没有历史，默认直接开启手动打谱模式，免去用户额外操作！
  if (!replayStore.hasAnyHistory) {
    if (gameStore.history.length > 0) {
      replayStore.loadHistory(gameStore.history);
      replayStore.setMode('replay');
    } else {
      replayStore.initEmptyGame();
      replayStore.setMode('manual');
    }
  }
});
</script>

<style scoped>
.replay-view-container {
  display: flex;
  flex: 1;
  align-items: flex-start;
  justify-content: center;
  gap: 20px;
  padding: 12px 16px;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
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
  width: 330px;
  height: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.panel-card {
  background: rgba(26, 15, 9, 0.92);
  border: 1px solid #4a2d18;
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  box-sizing: border-box;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.panel-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.header-title-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-title {
  margin: 0;
  font-size: 16px;
  color: #eed6b3;
  font-weight: 600;
  font-family: 'Kaiti', serif;
  letter-spacing: 1px;
}

.active-mode-badge {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 4px;
  border: 1px solid transparent;
}

.active-mode-badge.manual {
  background: rgba(212, 175, 55, 0.15);
  color: #ffd700;
  border-color: rgba(212, 175, 55, 0.4);
}

.active-mode-badge.replay {
  background: rgba(140, 110, 80, 0.2);
  color: #c9aa88;
  border-color: #5a3820;
}

/* 模式切换双按钮 */
.mode-tab-group {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  background: rgba(16, 8, 4, 0.6);
  padding: 3px;
  border-radius: 6px;
  border: 1px solid #3d2313;
}

.mode-tab-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 4px;
  border: 1px solid transparent;
  background: transparent;
  color: #a88d74;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mode-tab-btn:hover {
  color: #eed6b3;
  background: rgba(255, 255, 255, 0.04);
}

.mode-tab-btn.active {
  background: #5a3014;
  border-color: #8c5224;
  color: #ffd700;
  font-weight: bold;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.panel-desc {
  margin: 0;
  font-size: 11px;
  color: #9c7b5c;
  line-height: 1.5;
  background: rgba(14, 7, 3, 0.4);
  padding: 8px 10px;
  border-radius: 5px;
  border-left: 3px solid #7d4924;
}

/* 步数概览与分支指示 */
.step-summary-box {
  background: rgba(18, 9, 5, 0.85);
  border: 1px solid #3d2313;
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.step-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.step-num-badge {
  padding: 3px 8px;
  border-radius: 4px;
  background: #4a2810;
  color: #ffd700;
  font-size: 11px;
  font-weight: bold;
}

.step-notation-text {
  font-family: 'Kaiti', serif;
  font-size: 16px;
  color: #eed6b3;
  font-weight: bold;
}

.branch-status-tag {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mainline-tag {
  font-size: 11px;
  color: #8fba8f;
  background: rgba(46, 139, 87, 0.15);
  border: 1px solid rgba(46, 139, 87, 0.3);
  padding: 2px 6px;
  border-radius: 4px;
}

.variation-tag {
  font-size: 11px;
  color: #e6a23c;
  background: rgba(230, 162, 60, 0.15);
  border: 1px solid rgba(230, 162, 60, 0.3);
  padding: 2px 6px;
  border-radius: 4px;
}

.return-mainline-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  background: #3d200e;
  border: 1px solid #7d4924;
  color: #ffcc66;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.return-mainline-btn:hover {
  background: #5c3216;
  border-color: #d4af37;
  color: #ffd700;
}

/* 分支候选胶囊栏 */
.variation-selector-box {
  background: rgba(22, 12, 6, 0.7);
  border: 1px dashed #6b4020;
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.variation-selector-title {
  font-size: 10px;
  color: #c9aa88;
}

.variation-pill-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.variation-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #2b160a;
  border: 1px solid #4a2810;
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 11px;
  color: #eed6b3;
  cursor: pointer;
  transition: all 0.2s;
}

.variation-pill:hover {
  border-color: #ffd700;
}

.variation-pill.active {
  background: #5a2e12;
  border-color: #ffd700;
  color: #ffd700;
  font-weight: bold;
}

.pill-prefix {
  font-size: 9px;
  color: #d4af37;
}

.pill-notation {
  font-family: 'Kaiti', serif;
}

/* 导航按键 */
.nav-btn-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.nav-control-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 7px 4px;
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
  background: #3d2010;
}

.nav-control-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* 打谱辅助工具条 */
.study-action-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.study-tool-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 5px 6px;
  background: rgba(36, 18, 10, 0.9);
  border: 1px solid #4a2810;
  border-radius: 5px;
  color: #c9aa88;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.study-tool-btn:hover:not(:disabled) {
  border-color: #d4af37;
  color: #ffd700;
  background: #422210;
}

.study-tool-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* 着法列表容器 */
.replay-list-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  border: 1px solid #3d2313;
  border-radius: 6px;
  background: rgba(14, 7, 3, 0.7);
  overflow: hidden;
}

.replay-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: rgba(28, 15, 8, 0.9);
  border-bottom: 1px solid #3d2313;
  font-size: 11px;
  color: #9c7b5c;
}

.active-side-indicator strong.red {
  color: #ff8585;
}

.active-side-indicator strong.black {
  color: #9cb5db;
}

.replay-list-box {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.replay-list-box::-webkit-scrollbar {
  width: 4px;
}
.replay-list-box::-webkit-scrollbar-thumb {
  background: #4a2c16;
  border-radius: 2px;
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

.replay-item.is-variation {
  border-left: 2px solid #e6a23c;
  background: rgba(230, 162, 60, 0.06);
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
  font-size: 13px;
  flex-grow: 1;
}

.rep-branch-badge {
  font-size: 9px;
  color: #e6a23c;
  background: rgba(230, 162, 60, 0.2);
  padding: 1px 4px;
  border-radius: 3px;
}

.rep-uci {
  color: #6e5642;
  font-size: 10px;
}

/* 空状态卡片 */
.empty-hint-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px 16px;
  text-align: center;
  gap: 8px;
}

.empty-icon-wrap {
  color: #8c5d35;
  margin-bottom: 4px;
}

.empty-text {
  margin: 0;
  font-size: 13px;
  color: #eed6b3;
  font-weight: bold;
}

.empty-subtext {
  margin: 0;
  font-size: 11px;
  color: #8c6f54;
  line-height: 1.5;
}

.start-manual-btn {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  background: #5a3014;
  border: 1px solid #d4af37;
  border-radius: 6px;
  color: #ffd700;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

.start-manual-btn:hover {
  background: #753f1a;
  transform: translateY(-1px);
}

/* 底部状态消息 */
.status-msg-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 4px;
  background: rgba(16, 8, 4, 0.8);
  border: 1px solid #3a1e0c;
  font-size: 11px;
  color: #c9aa88;
}

.msg-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #d4af37;
}

.msg-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
