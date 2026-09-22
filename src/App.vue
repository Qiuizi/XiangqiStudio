<template>
  <div class="app-root">
    <AppHeader 
      :current-view="currentView === 'lobby' ? 'game' : currentView" 
      @change-view="onHeaderChangeView"
    />

    <main class="app-body">
      <LobbyView 
        v-if="currentView === 'lobby'" 
        @select-view="onLobbySelectView"
      />

      <GameView 
        v-else-if="currentView === 'game'" 
      />

      <ReplayView 
        v-else-if="currentView === 'replay'" 
      />

      <StudyView 
        v-else-if="currentView === 'study'" 
      />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useGameStore } from './stores/gameStore';
import AppHeader from './components/layout/AppHeader.vue';
import LobbyView from './views/LobbyView.vue';
import GameView from './views/GameView.vue';
import ReplayView from './views/ReplayView.vue';
import StudyView from './views/StudyView.vue';

type AppView = 'lobby' | 'game' | 'replay' | 'study';

const currentView = ref<AppView>('lobby');
const gameStore = useGameStore();

function onHeaderChangeView(view: 'game' | 'replay' | 'study') {
  currentView.value = view;
  if (view === 'study') {
    gameStore.enterStudyMode('manual');
  } else if (view === 'game') {
    if (gameStore.gameMode === 'study') {
      gameStore.exitStudyMode();
    }
  }
}

function onLobbySelectView(view: 'game' | 'replay' | 'study') {
  currentView.value = view;
  if (view === 'study') {
    gameStore.enterStudyMode('manual');
  } else if (view === 'game') {
    if (gameStore.gameMode === 'study') {
      gameStore.exitStudyMode();
    }
  }
}

onMounted(() => {
  // Proactively start engine in the background
  gameStore.initEngine();
});
</script>

<style scoped>
.app-root {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #170b06;
}

.app-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}
</style>