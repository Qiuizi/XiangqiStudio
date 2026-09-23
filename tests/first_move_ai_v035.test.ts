import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useGameStore } from '../src/stores/gameStore';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

describe('Xiangqi Studio V0.3.5 — 首步 AI 搜索与落子时序专项回归测试', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('1. 验证玩家移动红炮后，游戏状态正确流转并准备触发 AI 走棋', () => {
    const store = useGameStore();
    expect(store.gameMode).toBe('pve');
    expect(store.playerSide).toBe('red');
    expect(store.activeColor).toBe('red');
    expect(store.isUserTurn).toBe(true);

    // 玩家走炮八平五 (h2e2: file 7, rank 2 -> file 4, rank 2)
    store.makeUserMove({ file: 7, rank: 2 }, { file: 4, rank: 2 });

    expect(store.activeColor).toBe('black');
    expect(store.isUserTurn).toBe(false);
    expect(store.history.length).toBe(1);
    expect(store.lastMove).not.toBeNull();
    expect(store.lastMove?.from.file).toBe(7);
    expect(store.lastMove?.to.file).toBe(4);
  });

  it('2. 验证真实 Pikafish 在玩家首步红炮局面下输出合法走法 (使用用户配置: 14T, 64MB, 1PV, 1500ms)', async () => {
    const enginePath = 'D:/Qiuizi/project/XiangqiStudio/src-tauri/resources/pikafish-bmi2.exe';
    if (!fs.existsSync(enginePath)) {
      console.warn('Pikafish binary not found at', enginePath);
      return;
    }

    const firstMoveFen = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C2C4/9/RNBAKABNR b - - 0 1';
    const child = spawn(enginePath, [], { cwd: path.dirname(enginePath) });
    let maxDepth = 0;
    let bestmove: string | null = null;
    let startTime = 0;

    await new Promise<void>((resolve) => {
      child.stdout.on('data', (d) => {
        d.toString().split('\n').forEach(l => {
          const line = l.trim();
          if (line === 'readyok') {
            startTime = Date.now();
            child.stdin.write(`position fen ${firstMoveFen}\n`);
            child.stdin.write('go movetime 1500\n');
          } else if (line.startsWith('info depth')) {
            const depthMatch = line.match(/\bdepth\s+(\d+)/);
            if (depthMatch) {
              const d = parseInt(depthMatch[1], 10);
              if (d > maxDepth) maxDepth = d;
            }
          } else if (line.startsWith('bestmove ')) {
            bestmove = line.split(' ')[1];
            child.stdin.write('quit\n');
            resolve();
          }
        });
      });

      child.stdin.write('uci\n');
      child.stdin.write('setoption name Threads value 14\n');
      child.stdin.write('setoption name Hash value 64\n');
      child.stdin.write('setoption name MultiPV value 1\n');
      child.stdin.write('isready\n');
    });

    console.log(`[First Move Engine Verification] Max Depth reached: ${maxDepth}, Bestmove: ${bestmove}`);
    expect(maxDepth).toBeGreaterThanOrEqual(15);
    expect(bestmove).not.toBeNull();
    // 黑方应对中炮合法走法（例如跳马 h9g7, b9c7 等）
    expect(['h9g7', 'b9c7', 'h7e7', 'b7e7', 'g6g5', 'c6c5']).toContain(bestmove);
  }, 10000);

  it('3. 验证 AI 落子后，棋盘合法执行并恢复玩家回合', () => {
    const store = useGameStore();

    // 玩家走炮八平五
    store.makeUserMove({ file: 7, rank: 2 }, { file: 4, rank: 2 });
    expect(store.activeColor).toBe('black');

    // 模拟 AI 执行跳马 h9g7 (file 7, rank 9 -> file 6, rank 7)
    store.executeAiMove('h9g7');

    expect(store.history.length).toBe(2);
    expect(store.activeColor).toBe('red');
    expect(store.isUserTurn).toBe(true); // 玩家可继续走棋！
    expect(store.isAiThinking).toBe(false);
  });
});
