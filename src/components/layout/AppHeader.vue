<template>
  <header class="app-header">
    <div class="header-left">
      <div class="logo-badge">
        <span class="logo-char">象</span>
      </div>
      <div class="logo-text">
        <span class="title-cn">象棋研究室</span>
        <span class="title-en">XIANGQI STUDIO</span>
      </div>
    </div>

    <!-- Navigation Modes -->
    <nav class="header-nav">
      <button 
        class="nav-btn" 
        :class="{ active: currentView === 'game' }"
        @click="$emit('change-view', 'game')"
      >
        <Swords :size="16" class="btn-icon" />
        <span>对战模式</span>
      </button>

      <button 
        class="nav-btn" 
        :class="{ active: currentView === 'replay' }"
        @click="$emit('change-view', 'replay')"
      >
        <BookOpen :size="16" class="btn-icon" />
        <span>复盘打谱</span>
      </button>

      <button 
        class="nav-btn" 
        :class="{ active: currentView === 'study' }"
        @click="$emit('change-view', 'study')"
      >
        <FlaskConical :size="16" class="btn-icon" />
        <span>残局研究</span>
      </button>
    </nav>

    <!-- Header Right / Engine Status & Tools -->
    <div class="header-right">
      <div 
        class="engine-badge" 
        :class="{ 'is-ready': gameStore.isEngineReady }"
        title="点击打开皮卡鱼引擎配置中心"
        @click="showSettingsModal = true"
      >
        <Cpu :size="14" />
        <span class="engine-name">{{ gameStore.engineName }}</span>
        <span class="status-dot"></span>
      </div>

      <button class="icon-tool-btn" title="皮卡鱼引擎设置" @click="showSettingsModal = true">
        <Settings :size="16" />
      </button>

      <button class="icon-tool-btn" :title="soundMuted ? '开启音效' : '静音'" @click="toggleSound">
        <Volume2 v-if="!soundMuted" :size="18" />
        <VolumeX v-else :size="18" />
      </button>
    </div>

    <!-- 引擎设置弹窗 -->
    <EngineSettingsModal v-model="showSettingsModal" />
  </header>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Swords, BookOpen, FlaskConical, Cpu, Volume2, VolumeX, Settings } from 'lucide-vue-next';
import { useGameStore } from '../../stores/gameStore';
import { sound } from '../../core/sound';
import EngineSettingsModal from '../game/EngineSettingsModal.vue';

defineProps<{
  currentView: 'game' | 'replay' | 'study';
}>();

defineEmits<{
  (e: 'change-view', view: 'game' | 'replay' | 'study'): void;
}>();

const gameStore = useGameStore();
const soundMuted = ref(!sound.isEnabled());
const showSettingsModal = ref(false);

function toggleSound() {
  const current = sound.isEnabled();
  sound.setEnabled(!current);
  soundMuted.value = current;
}
</script>

<style scoped>
.app-header {
  height: 46px;
  background: linear-gradient(180deg, #24140d 0%, #1a0d07 100%);
  border-bottom: 1px solid #4a2d18;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
  user-select: none;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-badge {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: radial-gradient(circle, #b02424 0%, #680d0d 100%);
  border: 1.5px solid #d4af37;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.4);
}

.logo-char {
  font-family: 'Kaiti', serif;
  font-size: 17px;
  font-weight: 900;
  color: #fff4d6;
}

.logo-text {
  display: flex;
  flex-direction: column;
}

.title-cn {
  font-family: 'Kaiti', 'STKaiti', serif;
  font-size: 15px;
  font-weight: bold;
  color: #eed6b3;
  letter-spacing: 1px;
}

.title-en {
  font-size: 8px;
  color: #9c7b5c;
  letter-spacing: 1.2px;
}

.header-nav {
  display: flex;
  gap: 6px;
  background: rgba(15, 8, 4, 0.6);
  padding: 3px;
  border-radius: 6px;
  border: 1px solid #3d2313;
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  border: none;
  background: transparent;
  color: #a88d74;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-btn:hover {
  color: #eed6b3;
  background: rgba(212, 175, 55, 0.1);
}

.nav-btn.active {
  color: #fff2d1;
  background: linear-gradient(180deg, #6e3e1b 0%, #4a2810 100%);
  border: 1px solid #8e5427;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 2px 4px rgba(0, 0, 0, 0.3);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.engine-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 20px;
  background: rgba(20, 10, 5, 0.8);
  border: 1px solid #4a2d18;
  color: #a88d74;
  font-size: 12px;
}

.engine-badge.is-ready {
  border-color: #386b45;
  color: #8ed69d;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #6b6b6b;
}

.is-ready .status-dot {
  background: #34c759;
  box-shadow: 0 0 8px #34c759;
  animation: pulseDot 2s infinite;
}

.icon-tool-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #4a2d18;
  background: rgba(25, 12, 6, 0.6);
  border-radius: 6px;
  color: #eed6b3;
  cursor: pointer;
  transition: all 0.2s;
}

.icon-tool-btn:hover {
  background: #4a2d18;
  border-color: #d4af37;
}

@keyframes pulseDot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.2); }
}
</style>
