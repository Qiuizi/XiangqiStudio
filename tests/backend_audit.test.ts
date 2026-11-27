import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { XiangqiBoard } from '../src/core/chess/board';
import { FenParseError, boardToFen, fenToBoard, INITIAL_FEN, uciToPos } from '../src/core/chess/fen';
import { moveToChineseNotation } from '../src/core/chess/notation';
import { scoreFromRedPerspective } from '../src/core/engine/score';
import { useGameStore } from '../src/stores/gameStore';
import { useReplayStore } from '../src/stores/replayStore';
import type { Move } from '../src/core/chess/types';

describe('Backend audit regressions', () => {
  describe('FEN parse and round-trip', () => {
    it('rejects malformed rows, clocks, and side-to-move instead of inventing a board', () => {
      expect(() => fenToBoard('4k4/9 w - - 0 1')).toThrow(FenParseError);
      expect(() => fenToBoard('9/9/9/9/9/9/9/9/9/8 w - - 0 1')).toThrow(/列数/);
      expect(() => fenToBoard('9/9/9/9/9/9/9/9/9/9 x - - 0 1')).toThrow(/走棋方/);
      expect(() => fenToBoard('9/9/9/9/9/9/9/9/9/9 w - - abc 1')).toThrow(/半回合/);
      expect(() => fenToBoard('9/9/9/9/9/9/9/9/9/9 w - - 0 0')).toThrow(/回合数/);
      expect(() => fenToBoard('')).toThrow(FenParseError);
    });

    it('keeps a board-only FEN and numeric clocks on round-trip', () => {
      const boardOnly = fenToBoard('4k4/9/9/9/9/9/9/9/9/4K4');
      expect(boardOnly.activeColor).toBe('red');
      expect(boardOnly.halfMove).toBe(0);
      expect(boardOnly.fullMove).toBe(1);

      const source = '4k4/9/9/9/9/9/9/9/9/4K4 b - - 7 3';
      const parsed = fenToBoard(source);
      const exported = boardToFen(parsed.grid, parsed.activeColor, parsed.halfMove, parsed.fullMove);
      expect(exported).toBe(source);
    });

    it('loadCustomFen reports a parse error and leaves the current position', () => {
      setActivePinia(createPinia());
      const game = useGameStore();
      const before = game.currentFen;
      const res = game.loadCustomFen('not-a-fen');
      expect(res.success).toBe(false);
      expect(res.error).toBeTruthy();
      expect(game.currentFen).toBe(before);
    });
  });

  describe('sixty-move rule counts only non-captures', () => {
    it('a pawn advance does not reset the no-capture clock', () => {
      const board = new XiangqiBoard();
      board.halfMove = 119;
      const move = board.makeMove(uciToPos('e3'), uciToPos('e4'));
      expect(move?.notation).toBe('兵五进一');
      expect(board.halfMove).toBe(120);
      expect(board.isGameOver()).toMatchObject({ isOver: true, winner: 'draw' });
    });

    it('a capture resets the clock, and undo restores it', () => {
      const board = new XiangqiBoard('4k4/9/9/9/4p4/9/9/9/9/4RK3 w - - 8 2');
      const move = board.makeMove(uciToPos('e0'), uciToPos('e5'));
      expect(move).not.toBeNull();
      expect(move?.captured?.type).toBe('p');
      expect(board.halfMove).toBe(0);
      expect(board.isGameOver().isOver).toBe(false);

      board.undoMove();
      expect(board.halfMove).toBe(8);
      expect(board.getFen().split(' ')[0]).toBe('4k4/9/9/9/4p4/9/9/9/9/4RK3');
    });
  });

  describe('Chinese notation for several identical pieces on one file', () => {
    it('labels two, three, and four pieces from the front of that side', () => {
      const twoRooks = fenToBoard('9/9/9/9/9/9/R8/9/9/R3K4 w - - 0 1').grid;
      const frontRook: Move = {
        from: { file: 0, rank: 3 },
        to: { file: 0, rank: 4 },
        piece: twoRooks[3][0]!,
        uci: 'a3a4',
      };
      const backRook: Move = {
        from: { file: 0, rank: 0 },
        to: { file: 0, rank: 1 },
        piece: twoRooks[0][0]!,
        uci: 'a0a1',
      };
      expect(moveToChineseNotation(twoRooks, frontRook)).toBe('前车进一');
      expect(moveToChineseNotation(twoRooks, backRook)).toBe('后车进一');

      const threePawns = fenToBoard('9/9/9/4p4/9/4p4/9/4p4/9/4K4 w - - 0 1').grid;
      expect(moveToChineseNotation(threePawns, {
        from: { file: 4, rank: 2 },
        to: { file: 4, rank: 1 },
        piece: threePawns[2][4]!,
        uci: 'e2e1',
      })).toBe('前卒进1');
      expect(moveToChineseNotation(threePawns, {
        from: { file: 4, rank: 4 },
        to: { file: 5, rank: 4 },
        piece: threePawns[4][4]!,
        uci: 'e4f4',
      })).toBe('中卒平6');
      expect(moveToChineseNotation(threePawns, {
        from: { file: 4, rank: 6 },
        to: { file: 4, rank: 7 },
        piece: threePawns[6][4]!,
        uci: 'e6e7',
      })).toBe('后卒退1');

      const fourPawns = fenToBoard('9/4P4/9/4P4/4P4/9/4P4/9/9/4K4 w - - 0 1').grid;
      expect(moveToChineseNotation(fourPawns, {
        from: { file: 4, rank: 6 },
        to: { file: 4, rank: 7 },
        piece: fourPawns[6][4]!,
        uci: 'e6e7',
      })).toBe('二兵进一');
      expect(moveToChineseNotation(fourPawns, {
        from: { file: 4, rank: 3 },
        to: { file: 4, rank: 4 },
        piece: fourPawns[3][4]!,
        uci: 'e3e4',
      })).toBe('后兵进一');
    });
  });

  describe('history cursor', () => {
    it('showPly restores earlier positions without deleting later moves', () => {
      const board = new XiangqiBoard();
      const start = board.getFen();
      board.makeMove(uciToPos('h2'), uciToPos('e2'));
      const afterFirst = board.getFen();
      board.makeMove(uciToPos('h9'), uciToPos('g7'));
      const tip = board.getFen();

      expect(board.showPly(0)).toBe(true);
      expect(board.getFen()).toBe(start);
      expect(board.history).toHaveLength(2);
      expect(board.showPly(1)).toBe(true);
      expect(board.getFen()).toBe(afterFirst);
      expect(board.activeColor).toBe('black');
      expect(board.showPly(2)).toBe(true);
      expect(board.getFen()).toBe(tip);
      expect(board.positionFens).toHaveLength(board.history.length + 1);
    });

    it('a move from an earlier ply truncates only the future line', () => {
      const board = new XiangqiBoard();
      board.makeMove(uciToPos('h2'), uciToPos('e2'));
      board.makeMove(uciToPos('h9'), uciToPos('g7'));
      board.showPly(1);
      const branched = board.makeMove(uciToPos('b9'), uciToPos('c7'));
      expect(branched?.notation).toBe('马2进3');
      expect(board.history).toHaveLength(2);
      expect(board.history[1].uci).toBe('b9c7');
      expect(board.viewPly).toBe(2);
    });

    it('gameStore.jumpToStep moves the board and the highlighted ply together', async () => {
      setActivePinia(createPinia());
      const game = useGameStore();
      await game.newGame('pvp', 'red');
      game.makeUserMove(uciToPos('h2'), uciToPos('e2'));
      game.makeUserMove(uciToPos('h9'), uciToPos('g7'));
      const tip = game.board.getFen();

      await game.jumpToStep(1);
      expect(game.currentStep).toBe(1);
      expect(game.currentFen).not.toBe(tip);
      expect(game.lastMove?.notation).toBe('炮二平五');
      expect(game.board.history).toHaveLength(2);

      await game.jumpToStep(0);
      expect(game.currentFen.split(' ')[0]).toBe(INITIAL_FEN.split(' ')[0]);
      expect(game.lastMove).toBeNull();

      await game.jumpToStep(2);
      expect(game.currentFen).toBe(tip);
      expect(game.lastMove?.uci).toBe('h9g7');
    });
  });

  describe('variation tree', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('does not record an illegal move or attach later moves to the wrong position', () => {
      const replay = useReplayStore();
      const moves: Move[] = [
        {
          from: { file: 7, rank: 2 },
          to: { file: 4, rank: 2 },
          piece: { type: 'c', color: 'red', id: 'c1' },
          notation: '炮二平五',
          uci: 'h2e2',
        },
        {
          from: { file: 4, rank: 0 },
          to: { file: 4, rank: 8 },
          piece: { type: 'k', color: 'black', id: 'bad' },
          notation: '将5进1',
          uci: 'e0e8',
        },
        {
          from: { file: 1, rank: 0 },
          to: { file: 2, rank: 2 },
          piece: { type: 'n', color: 'red', id: 'n1' },
          notation: '马八进七',
          uci: 'b0c2',
        },
      ];
      replay.loadHistory(moves, INITIAL_FEN);
      expect(replay.activeMovePath).toHaveLength(1);
      expect(replay.currentNode?.move?.uci).toBe('h2e2');
      expect(replay.currentNode?.fen).not.toBe(INITIAL_FEN);
      const root = replay.treeNodes[replay.rootId];
      expect(root.childrenIds).toHaveLength(1);
      const child = replay.treeNodes[root.childrenIds[0]];
      expect(child.parentId).toBe(root.id);
      expect(child.fen).not.toBe(root.fen);
    });
  });

  describe('score perspective', () => {
    it('negates side-to-move scores when black is to move', () => {
      expect(scoreFromRedPerspective(80, null, 'red')).toEqual({ scoreCp: 80, scoreMate: null });
      expect(scoreFromRedPerspective(80, null, 'black')).toEqual({ scoreCp: -80, scoreMate: null });
      expect(scoreFromRedPerspective(null, 3, 'black')).toEqual({ scoreCp: null, scoreMate: -3 });
      expect(scoreFromRedPerspective(null, null, 'black')).toEqual({ scoreCp: null, scoreMate: null });
    });
  });
});
