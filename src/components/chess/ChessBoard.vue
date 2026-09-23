<template>
  <div class="board-shell" ref="shellRef">
    <!-- 棋盘主舞台：所有图层严格共享同一个物理矩形和坐标系 -->
    <div 
      class="board-stage" 
      ref="stageRef"
      :style="{
        width: stageWidth + 'px',
        height: stageHeight + 'px',
      }"
    >
      <!-- 1. 底层棋盘网格 SVG：绘制木纹底板、边框、横竖线、九宫、十字星位、楚河汉界 -->
      <svg 
        class="board-grid-svg" 
        :viewBox="`0 0 ${stageWidth} ${stageHeight}`"
        :width="stageWidth"
        :height="stageHeight"
      >
        <defs>
          <!-- 棋盘整体暖质实木底纹渐变 -->
          <radialGradient id="boardSurfaceGrad" cx="50%" cy="50%" r="72%">
            <stop offset="0%" stop-color="#f5dfbb" />
            <stop offset="55%" stop-color="#e7be88" />
            <stop offset="100%" stop-color="#c6955d" />
          </radialGradient>

          <!-- 棋盘实木边框倒角渐变 -->
          <linearGradient id="boardBorderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#60371a" />
            <stop offset="50%" stop-color="#3d200e" />
            <stop offset="100%" stop-color="#241106" />
          </linearGradient>

          <!-- 棋盘内阴影滤镜 -->
          <filter id="boardInnerShadow" x="-5%" y="-5%" width="110%" height="110%">
            <feOffset dx="0" dy="2" />
            <feGaussianBlur stdDeviation="3.5" result="offset-blur" />
            <feComposite operator="out" in="SourceGraphic" in2="offset-blur" result="inverse" />
            <feFlood flood-color="#200e04" flood-opacity="0.5" result="color" />
            <feComposite operator="in" in="color" in2="inverse" result="shadow" />
            <feComposite operator="over" in="shadow" in2="SourceGraphic" />
          </filter>

          <!-- AI 推荐走法金色箭头标 -->
          <marker 
            id="aiArrowHead" 
            markerWidth="8" 
            markerHeight="8" 
            refX="6" 
            refY="4" 
            orient="auto"
          >
            <path d="M 1 1 L 7 4 L 1 7 z" fill="#ffb700" />
          </marker>
        </defs>

        <!-- 棋盘木纹底色板 -->
        <rect 
          :x="padX - cellW * 0.62" 
          :y="padY - cellH * 0.62" 
          :width="gridWidth + cellW * 1.24" 
          :height="gridHeight + cellH * 1.24" 
          fill="url(#boardSurfaceGrad)" 
          rx="10"
          filter="url(#boardInnerShadow)"
        />

        <!-- 外围装饰双线（外粗内细） -->
        <rect 
          :x="padX - 8" 
          :y="padY - 8" 
          :width="gridWidth + 16" 
          :height="gridHeight + 16" 
          fill="none" 
          stroke="#5c381c" 
          stroke-width="2.2" 
          rx="4"
        />

        <!-- 棋盘主网格外框线 -->
        <rect 
          :x="padX" 
          :y="padY" 
          :width="gridWidth" 
          :height="gridHeight" 
          fill="none" 
          stroke="#5c381c" 
          stroke-width="1.8" 
        />

        <!-- 10 条横线 (ranks 0..9) -->
        <g stroke="#5c381c" stroke-width="1.2">
          <line 
            v-for="r in 10" 
            :key="'hl_' + r"
            :x1="padX" 
            :y1="padY + (r - 1) * cellH" 
            :x2="padX + gridWidth" 
            :y2="padY + (r - 1) * cellH" 
          />
        </g>

        <!-- 9 条竖线 (files 0..8) -->
        <g stroke="#5c381c" stroke-width="1.2">
          <!-- 左右两边最外竖线贯通整个棋盘 -->
          <line :x1="padX" :y1="padY" :x2="padX" :y2="padY + gridHeight" />
          <line :x1="padX + gridWidth" :y1="padY" :x2="padX + gridWidth" :y2="padY + gridHeight" />

          <!-- 中间 7 条竖线（files 1..7），在楚河汉界处断开 -->
          <template v-for="f in 7" :key="'vl_' + f">
            <!-- 上半区 (视觉 rank 0 到 4) -->
            <line 
              :x1="padX + f * cellW" 
              :y1="padY" 
              :x2="padX + f * cellW" 
              :y2="padY + 4 * cellH" 
            />
            <!-- 下半区 (视觉 rank 5 到 9) -->
            <line 
              :x1="padX + f * cellW" 
              :y1="padY + 5 * cellH" 
              :x2="padX + f * cellW" 
              :y2="padY + gridHeight" 
            />
          </template>
        </g>

        <!-- 九宫斜线（上九宫与下九宫） -->
        <g stroke="#5c381c" stroke-width="1.2">
          <!-- 上九宫 (视觉 rank 0..2, files 3..5) -->
          <line :x1="padX + 3 * cellW" :y1="padY" :x2="padX + 5 * cellW" :y2="padY + 2 * cellH" />
          <line :x1="padX + 5 * cellW" :y1="padY" :x2="padX + 3 * cellW" :y2="padY + 2 * cellH" />

          <!-- 下九宫 (视觉 rank 7..9, files 3..5) -->
          <line :x1="padX + 3 * cellW" :y1="padY + 7 * cellH" :x2="padX + 5 * cellW" :y2="padY + 9 * cellH" />
          <line :x1="padX + 5 * cellW" :y1="padY + 7 * cellH" :x2="padX + 3 * cellW" :y2="padY + 9 * cellH" />
        </g>

        <!-- 十字星位花点 (物理固定位置) -->
        <g stroke="#5c381c" stroke-width="1.2" fill="none">
          <template v-for="(star, idx) in starPositions" :key="'star_' + idx">
            <path :d="renderStarMark(star.f, star.r)" />
          </template>
        </g>

        <!-- 楚河 漢界 书法大字 -->
        <g class="river-calligraphy" fill="#694022" font-family="'Kaiti', 'STKaiti', 'KaiTi_GB2312', serif" font-weight="bold">
          <text 
            :x="padX + 2 * cellW" 
            :y="padY + 4.5 * cellH + riverFontOffset" 
            text-anchor="middle" 
            :font-size="riverFontSize"
            letter-spacing="10"
          >
            楚 河
          </text>
          <text 
            :x="padX + 6 * cellW" 
            :y="padY + 4.5 * cellH + riverFontOffset" 
            text-anchor="middle" 
            :font-size="riverFontSize"
            letter-spacing="10"
          >
            漢 界
          </text>
        </g>
      </svg>

      <!-- 2. 上一步走棋高亮层 (Highlight Layer) -->
      <div v-if="lastMove" class="highlight-layer">
        <!-- 起点方框 -->
        <div 
          class="last-move-box from-box"
          :style="{
            left: lastMoveFromCoord.x + 'px',
            top: lastMoveFromCoord.y + 'px',
            width: (pieceSize + 4) + 'px',
            height: (pieceSize + 4) + 'px',
          }"
        />
        <!-- 终点方框 -->
        <div 
          class="last-move-box to-box"
          :style="{
            left: lastMoveToCoord.x + 'px',
            top: lastMoveToCoord.y + 'px',
            width: (pieceSize + 4) + 'px',
            height: (pieceSize + 4) + 'px',
          }"
        />
      </div>

      <!-- 3. 将军告警扩散圈 (Check Layer) -->
      <div 
        v-if="inCheckKingPos" 
        class="check-alert-ring"
        :style="{
          left: checkKingCoord.x + 'px',
          top: checkKingCoord.y + 'px',
          width: (pieceSize + 10) + 'px',
          height: (pieceSize + 10) + 'px',
        }"
      />

      <!-- 4. AI 推荐箭头层 (SVG Arrow Layer) -->
      <svg 
        v-if="aiArrow && aiArrowCoord" 
        class="arrow-layer-svg" 
        :viewBox="`0 0 ${stageWidth} ${stageHeight}`"
        :width="stageWidth"
        :height="stageHeight"
      >
        <line 
          :x1="aiArrowCoord.from.x" 
          :y1="aiArrowCoord.from.y" 
          :x2="aiArrowCoord.to.x" 
          :y2="aiArrowCoord.to.y" 
          stroke="#ffb700" 
          stroke-width="4.5" 
          stroke-linecap="round"
          marker-end="url(#aiArrowHead)"
          stroke-opacity="0.88"
          filter="drop-shadow(0 2px 4px rgba(0,0,0,0.6))"
        />
      </svg>

      <!-- 5. 全盘交叉点点击交互层 (Intersections Layer) -->
      <div class="intersections-layer">
        <template v-for="r in 10" :key="'inter_r_' + r">
          <template v-for="f in 9" :key="'inter_' + f + '_' + r">
            <div 
              class="intersection-hitbox"
              :style="{
                left: getCoord(f - 1, r - 1).x + 'px',
                top: getCoord(f - 1, r - 1).y + 'px',
                width: cellW + 'px',
                height: cellH + 'px',
              }"
              @click="onIntersectionClick(f - 1, r - 1)"
            />
          </template>
        </template>
      </div>

      <!-- 6. 合法走法落点提示层 (Move Hints Layer) -->
      <div class="move-hint-layer">
        <template v-for="target in legalTargetsList" :key="'target_' + target.file + '_' + target.rank">
          <!-- 目标是空位：金色微脉动落点实心点 -->
          <div 
            v-if="!target.isCapture"
            class="target-empty-dot"
            :style="{
              left: target.x + 'px',
              top: target.y + 'px',
              width: targetDotSize + 'px',
              height: targetDotSize + 'px',
            }"
            @click.stop="onIntersectionClick(target.file, target.rank)"
          />
          <!-- 目标有敌方棋子：红色吃子准星圈 -->
          <div 
            v-else
            class="target-capture-ring"
            :style="{
              left: target.x + 'px',
              top: target.y + 'px',
              width: (pieceSize + 6) + 'px',
              height: (pieceSize + 6) + 'px',
            }"
            @click.stop="onIntersectionClick(target.file, target.rank)"
          />
        </template>
      </div>

      <!-- 7. 棋子渲染层 (Piece Layer) -->
      <div class="piece-layer">
        <template v-for="pieceItem in piecesList" :key="pieceItem.key">
          <div 
            class="piece-anchor"
            :style="{
              left: pieceItem.x + 'px',
              top: pieceItem.y + 'px',
              width: pieceSize + 'px',
              height: pieceSize + 'px',
            }"
            @click.stop="onIntersectionClick(pieceItem.file, pieceItem.rank)"
          >
            <ChessPiece 
              :piece="pieceItem.piece"
              :is-selected="selectedPos?.file === pieceItem.file && selectedPos?.rank === pieceItem.rank"
            />
          </div>
        </template>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { BoardGrid, Move, Position } from '../../core/chess/types';
import ChessPiece from './ChessPiece.vue';

const props = defineProps<{
  grid: BoardGrid;
  selectedPos: Position | null;
  legalTargets: Position[];
  lastMove: Move | null;
  inCheckKingPos: Position | null;
  flipped?: boolean;
  aiArrow?: { from: Position; to: Position } | null;
}>();

const emit = defineEmits<{
  (e: 'select', pos: Position): void;
  (e: 'move', from: Position, to: Position): void;
}>();

// DOM Refs
const shellRef = ref<HTMLElement | null>(null);

// 响应式物理尺寸 (px)
// 默认初始尺寸，在挂载时由 ResizeObserver 动态计算
const stageWidth = ref(540);

// 中国象棋棋盘严格几何比例：
// 横向 8 个间隔，外边距左右各 0.80 格 => 宽度总计 9.6 个步长
// 纵向 9 个间隔，外边距上下各 0.80 格 => 高度总计 10.6 个步长
// 高宽比 = 10.6 / 9.6 ≈ 1.1041667
const STAGE_ASPECT_RATIO = 10.6 / 9.6;
const stageHeight = computed(() => Math.round(stageWidth.value * STAGE_ASPECT_RATIO));

// 步长与边距计算
const cellStep = computed(() => stageWidth.value / 9.6);
const cellW = computed(() => cellStep.value);
const cellH = computed(() => cellStep.value);
const padX = computed(() => cellStep.value * 0.80);
const padY = computed(() => cellStep.value * 0.80);

// 内网格总尺寸 (8 files x 9 ranks)
const gridWidth = computed(() => 8 * cellW.value);
const gridHeight = computed(() => 9 * cellH.value);

// 棋子直径
const pieceSize = computed(() => Math.round(cellStep.value * 0.88));
const targetDotSize = computed(() => Math.max(12, Math.round(cellStep.value * 0.28)));
const riverFontSize = computed(() => Math.round(cellStep.value * 0.40));
const riverFontOffset = computed(() => Math.round(riverFontSize.value * 0.35));

// 核心中国象棋坐标映射函数
// 将逻辑坐标 (file, rank) [file: 0..8, rank: 0..9] 严格映射为 stage 内部像素中心点
function getCoord(file: number, rank: number): { x: number; y: number } {
  // 默认非翻转视角（红方在底，黑方在顶）：
  // rank 0 为红方底线，对应视觉最下方 (visualRank = 9)
  // rank 9 为黑方底线，对应视觉最上方 (visualRank = 0)
  // 翻转视角（黑方在底，红方在顶）：
  // rank 0 为红方底线，对应视觉最上方 (visualRank = 0)
  // rank 9 为黑方底线，对应视觉最下方 (visualRank = 9)
  const visualFile = props.flipped ? (8 - file) : file;
  const visualRank = props.flipped ? rank : (9 - rank);

  const x = Math.round(padX.value + visualFile * cellW.value);
  const y = Math.round(padY.value + visualRank * cellH.value);
  return { x, y };
}

// 扁平化棋子列表（只渲染盘上实际存在的棋子，中心对齐）
const piecesList = computed(() => {
  const list = [];
  for (let rank = 0; rank < 10; rank++) {
    for (let file = 0; file < 9; file++) {
      const piece = props.grid[rank]?.[file];
      if (piece) {
        const coord = getCoord(file, rank);
        list.push({
          key: `${piece.id}_${file}_${rank}`,
          file,
          rank,
          piece,
          x: coord.x,
          y: coord.y,
        });
      }
    }
  }
  return list;
});

// 合法走法落点提示列表
const legalTargetsList = computed(() => {
  return props.legalTargets.map(target => {
    const coord = getCoord(target.file, target.rank);
    const hasPiece = !!props.grid[target.rank]?.[target.file];
    return {
      file: target.file,
      rank: target.rank,
      x: coord.x,
      y: coord.y,
      isCapture: hasPiece,
    };
  });
});

// 上一步走法高亮坐标
const lastMoveFromCoord = computed(() => {
  if (!props.lastMove) return { x: 0, y: 0 };
  return getCoord(props.lastMove.from.file, props.lastMove.from.rank);
});
const lastMoveToCoord = computed(() => {
  if (!props.lastMove) return { x: 0, y: 0 };
  return getCoord(props.lastMove.to.file, props.lastMove.to.rank);
});

// 将军告警坐标
const checkKingCoord = computed(() => {
  if (!props.inCheckKingPos) return { x: 0, y: 0 };
  return getCoord(props.inCheckKingPos.file, props.inCheckKingPos.rank);
});

// AI 推荐走法箭头坐标
const aiArrowCoord = computed(() => {
  if (!props.aiArrow) return null;
  return {
    from: getCoord(props.aiArrow.from.file, props.aiArrow.from.rank),
    to: getCoord(props.aiArrow.to.file, props.aiArrow.to.rank),
  };
});

// 十字星位花点固定视觉位置 (视觉第 2, 3, 6, 7 行)
const starPositions = [
  // 炮位 (视觉 rank 2 和 rank 7)
  { f: 1, r: 2 }, { f: 7, r: 2 },
  { f: 1, r: 7 }, { f: 7, r: 7 },
  // 兵/卒位 (视觉 rank 3 和 rank 6)
  { f: 0, r: 3 }, { f: 2, r: 3 }, { f: 4, r: 3 }, { f: 6, r: 3 }, { f: 8, r: 3 },
  { f: 0, r: 6 }, { f: 2, r: 6 }, { f: 4, r: 6 }, { f: 6, r: 6 }, { f: 8, r: 6 },
];

function renderStarMark(file: number, visualRank: number): string {
  const cx = padX.value + file * cellW.value;
  const cy = padY.value + visualRank * cellH.value;
  const d = Math.round(cellStep.value * 0.08); // 离交叉点偏移
  const len = Math.round(cellStep.value * 0.14); // 拐角长度
  const paths: string[] = [];

  // 左半边拐角
  if (file > 0) {
    paths.push(`M ${cx - d - len} ${cy - d} L ${cx - d} ${cy - d} L ${cx - d} ${cy - d - len}`);
    paths.push(`M ${cx - d - len} ${cy + d} L ${cx - d} ${cy + d} L ${cx - d} ${cy + d + len}`);
  }
  // 右半边拐角
  if (file < 8) {
    paths.push(`M ${cx + d + len} ${cy - d} L ${cx + d} ${cy - d} L ${cx + d} ${cy - d - len}`);
    paths.push(`M ${cx + d + len} ${cy + d} L ${cx + d} ${cy + d} L ${cx + d} ${cy + d + len}`);
  }

  return paths.join(' ');
}

// 交互响应逻辑
function onIntersectionClick(file: number, rank: number) {
  // 若已选中棋子，检查点击的点是否为合法落点
  if (props.selectedPos) {
    const isTarget = props.legalTargets.some(t => t.file === file && t.rank === rank);
    if (isTarget) {
      emit('move', props.selectedPos, { file, rank });
      return;
    }
  }

  // 否则触发点选
  emit('select', { file, rank });
}

// ResizeObserver 动态响应式尺寸同步（使用 requestAnimationFrame 防抖，杜绝微循环通知）
let resizeObserver: ResizeObserver | null = null;
let rAF: number | null = null;

function updateDimensions() {
  if (!shellRef.value) return;
  // 查找承载棋盘的外层中心容器（.column-center、.replay-board-area、.study-board-area 或其父级容器）
  const host = (shellRef.value.closest('.column-center') 
    || shellRef.value.closest('.replay-board-area')
    || shellRef.value.closest('.study-board-area')
    || shellRef.value.parentElement?.parentElement 
    || shellRef.value.parentElement) as HTMLElement | null;
  if (!host) return;

  const hostW = host.clientWidth;
  const hostH = host.clientHeight;

  // 扣除空间说明：
  // 1. 评估条宽度 20px + 右边距 12px = 32px；实木外框左右 7px*2 = 14px；安全呼吸留白 14px => 总计 60px
  const availW = hostW - 60;
  // 2. 实木外框上下 7px*2 = 14px；评估条底部数值标签高度 28px；上下安全呼吸留白 16px => 总计 58px
  const availH = hostH - 58;

  if (availW <= 0 || availH <= 0) return;

  // 按 10.6 / 9.6 严格几何高宽比由可用高度反推最大允许宽度
  const maxWByHeight = availH / STAGE_ASPECT_RATIO;
  let targetW = Math.floor(Math.min(availW, maxWByHeight));

  // 保证合理的最小可点击尺寸（260px），不设人为上限，完全由容器可用宽高自适应撑满！
  targetW = Math.max(260, targetW);
  if (targetW !== stageWidth.value) {
    stageWidth.value = targetW;
  }
}

function onResizeNotify() {
  if (rAF) cancelAnimationFrame(rAF);
  rAF = requestAnimationFrame(() => {
    updateDimensions();
  });
}

onMounted(() => {
  updateDimensions();
  const host = (shellRef.value?.closest('.column-center') 
    || shellRef.value?.closest('.replay-board-area')
    || shellRef.value?.closest('.study-board-area')
    || shellRef.value?.parentElement?.parentElement 
    || shellRef.value?.parentElement) as HTMLElement | null;

  if (host && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      onResizeNotify();
    });
    resizeObserver.observe(host);
  }
  window.addEventListener('resize', onResizeNotify);
});

onUnmounted(() => {
  if (rAF) {
    cancelAnimationFrame(rAF);
    rAF = null;
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  window.removeEventListener('resize', onResizeNotify);
});
</script>

<style scoped>
/* 1. 外层 board-shell：负责居中与布局容器，移除 800px 固定上限 */
.board-shell {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  user-select: none;
  box-sizing: border-box;
  padding: 0;
}

/* 2. 内层 board-stage：核心舞台，绝对定位基准容器，带精美胡桃木外框与深色阴影 */
.board-stage {
  position: relative;
  border-radius: 12px;
  box-shadow: 
    0 16px 40px rgba(0, 0, 0, 0.7),
    0 4px 12px rgba(0, 0, 0, 0.45),
    inset 0 1px 1px rgba(255, 255, 255, 0.18);
  border: 7px solid #3c1e0a;
  background: #3c1e0a;
  box-sizing: content-box;
  overflow: hidden;
}

/* 3. 网格与底色 SVG：100% 贴合 stage */
.board-grid-svg {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

/* 4. 上一步走棋高亮层 */
.highlight-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 5;
}

.last-move-box {
  position: absolute;
  transform: translate(-50%, -50%);
  border-radius: 6px;
  box-sizing: border-box;
}

.from-box {
  border: 2px dashed rgba(212, 175, 55, 0.65);
  background: rgba(212, 175, 55, 0.08);
}

.to-box {
  border: 2.5px solid #ff9900;
  background: rgba(255, 153, 0, 0.14);
  box-shadow: 0 0 8px rgba(255, 153, 0, 0.4);
}

/* 5. 将军预警红圈 */
.check-alert-ring {
  position: absolute;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 3px solid #ff2222;
  background: rgba(255, 0, 0, 0.22);
  pointer-events: none;
  z-index: 6;
  animation: pulseCheck 1s infinite alternate ease-in-out;
}

/* 6. AI 推荐箭头 SVG 层 */
.arrow-layer-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 8;
}

/* 7. 交叉点交互点击层 (Hitbox Layer) */
.intersections-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 9;
}

.intersection-hitbox {
  position: absolute;
  transform: translate(-50%, -50%);
  pointer-events: auto;
  cursor: pointer;
}

/* 8. 合法走法落点提示层 (Move Hints) */
.move-hint-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 12;
}

.target-empty-dot {
  position: absolute;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: #d4af37;
  box-shadow: 0 0 6px rgba(212, 175, 55, 0.8), 0 0 2px #000;
  cursor: pointer;
  pointer-events: auto;
  animation: pulseTarget 1.2s infinite ease-in-out;
}

.target-capture-ring {
  position: absolute;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 3px dashed #ff3b30;
  box-shadow: 0 0 8px rgba(255, 59, 48, 0.5);
  cursor: pointer;
  pointer-events: auto;
  animation: rotateRing 5s infinite linear;
}

/* 9. 棋子层 (Piece Layer) */
.piece-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 15;
}

.piece-anchor {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  cursor: pointer;
}

/* 动画特效 */
@keyframes pulseTarget {
  0%, 100% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 0.75;
  }
  50% {
    transform: translate(-50%, -50%) scale(1.3);
    opacity: 1;
  }
}

@keyframes pulseCheck {
  0% {
    transform: translate(-50%, -50%) scale(0.95);
    opacity: 0.6;
  }
  100% {
    transform: translate(-50%, -50%) scale(1.08);
    opacity: 1;
    box-shadow: 0 0 16px rgba(255, 34, 34, 0.7);
  }
}

@keyframes rotateRing {
  from {
    transform: translate(-50%, -50%) rotate(0deg);
  }
  to {
    transform: translate(-50%, -50%) rotate(360deg);
  }
}
</style>
