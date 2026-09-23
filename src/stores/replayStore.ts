import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { BoardGrid, Move, PieceColor, Position } from '../core/chess/types';
import { XiangqiBoard } from '../core/chess/board';
import { INITIAL_FEN } from '../core/chess/fen';
import { sound } from '../core/sound';

export type ReplayMode = 'replay' | 'manual';

/**
 * 树状棋谱节点数据结构
 * 支持主线与无限级变化分支 (Variation Tree)
 */
export interface ReplayNode {
  id: string;               // 唯一节点 ID
  parentId: string | null;  // 父节点 ID，根节点为 null
  move: Move | null;        // 形成该局面的着法（根节点为 null）
  fen: string;              // 走完本步后的局面 FEN
  stepIndex: number;        // 步数深度（root 为 0，走一步为 1...）
  childrenIds: string[];    // 子节点 ID 列表：childrenIds[0] 为主线，childrenIds[1..n] 为变化分支
  comment?: string;         // 局面评注
}

export const useReplayStore = defineStore('replay', () => {
  // 1. 独立棋盘实例（与对战主棋盘绝对隔离）
  const board = ref<XiangqiBoard>(new XiangqiBoard(INITIAL_FEN));
  const boardVersion = ref(0);

  // 2. 复盘工作模式：'replay' (只读回放) | 'manual' (手动打谱与推演)
  const mode = ref<ReplayMode>('replay');

  // 3. 树状棋谱存储
  const treeNodes = ref<Record<string, ReplayNode>>({});
  const rootId = ref<string>('root');
  const currentNodeId = ref<string>('root');

  // 4. 打谱交互状态
  const selectedPos = ref<Position | null>(null);
  const legalTargets = ref<Position[]>([]);
  const statusMessage = ref<string>('');

  // 初始化空的根节点
  function createRootNode(fen: string = INITIAL_FEN): ReplayNode {
    return {
      id: 'root',
      parentId: null,
      move: null,
      fen,
      stepIndex: 0,
      childrenIds: [],
    };
  }

  // 重置/新建打谱
  function initEmptyGame(fen: string = INITIAL_FEN) {
    board.value = new XiangqiBoard(fen);
    boardVersion.value++;
    const root = createRootNode(fen);
    treeNodes.value = { [root.id]: root };
    rootId.value = root.id;
    currentNodeId.value = root.id;
    selectedPos.value = null;
    legalTargets.value = [];
    statusMessage.value = '已建立新打谱局，可自由推演红黑双方走子';
  }

  // 从已有对局历史初始化棋谱树（单向克隆，绝不反向污染）
  function loadHistory(moves: Move[], initialFen: string = INITIAL_FEN) {
    board.value = new XiangqiBoard(initialFen);
    const root = createRootNode(initialFen);
    const nodes: Record<string, ReplayNode> = { [root.id]: root };

    let prevNodeId = root.id;
    const tempBoard = new XiangqiBoard(initialFen);

    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const applied = tempBoard.makeMove(m.from, m.to);
      const nodeId = `node_${i + 1}`;
      const newNode: ReplayNode = {
        id: nodeId,
        parentId: prevNodeId,
        move: applied ? { ...applied, notation: m.notation || applied.notation } : { ...m },
        fen: tempBoard.getFen(),
        stepIndex: i + 1,
        childrenIds: [],
      };

      nodes[prevNodeId].childrenIds.push(nodeId);
      nodes[nodeId] = newNode;
      prevNodeId = nodeId;
    }

    treeNodes.value = nodes;
    rootId.value = root.id;
    // 默认跳转到已有对局的终点
    currentNodeId.value = prevNodeId;
    board.value.reset(nodes[prevNodeId]?.fen || initialFen);
    boardVersion.value++;
    selectedPos.value = null;
    legalTargets.value = [];
    statusMessage.value = moves.length > 0 ? `已载入对局棋谱 (共 ${moves.length} 步)` : '';
  }

  // 初始加载一次默认空局面
  initEmptyGame(INITIAL_FEN);

  // 计算属性
  const grid = computed<BoardGrid>(() => {
    // 依赖 boardVersion 确保视图响应式更新
    boardVersion.value;
    return board.value.grid;
  });

  const activeColor = computed<PieceColor>(() => {
    boardVersion.value;
    return board.value.activeColor;
  });

  const currentNode = computed<ReplayNode | null>(() => {
    return treeNodes.value[currentNodeId.value] || null;
  });

  const lastMove = computed<Move | null>(() => {
    return currentNode.value?.move || null;
  });

  const inCheckKingPos = computed<Position | null>(() => {
    boardVersion.value;
    if (!board.value.isInCheck()) return null;
    const color = board.value.activeColor;
    for (let r = 0; r < 10; r++) {
      for (let f = 0; f < 9; f++) {
        const piece = board.value.grid[r][f];
        if (piece && piece.type === 'k' && piece.color === color) {
          return { file: f, rank: r };
        }
      }
    }
    return null;
  });

  const hasAnyHistory = computed<boolean>(() => {
    const root = treeNodes.value[rootId.value];
    return !!(root && root.childrenIds.length > 0);
  });

  // 获取从根节点到指定节点的前置祖先链（含本节点）
  function getNodePath(nodeId: string): ReplayNode[] {
    const path: ReplayNode[] = [];
    let cur = treeNodes.value[nodeId];
    while (cur) {
      path.unshift(cur);
      if (!cur.parentId) break;
      cur = treeNodes.value[cur.parentId];
    }
    return path;
  }

  // 当前激活路径上的所有走法节点（排除 root）
  const activeMovePath = computed<ReplayNode[]>(() => {
    return getNodePath(currentNodeId.value).filter(n => n.id !== rootId.value);
  });

  // 主线节点路径（从 root 沿 childrenIds[0] 遍历）
  const mainlineNodeIds = computed<Set<string>>(() => {
    const set = new Set<string>();
    let curId: string | undefined = rootId.value;
    while (curId && treeNodes.value[curId]) {
      set.add(curId);
      curId = treeNodes.value[curId].childrenIds[0];
    }
    return set;
  });

  // 当前是否处于主线分支中
  const isCurrentOnMainline = computed<boolean>(() => {
    return mainlineNodeIds.value.has(currentNodeId.value);
  });

  // 当前节点的同级可选分支（即父节点的所有子节点），供同回合切换候选走法
  const siblingVariations = computed<{ node: ReplayNode; isMain: boolean; isActive: boolean }[]>(() => {
    const cur = currentNode.value;
    if (!cur || !cur.parentId) return [];
    const parent = treeNodes.value[cur.parentId];
    if (!parent || parent.childrenIds.length <= 1) return [];

    return parent.childrenIds.map((cid, idx) => {
      const node = treeNodes.value[cid];
      return {
        node,
        isMain: idx === 0,
        isActive: cid === cur.id,
      };
    }).filter(v => !!v.node);
  });

  // 动作：切换模式
  function setMode(newMode: ReplayMode) {
    mode.value = newMode;
    selectedPos.value = null;
    legalTargets.value = [];
    if (newMode === 'manual') {
      statusMessage.value = '已切换为【手动打谱】模式，可直接点选棋子落子';
    } else {
      statusMessage.value = '已切换为【只读回放】模式';
    }
  }

  // 动作：打谱模式下点选棋子
  function selectSquare(pos: Position) {
    if (mode.value !== 'manual') return;

    const piece = board.value.grid[pos.rank]?.[pos.file];
    if (piece && piece.color === board.value.activeColor) {
      selectedPos.value = pos;
      legalTargets.value = board.value.getLegalMoves(pos);
      sound.play('pick');
      return;
    }

    selectedPos.value = null;
    legalTargets.value = [];
  }

  // 动作：打谱模式下落子
  function makeMove(from: Position, to: Position): boolean {
    if (mode.value !== 'manual') return false;

    const move = board.value.makeMove(from, to);
    if (!move) return false;

    boardVersion.value++;
    selectedPos.value = null;
    legalTargets.value = [];

    const parentNode = currentNode.value || treeNodes.value[rootId.value];
    const newFen = board.value.getFen();

    // 检查是否已有完全一致的子节点
    let targetChildId: string | null = null;
    for (const cid of parentNode.childrenIds) {
      const child = treeNodes.value[cid];
      if (child && child.move && child.move.from.file === from.file && child.move.from.rank === from.rank &&
          child.move.to.file === to.file && child.move.to.rank === to.rank) {
        targetChildId = cid;
        break;
      }
    }

    if (targetChildId) {
      // 已经存在该分支节点，直接进入
      currentNodeId.value = targetChildId;
      statusMessage.value = `进入已有走法: ${move.notation}`;
    } else {
      // 创建新节点
      const newId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const stepIndex = parentNode.stepIndex + 1;
      const newNode: ReplayNode = {
        id: newId,
        parentId: parentNode.id,
        move: { ...move },
        fen: newFen,
        stepIndex,
        childrenIds: [],
      };

      parentNode.childrenIds.push(newId);
      treeNodes.value[newId] = newNode;
      currentNodeId.value = newId;

      if (parentNode.childrenIds.length > 1) {
        const branchNum = parentNode.childrenIds.length - 1;
        statusMessage.value = `在第 ${parentNode.stepIndex} 步派生新变化分支 ${branchNum} (${move.notation})`;
      } else {
        statusMessage.value = `第 ${stepIndex} 步: ${move.notation}`;
      }
    }

    // 播放音效
    if (move.captured) {
      sound.play('eat');
    } else {
      sound.play('move');
    }
    if (board.value.isInCheck()) {
      sound.play('check');
    }

    const over = board.value.isGameOver();
    if (over.isOver) {
      sound.play('end');
      statusMessage.value += ` · 对局结束 (${over.reason || '绝杀'})`;
    }

    return true;
  }

  // 动作：跳转至指定节点
  function jumpToNode(nodeId: string) {
    const node = treeNodes.value[nodeId];
    if (!node) return;

    currentNodeId.value = nodeId;
    board.value.reset(node.fen);
    boardVersion.value++;
    selectedPos.value = null;
    legalTargets.value = [];
  }

  // 导航：起点
  function goToFirst() {
    jumpToNode(rootId.value);
  }

  // 导航：上一步
  function goToPrev() {
    const cur = currentNode.value;
    if (cur && cur.parentId) {
      jumpToNode(cur.parentId);
    }
  }

  // 导航：下一步（沿当前路线的第 1 个子节点）
  function goToNext() {
    const cur = currentNode.value;
    if (cur && cur.childrenIds.length > 0) {
      jumpToNode(cur.childrenIds[0]);
    }
  }

  // 导航：终点（从当前路线走到叶子）
  function goToLast() {
    let cur = currentNode.value;
    while (cur && cur.childrenIds.length > 0) {
      const nextId = cur.childrenIds[0];
      const nextNode = treeNodes.value[nextId];
      if (!nextNode) break;
      cur = nextNode;
    }
    if (cur) {
      jumpToNode(cur.id);
    }
  }

  // 动作：切换变化分支
  function switchVariation(targetNodeId: string) {
    jumpToNode(targetNodeId);
  }

  // 动作：一键返回主线
  function returnToMainline() {
    const cur = currentNode.value;
    if (!cur) return;
    const targetDepth = cur.stepIndex;

    // 在主线中寻找深度最接近 targetDepth 的节点
    let curId: string | undefined = rootId.value;
    let bestMatchId = rootId.value;

    while (curId && treeNodes.value[curId]) {
      const n: ReplayNode = treeNodes.value[curId];
      if (n.stepIndex <= targetDepth) {
        bestMatchId = n.id;
      }
      if (n.stepIndex === targetDepth) {
        break;
      }
      curId = n.childrenIds[0];
    }

    jumpToNode(bestMatchId);
    statusMessage.value = '已返回原始主线';
  }

  // 动作：撤销当前打谱步（回到 parent，若处于打谱模式且当前节点无子节点则删除此节点）
  function undoCurrentMove() {
    const cur = currentNode.value;
    if (!cur || !cur.parentId) return;

    const parentId = cur.parentId;
    const parentNode = treeNodes.value[parentId];

    // 如果处于打谱模式，且当前节点没有子分支，彻底移除此节点
    if (mode.value === 'manual' && parentNode && cur.childrenIds.length === 0) {
      parentNode.childrenIds = parentNode.childrenIds.filter(id => id !== cur.id);
      delete treeNodes.value[cur.id];
    }

    jumpToNode(parentId);
    sound.play('undo');
    statusMessage.value = '已撤销一步';
  }

  return {
    board,
    boardVersion,
    grid,
    activeColor,
    mode,
    treeNodes,
    rootId,
    currentNodeId,
    currentNode,
    lastMove,
    inCheckKingPos,
    selectedPos,
    legalTargets,
    statusMessage,
    hasAnyHistory,
    activeMovePath,
    isCurrentOnMainline,
    siblingVariations,

    initEmptyGame,
    loadHistory,
    setMode,
    selectSquare,
    makeMove,
    jumpToNode,
    goToFirst,
    goToPrev,
    goToNext,
    goToLast,
    switchVariation,
    returnToMainline,
    undoCurrentMove,
  };
});
