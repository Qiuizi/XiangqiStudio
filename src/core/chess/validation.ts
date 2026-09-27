import { fenToBoard } from './fen';
import { areKingsFacing, getAllLegalMoves, isKingInCheck } from './rules';
import type { BoardGrid, PieceColor, PieceType } from './types';

export interface PositionValidationResult {
  valid: boolean;
  reason?: string;
  code?: string;
}

// 5 legal points for advisors in the palace
const RED_ADVISOR_POINTS = new Set(['3,0', '5,0', '4,1', '3,2', '5,2']);
const BLACK_ADVISOR_POINTS = new Set(['3,7', '5,7', '4,8', '3,9', '5,9']);

// 7 legal points for elephants / bishops
const RED_BISHOP_POINTS = new Set(['2,0', '6,0', '0,2', '4,2', '8,2', '2,4', '6,4']);
const BLACK_BISHOP_POINTS = new Set(['2,9', '6,9', '0,7', '4,7', '8,7', '2,5', '6,5']);

/**
 * Validates whether a FEN position is safe and legal to send to the Pikafish UCI engine.
 * Protects Pikafish against illegal piece counts, buffer overflows, and segmentation faults.
 */
export function validatePositionBeforeEngine(fen: string): PositionValidationResult {
  if (!fen || typeof fen !== 'string') {
    return { valid: false, reason: 'FEN 字符串为空', code: 'EMPTY_FEN' };
  }

  const cleanFen = fen.trim();
  const parts = cleanFen.split(/\s+/);
  if (parts.length === 0 || !parts[0]) {
    return { valid: false, reason: 'FEN 格式不正确', code: 'INVALID_FORMAT' };
  }

  const boardPart = parts[0];
  const rows = boardPart.split('/');
  if (rows.length !== 10) {
    return {
      valid: false,
      reason: `棋盘行数错误（期望 10 行，实际 ${rows.length} 行）`,
      code: 'INVALID_ROW_COUNT',
    };
  }

  // 1. Verify grid dimensions and character validity
  for (let r = 0; r < 10; r++) {
    const rowStr = rows[r];
    let fileCount = 0;
    for (let c = 0; c < rowStr.length; c++) {
      const ch = rowStr[c];
      const digit = parseInt(ch, 10);
      if (!isNaN(digit)) {
        if (digit < 1 || digit > 9) {
          return { valid: false, reason: `行 ${r + 1} 存在非法空位数字: ${ch}`, code: 'INVALID_DIGIT' };
        }
        fileCount += digit;
      } else if ('kabnrcpKABNRCP'.includes(ch)) {
        fileCount += 1;
      } else {
        return { valid: false, reason: `行 ${r + 1} 包含非法字符: ${ch}`, code: 'INVALID_CHAR' };
      }
    }
    if (fileCount !== 9) {
      return {
        valid: false,
        reason: `第 ${r + 1} 行总列数错误（期望 9 列，实际 ${fileCount} 列）`,
        code: 'INVALID_COLUMN_COUNT',
      };
    }
  }

  // 2. Parse into grid
  let grid: BoardGrid;
  let activeColor: PieceColor;
  try {
    const parsed = fenToBoard(cleanFen);
    grid = parsed.grid;
    activeColor = parsed.activeColor;
  } catch (err: any) {
    return { valid: false, reason: `FEN 解析失败: ${err?.message || err}`, code: 'PARSE_FAILED' };
  }

  // 3. Count pieces and track positions
  let redKings = 0;
  let blackKings = 0;
  let totalRed = 0;
  let totalBlack = 0;

  const counts: Record<PieceColor, Record<PieceType, number>> = {
    red: { k: 0, a: 0, b: 0, n: 0, r: 0, c: 0, p: 0 },
    black: { k: 0, a: 0, b: 0, n: 0, r: 0, c: 0, p: 0 },
  };

  const redKingPositions: { f: number; r: number }[] = [];
  const blackKingPositions: { f: number; r: number }[] = [];

  for (let r = 0; r <= 9; r++) {
    for (let f = 0; f <= 8; f++) {
      const piece = grid[r][f];
      if (!piece) continue;

      const { color, type } = piece;
      counts[color][type]++;
      if (color === 'red') totalRed++;
      else totalBlack++;

      if (type === 'k') {
        if (color === 'red') {
          redKings++;
          redKingPositions.push({ f, r });
        } else {
          blackKings++;
          blackKingPositions.push({ f, r });
        }
      } else if (type === 'a') {
        const key = `${f},${r}`;
        if (color === 'red' && !RED_ADVISOR_POINTS.has(key)) {
          return {
            valid: false,
            reason: `红仕位置非法 (${String.fromCharCode(97 + f)}${r})，不在九宫仕角/中心`,
            code: 'RED_ADVISOR_INVALID_POS',
          };
        }
        if (color === 'black' && !BLACK_ADVISOR_POINTS.has(key)) {
          return {
            valid: false,
            reason: `黑士位置非法 (${String.fromCharCode(97 + f)}${r})，不在九宫士角/中心`,
            code: 'BLACK_ADVISOR_INVALID_POS',
          };
        }
      } else if (type === 'b') {
        const key = `${f},${r}`;
        if (color === 'red' && !RED_BISHOP_POINTS.has(key)) {
          return {
            valid: false,
            reason: `红相位置非法 (${String.fromCharCode(97 + f)}${r})，不能过河且只能在田字格位`,
            code: 'RED_BISHOP_INVALID_POS',
          };
        }
        if (color === 'black' && !BLACK_BISHOP_POINTS.has(key)) {
          return {
            valid: false,
            reason: `黑象位置非法 (${String.fromCharCode(97 + f)}${r})，不能过河且只能在田字格位`,
            code: 'BLACK_BISHOP_INVALID_POS',
          };
        }
      } else if (type === 'p') {
        if (color === 'red') {
          // Red pawn cannot be in rank 0 or 1
          if (r < 3) {
            return {
              valid: false,
              reason: `红兵位置非法 (${String.fromCharCode(97 + f)}${r})，红兵不能后退到己方底线附近`,
              code: 'RED_PAWN_INVALID_RANK',
            };
          }
          // Before river (r: 3, 4), can only be on even files 0, 2, 4, 6, 8
          if (r < 5 && f % 2 !== 0) {
            return {
              valid: false,
              reason: `红兵未过河前位置非法 (${String.fromCharCode(97 + f)}${r})，必须在原始兵位列`,
              code: 'RED_PAWN_INVALID_FILE',
            };
          }
        } else {
          // Black pawn cannot be in rank 8 or 9
          if (r > 6) {
            return {
              valid: false,
              reason: `黑卒位置非法 (${String.fromCharCode(97 + f)}${r})，黑卒不能后退到己方底线附近`,
              code: 'BLACK_PAWN_INVALID_RANK',
            };
          }
          // Before river (r: 5, 6), can only be on even files 0, 2, 4, 6, 8
          if (r > 4 && f % 2 !== 0) {
            return {
              valid: false,
              reason: `黑卒未过河前位置非法 (${String.fromCharCode(97 + f)}${r})，必须在原始卒位列`,
              code: 'BLACK_PAWN_INVALID_FILE',
            };
          }
        }
      }
    }
  }

  // 4. Kings presence validation
  if (redKings === 0) {
    return { valid: false, reason: '棋盘缺少红帅', code: 'MISSING_RED_KING' };
  }
  if (redKings > 1) {
    return { valid: false, reason: `棋盘存在 ${redKings} 个红帅（最多 1 个）`, code: 'MULTIPLE_RED_KINGS' };
  }
  if (blackKings === 0) {
    return { valid: false, reason: '棋盘缺少黑将', code: 'MISSING_BLACK_KING' };
  }
  if (blackKings > 1) {
    return { valid: false, reason: `棋盘存在 ${blackKings} 个黑将（最多 1 个）`, code: 'MULTIPLE_BLACK_KINGS' };
  }

  // Palace location checks for the single kings
  const rk = redKingPositions[0];
  if (rk.f < 3 || rk.f > 5 || rk.r < 0 || rk.r > 2) {
    return {
      valid: false,
      reason: `红帅位置非法 (${String.fromCharCode(97 + rk.f)}${rk.r})，必须在红方九宫格内`,
      code: 'RED_KING_OUTSIDE_PALACE',
    };
  }

  const bk = blackKingPositions[0];
  if (bk.f < 3 || bk.f > 5 || bk.r < 7 || bk.r > 9) {
    return {
      valid: false,
      reason: `黑将位置非法 (${String.fromCharCode(97 + bk.f)}${bk.r})，必须在黑方九宫格内`,
      code: 'BLACK_KING_OUTSIDE_PALACE',
    };
  }

  // 5. Piece quantity limits
  if (counts.red.r > 2) return { valid: false, reason: `红车数量超限: ${counts.red.r} (最多 2)`, code: 'RED_ROOK_OVERFLOW' };
  if (counts.black.r > 2) return { valid: false, reason: `黑车数量超限: ${counts.black.r} (最多 2)`, code: 'BLACK_ROOK_OVERFLOW' };
  if (counts.red.n > 2) return { valid: false, reason: `红马数量超限: ${counts.red.n} (最多 2)`, code: 'RED_KNIGHT_OVERFLOW' };
  if (counts.black.n > 2) return { valid: false, reason: `黑马数量超限: ${counts.black.n} (最多 2)`, code: 'BLACK_KNIGHT_OVERFLOW' };
  if (counts.red.c > 2) return { valid: false, reason: `红炮数量超限: ${counts.red.c} (最多 2)`, code: 'RED_CANNON_OVERFLOW' };
  if (counts.black.c > 2) return { valid: false, reason: `黑炮数量超限: ${counts.black.c} (最多 2)`, code: 'BLACK_CANNON_OVERFLOW' };
  if (counts.red.b > 2) return { valid: false, reason: `红相数量超限: ${counts.red.b} (最多 2)`, code: 'RED_BISHOP_OVERFLOW' };
  if (counts.black.b > 2) return { valid: false, reason: `黑象数量超限: ${counts.black.b} (最多 2)`, code: 'BLACK_BISHOP_OVERFLOW' };
  if (counts.red.a > 2) return { valid: false, reason: `红仕数量超限: ${counts.red.a} (最多 2)`, code: 'RED_ADVISOR_OVERFLOW' };
  if (counts.black.a > 2) return { valid: false, reason: `黑士数量超限: ${counts.black.a} (最多 2)`, code: 'BLACK_ADVISOR_OVERFLOW' };
  if (counts.red.p > 5) return { valid: false, reason: `红兵数量超限: ${counts.red.p} (最多 5)`, code: 'RED_PAWN_OVERFLOW' };
  if (counts.black.p > 5) return { valid: false, reason: `黑卒数量超限: ${counts.black.p} (最多 5)`, code: 'BLACK_PAWN_OVERFLOW' };

  if (totalRed > 16) return { valid: false, reason: `红方棋子总数超限: ${totalRed} (最多 16)`, code: 'TOTAL_RED_OVERFLOW' };
  if (totalBlack > 16) return { valid: false, reason: `黑方棋子总数超限: ${totalBlack} (最多 16)`, code: 'TOTAL_BLACK_OVERFLOW' };
  if (totalRed + totalBlack > 32) {
    return { valid: false, reason: `棋盘棋子总数超限: ${totalRed + totalBlack} (最多 32)`, code: 'TOTAL_PIECES_OVERFLOW' };
  }

  // 6. Flying Generals (kings facing each other directly)
  if (areKingsFacing(grid)) {
    return { valid: false, reason: '红帅与黑将在同一列直接照面（飞将违规）', code: 'KINGS_FACING' };
  }

  // 7. Inactive side cannot be in check!
  // If Red is to move, Black cannot be in check (otherwise previous move was illegal).
  const inactiveColor: PieceColor = activeColor === 'red' ? 'black' : 'red';
  if (isKingInCheck(grid, inactiveColor)) {
    const oppName = inactiveColor === 'red' ? '红帅' : '黑将';
    return {
      valid: false,
      reason: `当前走棋方为${activeColor === 'red' ? '红' : '黑'}方，但${oppName}已被攻击中（前一步落子违规）`,
      code: 'INACTIVE_SIDE_IN_CHECK',
    };
  }

  // 8. Legal move generation check
  try {
    getAllLegalMoves(grid, activeColor);
  } catch (err: any) {
    return { valid: false, reason: `着法生成异常: ${err?.message || err}`, code: 'MOVE_GENERATION_FAILED' };
  }

  return { valid: true };
}
