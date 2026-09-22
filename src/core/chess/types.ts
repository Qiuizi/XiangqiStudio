export type PieceColor = 'red' | 'black';

export type PieceType = 
  | 'k' // 帅/将 (King)
  | 'a' // 仕/士 (Advisor)
  | 'b' // 相/象 (Bishop/Elephant)
  | 'n' // 傌/马 (Knight/Horse)
  | 'r' // 俥/车 (Rook/Chariot)
  | 'c' // 炮/砲 (Cannon)
  | 'p';// 兵/卒 (Pawn/Soldier)

export interface Piece {
  color: PieceColor;
  type: PieceType;
  id: string; // unique ID for animation keying
}

export interface Position {
  file: number; // 0 to 8 (a to i)
  rank: number; // 0 to 9 (0 to 9)
}

export interface Move {
  from: Position;
  to: Position;
  piece: Piece;
  captured?: Piece;
  uci: string; // e.g. "h2e2"
  notation?: string; // e.g. "炮二平五"
  prevHalfMove?: number;
}

export type BoardGrid = (Piece | null)[][]; // 10 rows (ranks 0..9), 9 cols (files 0..8)
