<template>
  <div class="lobby-container">
    <div class="lobby-content">
      <!-- Title & Branding -->
      <div class="lobby-hero">
        <div class="hero-seal">
          <span class="seal-character">象</span>
        </div>
        <h1 class="hero-title">象棋研究室</h1>
        <div class="hero-subtitle">XIANGQI STUDIO · 搭载 PIKAFISH 顶尖深度计算引擎</div>
        <div class="hero-divider">
          <span class="diamond">◆</span>
        </div>
      </div>

      <!-- Main Action Cards -->
      <div class="modes-grid">
        <!-- Mode 1: AI Battle -->
        <div class="mode-card featured" @click="startGame('pve')">
          <div class="card-icon-wrapper red-icon">
            <Swords :size="32" />
          </div>
          <div class="card-body">
            <h3 class="card-title">人机对战</h3>
            <p class="card-desc">挑战当世无双的皮卡鱼 (Pikafish) 神经网络引擎，支持自由调整思考时间与红黑先后手。</p>
          </div>
          <div class="card-footer">
            <span class="action-link">立即挑战 &rarr;</span>
          </div>
        </div>

        <!-- Mode 2: Local PvP -->
        <div class="mode-card" @click="startGame('pvp')">
          <div class="card-icon-wrapper amber-icon">
            <Users :size="28" />
          </div>
          <div class="card-body">
            <h3 class="card-title">同屏对弈</h3>
            <p class="card-desc">离线双人本地对战，原汁原味的古典木质棋盘体验与真实走棋音效。</p>
          </div>
          <div class="card-footer">
            <span class="action-link">进入棋局 &rarr;</span>
          </div>
        </div>

        <!-- Mode 3: Replay -->
        <div class="mode-card" @click="$emit('select-view', 'replay')">
          <div class="card-icon-wrapper gold-icon">
            <BookOpen :size="28" />
          </div>
          <div class="card-body">
            <h3 class="card-title">棋谱复盘</h3>
            <p class="card-desc">逐步回放推演历史对局，复盘分析每一步棋局优劣变化与胜负关键。</p>
          </div>
          <div class="card-footer">
            <span class="action-link">打开复盘 &rarr;</span>
          </div>
        </div>

        <!-- Mode 4: Study -->
        <div class="mode-card" @click="$emit('select-view', 'study')">
          <div class="card-icon-wrapper jade-icon">
            <FlaskConical :size="28" />
          </div>
          <div class="card-body">
            <h3 class="card-title">残局研究</h3>
            <p class="card-desc">自由摆放棋子，导入经典排局残局 FEN，让皮卡鱼 AI 寻找绝杀解法。</p>
          </div>
          <div class="card-footer">
            <span class="action-link">开始研究 &rarr;</span>
          </div>
        </div>
      </div>

      <!-- Engine Status Bar at bottom -->
      <div class="lobby-engine-bar">
        <div class="bar-left">
          <span class="bar-indicator" :class="{ ready: gameStore.isEngineReady }"></span>
          <span class="bar-text">引擎状态: {{ gameStore.engineStatusText }}</span>
        </div>
        <div class="bar-right">
          <span>{{ gameStore.engineName }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Swords, Users, BookOpen, FlaskConical } from 'lucide-vue-next';
import { useGameStore, type GameMode } from '../stores/gameStore';

const emit = defineEmits<{
  (e: 'select-view', view: 'game' | 'replay' | 'study'): void;
}>();

const gameStore = useGameStore();

function startGame(mode: GameMode) {
  gameStore.newGame(mode, 'red');
  emit('select-view', 'game');
}
</script>

<style scoped>
.lobby-container {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  background: radial-gradient(circle at 50% 30%, #29160d 0%, #170b06 100%);
  user-select: none;
}

.lobby-content {
  max-width: 900px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 36px;
}

.lobby-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.hero-seal {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: radial-gradient(circle, #b72b2b 0%, #680d0d 100%);
  border: 2px solid #d4af37;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
}

.seal-character {
  font-family: 'Kaiti', serif;
  font-size: 32px;
  font-weight: 900;
  color: #fff3d6;
}

.hero-title {
  font-family: 'Kaiti', 'STKaiti', serif;
  font-size: 32px;
  font-weight: bold;
  color: #eed6b3;
  margin: 4px 0 0 0;
  letter-spacing: 2px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.6);
}

.hero-subtitle {
  font-size: 11px;
  color: #a88d74;
  letter-spacing: 2.5px;
}

.hero-divider {
  color: #d4af37;
  font-size: 10px;
  margin-top: 4px;
}

.modes-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  width: 100%;
}

.mode-card {
  background: rgba(36, 20, 12, 0.8);
  border: 1px solid #4a2c16;
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
}

.mode-card:hover {
  transform: translateY(-4px);
  border-color: #d4af37;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.6), 0 0 16px rgba(212, 175, 55, 0.2);
  background: rgba(48, 27, 16, 0.9);
}

.mode-card.featured {
  border-color: #8c4225;
  background: linear-gradient(135deg, rgba(64, 28, 14, 0.85) 0%, rgba(36, 17, 9, 0.85) 100%);
}

.card-icon-wrapper {
  width: 52px;
  height: 52px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid;
}

.red-icon {
  background: rgba(176, 36, 36, 0.2);
  border-color: #b02424;
  color: #ff7b7b;
}

.amber-icon {
  background: rgba(212, 120, 30, 0.2);
  border-color: #d4781e;
  color: #ffaa5c;
}

.gold-icon {
  background: rgba(212, 175, 55, 0.2);
  border-color: #d4af37;
  color: #ffd700;
}

.jade-icon {
  background: rgba(56, 140, 95, 0.2);
  border-color: #388c5f;
  color: #7ce8aa;
}

.card-title {
  margin: 0 0 6px 0;
  font-size: 18px;
  font-weight: 600;
  color: #eed6b3;
}

.card-desc {
  margin: 0;
  font-size: 13px;
  color: #a88d74;
  line-height: 1.5;
}

.card-footer {
  margin-top: auto;
}

.action-link {
  font-size: 13px;
  font-weight: 600;
  color: #d4af37;
}

.lobby-engine-bar {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 18px;
  border-radius: 8px;
  background: rgba(18, 9, 5, 0.8);
  border: 1px solid #3d2313;
  font-size: 12px;
  color: #8c6f54;
}

.bar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bar-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #6e5642;
}

.bar-indicator.ready {
  background: #34c759;
  box-shadow: 0 0 8px #34c759;
}
</style>
