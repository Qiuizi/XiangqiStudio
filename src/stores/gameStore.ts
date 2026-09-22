import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { XiangqiBoard } from '../core/chess/board';
import { sound } from '../core/sound';
import { INITIAL_FEN, parseUciMove } from '../core/chess/fen';
import type { PieceColor, Position } from '../core/chess/types';
import { useEngineSettingsStore, type UciOptionMeta } from './engineSettingsStore';

export type GameMode = 'pve' | 'pvp' | 'study' | 'replay';

export interface MultiPvLine {
  multipv: number;
  depth: number;
  seldepth?: number;
  scoreCp: number | null;
  scoreMate: number | null;
  nodes: number;
  nps: number;
  timeMs?: number;
  hashfull?: number;
  pv: string[];
  bestMove: string;
}

export interface EngineInfo {
  depth: number;
  seldepth?: number;
  scoreCp: number | null;
  scoreMate: number | null;
  nodes: number;
  nps: number;
  timeMs?: number;
  hashfull?: number;
  pv: string[];
  bestMove: string | null;
  multipvLines: MultiPvLine[];
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export const useGameStore = defineStore('game', () => {
  // Game Board Model
  const board = ref(new XiangqiBoard());
  const selectedPos = ref<Position | null>(null);
  const legalTargets = ref<Position[]>([]);
  const flipped = ref(false);

  // Mode & Players
  const gameMode = ref<GameMode>('pve');
  const playerSide = ref<PieceColor>('red');

  const aiThinkingTimeMs = computed({
    get: () => useEngineSettingsStore().matchMovetimeMs,
    set: (val: number) => { useEngineSettingsStore().matchMovetimeMs = val; }
  });

  // Engine state
  const isEngineReady = ref(false);
  const isAiThinking = ref(false);
  const isAnalyzing = ref(false);
  const engineName = ref('Pikafish NNUE');
  const engineStatusText = ref('就绪');
  const autoAnalysis = ref(false); // 默认隐藏 AI 提示箭头，由用户主动点击开启

  const engineInfo = ref<EngineInfo>({
    depth: 0,
    scoreCp: null,
    scoreMate: null,
    nodes: 0,
    nps: 0,
    pv: [],
    bestMove: null,
    multipvLines: [],
  });

  const selectedMultiPv = ref<number>(1);
  const currentSearchId = ref<number>(0);

  // Replay cursor
  const currentStep = ref<number>(0);

  // Listeners initialized flag
  let isListenerInit = false;

  // Computed state
  const activeColor = computed(() => board.value.activeColor);
  const grid = computed(() => board.value.grid);
  const history = computed(() => board.value.history);
  const lastMove = computed(() => {
    if (board.value.history.length === 0) return null;
    return board.value.history[board.value.history.length - 1];
  });

  const inCheckKingPos = computed(() => {
    if (board.value.isInCheck()) {
      for (let r = 0; r <= 9; r++) {
        for (let f = 0; f <= 8; f++) {
          const p = board.value.grid[r][f];
          if (p && p.type === 'k' && p.color === board.value.activeColor) {
            return { file: f, rank: r };
          }
        }
      }
    }
    return null;
  });

  const isUserTurn = computed(() => {
    if (gameMode.value === 'pvp') return true;
    if (gameMode.value === 'pve') {
      return activeColor.value === playerSide.value && !isAiThinking.value;
    }
    return true; // study / replay
  });

  // Recommended arrow computed from selected MultiPV line, or bestMove, or PV
  const aiArrow = computed(() => {
    let moveStr: string | null = null;
    if (selectedMultiPv.value > 1) {
      const line = engineInfo.value.multipvLines.find(l => l.multipv === selectedMultiPv.value);
      if (line && line.bestMove) {
        moveStr = line.bestMove;
      }
    }
    if (!moveStr) {
      moveStr = engineInfo.value.bestMove || (engineInfo.value.pv.length > 0 ? engineInfo.value.pv[0] : null);
    }
    if (!moveStr || moveStr.length < 4) return null;
    try {
      return parseUciMove(moveStr);
    } catch {
      return null;
    }
  });

  const activeAiSearchId = ref<number | null>(null);

  // Initialize engine & listeners
  async function initEngine() {
    if (isListenerInit) return;
    isListenerInit = true;

    if (!isTauri()) {
      engineStatusText.value = '单机规则模式 (网页预览中)';
      return;
    }

    const engineSettings = useEngineSettingsStore();

    try {
      await listen<string>('engine-name', (e) => {
        engineName.value = e.payload;
      });

      await listen<UciOptionMeta[]>('engine-options', (e) => {
        engineSettings.availableOptions = e.payload;
      });

      await listen<boolean>('engine-ready', async () => {
        isEngineReady.value = true;
        engineStatusText.value = '引擎就绪';
        await engineSettings.fetchEngineStatus();
        await engineSettings.applySettings();
        // If it is AI turn right away, trigger search
        checkAiTurn();
      });

      await listen<any>('engine-info', (e) => {
        const payload = e.payload;
        if (payload.search_id && currentSearchId.value && payload.search_id !== currentSearchId.value) {
          return;
        }

        if (payload.depth !== undefined && payload.depth !== null) {
          engineInfo.value.depth = payload.depth;
        }
        if (payload.seldepth !== undefined && payload.seldepth !== null) {
          engineInfo.value.seldepth = payload.seldepth;
        }
        if (payload.time_ms !== undefined && payload.time_ms !== null) {
          engineInfo.value.timeMs = payload.time_ms;
        }
        if (payload.hashfull !== undefined && payload.hashfull !== null) {
          engineInfo.value.hashfull = payload.hashfull;
        }
        if (payload.nodes !== undefined && payload.nodes !== null) {
          engineInfo.value.nodes = payload.nodes;
        }
        if (payload.nps !== undefined && payload.nps !== null) {
          engineInfo.value.nps = payload.nps;
        }

        const lineNum = payload.multipv || 1;
        const existingIdx = engineInfo.value.multipvLines.findIndex(l => l.multipv === lineNum);
        const prevLine = existingIdx >= 0 ? engineInfo.value.multipvLines[existingIdx] : null;

        const lineObj: MultiPvLine = {
          multipv: lineNum,
          depth: payload.depth || (prevLine?.depth ?? 0),
          seldepth: payload.seldepth !== undefined && payload.seldepth !== null ? payload.seldepth : prevLine?.seldepth,
          scoreCp: payload.score_cp !== undefined ? payload.score_cp : (prevLine?.scoreCp ?? null),
          scoreMate: payload.score_mate !== undefined ? payload.score_mate : (prevLine?.scoreMate ?? null),
          nodes: payload.nodes !== undefined && payload.nodes !== null ? payload.nodes : (prevLine?.nodes ?? 0),
          nps: payload.nps !== undefined && payload.nps !== null ? payload.nps : (prevLine?.nps ?? 0),
          timeMs: payload.time_ms !== undefined && payload.time_ms !== null ? payload.time_ms : prevLine?.timeMs,
          hashfull: payload.hashfull !== undefined && payload.hashfull !== null ? payload.hashfull : prevLine?.hashfull,
          pv: (payload.pv && payload.pv.length > 0) ? payload.pv : (prevLine?.pv ?? []),
          bestMove: (payload.pv && payload.pv.length > 0) ? payload.pv[0] : (prevLine?.bestMove ?? ''),
        };

        if (existingIdx >= 0) {
          engineInfo.value.multipvLines[existingIdx] = lineObj;
        } else {
          engineInfo.value.multipvLines.push(lineObj);
          engineInfo.value.multipvLines.sort((a, b) => a.multipv - b.multipv);
        }

        if (lineNum === 1) {
          if (payload.score_cp !== undefined) {
            engineInfo.value.scoreCp = payload.score_cp;
          }
          if (payload.score_mate !== undefined) {
            engineInfo.value.scoreMate = payload.score_mate;
          }
          if (payload.pv && payload.pv.length > 0) {
            engineInfo.value.pv = payload.pv;
            engineInfo.value.bestMove = payload.pv[0];
          }
        }
      });

      await listen<{ search_id: number; is_ai_move: boolean; bestmove: string }>('engine-bestmove', (e) => {
        const { bestmove, search_id, is_ai_move } = e.payload;
        if (currentSearchId.value && search_id !== currentSearchId.value) {
          return;
        }
        engineInfo.value.bestMove = bestmove;
        isAnalyzing.value = false;

        if (is_ai_move && isAiThinking.value && activeAiSearchId.value === search_id) {
          isAiThinking.value = false;
          activeAiSearchId.value = null;
          executeAiMove(bestmove);
        }
      });

      // Start engine process
      engineStatusText.value = '正在启动皮卡鱼引擎...';
      await invoke('start_engine', {});
    } catch (err) {
      console.warn('Init engine error:', err);
      engineStatusText.value = '单机规则模式 (未连接引擎)';
    }
  }

  // Trigger search on current board position
  async function triggerAnalysis(isAiMoveRequest: boolean = false) {
    if (!isTauri() || !isEngineReady.value) return;

    // Avoid conflicting manual analysis if AI is calculating next move
    if (!isAiMoveRequest && isAiThinking.value) {
      return;
    }

    const engineSettings = useEngineSettingsStore();

    if (isAiMoveRequest) {
      isAiThinking.value = true;
      isAnalyzing.value = false;
      engineStatusText.value = '皮卡鱼正在思考...';
    } else {
      isAnalyzing.value = true;
      engineStatusText.value = '深度算力分析中...';
    }

    try {
      const fen = board.value.getFen();
      let searchType: string;
      let limitValue: number | null = null;

      if (isAiMoveRequest) {
        searchType = engineSettings.matchSearchType;
        if (searchType === 'movetime') limitValue = engineSettings.matchMovetimeMs;
        else if (searchType === 'depth') limitValue = engineSettings.matchDepth;
        else if (searchType === 'nodes') limitValue = engineSettings.matchNodes;
      } else {
        searchType = engineSettings.analysisSearchType;
        if (searchType === 'infinite') limitValue = null;
        else if (searchType === 'depth') limitValue = engineSettings.analysisDepth;
        else if (searchType === 'movetime') limitValue = engineSettings.analysisMovetimeMs;
        else if (searchType === 'nodes') limitValue = engineSettings.analysisNodes;
      }

      const searchId = await invoke<number>('search_position', {
        fen,
        moves: [],
        searchType,
        limitValue,
        isAiMove: isAiMoveRequest,
      });

      currentSearchId.value = searchId;
      engineInfo.value.depth = 0;
      engineInfo.value.seldepth = undefined;
      engineInfo.value.nodes = 0;
      engineInfo.value.nps = 0;
      engineInfo.value.timeMs = 0;
      engineInfo.value.multipvLines = [];

      if (isAiMoveRequest) {
        activeAiSearchId.value = searchId;
      }
    } catch (err) {
      console.error('Search error:', err);
      isAiThinking.value = false;
      isAnalyzing.value = false;
      activeAiSearchId.value = null;
    }
  }

  async function stopAnalysis() {
    if (!isTauri()) return;
    try {
      await invoke('stop_search');
      isAiThinking.value = false;
      isAnalyzing.value = false;
      activeAiSearchId.value = null;
      currentSearchId.value = 0;
      engineStatusText.value = '计算已停止';
    } catch (e) {
      console.warn('Stop search error:', e);
    }
  }

  function executeAiMove(uci: string) {
    try {
      const { from, to } = parseUciMove(uci);
      const piece = board.value.grid[from.rank][from.file];
      if (!piece || piece.color !== activeColor.value) {
        console.warn('Invalid AI move suggested:', uci);
        return;
      }

      const move = board.value.makeMove(from, to);
      if (move) {
        currentStep.value = board.value.history.length;
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
        } else if (autoAnalysis.value) {
          triggerAnalysis(false);
        }
      }
    } catch (err) {
      console.error('Failed to execute AI move:', err);
    }
  }

  function checkAiTurn() {
    if (gameMode.value === 'pve' && activeColor.value !== playerSide.value) {
      const over = board.value.isGameOver();
      if (!over.isOver) {
        triggerAnalysis(true);
      }
    } else if (autoAnalysis.value) {
      triggerAnalysis(false);
    }
  }

  function selectSquare(pos: Position) {
    if (!isUserTurn.value) return;

    const piece = board.value.grid[pos.rank][pos.file];

    // If clicking on a friendly piece
    if (piece && piece.color === activeColor.value) {
      selectedPos.value = pos;
      legalTargets.value = board.value.getLegalMoves(pos);
      sound.play('pick');
      return;
    }

    // Otherwise clear selection
    selectedPos.value = null;
    legalTargets.value = [];
  }

  function makeUserMove(from: Position, to: Position) {
    if (!isUserTurn.value) return;

    const move = board.value.makeMove(from, to);
    if (!move) return;

    selectedPos.value = null;
    legalTargets.value = [];
    currentStep.value = board.value.history.length;

    // Clear old candidate lines for new position
    engineInfo.value.multipvLines = [];
    selectedMultiPv.value = 1;

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
    } else {
      checkAiTurn();
    }
  }

  function undo() {
    activeAiSearchId.value = null;
    if (isAiThinking.value || isAnalyzing.value) {
      stopAnalysis();
    }

    if (gameMode.value === 'pve') {
      // Undo both AI's and player's move if it's player's turn
      if (board.value.history.length >= 2) {
        board.value.undoMove();
        board.value.undoMove();
      } else if (board.value.history.length === 1) {
        board.value.undoMove();
      }
    } else {
      board.value.undoMove();
    }

    selectedPos.value = null;
    legalTargets.value = [];
    currentStep.value = board.value.history.length;
    engineInfo.value.multipvLines = [];
    selectedMultiPv.value = 1;
    sound.play('undo');

    if (autoAnalysis.value) {
      triggerAnalysis(false);
    }
  }

  function newGame(mode: GameMode = 'pve', side: PieceColor = 'red') {
    activeAiSearchId.value = null;
    if (isAiThinking.value || isAnalyzing.value) {
      stopAnalysis();
    }

    gameMode.value = mode;
    playerSide.value = side;
    flipped.value = side === 'black'; // flip board if player chose black

    board.value.reset(INITIAL_FEN);
    selectedPos.value = null;
    legalTargets.value = [];
    currentStep.value = 0;

    engineInfo.value = {
      depth: 0,
      scoreCp: null,
      scoreMate: null,
      nodes: 0,
      nps: 0,
      pv: [],
      bestMove: null,
      multipvLines: [],
    };
    selectedMultiPv.value = 1;

    sound.play('begin');
    checkAiTurn();
  }

  function flipBoard() {
    flipped.value = !flipped.value;
  }

  function jumpToStep(step: number) {
    if (step < 0 || step > board.value.history.length) return;
    currentStep.value = step;
    if (autoAnalysis.value || isAnalyzing.value) {
      triggerAnalysis(false);
    }
  }

  function toggleAnalysis() {
    autoAnalysis.value = !autoAnalysis.value;
    if (autoAnalysis.value) {
      triggerAnalysis(false);
    } else {
      stopAnalysis();
    }
  }

  function selectMultiPvLine(lineIndex: number) {
    selectedMultiPv.value = lineIndex;
  }

  return {
    board,
    grid,
    activeColor,
    history,
    lastMove,
    selectedPos,
    legalTargets,
    flipped,
    gameMode,
    playerSide,
    aiThinkingTimeMs,
    isEngineReady,
    isAiThinking,
    isAnalyzing,
    engineName,
    engineStatusText,
    engineInfo,
    selectedMultiPv,
    aiArrow,
    inCheckKingPos,
    isUserTurn,
    currentStep,
    autoAnalysis,

    initEngine,
    selectSquare,
    makeUserMove,
    undo,
    newGame,
    flipBoard,
    jumpToStep,
    triggerAnalysis,
    stopAnalysis,
    toggleAnalysis,
    selectMultiPvLine,
  };
});
