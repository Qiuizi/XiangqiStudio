<template>
  <div class="study-view-container">
    <!-- Center Board -->
    <div class="study-board-area">
      <ChessBoard
        :grid="gameStore.grid"
        :selected-pos="gameStore.selectedPos"
        :legal-targets="gameStore.legalTargets"
        :last-move="gameStore.lastMove"
        :in-check-king-pos="gameStore.inCheckKingPos"
        :flipped="gameStore.flipped"
        :ai-arrow="gameStore.aiArrow"
        @select="onSelectSquare"
        @move="onMakeMove"
      />
    </div>

    <!-- Side Tools Panel -->
    <div class="study-tools-panel">
      <div class="panel-card">
        <h3>残局研究与摆子</h3>
        <p class="panel-desc">自由摆放棋子或输入残局 FEN，一键唤醒皮卡鱼进行深度计算与破解。</p>

        <!-- Turn Selection -->
        <div class="tool-section">
          <label>指定先行方</label>
          <div class="btn-group">
            <button 
              class="choice-btn red-choice" 
              :class="{ active: gameStore.activeColor === 'red' }"
              @click="setActiveColor('red')"
            >
              红方先行
            </button>
            <button 
              class="choice-btn black-choice" 
              :class="{ active: gameStore.activeColor === 'black' }"
              @click="setActiveColor('black')"
            >
              黑方先行
            </button>
          </div>
        </div>

        <!-- Quick Presets -->
        <div class="tool-section">
          <label>经典残局局面</label>
          <div class="presets-grid">
            <button class="preset-btn" @click="loadPreset('start')">初始全盘</button>
            <button class="preset-btn" @click="loadPreset('ma_bing')">马兵胜单缺象</button>
            <button class="preset-btn" @click="loadPreset('pao_bing')">炮兵胜双士</button>
            <button class="preset-btn" @click="loadPreset('che_bing')">车兵胜车卒</button>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="tool-section action-section">
          <button class="primary-action-btn" @click="startEngineSearch">
            <Cpu :size="16" />
            <span>皮卡鱼深度解局</span>
          </button>
          <button class="sec-action-btn" @click="resetBoard">
            <RotateCcw :size="16" />
            <span>恢复初始棋局</span>
          </button>
        </div>

        <!-- FEN Input/Output -->
        <div class="tool-section">
          <label>局面 FEN 串</label>
          <textarea :value="gameStore.board.getFen()" rows="3" readonly class="fen-display"></textarea>
          <button class="copy-btn" @click="copyFen">
            <Copy :size="14" />
            <span>复制 FEN</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Cpu, RotateCcw, Copy } from 'lucide-vue-next';
import { useGameStore } from '../stores/gameStore';
import ChessBoard from '../components/chess/ChessBoard.vue';
import type { PieceColor, Position } from '../core/chess/types';
import { INITIAL_FEN } from '../core/chess/fen';

const gameStore = useGameStore();

const PRESETS: Record<string, string> = {
  start: INITIAL_FEN,
  ma_bing: '4k4/4a4/4ba3/9/9/9/4N4/4B4/4P4/4K4 w - - 0 1',
  pao_bing: '4k4/4a4/4a4/9/9/9/4P4/4C4/9/4K4 w - - 0 1',
  che_bing: '4k4/9/9/9/4r4/4R4/4P4/9/9/4K4 w - - 0 1',
};

function onSelectSquare(pos: Position) {
  gameStore.selectSquare(pos);
}

function onMakeMove(from: Position, to: Position) {
  gameStore.makeUserMove(from, to);
}

function setActiveColor(color: PieceColor) {
  gameStore.board.activeColor = color;
}

function loadPreset(key: string) {
  const fen = PRESETS[key] || INITIAL_FEN;
  gameStore.board.reset(fen);
  gameStore.history.length = 0;
  gameStore.currentStep = 0;
}

function resetBoard() {
  gameStore.board.reset(INITIAL_FEN);
  gameStore.history.length = 0;
  gameStore.currentStep = 0;
}

function startEngineSearch() {
  gameStore.triggerAnalysis(false);
}

async function copyFen() {
  const fen = gameStore.board.getFen();
  try {
    await navigator.clipboard.writeText(fen);
    alert('已成功复制当前局面 FEN！');
  } catch {
    alert(fen);
  }
}
</script>

<style scoped>
.study-view-container {
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

.tool-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tool-section label {
  font-size: 12px;
  color: #a88d74;
}

.btn-group {
  display: flex;
  gap: 10px;
}

.choice-btn {
  flex: 1;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid #4a2c16;
  background: #190c06;
  color: #eed6b3;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.choice-btn.active.red-choice {
  background: #7a1515;
  border-color: #e04848;
  color: #fff4d6;
  font-weight: bold;
}

.choice-btn.active.black-choice {
  background: #2b2e38;
  border-color: #7b7f8c;
  color: #cfd4e3;
  font-weight: bold;
}

.presets-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.preset-btn {
  padding: 8px 6px;
  border-radius: 6px;
  border: 1px solid #3d2313;
  background: #201007;
  color: #eed6b3;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.preset-btn:hover {
  border-color: #d4af37;
  color: #ffd700;
}

.action-section {
  gap: 10px;
}

.primary-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #d4af37;
  background: linear-gradient(180deg, #b02424 0%, #751414 100%);
  color: #fff4d6;
  font-size: 13px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.primary-action-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(176, 36, 36, 0.4);
}

.sec-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid #4a2c16;
  background: #29150a;
  color: #eed6b3;
  font-size: 12px;
  cursor: pointer;
}

.sec-action-btn:hover {
  border-color: #d4af37;
}

.fen-display {
  background: rgba(15, 8, 4, 0.7);
  border: 1px solid #3d2313;
  border-radius: 6px;
  padding: 8px;
  font-size: 11px;
  color: #eed6b3;
  font-family: monospace;
  resize: none;
}

.copy-btn {
  align-self: flex-end;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 4px;
  border: 1px solid #4a2c16;
  background: #29150a;
  color: #eed6b3;
  font-size: 11px;
  cursor: pointer;
}
</style>
