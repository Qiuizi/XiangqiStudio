import type { PieceColor } from '../chess/types';

export interface RedPerspectiveScore {
  scoreCp: number | null;
  scoreMate: number | null;
}

/**
 * UCI scores are from the side to move. The evaluation bar treats positive as
 * red advantage, so black-to-move scores have to be negated before display.
 */
export function scoreFromRedPerspective(
  scoreCp: number | null,
  scoreMate: number | null,
  sideToMove: PieceColor,
): RedPerspectiveScore {
  if (sideToMove === 'red') {
    return { scoreCp, scoreMate };
  }
  return {
    scoreCp: scoreCp === null ? null : -scoreCp,
    scoreMate: scoreMate === null ? null : -scoreMate,
  };
}
