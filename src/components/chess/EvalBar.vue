<template>
  <div class="eval-bar-container" :title="evalTitle">
    <div class="eval-bar-track">
      <!-- Black Advantage (Top) -->
      <div 
        class="eval-fill black-fill" 
        :style="{ height: blackHeightPercent + '%' }"
      ></div>
      <!-- Red Advantage (Bottom) -->
      <div 
        class="eval-fill red-fill" 
        :style="{ height: redHeightPercent + '%' }"
      ></div>
    </div>
    <div class="eval-score-badge" :class="{ 'is-red-win': (scoreCp ?? 0) > 0, 'is-black-win': (scoreCp ?? 0) < 0 }">
      {{ displayScore }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  scoreCp: number | null;
  scoreMate: number | null;
}>();

const displayScore = computed(() => {
  if (props.scoreMate !== null) {
    return `M${props.scoreMate > 0 ? '+' : ''}${props.scoreMate}`;
  }
  if (props.scoreCp === null) {
    return '0.0';
  }
  const pawns = props.scoreCp / 100;
  return (pawns > 0 ? '+' : '') + pawns.toFixed(1);
});

const evalTitle = computed(() => {
  if (props.scoreMate !== null) {
    return `杀局预警: ${Math.abs(props.scoreMate)} 步成杀 (${props.scoreMate > 0 ? '红胜' : '黑胜'})`;
  }
  if (props.scoreCp === null) return '局面均势 (0.00)';
  return `局面评估分: ${props.scoreCp} (${props.scoreCp > 0 ? '红方占优' : props.scoreCp < 0 ? '黑方占优' : '均势'})`;
});

// Calculate percentage for Red fill (0% to 100%, 50% is equal)
const redHeightPercent = computed(() => {
  if (props.scoreMate !== null) {
    return props.scoreMate > 0 ? 98 : 2;
  }
  if (props.scoreCp === null) return 50;

  // Use a sigmoid / clamped compression for chess score (-1000cp to +1000cp)
  const cp = Math.max(-1200, Math.min(1200, props.scoreCp));
  // 50 + (cp / 1200) * 45
  return 50 + (cp / 1200) * 45;
});

const blackHeightPercent = computed(() => 100 - redHeightPercent.value);
</script>

<style scoped>
.eval-bar-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 20px;
  align-self: stretch;
  margin-right: 12px;
  position: relative;
  user-select: none;
  box-sizing: border-box;
  padding: 4px 0 26px 0;
}

.eval-bar-track {
  width: 14px;
  height: 100%;
  border-radius: 7px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #1a1a1c;
  border: 1px solid #4a3424;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5), inset 0 1px 3px rgba(0, 0, 0, 0.8);
}

.eval-fill {
  transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.black-fill {
  background: linear-gradient(180deg, #161719 0%, #2c2d33 100%);
}

.red-fill {
  background: linear-gradient(180deg, #b02424 0%, #e84545 100%);
}

.eval-score-badge {
  position: absolute;
  bottom: -28px;
  font-size: 11px;
  font-weight: 800;
  padding: 2px 5px;
  border-radius: 4px;
  background: #2b1f18;
  color: #e8d0b5;
  border: 1px solid #6b4c34;
  white-space: nowrap;
}

.eval-score-badge.is-red-win {
  color: #ff6b6b;
}

.eval-score-badge.is-black-win {
  color: #9cb5db;
}
</style>
