import type { BoardGrid, Move, PieceColor, Position } from './types';
import { boardToFen, fenToBoard, INITIAL_FEN, moveToUci } from './fen';
import {
  getLegalMovesForPosition,
  isCheckmate,
  isKingInCheck,
  isStalemate,
} from './rules';
import { moveToChineseNotation } from './notation';

export class XiangqiBoard {
  public grid: BoardGrid;
  public activeColor: PieceColor;
  public history: Move[];
  public halfMove: number;
  public fullMove: number;

  constructor(fen: string = INITIAL_FEN) {
    const parsed = fenToBoard(fen);
    this.grid = parsed.grid;
    this.activeColor = parsed.activeColor;
    this.halfMove = parsed.halfMove;
    this.fullMove = parsed.fullMove;
    this.history = [];
  }

  public reset(fen: string = INITIAL_FEN) {
    const parsed = fenToBoard(fen);
    this.grid = parsed.grid;
    this.activeColor = parsed.activeColor;
    this.halfMove = parsed.halfMove;
    this.fullMove = parsed.fullMove;
    this.history = [];
  }

  public getFen(): string {
    return boardToFen(this.grid, this.activeColor, this.halfMove, this.fullMove);
  }

  public getLegalMoves(pos: Position): Position[] {
    const piece = this.grid[pos.rank][pos.file];
    if (!piece || piece.color !== this.activeColor) return [];
    return getLegalMovesForPosition(this.grid, pos);
  }

  public isInCheck(color: PieceColor = this.activeColor): boolean {
    return isKingInCheck(this.grid, color);
  }

  public isGameOver(): { isOver: boolean; winner?: PieceColor | 'draw'; reason?: string } {
    if (isCheckmate(this.grid, this.activeColor)) {
      const winner: PieceColor = this.activeColor === 'red' ? 'black' : 'red';
      return { isOver: true, winner, reason: '绝杀 (Checkmate)' };
    }
    if (isStalemate(this.grid, this.activeColor)) {
      const winner: PieceColor = this.activeColor === 'red' ? 'black' : 'red';
      return { isOver: true, winner, reason: '困毙 (Stalemate)' };
    }
    if (this.halfMove >= 120) {
      return { isOver: true, winner: 'draw', reason: '六十回合自然限着和棋' };
    }
    return { isOver: false };
  }

  public makeMove(from: Position, to: Position): Move | null {
    const piece = this.grid[from.rank][from.file];
    if (!piece || piece.color !== this.activeColor) return null;

    const legalMoves = getLegalMovesForPosition(this.grid, from);
    const isLegal = legalMoves.some(m => m.file === to.file && m.rank === to.rank);
    if (!isLegal) return null;

    const captured = this.grid[to.rank][to.file] || undefined;
    const move: Move = {
      from,
      to,
      piece: { ...piece },
      captured: captured ? { ...captured } : undefined,
      uci: moveToUci(from, to),
      prevHalfMove: this.halfMove,
    };

    // Calculate Chinese notation before moving
    move.notation = moveToChineseNotation(this.grid, move);

    // Apply move
    this.grid[to.rank][to.file] = piece;
    this.grid[from.rank][from.file] = null;

    // Update halfMove
    if (captured || piece.type === 'p') {
      this.halfMove = 0;
    } else {
      this.halfMove++;
    }

    // Switch turn
    if (this.activeColor === 'black') {
      this.fullMove++;
      this.activeColor = 'red';
    } else {
      this.activeColor = 'black';
    }

    this.history.push(move);
    return move;
  }

  public undoMove(): Move | null {
    if (this.history.length === 0) return null;

    const lastMove = this.history.pop()!;
    const { from, to, piece, captured, prevHalfMove } = lastMove;

    // Restore moving piece
    this.grid[from.rank][from.file] = piece;

    // Restore captured piece or null
    this.grid[to.rank][to.file] = captured || null;

    if (prevHalfMove !== undefined) {
      this.halfMove = prevHalfMove;
    }

    // Revert turn
    if (this.activeColor === 'red') {
      this.fullMove--;
      this.activeColor = 'black';
    } else {
      this.activeColor = 'red';
    }

    return lastMove;
  }
}
