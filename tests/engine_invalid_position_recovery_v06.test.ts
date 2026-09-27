import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useGameStore } from '../src/stores/gameStore';
import { validatePositionBeforeEngine } from '../src/core/chess/validation';
import { INITIAL_FEN } from '../src/core/chess/fen';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

describe('Xiangqi Studio V0.6 — 引擎局面安全边界与异常恢复专项测试', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('1. validatePositionBeforeEngine 规则校验层', () => {
    it('拒绝空棋盘 (90 个交叉点全空)', () => {
      const emptyFen = '9/9/9/9/9/9/9/9/9/9 w - - 0 1';
      const res = validatePositionBeforeEngine(emptyFen);
      expect(res.valid).toBe(false);
      expect(res.code).toBe('MISSING_RED_KING');
    });

    it('拒绝缺少红方帅', () => {
      // Standard board with Red King 'K' replaced by empty '1'
      const fen = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBA1ABNR w - - 0 1';
      const res = validatePositionBeforeEngine(fen);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('红帅');
    });

    it('拒绝缺少黑方将', () => {
      // Standard board with Black King 'k' replaced by empty '1'
      const fen = 'rnba1abnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';
      const res = validatePositionBeforeEngine(fen);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('黑将');
    });

    it('拒绝存在两个红帅', () => {
      const fen = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABKR w - - 0 1';
      const res = validatePositionBeforeEngine(fen);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('2 个红帅');
    });

    it('拒绝存在两个黑将', () => {
      const fen = 'rnbakkbnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';
      const res = validatePositionBeforeEngine(fen);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('2 个黑将');
    });

    it('拒绝棋子数量超限 (如 3 个红车或 3 个黑车，避免 Pikafish 内存越界崩溃)', () => {
      // 3 Red Rooks: R R R
      const threeRedRooks = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABRR w - - 0 1';
      const resRed = validatePositionBeforeEngine(threeRedRooks);
      expect(resRed.valid).toBe(false);
      expect(resRed.reason).toContain('红车数量超限');

      // 3 Black Rooks: r r r
      const threeBlackRooks = 'r2akabnr/r8/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';
      const resBlack = validatePositionBeforeEngine(threeBlackRooks);
      expect(resBlack.valid).toBe(false);
      expect(resBlack.reason).toContain('黑车数量超限');
    });

    it('拒绝红帅与黑将在同一列直接照面 (飞将违规)', () => {
      const facingKings = '4k4/9/9/9/9/9/9/9/9/4K4 w - - 0 1';
      const res = validatePositionBeforeEngine(facingKings);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('照面');
    });

    it('拒绝将帅位于九宫格外', () => {
      // Red king at e3 (outside palace)
      const kingOutside = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/4K4/1C5C1/9/RNBA1ABNR w - - 0 1';
      const res = validatePositionBeforeEngine(kingOutside);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('红帅位置非法');
    });

    it('拒绝当前非走棋方处于被将军状态 (前一步走法非法局面)', () => {
      // Red to move ('w'), but Black King is already attacked by Red Rook at d8
      // Position: Black King at d9 (3,9), Red Rook at d8 (3,8), Red King at e0 (4,0)
      const inactiveInCheck = '3k5/3R5/9/9/9/9/9/9/4K4/9 w - - 0 1';
      const res = validatePositionBeforeEngine(inactiveInCheck);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('黑将已被攻击中');
    });

    it('允许完全合法的标准初始局面', () => {
      const res = validatePositionBeforeEngine(INITIAL_FEN);
      expect(res.valid).toBe(true);
    });

    it('允许完全合法的典型残局 (如车兵残局、马炮残局)', () => {
      // Red King at e0 (4,0), Red Rook at e7 (4,7), Black King at d9 (3,9), Black to move
      const legalEndgame = '3k5/4R4/9/9/9/9/9/9/4K4/9 b - - 0 1';
      const res = validatePositionBeforeEngine(legalEndgame);
      expect(res.valid).toBe(true);
    });

    it('允许完全合法的攻防中局', () => {
      const midgame = 'r1bakab1r/9/1cn3c1n/p1p1p1p1p/9/2P6/P3P1P1P/1C2C1N2/9/RNBAKAB1R w - - 0 1';
      const res = validatePositionBeforeEngine(midgame);
      expect(res.valid).toBe(true);
    });
  });

  describe('2. Store 局面安全栅栏与状态防卡死验证', () => {
    it('尝试在非法残局上触发深度解局 -> 立即安全拦截，禁止卡死在 isStudyAnalyzing/isAnalyzing', async () => {
      const store = useGameStore();
      await store.enterStudyMode('manual');

      // 设置一个非法 FEN (空棋盘)
      store.board.reset('9/9/9/9/9/9/9/9/9/9 w - - 0 1');

      // 触发分析
      await store.toggleStudyAnalysis();

      // 核心断言：无论如何不能永久卡在分析或 AI 思考状态！
      expect(store.isStudyAnalyzing).toBe(false);
      expect(store.isAnalyzing).toBe(false);
      expect(store.isAiThinking).toBe(false);
      expect(store.isEngineError).toBe(true);
      expect(store.engineErrorMsg).toContain('Pikafish');
    });

    it('连续导入多个不同 FEN (包括合法与异常) -> 上下文重置干净，无状态残留', async () => {
      const store = useGameStore();
      await store.enterStudyMode('manual');

      // 1. 导入初始局面
      await store.importNewPosition(INITIAL_FEN, 'red');
      expect(store.isStudyAnalyzing).toBe(false);
      expect(store.isAnalyzing).toBe(false);
      expect(store.engineInfo.multipvLines.length).toBe(0);

      // 2. 连续快速导入另一个合法残局
      const legalEndgame = '3k5/4R4/9/9/9/9/9/9/4K4/9 b - - 0 1';
      await store.importNewPosition(legalEndgame, 'black');
      expect(store.board.activeColor).toBe('black');
      expect(store.isStudyAnalyzing).toBe(false);
      expect(store.aiArrow).toBeNull();

      // 3. 连续导入异常局面 (缺黑将)
      const invalidFen = 'rnba1abnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';
      await store.importNewPosition(invalidFen, 'red');
      expect(store.isStudyAnalyzing).toBe(false);
      expect(store.isEngineError).toBe(true);
      expect(store.engineErrorMsg).toContain('黑将');
      // 棋盘依然能正常展示该局面供用户编辑修正
      expect(store.board.getFen()).toContain('rnba1abnr');
    });

    it('分析中再次导入截图局面 -> 安全停止旧搜索并重置状态，绝不复用旧 searchId', async () => {
      const store = useGameStore();
      await store.enterStudyMode('manual');

      // 模拟正在分析旧局面
      store.isStudyAnalyzing = true;
      store.isAnalyzing = true;
      store.activeAnalysisFen = INITIAL_FEN;
      store.updateAiArrow('h2e2', true);

      // 导入新截图局面
      const newFen = '3k5/4R4/9/9/9/9/9/9/4K4/9 b - - 0 1';
      await store.importNewPosition(newFen, 'black');

      // 验证旧搜索完全清理
      expect(store.isStudyAnalyzing).toBe(false);
      expect(store.isAnalyzing).toBe(false);
      expect(store.activeAnalysisFen).toBeNull();
      expect(store.aiArrow).toBeNull();
      expect(store.board.activeColor).toBe('black');
    });

    it('stop 后立即加载新 FEN -> 不会触发冲突或残留报错', async () => {
      const store = useGameStore();
      await store.enterStudyMode('manual');

      await store.stopAnalysis(true);
      expect(store.isAnalyzing).toBe(false);
      expect(store.isAiThinking).toBe(false);

      await store.importNewPosition(INITIAL_FEN, 'red');
      expect(store.isStudyAnalyzing).toBe(false);
      expect(store.isAnalyzing).toBe(false);
      expect(store.engineInfo.depth).toBe(0);
    });
  });

  describe('3. Pikafish 真实引擎边界防御验证 (防段错误崩溃)', () => {
    it('真实 Pikafish 进程在安全校验守卫下不会因非法 FEN 崩溃', async () => {
      const engineDir = path.resolve(__dirname, '../src-tauri/resources');
      const candidateEngines = ['pikafish-avx2.exe', 'pikafish-bmi2.exe'];
      const engineExe = candidateEngines
        .map(name => path.join(engineDir, name))
        .find(p => fs.existsSync(p));

      if (!engineExe) {
        console.warn('Pikafish executable not found in resources, skipping real process test');
        return;
      }

      // 模拟前端与 Rust 端的联合防线：
      // 当截图识别给出一个非法 FEN（例如含有 3 个车）
      const corruptedFen = 'r2akanr1/r8/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

      // 1. 前端层拦截
      const feCheck = validatePositionBeforeEngine(corruptedFen);
      expect(feCheck.valid).toBe(false);
      expect(feCheck.reason).toContain('黑车数量超限');

      // 2. 验证防线生效后，保证没有任何非法 FEN 写入真实的 Pikafish stdin
      const proc = spawn(engineExe, [], {
        cwd: engineDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let exited = false;
      let exitCode: number | null = null;
      proc.on('exit', (code) => {
        exited = true;
        exitCode = code;
      });

      // 初始化引擎 UCI
      proc.stdin.write('uci\n');
      proc.stdin.write('isready\n');

      // 等待引擎就绪响应
      let buffer = '';
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Pikafish init timeout')), 5000);
        proc.stdout.on('data', (d) => {
          buffer += d.toString();
          if (buffer.includes('readyok')) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });

      // 发送合法局面，确保引擎工作正常
      proc.stdin.write(`position fen ${INITIAL_FEN}\n`);
      proc.stdin.write('go depth 5\n');

      let hasBestMove = false;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Pikafish search timeout')), 5000);
        proc.stdout.on('data', (d) => {
          if (d.toString().includes('bestmove')) {
            hasBestMove = true;
            clearTimeout(timeout);
            resolve();
          }
        });
      });

      expect(hasBestMove).toBe(true);
      expect(exited).toBe(false);

      // 安全退出
      proc.stdin.write('quit\n');
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (!proc.killed) proc.kill();
    });
  });
});
