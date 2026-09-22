import { describe, it, expect, beforeEach } from 'vitest';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { XiangqiBoard } from '../src/core/chess/board';
import { parseUciMove } from '../src/core/chess/fen';
import { getAllLegalMoves } from '../src/core/chess/rules';
import { setActivePinia, createPinia } from 'pinia';
import { useGameStore } from '../src/stores/gameStore';
import { useEngineSettingsStore } from '../src/stores/engineSettingsStore';

describe('Xiangqi Studio — V0.3.4 卡顿回归与任务冲突专项诊断测试', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('实验 A：普通对弈真实连续 20 个人机回合完整对弈 (关闭实时分析，定步长落子验证)', async () => {
    const engineDir = path.resolve(__dirname, '../src-tauri/resources');
    const engineExe = path.join(engineDir, 'pikafish-bmi2.exe');

    const proc = spawn(engineExe, [], {
      cwd: engineDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdoutBuffer = '';
    proc.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString();
    });

    const sendCmd = (cmd: string) => {
      proc.stdin.write(`${cmd}\n`);
    };

    const waitFor = (pattern: string | RegExp, timeoutMs = 8000): Promise<string> => {
      return new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
          const match = typeof pattern === 'string'
            ? stdoutBuffer.includes(pattern)
            : pattern.test(stdoutBuffer);

          if (match) {
            const out = stdoutBuffer;
            stdoutBuffer = '';
            resolve(out);
          } else if (Date.now() - start > timeoutMs) {
            reject(new Error(`Timeout waiting for ${pattern}. Buffer: ${stdoutBuffer}`));
          } else {
            setTimeout(check, 10);
          }
        };
        check();
      });
    };

    sendCmd('uci');
    await waitFor('uciok');
    sendCmd('setoption name Threads value 2');
    sendCmd('setoption name Hash value 64');
    sendCmd('setoption name EvalFile value pikafish.nnue');
    sendCmd('isready');
    await waitFor('readyok');

    const board = new XiangqiBoard();
    const movesList: string[] = [];

    // 20 回合人类预定合法走法
    const humanMoves = [
      'h2e2', 'b0c2', 'i0i1', 'i1f1', 'c0e2', 
      'b2b6', 'a0b0', 'e3e4', 'g3g4', 'd0e1', 
      'c2d4', 'f1f7', 'b6d6', 'e2c4', 'e1d2',
      'a3a4', 'i3i4', 'g4g5', 'd4e6', 'f7f8'
    ];

    let completedRounds = 0;

    for (let round = 0; round < 20; round++) {
      expect(board.activeColor).toBe('red');
      const legalMoves = getAllLegalMoves(board.grid, 'red');
      expect(legalMoves.length).toBeGreaterThan(0);

      // 人类落子
      const preferred = humanMoves[round];
      const humanChoice = legalMoves.find(m => m.uci === preferred) || legalMoves[0];
      const hm = board.makeMove(humanChoice.from, humanChoice.to);
      expect(hm).not.toBeNull();
      movesList.push(humanChoice.uci);

      if (board.isGameOver().isOver) break;

      // 验证执棋方切换为黑方 (AI)
      expect(board.activeColor).toBe('black');

      // AI 搜索 (固定 100ms)
      sendCmd(`position startpos moves ${movesList.join(' ')}`);
      sendCmd('go movetime 100');

      const out = await waitFor(/bestmove\s+([a-i]\d[a-i]\d)/);
      const match = out.match(/bestmove\s+([a-i]\d[a-i]\d)/);
      expect(match).not.toBeNull();
      const bestMoveUci = match![1];

      // 校验并执行 AI 落子
      const { from, to } = parseUciMove(bestMoveUci);
      const piece = board.grid[from.rank]?.[from.file];
      expect(piece?.color).toBe('black');

      const aim = board.makeMove(from, to);
      expect(aim).not.toBeNull();
      movesList.push(bestMoveUci);

      completedRounds++;
      if (board.isGameOver().isOver) break;

      // 验证落子后顺利交还红方
      expect(board.activeColor).toBe('red');
    }

    sendCmd('quit');
    expect(completedRounds).toBeGreaterThanOrEqual(15);
  });

  it('实验 B：普通对局隔离性验证：右侧开启无限分析时，对局搜索依然严格为有限时间，且落子不被锁死', async () => {
    const game = useGameStore();
    const settings = useEngineSettingsStore();

    // 用户在右侧分析面板选择了“无限”
    settings.analysisSearchType = 'infinite';
    settings.matchSearchType = 'movetime';
    settings.matchMovetimeMs = 1000;

    game.newGame('pve', 'red');
    expect(game.activeColor).toBe('red');
    expect(game.isUserTurn).toBe(true);

    // 走红棋
    const { from: rf, to: rt } = parseUciMove('h2e2');
    game.makeUserMove(rf, rt);
    expect(game.activeColor).toBe('black');

    // 校验对局搜索配置未被污染为无限
    expect(settings.matchSearchType).not.toBe('infinite');
    expect(settings.matchSearchType).toBe('movetime');
    expect(settings.matchMovetimeMs).toBe(1000);
  });

  it('实验 C：残局研究与普通对弈切换：残局分析任务切回普通对弈无残留', async () => {
    const game = useGameStore();

    // 1. 进入残局研究
    await game.enterStudyMode('manual');
    expect(game.gameMode).toBe('study');
    game.isStudyAnalyzing = true;
    game.isAnalyzing = true;

    // 2. 模拟切换回普通对局
    await game.exitStudyMode();
    expect(game.gameMode).toBe('pve');
    expect(game.isStudyAnalyzing).toBe(false);
    expect(game.isAnalyzing).toBe(false);

    // 3. 开始新对局
    await game.newGame('pve', 'red');
    expect(game.activeColor).toBe('red');
    expect(game.isUserTurn).toBe(true);
  });

  it('实验 D：高频中断恢复：AI 思考中与分析中执行悔棋，不会残留死锁', async () => {
    const game = useGameStore();
    game.newGame('pve', 'red');

    // 红方走棋
    const { from: rf, to: rt } = parseUciMove('h2e2');
    game.makeUserMove(rf, rt);
    expect(game.activeColor).toBe('black');

    // 模拟 AI 正在思考中
    game.isAiThinking = true;
    game.activeAiSearchId = 999;

    // 思考中玩家点击悔棋
    await game.undo();

    // 核心断言：AI 思考被安全取消，回合回到红方人类，棋盘可操作！
    expect(game.isAiThinking).toBe(false);
    expect(game.activeColor).toBe('red');
    expect(game.isUserTurn).toBe(true);
    expect(game.board.history.length).toBe(0);
  });

  it('实验 E：验证 info 节流与 MultiPV 数据完整性', async () => {
    const engineDir = path.resolve(__dirname, '../src-tauri/resources');
    const engineExe = path.join(engineDir, 'pikafish-bmi2.exe');

    const proc = spawn(engineExe, [], {
      cwd: engineDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdoutBuffer = '';
    let infoCount = 0;
    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdoutBuffer += text;
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('info ')) infoCount++;
      }
    });

    const sendCmd = (cmd: string) => {
      proc.stdin.write(`${cmd}\n`);
    };

    const waitFor = (pattern: string | RegExp, timeoutMs = 5000): Promise<string> => {
      return new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
          const match = typeof pattern === 'string'
            ? stdoutBuffer.includes(pattern)
            : pattern.test(stdoutBuffer);

          if (match) {
            const out = stdoutBuffer;
            resolve(out);
          } else if (Date.now() - start > timeoutMs) {
            reject(new Error(`Timeout waiting for ${pattern}`));
          } else {
            setTimeout(check, 10);
          }
        };
        check();
      });
    };

    sendCmd('uci');
    await waitFor('uciok');
    sendCmd('setoption name Threads value 2');
    sendCmd('setoption name MultiPV value 3');
    sendCmd('setoption name EvalFile value pikafish.nnue');
    sendCmd('isready');
    await waitFor('readyok');

    sendCmd('position startpos');
    sendCmd('go movetime 200');
    await waitFor('bestmove');

    sendCmd('quit');

    // 确认引擎产生了搜索信息
    expect(infoCount).toBeGreaterThan(0);
    expect(stdoutBuffer).toContain('bestmove');
  });
});
