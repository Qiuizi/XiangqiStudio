import type { BoardGrid, Move, PieceColor, Position } from './types';
import { moveToUci } from './fen';

// Board boundaries
export const MIN_FILE = 0;
export const MAX_FILE = 8;
export const MIN_RANK = 0;
export const MAX_RANK = 9;

export function isInsideBoard(pos: Position): boolean {
  return pos.file >= MIN_FILE && pos.file <= MAX_FILE && pos.rank >= MIN_RANK && pos.rank <= MAX_RANK;
}

export function isInsidePalace(pos: Position, color: PieceColor): boolean {
  if (pos.file < 3 || pos.file > 5) return false;
  if (color === 'red') {
    return pos.rank >= 0 && pos.rank <= 2;
  } else {
    return pos.rank >= 7 && pos.rank <= 9;
  }
}

export function hasCrossedRiver(rank: number, color: PieceColor): boolean {
  if (color === 'red') {
    return rank >= 5;
  } else {
    return rank <= 4;
  }
}

export function findKing(grid: BoardGrid, color: PieceColor): Position | null {
  for (let r = 0; r <= 9; r++) {
    for (let f = 0; f <= 8; f++) {
      const piece = grid[r][f];
      if (piece && piece.type === 'k' && piece.color === color) {
        return { file: f, rank: r };
      }
    }
  }
  return null;
}

export function areKingsFacing(grid: BoardGrid): boolean {
  const redKing = findKing(grid, 'red');
  const blackKing = findKing(grid, 'black');
  if (!redKing || !blackKing) return false;

  if (redKing.file !== blackKing.file) return false;

  const file = redKing.file;
  const minRank = Math.min(redKing.rank, blackKing.rank);
  const maxRank = Math.max(redKing.rank, blackKing.rank);

  for (let r = minRank + 1; r < maxRank; r++) {
    if (grid[r][file] !== null) {
      return false; // Obstacle between kings
    }
  }

  return true; // No obstacle: flying general!
}

export function getPseudoLegalMoves(grid: BoardGrid, pos: Position): Position[] {
  const piece = grid[pos.rank][pos.file];
  if (!piece) return [];

  const targets: Position[] = [];
  const color = piece.color;
  const oppColor: PieceColor = color === 'red' ? 'black' : 'red';

  const addIfValid = (f: number, r: number) => {
    if (!isInsideBoard({ file: f, rank: r })) return;
    const dest = grid[r][f];
    if (!dest || dest.color === oppColor) {
      targets.push({ file: f, rank: r });
    }
  };

  switch (piece.type) {
    case 'k': { // King / 将 / 帅
      const deltas = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (const [df, dr] of deltas) {
        const nf = pos.file + df;
        const nr = pos.rank + dr;
        if (isInsidePalace({ file: nf, rank: nr }, color)) {
          addIfValid(nf, nr);
        }
      }
      break;
    }

    case 'a': { // Advisor / 士 / 仕
      const deltas = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (const [df, dr] of deltas) {
        const nf = pos.file + df;
        const nr = pos.rank + dr;
        if (isInsidePalace({ file: nf, rank: nr }, color)) {
          addIfValid(nf, nr);
        }
      }
      break;
    }

    case 'b': { // Elephant / 象 / 相
      const deltas = [
        { df: 2, dr: 2, eyeF: 1, eyeR: 1 },
        { df: 2, dr: -2, eyeF: 1, eyeR: -1 },
        { df: -2, dr: 2, eyeF: -1, eyeR: 1 },
        { df: -2, dr: -2, eyeF: -1, eyeR: -1 },
      ];

      for (const { df, dr, eyeF, eyeR } of deltas) {
        const nf = pos.file + df;
        const nr = pos.rank + dr;

        if (!isInsideBoard({ file: nf, rank: nr })) continue;
        // Cannot cross river
        if (color === 'red' && nr > 4) continue;
        if (color === 'black' && nr < 5) continue;

        // Check elephant eye (塞象眼)
        const eyeRank = pos.rank + eyeR;
        const eyeFile = pos.file + eyeF;
        if (grid[eyeRank][eyeFile] !== null) continue;

        addIfValid(nf, nr);
      }
      break;
    }

    case 'n': { // Horse / 马 / 傌
      const moves = [
        { df: 1, dr: 2, legF: 0, legR: 1 },
        { df: -1, dr: 2, legF: 0, legR: 1 },
        { df: 1, dr: -2, legF: 0, legR: -1 },
        { df: -1, dr: -2, legF: 0, legR: -1 },
        { df: 2, dr: 1, legF: 1, legR: 0 },
        { df: 2, dr: -1, legF: 1, legR: 0 },
        { df: -2, dr: 1, legF: -1, legR: 0 },
        { df: -2, dr: -1, legF: -1, legR: 0 },
      ];

      for (const { df, dr, legF, legR } of moves) {
        const nf = pos.file + df;
        const nr = pos.rank + dr;
        if (!isInsideBoard({ file: nf, rank: nr })) continue;

        // Check horse leg (蹩马腿)
        const legFile = pos.file + legF;
        const legRank = pos.rank + legR;
        if (grid[legRank][legFile] !== null) continue;

        addIfValid(nf, nr);
      }
      break;
    }

    case 'r': { // Rook / 车 / 俥
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (const [df, dr] of dirs) {
        let nf = pos.file + df;
        let nr = pos.rank + dr;
        while (isInsideBoard({ file: nf, rank: nr })) {
          const target = grid[nr][nf];
          if (!target) {
            targets.push({ file: nf, rank: nr });
          } else {
            if (target.color === oppColor) {
              targets.push({ file: nf, rank: nr });
            }
            break; // Blocked
          }
          nf += df;
          nr += dr;
        }
      }
      break;
    }

    case 'c': { // Cannon / 炮 / 砲
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (const [df, dr] of dirs) {
        let nf = pos.file + df;
        let nr = pos.rank + dr;
        let jumpedHurdle = false;

        while (isInsideBoard({ file: nf, rank: nr })) {
          const target = grid[nr][nf];
          if (!jumpedHurdle) {
            if (!target) {
              targets.push({ file: nf, rank: nr });
            } else {
              jumpedHurdle = true; // First piece encountered acts as hurdle
            }
          } else {
            if (target) {
              if (target.color === oppColor) {
                targets.push({ file: nf, rank: nr }); // Capture over hurdle
              }
              break; // Second piece stops scan
            }
          }
          nf += df;
          nr += dr;
        }
      }
      break;
    }

    case 'p': { // Pawn / 兵 / 卒
      const forwardDir = color === 'red' ? 1 : -1;

      // Always can try moving forward
      const forwardRank = pos.rank + forwardDir;
      if (isInsideBoard({ file: pos.file, rank: forwardRank })) {
        addIfValid(pos.file, forwardRank);
      }

      // After crossing river, can also move left and right
      if (hasCrossedRiver(pos.rank, color)) {
        addIfValid(pos.file - 1, pos.rank);
        addIfValid(pos.file + 1, pos.rank);
      }
      break;
    }
  }

  return targets;
}

export function cloneGrid(grid: BoardGrid): BoardGrid {
  return grid.map(row => row.map(cell => (cell ? { ...cell } : null)));
}

export function simulateMove(grid: BoardGrid, from: Position, to: Position): BoardGrid {
  const newGrid = cloneGrid(grid);
  const piece = newGrid[from.rank][from.file];
  newGrid[to.rank][to.file] = piece;
  newGrid[from.rank][from.file] = null;
  return newGrid;
}

export function isKingInCheck(grid: BoardGrid, color: PieceColor): boolean {
  if (areKingsFacing(grid)) {
    return true;
  }

  const kingPos = findKing(grid, color);
  if (!kingPos) return true; // No king means defeated/in check

  const oppColor: PieceColor = color === 'red' ? 'black' : 'red';

  // Check if any opponent piece can attack kingPos
  for (let r = 0; r <= 9; r++) {
    for (let f = 0; f <= 8; f++) {
      const p = grid[r][f];
      if (p && p.color === oppColor) {
        const moves = getPseudoLegalMoves(grid, { file: f, rank: r });
        if (moves.some(m => m.file === kingPos.file && m.rank === kingPos.rank)) {
          return true;
        }
      }
    }
  }

  return false;
}

export function getLegalMovesForPosition(grid: BoardGrid, pos: Position): Position[] {
  const piece = grid[pos.rank][pos.file];
  if (!piece) return [];

  const pseudoMoves = getPseudoLegalMoves(grid, pos);
  const legalMoves: Position[] = [];

  for (const to of pseudoMoves) {
    const nextGrid = simulateMove(grid, pos, to);
    if (!areKingsFacing(nextGrid) && !isKingInCheck(nextGrid, piece.color)) {
      legalMoves.push(to);
    }
  }

  return legalMoves;
}

export function getAllLegalMoves(grid: BoardGrid, color: PieceColor): Move[] {
  const moves: Move[] = [];

  for (let r = 0; r <= 9; r++) {
    for (let f = 0; f <= 8; f++) {
      const piece = grid[r][f];
      if (piece && piece.color === color) {
        const from = { file: f, rank: r };
        const legalTos = getLegalMovesForPosition(grid, from);
        for (const to of legalTos) {
          const captured = grid[to.rank][to.file] || undefined;
          moves.push({
            from,
            to,
            piece,
            captured,
            uci: moveToUci(from, to),
          });
        }
      }
    }
  }

  return moves;
}

export function isCheckmate(grid: BoardGrid, color: PieceColor): boolean {
  if (!isKingInCheck(grid, color)) return false;
  return getAllLegalMoves(grid, color).length === 0;
}

export function isStalemate(grid: BoardGrid, color: PieceColor): boolean {
  if (isKingInCheck(grid, color)) return false;
  return getAllLegalMoves(grid, color).length === 0;
}
