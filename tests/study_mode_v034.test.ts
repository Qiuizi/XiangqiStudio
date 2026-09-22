import { describe, it, expect, beforeEach } from 'vitest';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { parseUciMove } from '../src/core/chess/fen';
import { setActivePinia, createPinia } from 'pinia';
import { useGameStore } from '../src/stores/gameStore';

describe('Xiangqi Studio V0.3.4 — 残局研究模式专项综合测试', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('1. 双方手动推演：红黑双方可无限无锁轮流走棋 (彻底解决黑方走棋卡死)', async () => {
    const game = useGameStore();
    await game.enterStudyMode('manual');

    expect(game.gameMode).toBe('study');
    expect(game.studySubMode).toBe('manual');
    expect(game.activeColor).toBe('red');
    expect(game.isUserTurn).toBe(true);

    // 动作 1: 红方 炮二平五 (h2e2)
    const { from: r1_f, to: r1_t } = parseUciMove('h2e2');
    game.selectSquare(r1_f);
    expect(game.selectedPos).toEqual(r1_f);
    expect(game.legalTargets.length).toBeGreaterThan(0);
    game.makeUserMove(r1_f, r1_t);

    expect(game.board.history.length).toBe(1);
    expect(game.activeColor).toBe('black');
    // 核心验证点：红方走完后，黑方必须可以走棋！
    expect(game.isUserTurn).toBe(true);

    // 动作 2: 黑方 马8进7 (b9c7)
    const { from: b1_f, to: b1_t } = parseUciMove('b9c7');
    game.selectSquare(b1_f);
    expect(game.selectedPos).toEqual(b1_f);
    expect(game.legalTargets.length).toBeGreaterThan(0);
    game.makeUserMove(b1_f, b1_t);

    expect(game.board.history.length).toBe(2);
    expect(game.activeColor).toBe('red');
    expect(game.isUserTurn).toBe(true);

    // 动作 3: 红方 马二进三 (b0c2)
    const { from: r2_f, to: r2_t } = parseUciMove('b0c2');
    game.selectSquare(r2_f);
    expect(game.selectedPos).toEqual(r2_f);
    game.makeUserMove(r2_f, r2_t);

    expect(game.board.history.length).toBe(3);
    expect(game.activeColor).toBe('black');
    expect(game.isUserTurn).toBe(true);

    // 动作 4: 黑方 车9平8 (a9b9)
    const { from: b2_f, to: b2_t } = parseUciMove('a9b9');
    game.selectSquare(b2_f);
    expect(game.selectedPos).toEqual(b2_f);
    game.makeUserMove(b2_f, b2_t);

    expect(game.board.history.length).toBe(4);
    expect(game.activeColor).toBe('red');
    expect(game.isUserTurn).toBe(true);

    // 动作 5: 红方 车一进一 (i0i1)
    const { from: r3_f, to: r3_t } = parseUciMove('i0i1');
    game.selectSquare(r3_f);
    game.makeUserMove(r3_f, r3_t);

    expect(game.board.history.length).toBe(5);
    expect(game.activeColor).toBe('black');
    expect(game.isUserTurn).toBe(true);

    // 动作 6: 黑方 卒7进1 (c6c5)
    const { from: b3_f, to: b3_t } = parseUciMove('c6c5');
    game.selectSquare(b3_f);
    game.makeUserMove(b3_f, b3_t);

    expect(game.board.history.length).toBe(6);
    expect(game.activeColor).toBe('red');
    expect(game.isUserTurn).toBe(true);
  });

  it('2. FEN 实时响应与经典残局局面载入同步', async () => {
    const game = useGameStore();
    await game.enterStudyMode('manual');

    const initialFen = game.currentFen;
    expect(initialFen).toContain('w - - 0 1');

    // 走出一步后，FEN 必须立即反映变更
    const { from: r1_f, to: r1_t } = parseUciMove('h2e2');
    game.makeUserMove(r1_f, r1_t);
    expect(game.currentFen).not.toBe(initialFen);
    expect(game.currentFen).toContain(' b - - ');

    // 载入炮兵胜双士预设残局
    const paoBingFen = '4k4/4a4/4a4/9/9/9/4P4/4C4/9/4K4 w - - 0 1';
    await game.resetToPreset(paoBingFen);
    expect(game.currentFen).toBe(paoBingFen);
    expect(game.activeColor).toBe('red');
    expect(game.board.history.length).toBe(0);

    // 检查棋盘上的子力 (Rank 0 为红方底线，Rank 9 为黑方底线)
    const redKing = game.grid[0][4];
    expect(redKing?.type).toBe('k');
    expect(redKing?.color).toBe('red');

    const blackKing = game.grid[9][4];
    expect(blackKing?.type).toBe('k');
    expect(blackKing?.color).toBe('black');

    // 载入自定义 FEN
    const customFen = '3k5/4a4/4ba3/9/9/9/2P1P1P2/9/9/4K4 b - - 0 1';
    const res = game.loadCustomFen(customFen);
    expect(res.success).toBe(true);
    expect(game.currentFen).toBe(customFen);
    expect(game.activeColor).toBe('black');
  });

  it('3. 自由摆棋模式：清空棋盘、放置/擦除棋子、指定先行方与 FEN 联动', async () => {
    const game = useGameStore();
    await game.enterStudyMode('edit');

    expect(game.studySubMode).toBe('edit');

    // 清空棋盘
    game.clearBoard();
    for (let r = 0; r < 10; r++) {
      for (let f = 0; f < 9; f++) {
        expect(game.grid[r][f]).toBeNull();
      }
    }
    expect(game.currentFen).toBe('9/9/9/9/9/9/9/9/9/9 w - - 0 1');

    // 放置红帅 (Rank 0, file 4)
    game.setPieceAt({ rank: 0, file: 4 }, { type: 'k', color: 'red' });
    expect(game.grid[0][4]?.type).toBe('k');
    expect(game.grid[0][4]?.color).toBe('red');

    // 放置黑将 (Rank 9, file 4)
    game.setPieceAt({ rank: 9, file: 4 }, { type: 'k', color: 'black' });
    expect(game.grid[9][4]?.type).toBe('k');
    expect(game.grid[9][4]?.color).toBe('black');

    // 放置红炮 [2, 4]
    game.setPieceAt({ rank: 2, file: 4 }, { type: 'c', color: 'red' });
    expect(game.grid[2][4]?.type).toBe('c');

    // FEN 必须自动同步包含放置的子力
    expect(game.currentFen).toContain('k');
    expect(game.currentFen).toContain('C');
    expect(game.currentFen).toContain('K');

    // 擦除红炮
    game.setPieceAt({ rank: 2, file: 4 }, null);
    expect(game.grid[2][4]).toBeNull();
    expect(game.currentFen).not.toContain('C');

    // 指定先行方为黑方
    await game.setActiveColor('black');
    expect(game.activeColor).toBe('black');
    expect(game.currentFen).toContain('b - - 0 1');
  });

  it('4. 残局推演悔棋隔离：手动推演单步撤销 vs 对抗模式双步撤销', async () => {
    const game = useGameStore();

    // --- A. 手动推演模式悔棋验证 ---
    await game.enterStudyMode('manual');
    const { from: r1_f, to: r1_t } = parseUciMove('h2e2');
    game.makeUserMove(r1_f, r1_t);
    const { from: b1_f, to: b1_t } = parseUciMove('b9c7');
    game.makeUserMove(b1_f, b1_t);

    expect(game.board.history.length).toBe(2);
    expect(game.activeColor).toBe('red');

    // 点击悔棋：手动模式只回退 1 步 (撤销黑方最后一步)
    await game.undo();
    expect(game.board.history.length).toBe(1);
    expect(game.activeColor).toBe('black');
    expect(game.isUserTurn).toBe(true);

    // 再次悔棋：撤销红方一步
    await game.undo();
    expect(game.board.history.length).toBe(0);
    expect(game.activeColor).toBe('red');
    expect(game.isUserTurn).toBe(true);

    // --- B. 人机残局对抗模式悔棋验证 ---
    await game.setStudySubMode('battle');
    game.playerSide = 'red';

    // 玩家走一步红棋
    game.makeUserMove(r1_f, r1_t);
    expect(game.board.history.length).toBe(1);
    expect(game.activeColor).toBe('black');

    // 模拟 AI 走出黑棋
    game.board.makeMove(b1_f, b1_t);
    expect(game.board.history.length).toBe(2);
    expect(game.activeColor).toBe('red');

    // 玩家回合点击悔棋：必须撤回 2 步 (恢复到玩家走红棋之前)
    await game.undo();
    expect(game.board.history.length).toBe(0);
    expect(game.activeColor).toBe('red');
    expect(game.isUserTurn).toBe(true);
  });

  it('5. 人机残局对抗模式：真实 Pikafish 引擎落子与双方持续交替对弈', async () => {
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

    const game = useGameStore();
    await game.enterStudyMode('battle');
    game.playerSide = 'red';

    // 载入残局：车兵胜单车
    const cheBingFen = '4k4/9/9/9/4r4/4R4/4P4/9/9/4K4 w - - 0 1';
    await game.resetToPreset(cheBingFen);

    expect(game.activeColor).toBe('red');
    expect(game.isUserTurn).toBe(true);

    const movesList: string[] = [];

    // 回合 1: 人类走红车进一 e4e5
    const { from: r_f, to: r_t } = parseUciMove('e4e5');
    game.makeUserMove(r_f, r_t);
    expect(game.board.history.length).toBe(1);
    expect(game.activeColor).toBe('black');
    movesList.push('e4e5');

    // 引擎作为黑方搜索走法
    sendCmd(`position fen ${cheBingFen} moves ${movesList.join(' ')}`);
    sendCmd('go movetime 150');

    const out = await waitFor(/bestmove\s+([a-i]\d[a-i]\d)/);
    const match = out.match(/bestmove\s+([a-i]\d[a-i]\d)/);
    expect(match).not.toBeNull();
    const aiMoveUci = match![1];

    // 模拟应用引擎走棋
    const { from: ai_f, to: ai_t } = parseUciMove(aiMoveUci);
    const executedMove = game.board.makeMove(ai_f, ai_t);
    expect(executedMove).not.toBeNull();
    expect(game.board.history.length).toBe(2);

    // AI 落子后，回合必须顺利交还红方人类！
    expect(game.activeColor).toBe('red');
    expect(game.isUserTurn).toBe(true);

    sendCmd('quit');
  });
});
