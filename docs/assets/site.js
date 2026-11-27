'use strict';

/*
 * Browser preview of the Xiangqi Studio analysis desk.
 * Move rules follow src/core/chess. The search is a shallow local heuristic
 * so the page can show an evaluation bar and a principal variation.
 * It is not Pikafish, and it does not send the position anywhere.
 */
(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (typeof document !== 'undefined') {
    const start = () => {
      const problems = api.selfCheck();
      if (problems.length) {
        console.error('Xiangqi preview self-check failed: ' + problems.join(' | '));
      }
      api.mount();
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  }
})(function () {
  const INITIAL = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';
  const PRESETS = [
    { id: 'start', label: '初始全盘', fen: INITIAL },
    { id: 'ma', label: '马兵胜单缺象', fen: '4k4/4a4/4ba3/9/9/9/4N4/4B4/4P4/4K4 w - - 0 1' },
    { id: 'pao', label: '炮兵胜双士', fen: '4k4/4a4/4a4/9/9/9/4P4/4C4/9/4K4 w - - 0 1' },
    { id: 'che', label: '车兵胜单车', fen: '4k4/9/9/9/4r4/4R4/4P4/9/9/4K4 w - - 0 1' },
    { id: 'bing', label: '三兵胜士象全', fen: '3k5/4a4/4ba3/9/9/9/2P1P1P2/9/9/4K4 w - - 0 1' },
    { id: 'dan', label: '单马胜单士', fen: '4k4/4a4/9/9/9/9/9/9/4N4/4K4 w - - 0 1' },
  ];

  const CHAR = {
    k: { t: 'k', c: 'black' }, a: { t: 'a', c: 'black' }, b: { t: 'b', c: 'black' },
    n: { t: 'n', c: 'black' }, r: { t: 'r', c: 'black' }, c: { t: 'c', c: 'black' },
    p: { t: 'p', c: 'black' },
    K: { t: 'k', c: 'red' }, A: { t: 'a', c: 'red' }, B: { t: 'b', c: 'red' },
    N: { t: 'n', c: 'red' }, R: { t: 'r', c: 'red' }, C: { t: 'c', c: 'red' },
    P: { t: 'p', c: 'red' },
  };
  const RED_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const NAME = {
    red: { k: '帅', a: '仕', b: '相', n: '马', r: '车', c: '炮', p: '兵' },
    black: { k: '将', a: '士', b: '象', n: '马', r: '车', c: '炮', p: '卒' },
  };
  const FACE = {
    red: { k: '帥', a: '仕', b: '相', n: '傌', r: '俥', c: '炮', p: '兵' },
    black: { k: '將', a: '士', b: '象', n: '馬', r: '車', c: '砲', p: '卒' },
  };
  const MAT = { k: 0, r: 1100, n: 450, c: 500, b: 180, a: 180, p: 80 };
  const MATE = 30000;

  function parseFen(fen) {
    const parts = fen.trim().split(/\s+/);
    const rows = parts[0].split('/');
    const turn = parts[1] === 'b' ? 'black' : 'red';
    const grid = Array.from({ length: 10 }, () => Array(9).fill(null));
    let id = 1;
    for (let row = 0; row < 10; row++) {
      const rank = 9 - row;
      const text = rows[row] || '9';
      let file = 0;
      for (const ch of text) {
        const n = parseInt(ch, 10);
        if (!Number.isNaN(n)) {
          file += n;
        } else if (CHAR[ch] && file < 9) {
          grid[rank][file] = { c: CHAR[ch].c, t: CHAR[ch].t, id: id++ };
          file += 1;
        }
      }
    }
    return { grid, turn };
  }

  function inside(f, r) {
    return f >= 0 && f <= 8 && r >= 0 && r <= 9;
  }

  function palace(f, r, color) {
    if (f < 3 || f > 5) return false;
    return color === 'red' ? r >= 0 && r <= 2 : r >= 7 && r <= 9;
  }

  function crossed(r, color) {
    return color === 'red' ? r >= 5 : r <= 4;
  }

  function opp(color) {
    return color === 'red' ? 'black' : 'red';
  }

  function pseudo(grid, f, r) {
    const piece = grid[r][f];
    if (!piece) return [];
    const color = piece.c;
    const enemy = opp(color);
    const out = [];
    const add = (nf, nr) => {
      if (!inside(nf, nr)) return;
      const dest = grid[nr][nf];
      if (!dest || dest.c === enemy) out.push({ f, r, tf: nf, tr: nr });
    };

    if (piece.t === 'k') {
      [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([df, dr]) => {
        const nf = f + df;
        const nr = r + dr;
        if (palace(nf, nr, color)) add(nf, nr);
      });
    } else if (piece.t === 'a') {
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([df, dr]) => {
        const nf = f + df;
        const nr = r + dr;
        if (palace(nf, nr, color)) add(nf, nr);
      });
    } else if (piece.t === 'b') {
      [[2, 2, 1, 1], [2, -2, 1, -1], [-2, 2, -1, 1], [-2, -2, -1, -1]].forEach(([df, dr, ef, er]) => {
        const nf = f + df;
        const nr = r + dr;
        if (!inside(nf, nr)) return;
        if (color === 'red' && nr > 4) return;
        if (color === 'black' && nr < 5) return;
        if (grid[r + er][f + ef]) return;
        add(nf, nr);
      });
    } else if (piece.t === 'n') {
      [[1, 2, 0, 1], [-1, 2, 0, 1], [1, -2, 0, -1], [-1, -2, 0, -1], [2, 1, 1, 0], [2, -1, 1, 0], [-2, 1, -1, 0], [-2, -1, -1, 0]].forEach(([df, dr, lf, lr]) => {
        const nf = f + df;
        const nr = r + dr;
        if (!inside(nf, nr)) return;
        if (grid[r + lr][f + lf]) return;
        add(nf, nr);
      });
    } else if (piece.t === 'r' || piece.t === 'c') {
      [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([df, dr]) => {
        let nf = f + df;
        let nr = r + dr;
        let jumped = false;
        while (inside(nf, nr)) {
          const target = grid[nr][nf];
          if (piece.t === 'r') {
            if (!target) out.push({ f, r, tf: nf, tr: nr });
            else {
              if (target.c === enemy) out.push({ f, r, tf: nf, tr: nr });
              break;
            }
          } else if (!jumped) {
            if (!target) out.push({ f, r, tf: nf, tr: nr });
            else jumped = true;
          } else if (target) {
            if (target.c === enemy) out.push({ f, r, tf: nf, tr: nr });
            break;
          }
          nf += df;
          nr += dr;
        }
      });
    } else if (piece.t === 'p') {
      const dir = color === 'red' ? 1 : -1;
      add(f, r + dir);
      if (crossed(r, color)) {
        add(f - 1, r);
        add(f + 1, r);
      }
    }
    return out;
  }

  function rayHasKing(grid, file, rank, by, dir) {
    for (let r = rank + dir; r >= 0 && r <= 9; r += dir) {
      const piece = grid[r][file];
      if (!piece) continue;
      return piece.c === by && piece.t === 'k';
    }
    return false;
  }

  function isAttacked(grid, tf, tr, by) {
    if (rayHasKing(grid, tf, tr, by, 1) || rayHasKing(grid, tf, tr, by, -1)) return true;

    for (const [df, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const kf = tf - df;
      const kr = tr - dr;
      if (!inside(kf, kr) || !palace(kf, kr, by) || !palace(tf, tr, by)) continue;
      const piece = grid[kr][kf];
      if (piece && piece.c === by && piece.t === 'k') return true;
    }

    if (palace(tf, tr, by)) {
      for (const [df, dr] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const af = tf - df;
        const ar = tr - dr;
        if (!palace(af, ar, by)) continue;
        const piece = grid[ar][af];
        if (piece && piece.c === by && piece.t === 'a') return true;
      }
    }

    for (const [df, dr, ef, er] of [[2, 2, 1, 1], [2, -2, 1, -1], [-2, 2, -1, 1], [-2, -2, -1, -1]]) {
      const bf = tf - df;
      const br = tr - dr;
      if (!inside(bf, br)) continue;
      if (by === 'red' && (br > 4 || tr > 4)) continue;
      if (by === 'black' && (br < 5 || tr < 5)) continue;
      const piece = grid[br][bf];
      if (!piece || piece.c !== by || piece.t !== 'b') continue;
      if (grid[br + er][bf + ef]) continue;
      return true;
    }

    for (const [df, dr, lf, lr] of [[1, 2, 0, 1], [-1, 2, 0, 1], [1, -2, 0, -1], [-1, -2, 0, -1], [2, 1, 1, 0], [2, -1, 1, 0], [-2, 1, -1, 0], [-2, -1, -1, 0]]) {
      const nf = tf - df;
      const nr = tr - dr;
      if (!inside(nf, nr)) continue;
      const piece = grid[nr][nf];
      if (!piece || piece.c !== by || piece.t !== 'n') continue;
      if (grid[nr + lr][nf + lf]) continue;
      return true;
    }

    for (const [df, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      let f = tf + df;
      let r = tr + dr;
      let screen = false;
      while (inside(f, r)) {
        const piece = grid[r][f];
        if (!screen) {
          if (piece) {
            if (piece.c === by && piece.t === 'r') return true;
            screen = true;
          }
        } else if (piece) {
          if (piece.c === by && piece.t === 'c') return true;
          break;
        }
        f += df;
        r += dr;
      }
    }

    if (by === 'red') {
      if (tr - 1 >= 0) {
        const pawn = grid[tr - 1][tf];
        if (pawn && pawn.c === 'red' && pawn.t === 'p') return true;
      }
      if (tr >= 5) {
        for (const df of [-1, 1]) {
          const f = tf + df;
          if (!inside(f, tr)) continue;
          const pawn = grid[tr][f];
          if (pawn && pawn.c === 'red' && pawn.t === 'p') return true;
        }
      }
    } else {
      if (tr + 1 <= 9) {
        const pawn = grid[tr + 1][tf];
        if (pawn && pawn.c === 'black' && pawn.t === 'p') return true;
      }
      if (tr <= 4) {
        for (const df of [-1, 1]) {
          const f = tf + df;
          if (!inside(f, tr)) continue;
          const pawn = grid[tr][f];
          if (pawn && pawn.c === 'black' && pawn.t === 'p') return true;
        }
      }
    }
    return false;
  }

  function findKing(grid, color) {
    for (let r = 0; r < 10; r++) {
      for (let f = 0; f < 9; f++) {
        const piece = grid[r][f];
        if (piece && piece.c === color && piece.t === 'k') return { f, r };
      }
    }
    return null;
  }

  function kingAttacked(grid, color) {
    const king = findKing(grid, color);
    if (!king) return true;
    return isAttacked(grid, king.f, king.r, opp(color));
  }

  function play(grid, move) {
    const next = grid.map((row) => row.slice());
    next[move.tr][move.tf] = next[move.r][move.f];
    next[move.r][move.f] = null;
    return next;
  }

  function legalFrom(grid, f, r) {
    const piece = grid[r][f];
    if (!piece) return [];
    return pseudo(grid, f, r).filter((move) => !kingAttacked(play(grid, move), piece.c));
  }

  function allLegal(grid, color) {
    const moves = [];
    for (let r = 0; r < 10; r++) {
      for (let f = 0; f < 9; f++) {
        const piece = grid[r][f];
        if (piece && piece.c === color) moves.push(...legalFrom(grid, f, r));
      }
    }
    return moves;
  }

  function fileName(file, color) {
    return color === 'red' ? RED_NUMS[8 - file] : String(file + 1);
  }

  function notation(grid, move) {
    const piece = grid[move.r][move.f];
    if (!piece) return '';
    const isRed = piece.c === 'red';
    const same = [];
    for (let r = 0; r <= 9; r++) {
      const other = grid[r][move.f];
      if (other && other.c === piece.c && other.t === piece.t) same.push(r);
    }
    let prefix = '';
    if (same.length === 2) {
      const otherRank = same.find((r) => r !== move.r);
      const front = isRed ? move.r > otherRank : move.r < otherRank;
      prefix = front ? '前' : '后';
    }
    const name = NAME[piece.c][piece.t];
    const dr = move.tr - move.r;
    let dir;
    let tail;
    if (dr === 0) {
      dir = '平';
      tail = fileName(move.tf, piece.c);
    } else {
      dir = (isRed ? dr > 0 : dr < 0) ? '进' : '退';
      if (piece.t === 'n' || piece.t === 'b' || piece.t === 'a') {
        tail = fileName(move.tf, piece.c);
      } else {
        const steps = Math.abs(dr);
        tail = isRed ? RED_NUMS[steps - 1] : String(steps);
      }
    }
    return prefix
      ? prefix + name + dir + tail
      : name + fileName(move.f, piece.c) + dir + tail;
  }

  function pst(piece, f, r) {
    const adv = piece.c === 'red' ? r : 9 - r;
    const center = 4 - Math.abs(f - 4);
    if (piece.t === 'p') return adv * 8 + (crossed(r, piece.c) ? 70 : 0) + center * 2;
    if (piece.t === 'n') return adv * 8 + center * 6 + (adv === 0 ? -8 : 18);
    if (piece.t === 'c') return center * 18 + (f === 4 ? 10 : 0) + (adv >= 2 ? 6 : 0);
    if (piece.t === 'r') return adv * 3 + (f === 0 || f === 8 ? 0 : 4);
    if (piece.t === 'a' || piece.t === 'b') return adv === 0 ? 6 : -12;
    if (piece.t === 'k') return f === 4 ? 8 : 0;
    return 0;
  }

  function evaluate(grid, color) {
    let red = 0;
    for (let r = 0; r < 10; r++) {
      for (let f = 0; f < 9; f++) {
        const piece = grid[r][f];
        if (!piece) continue;
        const value = MAT[piece.t] + pst(piece, f, r);
        red += piece.c === 'red' ? value : -value;
      }
    }
    return color === 'red' ? red : -red;
  }

  function victimValue(grid, move) {
    const victim = grid[move.tr][move.tf];
    return victim ? MAT[victim.t] + 100 : 0;
  }

function countPieces(grid) {
  let n = 0;
  for (let r = 0; r < 10; r++) {
    for (let f = 0; f < 9; f++) if (grid[r][f]) n += 1;
  }
  return n;
}

function captureMoves(grid, color) {
  const moves = [];
  for (let r = 0; r < 10; r++) {
    for (let f = 0; f < 9; f++) {
      const piece = grid[r][f];
      if (!piece || piece.c !== color) continue;
      pseudo(grid, f, r).forEach((move) => {
        if (!grid[move.tr][move.tf]) return;
        if (!kingAttacked(play(grid, move), color)) moves.push(move);
      });
    }
  }
  return moves;
}

  function now() {
    return (typeof performance !== 'undefined' ? performance.now() : Date.now());
  }

  function analyze(grid, color) {
    const started = now();
    const deadline = started + (countPieces(grid) <= 10 ? 56 : 80);
    let nodes = 0;
    let abort = false;
    const moves = allLegal(grid, color);
    if (!moves.length) {
      return { depth: 0, lines: [], nodes: 0, ms: 0, over: true };
    }

    function tick() {
      nodes += 1;
      if ((nodes & 63) === 0 && now() > deadline) abort = true;
      return abort;
    }

    function quiesce(node, side, alpha, beta, ply, qdepth) {
      if (tick()) return 0;
      const inCheck = kingAttacked(node, side);
      if (!inCheck) {
        const stand = evaluate(node, side);
        if (stand >= beta) return beta;
        if (stand > alpha) alpha = stand;
        if (qdepth >= 2) return alpha;
      } else if (qdepth >= 2) {
        return alpha;
      }
      const moves = inCheck ? allLegal(node, side) : captureMoves(node, side);
      if (inCheck && !moves.length) return ply - MATE;
      moves.sort((a, b) => victimValue(node, b) - victimValue(node, a));
      for (const move of moves) {
        const score = -quiesce(play(node, move), opp(side), -beta, -alpha, ply + 1, qdepth + 1);
        if (abort) return 0;
        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
      }
      return alpha;
    }

    function negamax(node, side, depth, alpha, beta, ply, pvOut) {
      if (abort) return 0;
      if (tick()) return 0;
      if (depth === 0) return quiesce(node, side, alpha, beta, ply, 0);
      const list = allLegal(node, side);
      if (!list.length) return ply - MATE;
      list.sort((a, b) => victimValue(node, b) - victimValue(node, a));
      let best = -1e9;
      let bestPv = null;
      for (const move of list) {
        const childPv = [];
        const score = -negamax(play(node, move), opp(side), depth - 1, -beta, -alpha, ply + 1, childPv);
        if (abort) return 0;
        if (score > best) {
          best = score;
          bestPv = [move].concat(childPv);
          if (score > alpha) alpha = score;
          if (alpha >= beta) break;
        }
      }
      if (bestPv) {
        for (const step of bestPv) pvOut.push(step);
      }
      return best;
    }

    let completed = [];
    let depthDone = 0;
    let seeds = moves.map((move) => ({ m: move, score: -1e9, pv: [move] }));
    const maxDepth = countPieces(grid) <= 10 ? 4 : 3;

    for (let depth = 1; depth <= maxDepth; depth++) {
      abort = false;
      const trial = [];
      const ordered = seeds.slice().sort((a, b) => b.score - a.score);
      let failed = false;
      for (const seed of ordered) {
        if (depth > 1 && now() > deadline) {
          failed = true;
          break;
        }
        const pv = [];
        const score = -negamax(play(grid, seed.m), opp(color), depth - 1, -1e9, 1e9, 1, pv);
        if (abort) {
          failed = true;
          break;
        }
        trial.push({ m: seed.m, score, pv: [seed.m].concat(pv) });
      }
      if (failed || trial.length !== moves.length) break;
      completed = trial;
      depthDone = depth;
      seeds = trial;
    }

    completed.sort((a, b) => b.score - a.score);
    return {
      depth: depthDone,
      lines: completed.slice(0, 3),
      nodes,
      ms: Math.max(0, now() - started),
      over: false,
    };
  }

  function redOf(score, side) {
    return side === 'red' ? score : -score;
  }

  function formatScore(redScore) {
    if (Math.abs(redScore) > 25000) {
      const plies = MATE - Math.abs(Math.round(redScore));
      const moves = Math.max(1, Math.ceil(plies / 2));
      return 'M' + (redScore > 0 ? '+' : '-') + moves;
    }
    const pawns = redScore / 100;
    const text = (pawns > 0 ? '+' : '') + pawns.toFixed(2);
    return text === '-0.00' ? '0.00' : text;
  }

  function formatBadge(redScore) {
    if (Math.abs(redScore) > 25000) return formatScore(redScore);
    const pawns = redScore / 100;
    const text = (pawns > 0 ? '+' : '') + pawns.toFixed(1);
    return text === '-0.0' ? '0.0' : text;
  }

  function barPercent(redScore) {
    if (redScore > 25000) return 96;
    if (redScore < -25000) return 4;
    const cp = Math.max(-1200, Math.min(1200, redScore));
    return 50 + (cp / 1200) * 45;
  }

  function has(list, file, rank) {
    return list.some((move) => move.tf === file && move.tr === rank);
  }

  function selfCheck() {
    const errors = [];
    const expect = (name, ok) => {
      if (!ok) errors.push(name);
    };
    const start = parseFen(INITIAL);
    expect('notation 炮二平五', notation(start.grid, { f: 7, r: 2, tf: 4, tr: 2 }) === '炮二平五');
    expect('notation 马8进7', notation(start.grid, { f: 7, r: 9, tf: 6, tr: 7 }) === '马8进7');
    expect('notation 马八进七', notation(start.grid, { f: 1, r: 0, tf: 2, tr: 2 }) === '马八进七');
    expect('notation 车一进一', notation(start.grid, { f: 8, r: 0, tf: 8, tr: 1 }) === '车一进一');
    expect('notation 卒5进1', notation(start.grid, { f: 4, r: 6, tf: 4, tr: 5 }) === '卒5进1');

    const horse = legalFrom(start.grid, 1, 0);
    expect('horse a2', has(horse, 0, 2));
    expect('horse c2', has(horse, 2, 2));
    const blocked = start.grid.map((row) => row.slice());
    blocked[1][1] = { c: 'red', t: 'p', id: 99 };
    expect('horse leg', legalFrom(blocked, 1, 0).length === 0);

    const elephant = legalFrom(start.grid, 2, 0);
    expect('elephant a2', has(elephant, 0, 2));
    expect('elephant e2', has(elephant, 4, 2));
    const eye = start.grid.map((row) => row.slice());
    eye[1][3] = { c: 'red', t: 'p', id: 100 };
    const eyeMoves = legalFrom(eye, 2, 0);
    expect('elephant eye blocked', !has(eyeMoves, 4, 2) && has(eyeMoves, 0, 2));

    const cannonFen = parseFen('4k4/9/9/4p4/4P4/9/9/4C4/9/4K4 w - - 0 1');
    const cannon = legalFrom(cannonFen.grid, 4, 2);
    expect('cannon capture', has(cannon, 4, 6));
    expect('cannon no e5', !has(cannon, 4, 5));
    expect('cannon no e7', !has(cannon, 4, 7));

    const face = parseFen('4k4/9/9/9/4R4/9/9/9/9/4K4 w - - 0 1');
    const rook = legalFrom(face.grid, 4, 5);
    expect('flying general', rook.every((move) => move.tf === 4));

    const checked = parseFen('4k4/9/9/9/4r4/9/9/9/9/4K4 w - - 0 1');
    expect('in check', kingAttacked(checked.grid, 'red'));
    const king = legalFrom(checked.grid, 4, 0);
    expect('king d0', has(king, 3, 0));
    expect('king f0', has(king, 5, 0));
    expect('king not e1', !has(king, 4, 1));

    const opening = allLegal(start.grid, 'red');
    expect('opening has moves', opening.length > 20);
    return errors;
  }

  function mount() {
    const topBar = document.querySelector('.top');
    if (topBar) {
      const markStuck = () => topBar.classList.toggle('is-stuck', window.scrollY > 4);
      markStuck();
      window.addEventListener('scroll', markStuck, { passive: true });
    }

    const stage = document.getElementById('stage');
    const pvList = document.getElementById('pv-list');
    const presetBar = document.getElementById('preset-bar');
    if (!stage || !pvList || !presetBar) return;

    const turnLabel = document.getElementById('turn-label');
    const searchState = document.getElementById('search-state');
    const lastLabel = document.getElementById('last-label');
    const statDepth = document.getElementById('stat-depth');
    const statScore = document.getElementById('stat-score');
    const statNodes = document.getElementById('stat-nodes');
    const statTime = document.getElementById('stat-time');
    const evalRed = document.getElementById('eval-red');
    const evalBlack = document.getElementById('eval-black');
    const evalScore = document.getElementById('eval-score');
    const analyzeBtn = document.getElementById('btn-analyze');
    const undoBtn = document.getElementById('btn-undo');
    const flipBtn = document.getElementById('btn-flip');
    const resetBtn = document.getElementById('btn-reset');

    let grid = null;
    let turn = 'red';
    let flipped = false;
    let selected = null;
    let targets = [];
    let lastMove = null;
    let lastText = '';
    let history = [];
    let analyzing = true;
    let result = null;
    let lineIndex = 0;
    let presetId = 'start';

    stage.innerHTML = boardMarkup();
    const pieceLayer = stage.querySelector('.piece-layer');
    const arrowLayer = stage.querySelector('.arrow-layer');

    presetBar.replaceChildren();
    PRESETS.forEach((preset) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'preset';
      button.dataset.preset = preset.id;
      button.textContent = preset.label;
      button.addEventListener('click', () => loadPreset(preset.id));
      presetBar.append(button);
    });

    analyzeBtn.addEventListener('click', () => {
      analyzing = !analyzing;
      if (analyzing) runSearch();
      else render();
    });
    undoBtn.addEventListener('click', undo);
    flipBtn.addEventListener('click', () => {
      flipped = !flipped;
      render();
    });
    resetBtn.addEventListener('click', () => loadPreset(presetId));
    stage.addEventListener('click', (event) => {
      const cell = event.target.closest('[data-f]');
      if (!cell || !stage.contains(cell)) {
        selected = null;
        targets = [];
        render();
        return;
      }
      onSquare(Number(cell.dataset.f), Number(cell.dataset.r));
    });

    loadPreset('start');

    function loadPreset(id) {
      const preset = PRESETS.find((item) => item.id === id) || PRESETS[0];
      const parsed = parseFen(preset.fen);
      presetId = preset.id;
      grid = parsed.grid;
      turn = parsed.turn;
      flipped = false;
      selected = null;
      targets = [];
      lastMove = null;
      lastText = '';
      history = [];
      result = null;
      lineIndex = 0;
      if (analyzing) runSearch();
      else render();
    }

    function onSquare(f, r) {
      if (selected && targets.some((move) => move.tf === f && move.tr === r)) {
        commit(targets.find((move) => move.tf === f && move.tr === r));
        return;
      }
      const piece = grid[r][f];
      if (piece && piece.c === turn && allLegal(grid, turn).length) {
        selected = { f, r };
        targets = legalFrom(grid, f, r);
      } else {
        selected = null;
        targets = [];
      }
      render();
    }

    function commit(move) {
      history.push({ grid, turn, lastMove, lastText });
      lastText = notation(grid, move);
      lastMove = move;
      grid = play(grid, move);
      turn = opp(turn);
      selected = null;
      targets = [];
      lineIndex = 0;
      if (analyzing) runSearch();
      else {
        result = null;
        render();
      }
    }

    function undo() {
      const previous = history.pop();
      if (!previous) return;
      grid = previous.grid;
      turn = previous.turn;
      lastMove = previous.lastMove;
      lastText = previous.lastText;
      selected = null;
      targets = [];
      lineIndex = 0;
      if (analyzing) runSearch();
      else {
        result = null;
        render();
      }
    }

    function runSearch() {
      result = analyze(grid, turn);
      lineIndex = 0;
      render();
    }

    function render() {
      const over = allLegal(grid, turn).length === 0;
      const inCheck = !over && kingAttacked(grid, turn);
      turnLabel.textContent = over
        ? (turn === 'red' ? '红方无子可走' : '黑方无子可走')
        : (turn === 'red' ? '红方走棋' : '黑方走棋');
      searchState.textContent = analyzing ? (result && result.depth ? '预演中' : '预演') : '已停止';
      searchState.className = 'pill' + (analyzing ? ' is-live' : ' is-stop');
      lastLabel.textContent = lastText ? '上一步  ' + lastText : '尚未落子';
      analyzeBtn.textContent = analyzing ? '停止分析' : '开始分析';
      analyzeBtn.setAttribute('aria-pressed', analyzing ? 'true' : 'false');
      undoBtn.disabled = history.length === 0;

      presetBar.querySelectorAll('.preset').forEach((button) => {
        button.classList.toggle('is-on', button.dataset.preset === presetId);
      });

      const lines = result && !result.over ? result.lines : [];
      if (lineIndex >= lines.length) lineIndex = 0;
      const active = lines[lineIndex];
      const redScore = active ? redOf(active.score, turn) : 0;
      const percent = active ? barPercent(redScore) : 50;

      statDepth.textContent = result && result.depth ? result.depth + ' 层' : '–';
      statScore.textContent = active ? formatScore(redScore) : (over ? '终局' : '–');
      statScore.className = 'stat-value ' + tone(active ? redScore : 0);
      statNodes.textContent = result ? formatNodes(result.nodes) : '–';
      statTime.textContent = result ? (result.ms / 1000).toFixed(2) + ' s' : '–';
      evalRed.style.height = percent.toFixed(1) + '%';
      evalBlack.style.height = (100 - percent).toFixed(1) + '%';
      evalScore.textContent = active ? formatBadge(redScore) : '0.0';
      evalScore.className = 'eval-score ' + tone(active ? redScore : 0);

      drawPieces(pieceLayer, inCheck);
      drawArrow(arrowLayer, active ? active.m : null);
      drawLines(lines);
    }

    function drawPieces(layer, inCheck) {
      const king = inCheck ? findKing(grid, turn) : null;
      const marks = [];
      if (lastMove) {
        marks.push(mark('from', lastMove.f, lastMove.r));
        marks.push(mark('to', lastMove.tf, lastMove.tr));
      }
      if (king) marks.push(mark('check', king.f, king.r));
      targets.forEach((move) => {
        const capture = !!grid[move.tr][move.tf];
        const point = pct(move.tf, move.tr);
        marks.push(
          '<button type="button" class="dot' + (capture ? ' is-capture' : '') + '" data-f="' + move.tf + '" data-r="' + move.tr +
          '" style="left:' + point.left + '%;top:' + point.top + '%" aria-label="落到这里"></button>'
        );
      });

      const pieces = [];
      for (let r = 0; r < 10; r++) {
        for (let f = 0; f < 9; f++) {
          const piece = grid[r][f];
          if (!piece) continue;
          const point = pct(f, r);
          const on = selected && selected.f === f && selected.r === r;
          const label = (piece.c === 'red' ? '红' : '黑') + FACE[piece.c][piece.t];
          pieces.push(
            '<button type="button" class="piece ' + piece.c + (on ? ' is-on' : '') + '" data-f="' + f + '" data-r="' + r +
            '" style="left:' + point.left + '%;top:' + point.top + '%" aria-label="' + label + '">' +
            FACE[piece.c][piece.t] + '</button>'
          );
        }
      }
      layer.innerHTML = marks.join('') + pieces.join('');
    }

    function mark(kind, f, r) {
      const point = pct(f, r);
      return '<span class="sq ' + kind + '" style="left:' + point.left + '%;top:' + point.top + '%"></span>';
    }

    function drawArrow(svg, move) {
      if (!move) {
        svg.innerHTML = '';
        return;
      }
      const a = point(move.f, move.r);
      const b = point(move.tf, move.tr);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const x1 = a.x + ux * 26;
      const y1 = a.y + uy * 26;
      const x2 = b.x - ux * 34;
      const y2 = b.y - uy * 34;
      svg.innerHTML =
        '<defs><marker id="xq-arrow-head" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">' +
        '<path d="M0.5 0.5 L6.5 3.5 L0.5 6.5 Z" fill="#e2a31a"/></marker></defs>' +
        '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) +
        '" stroke="#e2a31a" stroke-width="5" stroke-linecap="round" marker-end="url(#xq-arrow-head)"/>';
    }

    function drawLines(lines) {
      pvList.replaceChildren();
      if (!lines.length) {
        const empty = document.createElement('li');
        empty.className = 'pv-empty';
        empty.textContent = allLegal(grid, turn).length ? '按「开始分析」展开主变' : '这一方已经无子可走';
        pvList.append(empty);
        return;
      }
      lines.forEach((line, index) => {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pv-btn' + (index === lineIndex ? ' is-on' : '');
        const redScore = redOf(line.score, turn);
        const rank = document.createElement('span');
        rank.className = 'pv-rank';
        rank.textContent = '#' + (index + 1);
        const move = document.createElement('span');
        move.className = 'pv-move';
        move.textContent = notation(grid, line.m);
        const score = document.createElement('span');
        score.className = 'pv-score ' + tone(redScore);
        score.textContent = formatScore(redScore);
        const chain = document.createElement('span');
        chain.className = 'pv-chain';
        chain.textContent = variationText(line);
        button.append(rank, move, score, chain);
        button.addEventListener('click', () => {
          lineIndex = index;
          render();
        });
        item.append(button);
        pvList.append(item);
      });
    }

    function variationText(line) {
      let node = grid;
      const words = [];
      line.pv.slice(0, 8).forEach((move) => {
        const piece = node[move.r] && node[move.r][move.f];
        if (!piece) return;
        words.push(notation(node, move));
        node = play(node, move);
      });
      return words.join('  ');
    }

    function point(f, r) {
      const vf = flipped ? 8 - f : f;
      const vr = flipped ? r : 9 - r;
      return { x: 80 + vf * 100, y: 80 + vr * 100 };
    }

    function pct(f, r) {
      const at = point(f, r);
      return { left: (at.x / 960) * 100, top: (at.y / 1060) * 100 };
    }
  }

  function tone(redScore) {
    if (redScore > 15) return 'tone-red';
    if (redScore < -15) return 'tone-black';
    return 'tone-even';
  }

  function formatNodes(n) {
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 1 : 2) + ' k';
    return String(n);
  }

  function boardMarkup() {
    const stars = [
      [1, 2], [7, 2], [1, 7], [7, 7],
      [0, 3], [2, 3], [4, 3], [6, 3], [8, 3],
      [0, 6], [2, 6], [4, 6], [6, 6], [8, 6],
    ];
    const starPath = stars.map(([f, vr]) => {
      const cx = 80 + f * 100;
      const cy = 80 + vr * 100;
      const d = 9;
      const len = 16;
      const parts = [];
      if (f > 0) {
        parts.push('M ' + (cx - d - len) + ' ' + (cy - d) + ' L ' + (cx - d) + ' ' + (cy - d) + ' L ' + (cx - d) + ' ' + (cy - d - len));
        parts.push('M ' + (cx - d - len) + ' ' + (cy + d) + ' L ' + (cx - d) + ' ' + (cy + d) + ' L ' + (cx - d) + ' ' + (cy + d + len));
      }
      if (f < 8) {
        parts.push('M ' + (cx + d + len) + ' ' + (cy - d) + ' L ' + (cx + d) + ' ' + (cy - d) + ' L ' + (cx + d) + ' ' + (cy - d - len));
        parts.push('M ' + (cx + d + len) + ' ' + (cy + d) + ' L ' + (cx + d) + ' ' + (cy + d) + ' L ' + (cx + d) + ' ' + (cy + d + len));
      }
      return parts.join(' ');
    }).join(' ');

    let vertical = '';
    for (let f = 1; f <= 7; f++) {
      const x = 80 + f * 100;
      vertical += '<line x1="' + x + '" y1="80" x2="' + x + '" y2="480"/>';
      vertical += '<line x1="' + x + '" y1="580" x2="' + x + '" y2="980"/>';
    }
    let horizontal = '';
    for (let i = 0; i < 10; i++) {
      const y = 80 + i * 100;
      horizontal += '<line x1="80" y1="' + y + '" x2="880" y2="' + y + '"/>';
    }

    return '' +
      '<svg class="board-svg" viewBox="0 0 960 1060" role="img" aria-label="中国象棋棋盘">' +
      '<defs>' +
      '<radialGradient id="xq-wood" cx="50%" cy="46%" r="72%">' +
      '<stop offset="0%" stop-color="#f6e2c2"/>' +
      '<stop offset="58%" stop-color="#e4bc86"/>' +
      '<stop offset="100%" stop-color="#c7965e"/>' +
      '</radialGradient>' +
      '<linearGradient id="xq-frame" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="#6a3d1e"/>' +
      '<stop offset="50%" stop-color="#3d2212"/>' +
      '<stop offset="100%" stop-color="#24150c"/>' +
      '</linearGradient>' +
      '</defs>' +
      '<rect x="18" y="18" width="924" height="1024" rx="18" fill="url(#xq-frame)"/>' +
      '<rect x="40" y="40" width="880" height="980" rx="10" fill="url(#xq-wood)"/>' +
      '<rect x="64" y="64" width="832" height="932" rx="4" fill="none" stroke="#5c381c" stroke-width="3"/>' +
      '<g stroke="#5c381c" stroke-width="2.2" fill="none">' +
      horizontal +
      '<line x1="80" y1="80" x2="80" y2="980"/>' +
      '<line x1="880" y1="80" x2="880" y2="980"/>' +
      vertical +
      '<line x1="380" y1="80" x2="580" y2="280"/>' +
      '<line x1="580" y1="80" x2="380" y2="280"/>' +
      '<line x1="380" y1="780" x2="580" y2="980"/>' +
      '<line x1="580" y1="780" x2="380" y2="980"/>' +
      '<path d="' + starPath + '"/>' +
      '</g>' +
      '<g fill="#694022" font-family="&quot;AR PL UKai CN&quot;, KaiTi, STKaiti, serif" font-size="42" font-weight="700">' +
      '<text x="280" y="542" text-anchor="middle">楚 河</text>' +
      '<text x="680" y="542" text-anchor="middle">漢 界</text>' +
      '</g></svg>' +
      '<svg class="arrow-layer" viewBox="0 0 960 1060" aria-hidden="true"></svg>' +
      '<div class="piece-layer"></div>';
  }

  return {
    INITIAL,
    PRESETS,
    parseFen,
    notation,
    allLegal,
    analyze,
    redOf,
    formatScore,
    selfCheck,
    mount,
  };
});
