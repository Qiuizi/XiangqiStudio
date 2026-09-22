import { describe, it, expect } from 'vitest';
import { XiangqiBoard } from '../src/core/chess/board';
import { uciToPos } from '../src/core/chess/fen';

describe('Xiangqi Notation Verification (中文着法记谱校验)', () => {
  it('1. 当头炮: 炮二平五 (Red Cannon h2 -> e2)', () => {
    const board = new XiangqiBoard();
    const move = board.makeMove(uciToPos('h2'), uciToPos('e2'));
    expect(move).not.toBeNull();
    expect(move?.notation).toBe('炮二平五');
  });

  it('2. 屏风马左马与右马: 马8进7 (h9 -> g7) 与 马2进3 (b9 -> c7)', () => {
    const board = new XiangqiBoard();
    board.makeMove(uciToPos('h2'), uciToPos('e2')); // Red: 炮二平五

    // Black 8路左马跳7路盘头: h9 -> g7 (马8进7)
    const m1 = board.makeMove(uciToPos('h9'), uciToPos('g7'));
    expect(m1).not.toBeNull();
    expect(m1?.notation).toBe('马8进7');

    // Red moves right horse: b0 -> c2 (马八进七)
    const m2 = board.makeMove(uciToPos('b0'), uciToPos('c2'));
    expect(m2?.notation).toBe('马八进七');

    // Black 2路右马跳3路: b9 -> c7 (马2进3)
    const m3 = board.makeMove(uciToPos('b9'), uciToPos('c7'));
    expect(m3).not.toBeNull();
    expect(m3?.notation).toBe('马2进3');
  });

  it('3. 巡河车: 车一进一 (i0 -> i1)', () => {
    const board = new XiangqiBoard();
    const m1 = board.makeMove(uciToPos('i0'), uciToPos('i1'));
    expect(m1?.notation).toBe('车一进一');

    // Black pawn advance: e6 -> e5 (卒5进1)
    const m2 = board.makeMove(uciToPos('e6'), uciToPos('e5'));
    expect(m2?.notation).toBe('卒5进1');

    // Red chariot horizontal shift: i1 -> f1 (车一平四)
    const m3 = board.makeMove(uciToPos('i1'), uciToPos('f1'));
    expect(m3?.notation).toBe('车一平四');
  });

  it('4. 飞相与上仕: 相七进五与士4进5', () => {
    const board = new XiangqiBoard();
    // Red Bishop c0 -> e2 (相七进五)
    const m1 = board.makeMove(uciToPos('c0'), uciToPos('e2'));
    expect(m1?.notation).toBe('相七进五');

    // Black Advisor d9 -> e8 (士4进5)
    const m2 = board.makeMove(uciToPos('d9'), uciToPos('e8'));
    expect(m2?.notation).toBe('士4进5');

    // Red Advisor d0 -> e1 (仕六进五)
    const m3 = board.makeMove(uciToPos('d0'), uciToPos('e1'));
    expect(m3?.notation).toBe('仕六进五');
  });

  it('5. 进中兵: 兵五进一', () => {
    const board = new XiangqiBoard();
    const m1 = board.makeMove(uciToPos('e3'), uciToPos('e4'));
    expect(m1?.notation).toBe('兵五进一');
  });
});
