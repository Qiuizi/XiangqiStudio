<template>
  <div 
    class="chess-piece-wrapper"
    :class="{ 
      'is-selected': isSelected,
      'is-red': piece.color === 'red',
      'is-black': piece.color === 'black'
    }"
  >
    <svg viewBox="0 0 100 100" class="piece-svg">
      <defs>
        <!-- Red piece 3D radial gradient -->
        <radialGradient :id="'redGrad_' + piece.id" cx="38%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#cf3b3b" />
          <stop offset="45%" stop-color="#b02222" />
          <stop offset="85%" stop-color="#7e1111" />
          <stop offset="100%" stop-color="#4d0808" />
        </radialGradient>

        <!-- Black piece 3D radial gradient -->
        <radialGradient :id="'blackGrad_' + piece.id" cx="38%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#404247" />
          <stop offset="45%" stop-color="#2a2b2f" />
          <stop offset="85%" stop-color="#18181a" />
          <stop offset="100%" stop-color="#0a0a0c" />
        </radialGradient>

        <!-- Golden bevel rim gradient -->
        <linearGradient :id="'goldRim_' + piece.id" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f5e1a4" />
          <stop offset="50%" stop-color="#d4af37" />
          <stop offset="100%" stop-color="#8a6b1c" />
        </linearGradient>

        <!-- Drop shadow filter for piece depth -->
        <filter :id="'pieceShadow_' + piece.id" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="1" dy="4" stdDeviation="3.5" flood-color="#000000" flood-opacity="0.65" />
        </filter>

        <!-- Engraved character text shadow -->
        <filter :id="'engrave_' + piece.id">
          <feDropShadow dx="0" dy="1" stdDeviation="0.5" flood-color="#000000" flood-opacity="0.7" />
        </filter>
      </defs>

      <!-- Main piece body -->
      <g :filter="'url(#pieceShadow_' + piece.id + ')'">
        <!-- Outer rim bevel -->
        <circle cx="50" cy="50" r="46" :fill="'url(#goldRim_' + piece.id + ')'" />
        
        <!-- Piece wooden face -->
        <circle 
          cx="50" 
          cy="50" 
          r="43.5" 
          :fill="piece.color === 'red' ? 'url(#redGrad_' + piece.id + ')' : 'url(#blackGrad_' + piece.id + ')'" 
        />

        <!-- Inner decorative groove line -->
        <circle 
          cx="50" 
          cy="50" 
          r="36" 
          fill="none" 
          :stroke="piece.color === 'red' ? '#e27373' : '#72747d'" 
          stroke-width="1.2" 
          stroke-opacity="0.6"
        />

        <!-- Fine inner gold line -->
        <circle 
          cx="50" 
          cy="50" 
          r="34" 
          fill="none" 
          :stroke="'url(#goldRim_' + piece.id + ')'" 
          stroke-width="0.7" 
          stroke-opacity="0.4" 
        />

        <!-- Calligraphy Chinese character -->
        <text
          x="50"
          y="50"
          text-anchor="middle"
          dominant-baseline="central"
          class="piece-char"
          :class="piece.color"
          :filter="'url(#engrave_' + piece.id + ')'"
        >
          {{ character }}
        </text>
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Piece } from '../../core/chess/types';

const props = defineProps<{
  piece: Piece;
  isSelected?: boolean;
}>();

const CHAR_MAP: Record<'red' | 'black', Record<string, string>> = {
  red: {
    k: '帥',
    a: '仕',
    b: '相',
    n: '傌',
    r: '俥',
    c: '炮',
    p: '兵',
  },
  black: {
    k: '將',
    a: '士',
    b: '象',
    n: '馬',
    r: '車',
    c: '砲',
    p: '卒',
  },
};

const character = computed(() => {
  return CHAR_MAP[props.piece.color][props.piece.type] || '';
});
</script>

<style scoped>
.chess-piece-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
  transition: transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.chess-piece-wrapper:hover {
  transform: scale(1.05) translateY(-2px);
}

.chess-piece-wrapper.is-selected {
  transform: scale(1.12) translateY(-4px);
  filter: drop-shadow(0 0 10px rgba(255, 215, 0, 0.85));
}

.piece-svg {
  width: 90%;
  height: 90%;
  overflow: visible;
}

.piece-char {
  font-family: 'Kaiti', 'STKaiti', 'KaiTi_GB2312', 'SimSun', 'Noto Serif SC', serif;
  font-size: 42px;
  font-weight: 800;
  letter-spacing: 0;
}

.piece-char.red {
  fill: #fff3d6;
  text-shadow: 0 1px 2px rgba(90, 10, 10, 0.9);
}

.piece-char.black {
  fill: #f5f2e9;
  text-shadow: 0 1px 2px rgba(10, 10, 10, 0.9);
}
</style>
