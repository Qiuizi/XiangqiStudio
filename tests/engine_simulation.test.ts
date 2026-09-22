import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { XiangqiBoard } from '../src/core/chess/board';
import { parseUciMove } from '../src/core/chess/fen';
import { getAllLegalMoves } from '../src/core/chess/rules';

describe('Real Pikafish Engine Integration Verification (真实皮卡鱼引擎联调测试)', () => {
  it('1. 引擎可执行文件与 NNUE 权重实际存在', () => {
    const engineDir = path.resolve(__dirname, '../src-tauri/resources');
    const bmi2Exe = path.join(engineDir, 'pikafish-bmi2.exe');
    const avx2Exe = path.join(engineDir, 'pikafish-avx2.exe');
    const nnueFile = path.join(engineDir, 'pikafish.nnue');

    expect(fs.existsSync(bmi2Exe) || fs.existsSync(avx2Exe)).toBe(true);
    expect(fs.existsSync(nnueFile)).toBe(true);
  });

  it('2. 真实 Pikafish 进行 20 个半回合实战对局、悔棋与换边测试', async () => {
    const engineDir = path.resolve(__dirname, '../src-tauri/resources');
    const engineExe = path.join(engineDir, 'pikafish-bmi2.exe');
    const nnueFile = path.join(engineDir, 'pikafish.nnue');

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

    // 1. UCI Handshake
    sendCmd('uci');
    await waitFor('uciok');

    // 2. Load NNUE & isready
    sendCmd('setoption name EvalFile value pikafish.nnue');
    sendCmd('isready');
    await waitFor('readyok');

    // 3. Human (Red) vs Pikafish (Black) - Play 20 half-moves (10 plies each)
    const board = new XiangqiBoard();
    const playedMoves: string[] = [];

    // Red's scripted opening moves to test varied responses
    const redMoves = [
      'h2e2', // 1. 炮二平五
      'b0c2', // 2. 马八进七
      'i0i1', // 3. 车一进一
      'i1f1', // 4. 车一平四
      'c0e2', // 5. 相七进五
      'b2b6', // 6. 炮八进四 (过河炮)
      'a0b0', // 7. 车九平八
      'e3e4', // 8. 兵五进一 (中兵挺进)
      'g3g4', // 9. 兵三进一
      'd0e1', // 10. 仕六进五
    ];

    for (let round = 0; round < 10; round++) {
      // --- Player (Red) Turn ---
      expect(board.activeColor).toBe('red');
      const legalRedMoves = getAllLegalMoves(board.grid, 'red');
      expect(legalRedMoves.length).toBeGreaterThan(0);

      const preferred = redMoves.find(u => legalRedMoves.some(m => m.uci === u));
      const moveToPlay = preferred
        ? legalRedMoves.find(m => m.uci === preferred)!
        : legalRedMoves[0];

      const m = board.makeMove(moveToPlay.from, moveToPlay.to);
      expect(m).not.toBeNull();
      playedMoves.push(m!.uci);

      // --- Pikafish (Black) Turn ---
      expect(board.activeColor).toBe('black');
      const currentFen = board.getFen();
      sendCmd(`position fen ${currentFen}`);
      sendCmd('go depth 4');

      const searchOutput = await waitFor(/bestmove [a-i][0-9][a-i][0-9]/);
      expect(searchOutput).toMatch(/info depth/);

      const bestMoveMatch = searchOutput.match(/bestmove ([a-i][0-9][a-i][0-9])/);
      expect(bestMoveMatch).not.toBeNull();
      const blackUci = bestMoveMatch![1];

      // Validate AI move legality in Chinese Chess rules
      const { from: bFrom, to: bTo } = parseUciMove(blackUci);
      const bPiece = board.grid[bFrom.rank][bFrom.file];
      expect(bPiece).not.toBeNull();
      expect(bPiece?.color).toBe('black');

      const bLegalMoves = board.getLegalMoves(bFrom);
      const isBlackMoveLegal = bLegalMoves.some(m => m.file === bTo.file && m.rank === bTo.rank);
      expect(isBlackMoveLegal).toBe(true);

      // Execute AI Move on Board
      const bMove = board.makeMove(bFrom, bTo);
      expect(bMove).not.toBeNull();
      playedMoves.push(bMove!.uci);
    }

    // Verify 20 half-moves played!
    expect(playedMoves.length).toBe(20);
    expect(board.history.length).toBe(20);

    // 4. Test Undo (悔棋)
    const fenBeforeUndo = board.getFen();
    const undoneAi = board.undoMove();
    expect(undoneAi?.piece.color).toBe('black');
    const undonePlayer = board.undoMove();
    expect(undonePlayer?.piece.color).toBe('red');
    expect(board.activeColor).toBe('red');
    expect(board.getFen()).not.toBe(fenBeforeUndo);

    // 5. Test Black Perspective: Player chooses Black, Pikafish is Red (AI moves first)
    board.reset();
    expect(board.activeColor).toBe('red');
    sendCmd(`position fen ${board.getFen()}`);
    sendCmd('go depth 4');

    const firstMoveOutput = await waitFor(/bestmove [a-i][0-9][a-i][0-9]/);
    const firstMoveMatch = firstMoveOutput.match(/bestmove ([a-i][0-9][a-i][0-9])/);
    expect(firstMoveMatch).not.toBeNull();
    const aiFirstMove = firstMoveMatch![1];

    const { from: fFrom, to: fTo } = parseUciMove(aiFirstMove);
    const fPiece = board.grid[fFrom.rank][fFrom.file];
    expect(fPiece?.color).toBe('red');

    const fMove = board.makeMove(fFrom, fTo);
    expect(fMove).not.toBeNull();
    expect(board.activeColor).toBe('black'); // Now user's turn!

    // Clean exit
    sendCmd('quit');
    proc.kill();
  }, 30000);
});
