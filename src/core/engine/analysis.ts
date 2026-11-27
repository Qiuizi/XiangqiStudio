export interface MultiPvLine {
  multipv: number;
  depth: number;
  seldepth?: number;
  scoreCp: number | null;
  scoreMate: number | null;
  nodes: number;
  nps: number;
  timeMs?: number;
  hashfull?: number;
  pv: string[];
  bestMove: string;
}

export interface EngineInfoState {
  depth: number;
  seldepth?: number;
  scoreCp: number | null;
  scoreMate: number | null;
  nodes: number;
  nps: number;
  timeMs?: number;
  hashfull?: number;
  pv: string[];
  bestMove: string | null;
  multipvLines: MultiPvLine[];
}

export interface RawEngineInfo {
  search_id?: number;
  depth?: number | null;
  seldepth?: number | null;
  score_cp?: number | null;
  score_mate?: number | null;
  nodes?: number | null;
  nps?: number | null;
  time_ms?: number | null;
  hashfull?: number | null;
  multipv?: number | null;
  pv?: string[] | null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Merge one UCI `info` payload into the analysis state.
 * Returns false when the payload belongs to a different search.
 *
 * Scores are side-to-move values straight from the engine. A line that omits
 * the score (currmove / info string, serialized as null) must not wipe the
 * last cp or mate. A real cp clears a previous mate, and a real mate clears cp.
 */
export function applyEngineInfo(
  state: EngineInfoState,
  payload: RawEngineInfo,
  currentSearchId: number,
): boolean {
  if (!currentSearchId || (payload.search_id && payload.search_id !== currentSearchId)) {
    return false;
  }

  const depth = finiteNumber(payload.depth);
  if (depth !== null && depth > 0) {
    state.depth = depth;
  }
  const seldepth = finiteNumber(payload.seldepth);
  if (seldepth !== null) state.seldepth = seldepth;
  const timeMs = finiteNumber(payload.time_ms);
  if (timeMs !== null) state.timeMs = timeMs;
  const hashfull = finiteNumber(payload.hashfull);
  if (hashfull !== null) state.hashfull = hashfull;
  const nodes = finiteNumber(payload.nodes);
  if (nodes !== null) state.nodes = nodes;
  const nps = finiteNumber(payload.nps);
  if (nps !== null) state.nps = nps;

  const lineNum = finiteNumber(payload.multipv) ?? 1;
  const existingIdx = state.multipvLines.findIndex(l => l.multipv === lineNum);
  const prevLine = existingIdx >= 0 ? state.multipvLines[existingIdx] : null;

  const hasCp = finiteNumber(payload.score_cp) !== null;
  const hasMate = finiteNumber(payload.score_mate) !== null;
  let scoreCp = prevLine?.scoreCp ?? null;
  let scoreMate = prevLine?.scoreMate ?? null;
  if (hasCp || hasMate) {
    scoreCp = hasCp ? finiteNumber(payload.score_cp) : null;
    scoreMate = hasMate ? finiteNumber(payload.score_mate) : null;
  }

  const lineObj: MultiPvLine = {
    multipv: lineNum,
    depth: (depth !== null && depth > 0) ? depth : (prevLine?.depth ?? 0),
    seldepth: seldepth !== null ? seldepth : prevLine?.seldepth,
    scoreCp,
    scoreMate,
    nodes: nodes !== null ? nodes : (prevLine?.nodes ?? 0),
    nps: nps !== null ? nps : (prevLine?.nps ?? 0),
    timeMs: timeMs !== null ? timeMs : prevLine?.timeMs,
    hashfull: hashfull !== null ? hashfull : prevLine?.hashfull,
    pv: (payload.pv && payload.pv.length > 0) ? payload.pv : (prevLine?.pv ?? []),
    bestMove: (payload.pv && payload.pv.length > 0) ? payload.pv[0] : (prevLine?.bestMove ?? ''),
  };

  if (existingIdx >= 0) {
    state.multipvLines[existingIdx] = lineObj;
  } else {
    state.multipvLines.push(lineObj);
    state.multipvLines.sort((a, b) => a.multipv - b.multipv);
  }

  if (lineNum === 1) {
    if (hasCp || hasMate) {
      state.scoreCp = scoreCp;
      state.scoreMate = scoreMate;
    }
    if (payload.pv && payload.pv.length > 0) {
      state.pv = payload.pv;
      state.bestMove = payload.pv[0];
    }
  }

  return true;
}
