import type { BoardGrid, Move, PieceColor, PieceType, Position } from './types';

const RED_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const BLACK_NUMS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

const PIECE_NAMES: Record<PieceColor, Record<PieceType, string>> = {
  red: {
    k: '帅',
    a: '仕',
    b: '相',
    n: '马',
    r: '车',
    c: '炮',
    p: '兵',
  },
  black: {
    k: '将',
    a: '士',
    b: '象',
    n: '马',
    r: '车',
    c: '炮',
    p: '卒',
  },
};

export function fileToColName(file: number, color: PieceColor): string {
  if (color === 'red') {
    // Red: 8 -> 一, 0 -> 九
    return RED_NUMS[8 - file];
  } else {
    // Black: 0 -> 1, 8 -> 9
    return BLACK_NUMS[file];
  }
}

export function moveToChineseNotation(grid: BoardGrid, move: Move): string {
  const { from, to, piece } = move;
  const color = piece.color;
  const isRed = color === 'red';

  // Check if there are multiple identical pieces on the same file (前/后)
  let disambiguation = '';
  const samePiecesOnCol: Position[] = [];

  for (let r = 0; r <= 9; r++) {
    const p = grid[r][from.file];
    if (p && p.color === color && p.type === piece.type) {
      samePiecesOnCol.push({ file: from.file, rank: r });
    }
  }

  // If 2 pieces on the same file (most common for 车, 炮, 马, 兵)
  if (samePiecesOnCol.length === 2) {
    const isFront = isRed
      ? from.rank > samePiecesOnCol.find(p => p.rank !== from.rank)!.rank
      : from.rank < samePiecesOnCol.find(p => p.rank !== from.rank)!.rank;
    disambiguation = isFront ? '前' : '后';
  }

  const pieceName = PIECE_NAMES[color][piece.type];
  const colName = fileToColName(from.file, color);

  let direction = '';
  let distanceOrTargetCol = '';

  const dr = to.rank - from.rank;

  if (dr === 0) {
    direction = '平';
    distanceOrTargetCol = fileToColName(to.file, color);
  } else {
    const isAdvancing = isRed ? dr > 0 : dr < 0;
    direction = isAdvancing ? '进' : '退';

    // Diagonal moving pieces (马, 相, 仕) always use target column name
    if (piece.type === 'n' || piece.type === 'b' || piece.type === 'a') {
      distanceOrTargetCol = fileToColName(to.file, color);
    } else {
      // Straight moving pieces (车, 炮, 兵, 帅) use steps count
      const steps = Math.abs(dr);
      distanceOrTargetCol = isRed ? RED_NUMS[steps - 1] : steps.toString();
    }
  }

  if (disambiguation) {
    return `${disambiguation}${pieceName}${direction}${distanceOrTargetCol}`;
  } else {
    return `${pieceName}${colName}${direction}${distanceOrTargetCol}`;
  }
}
