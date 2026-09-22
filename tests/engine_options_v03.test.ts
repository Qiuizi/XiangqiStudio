import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

describe('Xiangqi Studio V0.3 — Pikafish UCI Options & Search Control Verification', () => {
  const engineDir = path.resolve(__dirname, '../src-tauri/resources');
  const engineExe = path.join(engineDir, 'pikafish-bmi2.exe');

  it('1. 验证真实引擎输出包含全部 V0.3 要求的 UCI 选项', async () => {
    expect(fs.existsSync(engineExe)).toBe(true);

    const proc = spawn(engineExe, [], {
      cwd: engineDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let output = '';
    proc.stdout.on('data', chunk => { output += chunk.toString(); });

    proc.stdin.write('uci\n');

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('UCI timeout')), 5000);
      const interval = setInterval(() => {
        if (output.includes('uciok')) {
          clearTimeout(timeout);
          clearInterval(interval);
          resolve();
        }
      }, 30);
    });

    proc.stdin.write('quit\n');

    // Verify key supported options
    expect(output).toContain('option name Threads type spin');
    expect(output).toContain('option name Hash type spin');
    expect(output).toContain('option name MultiPV type spin default 1 min 1 max 128');
    expect(output).toContain('option name Skill Level type spin default 20 min 0 max 20');
    expect(output).toContain('option name UCI_LimitStrength type check default false');
    expect(output).toContain('option name UCI_Elo type spin default 1280 min 1280 max 3133');
    expect(output).toContain('option name Repetition Rule type combo');
    expect(output).toContain('option name ScoreType type combo');
  });

  it('2. 验证下发 Threads, Hash, MultiPV 3 后多候选分支实时输出', async () => {
    const proc = spawn(engineExe, [], {
      cwd: engineDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let output = '';
    proc.stdout.on('data', chunk => { output += chunk.toString(); });

    const sendAndWait = (cmd: string, expectStr: string): Promise<void> => {
      proc.stdin.write(`${cmd}\n`);
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Timeout waiting for ${expectStr}`)), 8000);
        const interval = setInterval(() => {
          if (output.includes(expectStr)) {
            clearTimeout(timeout);
            clearInterval(interval);
            output = '';
            resolve();
          }
        }, 20);
      });
    };

    await sendAndWait('uci', 'uciok');
    await sendAndWait('setoption name EvalFile value pikafish.nnue', '');
    await sendAndWait('setoption name Threads value 2', '');
    await sendAndWait('setoption name Hash value 32', '');
    await sendAndWait('setoption name MultiPV value 3', '');
    await sendAndWait('isready', 'readyok');

    // Start a search on initial position with MultiPV 3
    proc.stdin.write('position startpos\n');
    proc.stdin.write('go depth 8\n');

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Search timeout')), 8000);
      const interval = setInterval(() => {
        if (output.includes('bestmove')) {
          clearTimeout(timeout);
          clearInterval(interval);
          resolve();
        }
      }, 20);
    });

    proc.stdin.write('quit\n');

    // Verify multipv 1, multipv 2, multipv 3 are all produced in output!
    expect(output).toContain('multipv 1');
    expect(output).toContain('multipv 2');
    expect(output).toContain('multipv 3');
    expect(output).toContain('bestmove');
  });

  it('3. 验证固定节点搜索 (go nodes) 与 无限分析 (go infinite + stop)', async () => {
    const proc = spawn(engineExe, [], {
      cwd: engineDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let output = '';
    proc.stdout.on('data', chunk => { output += chunk.toString(); });

    const sendAndWait = (cmd: string, expectStr: string): Promise<void> => {
      proc.stdin.write(`${cmd}\n`);
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Timeout waiting for ${expectStr}`)), 8000);
        const interval = setInterval(() => {
          if (output.includes(expectStr)) {
            clearTimeout(timeout);
            clearInterval(interval);
            output = '';
            resolve();
          }
        }, 20);
      });
    };

    await sendAndWait('uci', 'uciok');
    await sendAndWait('isready', 'readyok');

    // Test A: go nodes 5000
    proc.stdin.write('position startpos\n');
    proc.stdin.write('go nodes 5000\n');
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('go nodes timeout')), 5000);
      const interval = setInterval(() => {
        if (output.includes('bestmove')) {
          clearTimeout(timeout);
          clearInterval(interval);
          output = '';
          resolve();
        }
      }, 20);
    });

    // Test B: go infinite + stop
    proc.stdin.write('position startpos\n');
    proc.stdin.write('go infinite\n');
    // Wait for at least one info line
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('go infinite timeout')), 5000);
      const interval = setInterval(() => {
        if (output.includes('info depth')) {
          clearTimeout(timeout);
          clearInterval(interval);
          resolve();
        }
      }, 20);
    });

    // Stop infinite search
    proc.stdin.write('stop\n');
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('stop timeout')), 5000);
      const interval = setInterval(() => {
        if (output.includes('bestmove')) {
          clearTimeout(timeout);
          clearInterval(interval);
          resolve();
        }
      }, 20);
    });

    proc.stdin.write('quit\n');
  });
});
