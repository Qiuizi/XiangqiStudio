import { describe, it, expect, beforeEach } from 'vitest';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { XiangqiBoard } from '../src/core/chess/board';
import { parseUciMove } from '../src/core/chess/fen';
import { getAllLegalMoves } from '../src/core/chess/rules';
import { setActivePinia, createPinia } from 'pinia';
import { useGameStore } from '../src/stores/gameStore';

describe('Xiangqi Studio V0.3.3 — Search Lifecycle & Stability Verification (专项稳定性验证)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('1. 真实 Pikafish 连续 30 个半回合完整对弈测试 (连续走棋无卡死)', async () => {
    const engineDir = path.resolve(__dirname, '../src-tauri/resources');
    const engineExe = path.join(engineDir, 'pikafish-bmi2.exe');
    const nnueFile = path.join(engineDir, 'pikafish.nnue');

    expect(fs.existsSync(engineExe)).toBe(true);
    expect(fs.existsSync(nnueFile)).toBe(true);

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
            setTimeout(check, 20);
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

    // Red's 15 scripted opening/tactical moves
    const redMoves = [
      'h2e2', // 1. 中炮
      'b0c2', // 2. 跳正马
      'i0i1', // 3. 边车进一
      'i1f1', // 4. 占肋道
      'c0e2', // 5. 飞相
      'b2b6', // 6. 巡河炮
      'a0b0', // 7. 出左直车
      'e3e4', // 8. 挺中兵
      'g3g4', // 9. 挺七兵
      'd0e1', // 10. 补仕
      'c2d4', // 11. 盘头马
      'f1f7', // 12. 进车捉子
      'b6d6', // 13. 移炮助攻
      'e2c4', // 14. 展相
      'e1d2', // 15. 上仕
    ];

    for (let round = 0; round < 15; round++) {
      // 1. Human (Red) moves
      expect(board.activeColor).toBe('red');
      const legalRedMoves = getAllLegalMoves(board.grid, 'red');
      expect(legalRedMoves.length).toBeGreaterThan(0);

      const preferred = redMoves[round];
      const moveToPlay = legalRedMoves.find(m => m.uci === preferred) || legalRedMoves[0];

      const m = board.makeMove(moveToPlay.from, moveToPlay.to);
      expect(m).not.toBeNull();
      movesList.push(moveToPlay.uci);

      if (board.isGameOver().isOver) break;

      // 2. Pikafish (Black) moves
      expect(board.activeColor).toBe('black');
      sendCmd(`position startpos moves ${movesList.join(' ')}`);
      sendCmd('go movetime 100');

      const out = await waitFor(/bestmove\s+([a-i]\d[a-i]\d)/);
      const match = out.match(/bestmove\s+([a-i]\d[a-i]\d)/);
      expect(match).not.toBeNull();
      const bestMoveUci = match![1];

      const { from, to } = parseUciMove(bestMoveUci);
      const aiMove = board.makeMove(from, to);
      expect(aiMove).not.toBeNull();
      movesList.push(bestMoveUci);

      if (board.isGameOver().isOver) break;
    }

    sendCmd('quit');
    expect(board.history.length).toBeGreaterThanOrEqual(20);
  });

  it('2. 验证 stop 与新 search 连续下发时输出先后顺序及隔离性', async () => {
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

    const waitFor = (pattern: string | RegExp, timeoutMs = 5000): Promise<string> => {
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
    sendCmd('isready');
    await waitFor('readyok');

    // Start long search 1
    sendCmd('position startpos');
    sendCmd('go infinite');

    await new Promise((r) => setTimeout(r, 60));

    // Abort search 1 and start search 2
    sendCmd('stop');
    sendCmd('position startpos moves h2e2');
    sendCmd('go movetime 150');

    // We should see two distinct bestmoves in sequence
    const out1 = await waitFor(/bestmove\s+[a-i]\d[a-i]\d/);
    expect(out1).toContain('bestmove');

    const out2 = await waitFor(/bestmove\s+[a-i]\d[a-i]\d/);
    expect(out2).toContain('bestmove');

    sendCmd('quit');
  });

  it('3. 前端 store 悔棋时序验证：AI 思考中悔棋只撤一步，不会导致当前回合变成 AI 且锁死', async () => {
    const game = useGameStore();
    game.newGame('pve', 'red');

    // 1. Red moves h2e2 (炮二平五)
    const { from: f1, to: t1 } = parseUciMove('h2e2');
    game.makeUserMove(f1, t1);
    expect(game.board.history.length).toBe(1);
    expect(game.activeColor).toBe('black'); // It is now Black's turn (AI is thinking)

    // Simulate AI thinking state
    game.isAiThinking = true;

    // 2. User clicks undo while AI is thinking
    await game.undo();

    // Verification:
    // It should have undone ONLY 1 move (the user's move)!
    expect(game.board.history.length).toBe(0);
    expect(game.activeColor).toBe('red');
    expect(game.isAiThinking).toBe(false);
    expect(game.isUserTurn).toBe(true); // Board MUST remain interactable!
  });

  it('4. 前端 store 悔棋时序验证：玩家回合悔棋撤销两步，恢复至玩家回合', async () => {
    const game = useGameStore();
    game.newGame('pve', 'red');

    // Turn 1: Red moves h2e2
    const { from: f1, to: t1 } = parseUciMove('h2e2');
    game.makeUserMove(f1, t1);
    expect(game.board.history.length).toBe(1);

    // AI moves b9c7 (马8进7)
    const { from: f2, to: t2 } = parseUciMove('b9c7');
    game.board.makeMove(f2, t2);
    expect(game.board.history.length).toBe(2);
    expect(game.activeColor).toBe('red'); // It is player's turn

    // Player clicks undo
    await game.undo();

    // Verification:
    // Both moves undone, length is 0, activeColor is Red, isUserTurn is true!
    expect(game.board.history.length).toBe(0);
    expect(game.activeColor).toBe('red');
    expect(game.isUserTurn).toBe(true);
  });

  it('5. 异常恢复状态机：引擎错误时不锁死棋盘，支持 retryAiMove 恢复对局', async () => {
    const game = useGameStore();
    game.newGame('pve', 'red');

    // Red moves
    const { from: f1, to: t1 } = parseUciMove('h2e2');
    game.makeUserMove(f1, t1);

    // Simulate AI error
    game.isAiThinking = true;
    // @ts-ignore
    game.isEngineError = true;
    game.engineErrorMsg = '模拟引擎无响应';
    game.isAiThinking = false;

    expect(game.matchStatus).toBe('engine_error');
    expect(game.engineErrorMsg).toBe('模拟引擎无响应');

    // User triggers retry
    await game.retryAiMove();
    expect(game.isEngineError).toBe(false);
    expect(game.engineErrorMsg).toBeNull();
  });
});
