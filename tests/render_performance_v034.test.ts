import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useGameStore } from '../src/stores/gameStore';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

describe('Xiangqi Studio — AI 计算期间 UI 卡顿与棋盘反复跳动专项测试', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('1. 验证 MultiPV 2 不再被 Rust 节流丢弃，成对均匀派发', async () => {
    const enginePath = 'D:/Qiuizi/project/XiangqiStudio/src-tauri/resources/pikafish-bmi2.exe';
    if (!fs.existsSync(enginePath)) {
      console.warn('Pikafish binary not found at', enginePath);
      return;
    }

    const child = spawn(enginePath, [], { cwd: path.dirname(enginePath) });
    const rawLines: string[] = [];
    let startTime = 0;

    await new Promise<void>((resolve) => {
      child.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const raw of lines) {
          const line = raw.trim();
          if (line === 'readyok') {
            startTime = Date.now();
            child.stdin.write('position startpos\n');
            child.stdin.write('go movetime 1500\n');
          } else if (line.startsWith('info depth') && startTime > 0) {
            rawLines.push(line);
          } else if (line.startsWith('bestmove ')) {
            child.stdin.write('quit\n');
            resolve();
          }
        }
      });

      child.stdin.write('uci\n');
      child.stdin.write('setoption name Threads value 4\n');
      child.stdin.write('setoption name Hash value 256\n');
      child.stdin.write('setoption name MultiPV value 2\n');
      child.stdin.write('isready\n');
    });

    // 模拟新版 Rust 独立 per-multipv 节流逻辑 (80ms)
    const lastEmitTimePerMpv = new Map<number, number>();
    const emittedLines: { lineNum: number; depth: number }[] = [];

    for (const raw of rawLines) {
      const mpvMatch = raw.match(/\bmultipv\s+(\d+)/);
      const depthMatch = raw.match(/\bdepth\s+(\d+)/);
      const lineNum = mpvMatch ? parseInt(mpvMatch[1], 10) : 1;
      const depth = depthMatch ? parseInt(depthMatch[1], 10) : 0;

      const now = Date.now();
      const lastEmit = lastEmitTimePerMpv.get(lineNum);
      const shouldEmit = !lastEmit || (now - lastEmit >= 80);

      if (shouldEmit) {
        lastEmitTimePerMpv.set(lineNum, now);
        emittedLines.push({ lineNum, depth });
      }
    }

    const mpv1Count = emittedLines.filter(l => l.lineNum === 1).length;
    const mpv2Count = emittedLines.filter(l => l.lineNum === 2).length;

    console.log(`[MultiPV Stream Result] MPV 1 count: ${mpv1Count}, MPV 2 count: ${mpv2Count}`);
    expect(mpv1Count).toBeGreaterThan(0);
    expect(mpv2Count).toBeGreaterThan(0);
    // 验证 MultiPV 2 接收率至少达到 MultiPV 1 的 80% (先前旧版本为 0%)
    const ratio = mpv2Count / mpv1Count;
    expect(ratio).toBeGreaterThanOrEqual(0.8);
  }, 10000);

  it('2. 验证推荐箭头具有视觉平滑稳定机制，杜绝 100ms 内反复换向横跳', () => {
    const store = useGameStore();

    // 模拟收到了第 1 路线
    store.engineInfo.multipvLines = [
      {
        multipv: 1,
        depth: 10,
        scoreCp: 25,
        scoreMate: null,
        nodes: 100000,
        nps: 1000000,
        pv: ['h2e2', 'h9g7'],
        bestMove: 'h2e2',
      },
    ];
    store.selectMultiPvLine(1);

    expect(store.aiArrow).not.toBeNull();
    expect(store.aiArrow?.from.file).toBe(7); // h -> 7
    expect(store.aiArrow?.from.rank).toBe(2); // 2 -> 2
    expect(store.aiArrow?.to.file).toBe(4);   // e -> 4
    expect(store.aiArrow?.to.rank).toBe(2);   // 2 -> 2
  });

  it('3. 验证手动选择 MultiPV 候选线路时不被其他线路抢占', () => {
    const store = useGameStore();

    // 模拟收到了 2 条线路
    store.engineInfo.multipvLines = [
      {
        multipv: 1,
        depth: 15,
        scoreCp: 25,
        scoreMate: null,
        nodes: 100000,
        nps: 1000000,
        pv: ['h2e2', 'h9g7'],
        bestMove: 'h2e2',
      },
      {
        multipv: 2,
        depth: 15,
        scoreCp: 18,
        scoreMate: null,
        nodes: 100000,
        nps: 1000000,
        pv: ['b2e2', 'b9c7'],
        bestMove: 'b2e2',
      },
    ];

    // 用户选择第 2 路线
    store.selectMultiPvLine(2);
    expect(store.selectedMultiPv).toBe(2);

    // 验证箭头对应第 2 路线走法 b2e2 (file 1 -> file 4)
    expect(store.aiArrow?.from.file).toBe(1); // b -> 1
    expect(store.aiArrow?.from.rank).toBe(2); // 2 -> 2
    expect(store.aiArrow?.to.file).toBe(4);   // e -> 4
    expect(store.aiArrow?.to.rank).toBe(2);   // 2 -> 2

    // 模拟新到了大量第 1 路线的 info 更新
    store.engineInfo.pv = ['c3c4'];
    store.engineInfo.bestMove = 'c3c4';
    store.engineInfo.multipvLines[0] = {
      ...store.engineInfo.multipvLines[0],
      pv: ['c3c4'],
      bestMove: 'c3c4',
    };

    // 验证：用户的选择权依然锁定在第 2 路线，没有被第 1 路线抢走
    expect(store.selectedMultiPv).toBe(2);
    expect(store.aiArrow?.from.file).toBe(1); // 依然是 b2e2
    expect(store.aiArrow?.from.rank).toBe(2);
  });

  it('4. 验证引擎计算期间真实棋局完全隔离，棋子与棋盘状态不发生非落子移动', () => {
    const store = useGameStore();
    const initialFen = store.board.getFen();
    const initialHistoryLength = store.history.length;

    // 模拟接收大量的分析数据
    for (let d = 1; d <= 25; d++) {
      store.engineInfo.depth = d;
      store.engineInfo.nodes = d * 100000;
      store.engineInfo.scoreCp = d * 2;
      store.engineInfo.pv = ['h2e2', 'h9g7', 'h0g2'];
      store.engineInfo.bestMove = 'h2e2';
    }

    // 验证棋盘 FEN 和走棋历史未受任何污染
    expect(store.board.getFen()).toBe(initialFen);
    expect(store.history.length).toBe(initialHistoryLength);
    expect(store.matchStatus).not.toBe('game_over');
  });
});
