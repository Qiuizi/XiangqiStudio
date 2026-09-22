import type { BoardGrid, PieceColor, PieceType, Position } from './types';

export const INITIAL_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

const CHAR_TO_PIECE: Record<string, { type: PieceType; color: PieceColor }> = {
  k: { type: 'k', color: 'black' },
  a: { type: 'a', color: 'black' },
  b: { type: 'b', color: 'black' },
  n: { type: 'n', color: 'black' },
  r: { type: 'r', color: 'black' },
  c: { type: 'c', color: 'black' },
  p: { type: 'p', color: 'black' },
  K: { type: 'k', color: 'red' },
  A: { type: 'a', color: 'red' },
  B: { type: 'b', color: 'red' },
  N: { type: 'n', color: 'red' },
  R: { type: 'r', color: 'red' },
  C: { type: 'c', color: 'red' },
  P: { type: 'p', color: 'red' },
};

const PIECE_TO_CHAR: Record<PieceColor, Record<PieceType, string>> = {
  black: { k: 'k', a: 'a', b: 'b', n: 'n', r: 'r', c: 'c', p: 'p' },
  red: { k: 'K', a: 'A', b: 'B', n: 'N', r: 'R', c: 'C', p: 'P' },
};

let pieceIdCounter = 0;

export function fenToBoard(fen: string = INITIAL_FEN): {
  grid: BoardGrid;
  activeColor: PieceColor;
  halfMove: number;
  fullMove: number;
} {
  const parts = fen.trim().split(/\s+/);
  const rows = parts[0].split('/');
  const activeColor: PieceColor = parts[1] === 'b' ? 'black' : 'red';
  const halfMove = parts[4] ? parseInt(parts[4], 10) : 0;
  const fullMove = parts[5] ? parseInt(parts[5], 10) : 1;

  // Initialize empty grid 10 ranks (0..9) x 9 files (0..8)
  const grid: BoardGrid = Array.from({ length: 10 }, () => Array(9).fill(null));

  // In FEN: row index 0 is Rank 9 (Black back rank), row index 9 is Rank 0 (Red back rank)
  for (let r = 0; r < 10; r++) {
    const rankIndex = 9 - r;
    const rowStr = rows[r] || '9';
    let fileIndex = 0;

    for (let c = 0; c < rowStr.length; c++) {
      const char = rowStr[c];
      const digit = parseInt(char, 10);

      if (!isNaN(digit)) {
        fileIndex += digit;
      } else if (CHAR_TO_PIECE[char] && fileIndex < 9) {
        const info = CHAR_TO_PIECE[char];
        grid[rankIndex][fileIndex] = {
          color: info.color,
          type: info.type,
          id: `p_${info.color}_${info.type}_${rankIndex}_${fileIndex}_${++pieceIdCounter}`,
        };
        fileIndex++;
      }
    }
  }

  return { grid, activeColor, halfMove, fullMove };
}

export function boardToFen(
  grid: BoardGrid,
  activeColor: PieceColor = 'red',
  halfMove: number = 0,
  fullMove: number = 1
): string {
  const rowStrings: string[] = [];

  // FEN starts from Rank 9 down to Rank 0
  for (let rankIndex = 9; rankIndex >= 0; rankIndex--) {
    let emptyCount = 0;
    let rowStr = '';

    for (let fileIndex = 0; fileIndex < 9; fileIndex++) {
      const piece = grid[rankIndex][fileIndex];
      if (!piece) {
        emptyCount++;
      } else {
        if (emptyCount > 0) {
          rowStr += emptyCount.toString();
          emptyCount = 0;
        }
        rowStr += PIECE_TO_CHAR[piece.color][piece.type];
      }
    }

    if (emptyCount > 0) {
      rowStr += emptyCount.toString();
    }
    rowStrings.push(rowStr);
  }

  const activeChar = activeColor === 'red' ? 'w' : 'b';
  return `${rowStrings.join('/')} ${activeChar} - - ${halfMove} ${fullMove}`;
}

export function posToUci(pos: Position): string {
  const fileChar = String.fromCharCode('a'.charCodeAt(0) + pos.file);
  return `${fileChar}${pos.rank}`;
}

export function uciToPos(uci: string): Position {
  const file = uci.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = parseInt(uci[1], 10);
  return { file, rank };
}

export function moveToUci(from: Position, to: Position): string {
  return `${posToUci(from)}${posToUci(to)}`;
}

export function parseUciMove(uci: string): { from: Position; to: Position } {
  const clean = uci.trim();
  const from = uciToPos(clean.slice(0, 2));
  const to = uciToPos(clean.slice(2, 4));
  return { from, to };
}
