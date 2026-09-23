import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useGameStore } from '../src/stores/gameStore';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

describe('Xiangqi Studio — 残局研究关闭深度解局后推荐箭头清理专项测试 (V0.3.5)', () => {
  let child: ChildProcess | null = null;

  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    if (child && !child.killed) {
      try {
        child.stdin?.write('quit\n');
        child.kill();
      } catch {
        // ignore
      }
      child = null;
    }
  });

  it('1. 残局研究开启深度解局并产生箭头 -> 关闭分析后箭头立即消失，棋子与高亮状态保持不变', async () => {
    const store = useGameStore();
    await store.enterStudyMode('manual');

    // 棋手走一步棋，产生走棋高亮
    store.makeUserMove({ file: 7, rank: 2 }, { file: 4, rank: 2 });
    expect(store.lastMove).not.toBeNull();
    const lastMoveSnapshot = { ...store.lastMove };

    // 开启深度解局
    await store.toggleStudyAnalysis();
    expect(store.isStudyAnalyzing).toBe(true);

    // 模拟引擎推送分析结果
    store.engineInfo.bestMove = 'h9g7';
    store.updateAiArrow('h9g7', true);

    // 验证箭头正常显示
    expect(store.aiArrow).not.toBeNull();
    expect(store.aiArrow?.from.file).toBe(7); // h
    expect(store.aiArrow?.from.rank).toBe(9); // 9
    expect(store.aiArrow?.to.file).toBe(6);   // g
    expect(store.aiArrow?.to.rank).toBe(7);   // 7

    // 关闭深度解局
    await store.toggleStudyAnalysis();
    expect(store.isStudyAnalyzing).toBe(false);

    // 核心断言：推荐箭头必须立即消失
    expect(store.aiArrow).toBeNull();

    // 走棋高亮和历史记录必须保持完好
    expect(store.lastMove).toEqual(lastMoveSnapshot);
    expect(store.history.length).toBe(1);
    expect(store.board.getFen()).toBe(store.currentFen);
  });

  it('2. 防迟到事件穿透：关闭分析后，旧搜索任务的 info 与 bestmove 不得重新唤醒箭头', async () => {
    const store = useGameStore();
    await store.enterStudyMode('manual');

    // 开启分析
    await store.toggleStudyAnalysis();
    expect(store.isStudyAnalyzing).toBe(true);

    // 产生箭头
    store.updateAiArrow('h2e2', true);
    expect(store.aiArrow).not.toBeNull();

    // 关闭分析
    await store.toggleStudyAnalysis();
    expect(store.isStudyAnalyzing).toBe(false);
    expect(store.aiArrow).toBeNull();

    // 模拟延迟到达的旧搜索 info 与 bestmove 走法
    store.updateAiArrow('b0c2', false);
    expect(store.aiArrow).toBeNull();

    store.updateAiArrow('b0c2', true);
    expect(store.aiArrow).toBeNull();
  });

  it('3. 连续高频开启、关闭分析至少 10 次，验证无任何旧箭头残留', async () => {
    const store = useGameStore();
    await store.enterStudyMode('manual');

    for (let i = 0; i < 10; i++) {
      // 开启
      await store.toggleStudyAnalysis();
      expect(store.isStudyAnalyzing).toBe(true);

      // 模拟中间产生了推荐走法
      const move = i % 2 === 0 ? 'h2e2' : 'b2e2';
      store.updateAiArrow(move, true);
      expect(store.aiArrow).not.toBeNull();

      // 关闭
      await store.toggleStudyAnalysis();
      expect(store.isStudyAnalyzing).toBe(false);

      // 每次关闭后，箭头必须立即消失且不能留存
      expect(store.aiArrow).toBeNull();
    }
  });

  it('4. 分析过程中切换残局预设与自定义 FEN，旧局面的箭头立即被清除', async () => {
    const store = useGameStore();
    await store.enterStudyMode('manual');

    // 开启分析并显示初始盘面的推荐箭头
    await store.toggleStudyAnalysis();
    store.updateAiArrow('h2e2', true);
    expect(store.aiArrow).not.toBeNull();

    // 切换到马兵胜单缺象预设 (4k4/4a4/4ba3/9/9/9/4N4/4B4/4P4/4K4 w - - 0 1)
    const maBingFen = '4k4/4a4/4ba3/9/9/9/4N4/4B4/4P4/4K4 w - - 0 1';
    await store.resetToPreset(maBingFen);

    // 切换后，旧局面的箭头必须立即被重置
    expect(store.aiArrow).toBeNull();
    expect(store.board.getFen()).toBe(maBingFen);

    // 导入自定义 FEN
    const customFen = '4k4/9/9/9/4r4/4R4/4P4/9/9/4K4 w - - 0 1';
    const res = store.loadCustomFen(customFen);
    expect(res.success).toBe(true);
    expect(store.aiArrow).toBeNull();
    expect(store.board.getFen()).toBe(customFen);
  });

  it('5. 普通人机对弈隔离验证：辅助分析关闭不得中断 activeAiSearchId 或 AI 落子状态', async () => {
    const store = useGameStore();
    await store.newGame('pve', 'red');

    // 模拟普通对弈中 AI 正在思考 (isAiThinking = true, activeAiSearchId = 999)
    store.isAiThinking = true;
    (store as any).activeAiSearchId = 999;
    (store as any).currentSearchId = 999;

    // 用户在右侧面板点击辅助分析关闭 (stopAnalysis(false))
    await store.stopAnalysis(false);

    // 辅助分析应为 false，但对局搜索依然受到保护
    expect(store.isAnalyzing).toBe(false);
    expect(store.isAiThinking).toBe(true);
    expect((store as any).activeAiSearchId).toBe(999);
  });

  it('6. 真实 Pikafish 引擎联调：开启分析获得推荐箭头，stop 后箭头真实消失', async () => {
    const enginePath = 'D:/Qiuizi/project/XiangqiStudio/src-tauri/resources/pikafish-bmi2.exe';
    if (!fs.existsSync(enginePath)) {
      console.warn('Pikafish binary not found at', enginePath);
      return;
    }

    const store = useGameStore();
    await store.enterStudyMode('manual');
    await store.toggleStudyAnalysis();

    child = spawn(enginePath, [], { cwd: path.dirname(enginePath) });

    let firstPvMove: string | null = null;

    await new Promise<void>((resolve) => {
      child!.stdout?.on('data', (data) => {
        const text = data.toString();
        const lines = text.split('\n');
        for (const raw of lines) {
          const line = raw.trim();
          if (line === 'readyok') {
            child!.stdin?.write('position startpos\n');
            child!.stdin?.write('go infinite\n');
          } else if (line.startsWith('info depth') && line.includes(' pv ')) {
            const pvMatch = line.match(/\bpv\s+([a-i]\d[a-i]\d)/);
            if (pvMatch && !firstPvMove) {
              firstPvMove = pvMatch[1];
              child!.stdin?.write('stop\n');
            }
          } else if (line.startsWith('bestmove ')) {
            resolve();
          }
        }
      });

      child!.stdin?.write('uci\n');
      child!.stdin?.write('isready\n');
    });

    expect(firstPvMove).not.toBeNull();
    // 模拟前端显示收到的引擎推荐箭头
    store.updateAiArrow(firstPvMove, true);
    expect(store.aiArrow).not.toBeNull();

    // 用户点击关闭深度解局
    await store.toggleStudyAnalysis();

    // 验证箭头在真实解局停止后完全清除
    expect(store.isStudyAnalyzing).toBe(false);
    expect(store.aiArrow).toBeNull();
  }, 10000);
});
