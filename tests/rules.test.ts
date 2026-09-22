import { describe, it, expect } from 'vitest';
import { XiangqiBoard } from '../src/core/chess/board';
import { fenToBoard, boardToFen, INITIAL_FEN, uciToPos } from '../src/core/chess/fen';
import {
  areKingsFacing,
  getLegalMovesForPosition,
  isKingInCheck,
} from '../src/core/chess/rules';

describe('Xiangqi Rules Engine Verification', () => {
  it('1. FEN 导入导出后局面一致 (FEN export/import round-trip)', () => {
    const board = new XiangqiBoard(INITIAL_FEN);
    const exportedFen = board.getFen();
    expect(exportedFen.split(' ')[0]).toBe(INITIAL_FEN.split(' ')[0]);
    expect(board.activeColor).toBe('red');
  });

  it('2. 行棋方切换与执行/撤销后局面一致 (Move execution, turn switch & undo)', () => {
    const board = new XiangqiBoard();
    const initialFen = board.getFen();

    // Red moves cannon: b2 -> e2 (炮二平五 / 中炮)
    const move = board.makeMove(uciToPos('b2'), uciToPos('e2'));
    expect(move).not.toBeNull();
    expect(move?.uci).toBe('b2e2');
    expect(board.activeColor).toBe('black');

    // Undo move
    const undone = board.undoMove();
    expect(undone?.uci).toBe('b2e2');
    expect(board.activeColor).toBe('red');
    expect(board.getFen()).toBe(initialFen);
  });

  it('3. 马腿被阻挡 (Hobbled horse leg check)', () => {
    // Standard starting position: Red horse at b0 (b0)
    // Front horse leg is at b1. b1 is empty in startpos, so b0 can move to c2 and a2.
    const board = new XiangqiBoard();
    const legalMoves = board.getLegalMoves(uciToPos('b0'));
    const ucis = legalMoves.map(m => board.getFen() && `${String.fromCharCode(97 + m.file)}${m.rank}`);
    expect(ucis).toContain('c2');
    expect(ucis).toContain('a2');

    // Place an obstacle at b1 to block horse leg
    board.grid[1][1] = { color: 'red', type: 'p', id: 'blocker' };
    const blockedMoves = board.getLegalMoves(uciToPos('b0'));
    expect(blockedMoves.length).toBe(0);
  });

  it('4. 象眼被阻挡 (Blocked elephant eye check)', () => {
    // Starting position: Red elephant at c0. Eye is at d1.
    // In startpos, c0 can move to a2 and e2.
    const board = new XiangqiBoard();
    const legalMoves = board.getLegalMoves(uciToPos('c0'));
    const ucis = legalMoves.map(m => `${String.fromCharCode(97 + m.file)}${m.rank}`);
    expect(ucis).toContain('a2');
    expect(ucis).toContain('e2');

    // Place obstacle on eye d1
    board.grid[1][3] = { color: 'red', type: 'p', id: 'eye_blocker' };
    const movesBlocked = board.getLegalMoves(uciToPos('c0'));
    const ucisBlocked = movesBlocked.map(m => `${String.fromCharCode(97 + m.file)}${m.rank}`);
    expect(ucisBlocked).not.toContain('e2'); // cannot reach e2 now
    expect(ucisBlocked).toContain('a2'); // can still reach a2
  });

  it('5. 炮隔一子吃子 (Cannon jump over hurdle to capture)', () => {
    // Custom FEN: Red cannon at e2, black soldier at e6, red pawn at e4 as hurdle
    // FEN: 4k4/9/9/4p4/4P4/9/9/4C4/9/4K4 w - - 0 1
    const testFen = '4k4/9/9/4p4/4P4/9/9/4C4/9/4K4 w - - 0 1';
    const board = new XiangqiBoard(testFen);
    const cannonPos = uciToPos('e2');
    const legalMoves = board.getLegalMoves(cannonPos);
    const ucis = legalMoves.map(m => `${String.fromCharCode(97 + m.file)}${m.rank}`);

    // Can capture e6 over e4!
    expect(ucis).toContain('e6');
    // Cannot move through e4 to an empty space past it without capture
    expect(ucis).not.toContain('e5');
    expect(ucis).not.toContain('e7');
  });

  it('6. 将帅照面禁止 (Flying General / Kings facing is illegal)', () => {
    // Both kings on file e (e0 and e9) with only one piece between them on e4
    // FEN: 4k4/9/9/9/4R4/9/9/9/9/4K4 w - - 0 1
    const testFen = '4k4/9/9/9/4R4/9/9/9/9/4K4 w - - 0 1';
    const board = new XiangqiBoard(testFen);
    const rookPos = uciToPos('e5'); // e5 is rank 5, file e

    // Moving rook away from file e (e.g. to a5) would expose kings facing each other!
    const rookMoves = board.getLegalMoves(rookPos);
    const ucis = rookMoves.map(m => `${String.fromCharCode(97 + m.file)}${m.rank}`);

    // Rook can only move along file e (e.g. e1, e2, e3, e4, e6...)
    // Rook CANNOT move to a5, b5, c5, d5, f5, g5, h5, i5!
    expect(ucis).not.toContain('a5');
    expect(ucis).not.toContain('d5');
    expect(ucis).not.toContain('f5');
  });

  it('7. 己方被将军时必须应将，禁止走出非法步 (Must respond to check)', () => {
    // Red king at e0. Black chariot at e5 checking Red King directly!
    // FEN: 4k4/9/9/9/4r4/9/9/9/9/4K4 w - - 0 1
    const testFen = '4k4/9/9/9/4r4/9/9/9/9/4K4 w - - 0 1';
    const board = new XiangqiBoard(testFen);
    expect(board.isInCheck('red')).toBe(true);

    const kingPos = uciToPos('e0');
    const legalMoves = board.getLegalMoves(kingPos);
    const ucis = legalMoves.map(m => `${String.fromCharCode(97 + m.file)}${m.rank}`);

    // King cannot remain on file e (cannot step to e1). Must step aside: d0 or f0!
    expect(ucis).not.toContain('e1');
    expect(ucis).toContain('d0');
    expect(ucis).toContain('f0');
  });
});
