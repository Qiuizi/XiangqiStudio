import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { XiangqiBoard } from '../core/chess/board';
import { sound } from '../core/sound';
import { INITIAL_FEN, parseUciMove } from '../core/chess/fen';
import type { PieceColor, PieceType, Position } from '../core/chess/types';
import { useEngineSettingsStore, type UciOptionMeta } from './engineSettingsStore';

export type GameMode = 'pve' | 'pvp' | 'study' | 'replay';
export type StudySubMode = 'manual' | 'battle' | 'edit';
export type MatchStatus = 'user_turn' | 'ai_thinking' | 'engine_error' | 'game_over';

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
  const studySubMode = ref<StudySubMode>('manual');
  const playerSide = ref<PieceColor>('red');

  const aiThinkingTimeMs = computed({
    get: () => useEngineSettingsStore().matchMovetimeMs,
    set: (val: number) => { useEngineSettingsStore().matchMovetimeMs = val; }
  });

  // Engine state
  const isEngineReady = ref(false);
  const isAiThinking = ref(false);
  const isAnalyzing = ref(false);
  const isStudyAnalyzing = ref(false);
  const isEngineError = ref(false);
  const engineErrorMsg = ref<string | null>(null);
  const engineName = ref('Pikafish NNUE');
  const engineStatusText = ref('未就绪');
  const autoAnalysis = ref(false);

  // AI Watchdog Timer
  let aiWatchdogTimer: any = null;

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
  const activeAiSearchId = ref<number | null>(null);

  // Replay cursor
  const currentStep = ref<number>(0);

  // Listeners initialized flag
  let isListenerInit = false;

  // Board state mutation version for rock-solid Vue reactivity
  const boardVersion = ref(0);

  // Computed state
  const activeColor = computed(() => {
    boardVersion.value;
    return board.value.activeColor;
  });
  const grid = computed(() => {
    boardVersion.value;
    return board.value.grid.map(row => [...row]);
  });
  const history = computed(() => board.value.history);
  const lastMove = computed(() => {
    if (board.value.history.length === 0) return null;
    return board.value.history[board.value.history.length - 1];
  });

  const currentFen = computed(() => {
    boardVersion.value;
    return board.value.getFen();
  });

  const inCheckKingPos = computed(() => {
    boardVersion.value;
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

  const matchStatus = computed<MatchStatus>(() => {
    if (board.value.isGameOver().isOver) return 'game_over';
    if (isEngineError.value) return 'engine_error';
    if (isAiThinking.value) return 'ai_thinking';
    return 'user_turn';
  });

  const isUserTurn = computed(() => {
    if (isEngineError.value) return false;
    if (gameMode.value === 'pvp') return true;
    if (gameMode.value === 'study') {
      if (studySubMode.value === 'manual') return true;
      if (studySubMode.value === 'battle') {
        return activeColor.value === playerSide.value && !isAiThinking.value;
      }
      if (studySubMode.value === 'edit') return true;
    }
    if (gameMode.value === 'pve') {
      return activeColor.value === playerSide.value && !isAiThinking.value;
    }
    return true; // replay
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

  function clearAiWatchdog() {
    if (aiWatchdogTimer) {
      clearTimeout(aiWatchdogTimer);
      aiWatchdogTimer = null;
    }
  }

  function handleAiFailure(reason: string) {
    clearAiWatchdog();
    isAiThinking.value = false;
    activeAiSearchId.value = null;
    isEngineError.value = true;
    engineErrorMsg.value = reason;
    engineStatusText.value = '引擎异常: ' + reason;
    console.error('[AI Failure]', reason);
  }

  // Initialize engine & listeners
  async function initEngine() {
    if (isListenerInit) return;
    isListenerInit = true;

    if (!isTauri()) {
      engineStatusText.value = '网页预览模式 (无引擎)';
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
        isEngineError.value = false;
        engineErrorMsg.value = null;
        engineStatusText.value = '就绪';
        await engineSettings.fetchEngineStatus();
        await engineSettings.applySettings();
        checkAiTurn();
      });

      await listen<string>('engine-status', (e) => {
        if (e.payload === 'stopped') {
          isEngineReady.value = false;
          isAiThinking.value = false;
          isAnalyzing.value = false;
          clearAiWatchdog();
          engineStatusText.value = '引擎已停止';
          if (
            (gameMode.value === 'pve' && activeColor.value !== playerSide.value) ||
            (gameMode.value === 'study' && studySubMode.value === 'battle' && activeColor.value !== playerSide.value)
          ) {
            handleAiFailure('引擎进程已退出');
          }
        }
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
          clearAiWatchdog();
          isAiThinking.value = false;
          activeAiSearchId.value = null;
          executeAiMove(bestmove);
        }
      });

      // Start engine process
      engineStatusText.value = '启动皮卡鱼...';
      await invoke('start_engine', {});
    } catch (err: any) {
      console.warn('Init engine error:', err);
      engineStatusText.value = '单机模式 (未加载引擎)';
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
      isEngineError.value = false;
      engineErrorMsg.value = null;
      engineStatusText.value = '皮卡鱼思考中...';
    } else {
      isAnalyzing.value = true;
      engineStatusText.value = '实时分析中...';
    }

    try {
      const fen = board.value.getFen();
      let searchType: string;
      let limitValue: number | null = null;
      let expectedTimeMs = 2000;

      if (isAiMoveRequest) {
        searchType = engineSettings.matchSearchType;
        if (searchType === 'movetime') {
          limitValue = engineSettings.matchMovetimeMs;
          expectedTimeMs = engineSettings.matchMovetimeMs;
        } else if (searchType === 'depth') {
          limitValue = engineSettings.matchDepth;
          expectedTimeMs = 10000;
        } else if (searchType === 'nodes') {
          limitValue = engineSettings.matchNodes;
          expectedTimeMs = 10000;
        }
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

        // Setup watchdog timer
        clearAiWatchdog();
        const timeoutMs = Math.max(8000, expectedTimeMs + 6000);
        aiWatchdogTimer = setTimeout(() => {
          if (isAiThinking.value && activeAiSearchId.value === searchId) {
            handleAiFailure('AI 思考超时，未收到引擎走法');
          }
        }, timeoutMs);
      }
    } catch (err: any) {
      console.error('Search error:', err);
      if (isAiMoveRequest) {
        handleAiFailure(String(err));
      } else {
        isAnalyzing.value = false;
      }
    }
  }

  async function stopAnalysis() {
    clearAiWatchdog();
    isAiThinking.value = false;
    isAnalyzing.value = false;
    activeAiSearchId.value = null;
    currentSearchId.value = 0;
    engineStatusText.value = '分析已停止';

    if (!isTauri()) return;
    try {
      await invoke('stop_search');
    } catch (e) {
      console.warn('Stop search error:', e);
    }
  }

  function executeAiMove(uci: string) {
    clearAiWatchdog();

    if (!uci || uci === '(none)' || uci.length < 4) {
      const over = board.value.isGameOver();
      if (over.isOver) {
        sound.play('end');
      } else {
        handleAiFailure('AI 无合法走法 (已认输或困毙)');
      }
      return;
    }

    try {
      const { from, to } = parseUciMove(uci);

      if (isNaN(from.file) || isNaN(from.rank) || isNaN(to.file) || isNaN(to.rank)) {
        handleAiFailure('AI 走法格式异常: ' + uci);
        return;
      }

      const piece = board.value.grid[from.rank]?.[from.file];
      if (!piece || piece.color !== activeColor.value) {
        handleAiFailure('AI 走法与当前执棋方不符: ' + uci);
        return;
      }

      const legalMoves = board.value.getLegalMoves(from);
      const isLegal = legalMoves.some(m => m.file === to.file && m.rank === to.rank);
      if (!isLegal) {
        handleAiFailure('AI 走法不符合规则: ' + uci);
        return;
      }

      const move = board.value.makeMove(from, to);
      if (move) {
        boardVersion.value++;
        isEngineError.value = false;
        engineErrorMsg.value = null;
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
        } else if (autoAnalysis.value || (gameMode.value === 'study' && isStudyAnalyzing.value)) {
          triggerAnalysis(false);
        }
      } else {
        handleAiFailure('落子执行失败: ' + uci);
      }
    } catch (err: any) {
      handleAiFailure('执行走棋异常: ' + String(err));
    }
  }

  function checkAiTurn() {
    clearAiWatchdog();
    if (gameMode.value === 'pve' && activeColor.value !== playerSide.value) {
      const over = board.value.isGameOver();
      if (!over.isOver) {
        triggerAnalysis(true);
      }
    } else if (gameMode.value === 'study' && studySubMode.value === 'battle' && activeColor.value !== playerSide.value) {
      const over = board.value.isGameOver();
      if (!over.isOver) {
        triggerAnalysis(true);
      }
    } else if (autoAnalysis.value || (gameMode.value === 'study' && isStudyAnalyzing.value)) {
      triggerAnalysis(false);
    }
  }

  async function retryAiMove() {
    clearAiWatchdog();
    if (isAiThinking.value) {
      await stopAnalysis();
    }
    isEngineError.value = false;
    engineErrorMsg.value = null;
    engineStatusText.value = '正在重试 AI 搜索...';
    checkAiTurn();
  }

  async function restartEngineAndResume() {
    clearAiWatchdog();
    await stopAnalysis();
    isEngineError.value = false;
    engineErrorMsg.value = null;
    engineStatusText.value = '正在重启引擎...';
    const settings = useEngineSettingsStore();
    const ok = await settings.restartEngine();
    if (ok) {
      checkAiTurn();
    } else {
      handleAiFailure('引擎重启失败: ' + (settings.lastError || '未知错误'));
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

    boardVersion.value++;
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

  async function undo() {
    clearAiWatchdog();
    if (isAiThinking.value || isAnalyzing.value) {
      await stopAnalysis();
    }
    isEngineError.value = false;
    engineErrorMsg.value = null;

    if (gameMode.value === 'pve' || (gameMode.value === 'study' && studySubMode.value === 'battle')) {
      // In battle mode:
      // If it is AI turn (player just moved, AI has not moved yet): only undo 1 move
      if (activeColor.value !== playerSide.value) {
        if (board.value.history.length >= 1) {
          board.value.undoMove();
        }
      } else {
        // If it is player turn (AI finished moving): undo 2 moves (AI move + player move)
        if (board.value.history.length >= 2) {
          board.value.undoMove();
          board.value.undoMove();
        } else if (board.value.history.length === 1) {
          board.value.undoMove();
        }
      }
    } else {
      // PVP or study manual mode: undo 1 single move
      board.value.undoMove();
    }

    boardVersion.value++;
    selectedPos.value = null;
    legalTargets.value = [];
    currentStep.value = board.value.history.length;
    engineInfo.value.multipvLines = [];
    selectedMultiPv.value = 1;
    sound.play('undo');

    checkAiTurn();
  }

  async function newGame(mode: GameMode = 'pve', side: PieceColor = 'red') {
    clearAiWatchdog();
    if (isAiThinking.value || isAnalyzing.value) {
      await stopAnalysis();
    }
    isEngineError.value = false;
    engineErrorMsg.value = null;

    gameMode.value = mode;
    playerSide.value = side;
    flipped.value = side === 'black';

    board.value.reset(INITIAL_FEN);
    boardVersion.value++;
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

  // Study Mode Specific Actions
  async function enterStudyMode(subMode: StudySubMode = 'manual') {
    clearAiWatchdog();
    if (isAiThinking.value || isAnalyzing.value) {
      await stopAnalysis();
    }
    gameMode.value = 'study';
    studySubMode.value = subMode;
    isEngineError.value = false;
    engineErrorMsg.value = null;
    selectedPos.value = null;
    legalTargets.value = [];
    engineInfo.value.multipvLines = [];
    selectedMultiPv.value = 1;
  }

  async function exitStudyMode() {
    clearAiWatchdog();
    if (isAiThinking.value || isAnalyzing.value) {
      await stopAnalysis();
    }
    isStudyAnalyzing.value = false;
    gameMode.value = 'pve';
    isEngineError.value = false;
    engineErrorMsg.value = null;
    selectedPos.value = null;
    legalTargets.value = [];
  }

  async function setStudySubMode(mode: StudySubMode) {
    if (isAiThinking.value || isAnalyzing.value) {
      await stopAnalysis();
    }
    studySubMode.value = mode;
    isEngineError.value = false;
    engineErrorMsg.value = null;
    selectedPos.value = null;
    legalTargets.value = [];
    if (mode === 'battle') {
      checkAiTurn();
    }
  }

  async function setActiveColor(color: PieceColor) {
    if (isAiThinking.value || isAnalyzing.value) {
      await stopAnalysis();
    }
    board.value.activeColor = color;
    boardVersion.value++;
    selectedPos.value = null;
    legalTargets.value = [];
    currentStep.value = board.value.history.length;
    engineInfo.value.multipvLines = [];
    selectedMultiPv.value = 1;
    if (gameMode.value === 'study' && studySubMode.value === 'battle') {
      checkAiTurn();
    } else if (isStudyAnalyzing.value) {
      triggerAnalysis(false);
    }
  }

  async function resetToPreset(fen: string = INITIAL_FEN) {
    if (isAiThinking.value || isAnalyzing.value) {
      await stopAnalysis();
    }
    board.value.reset(fen);
    boardVersion.value++;
    selectedPos.value = null;
    legalTargets.value = [];
    board.value.history = [];
    currentStep.value = 0;
    engineInfo.value.multipvLines = [];
    selectedMultiPv.value = 1;
    isEngineError.value = false;
    engineErrorMsg.value = null;
    if (gameMode.value === 'study' && studySubMode.value === 'battle') {
      checkAiTurn();
    } else if (isStudyAnalyzing.value) {
      triggerAnalysis(false);
    }
  }

  function loadCustomFen(fen: string): { success: boolean; error?: string } {
    try {
      const clean = fen.trim();
      if (!clean) return { success: false, error: 'FEN 字符串不能为空' };
      resetToPreset(clean);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: String(e.message || e) };
    }
  }

  function triggerStudyAiMove() {
    if (isAiThinking.value) return;
    const over = board.value.isGameOver();
    if (!over.isOver) {
      triggerAnalysis(true);
    }
  }

  async function toggleStudyAnalysis() {
    isStudyAnalyzing.value = !isStudyAnalyzing.value;
    if (isStudyAnalyzing.value) {
      triggerAnalysis(false);
    } else {
      await stopAnalysis();
    }
  }

  function setPieceAt(pos: Position, piece: { type: PieceType; color: PieceColor } | null) {
    if (piece) {
      board.value.grid[pos.rank][pos.file] = {
        color: piece.color,
        type: piece.type,
        id: `p_${piece.color}_${piece.type}_${pos.rank}_${pos.file}_${Date.now()}`,
      };
    } else {
      board.value.grid[pos.rank][pos.file] = null;
    }
    boardVersion.value++;
    currentStep.value = board.value.history.length;
  }

  function clearBoard() {
    for (let r = 0; r < 10; r++) {
      for (let f = 0; f < 9; f++) {
        board.value.grid[r][f] = null;
      }
    }
    board.value.history = [];
    boardVersion.value++;
    currentStep.value = 0;
  }

  function flipBoard() {
    flipped.value = !flipped.value;
  }

  function jumpToStep(step: number) {
    if (step < 0 || step > board.value.history.length) return;
    currentStep.value = step;
    if (autoAnalysis.value || isAnalyzing.value || isStudyAnalyzing.value) {
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
    studySubMode,
    playerSide,
    aiThinkingTimeMs,
    isEngineReady,
    isAiThinking,
    isAnalyzing,
    isStudyAnalyzing,
    isEngineError,
    engineErrorMsg,
    matchStatus,
    engineName,
    engineStatusText,
    engineInfo,
    selectedMultiPv,
    aiArrow,
    inCheckKingPos,
    isUserTurn,
    currentStep,
    currentFen,
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
    checkAiTurn,
    retryAiMove,
    restartEngineAndResume,

    // Study mode exports
    enterStudyMode,
    exitStudyMode,
    setStudySubMode,
    setActiveColor,
    resetToPreset,
    loadCustomFen,
    triggerStudyAiMove,
    toggleStudyAnalysis,
    setPieceAt,
    clearBoard,
  };
});
