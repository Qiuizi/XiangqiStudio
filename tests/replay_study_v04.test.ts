import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useReplayStore } from '../src/stores/replayStore';
import { useGameStore } from '../src/stores/gameStore';
import { INITIAL_FEN } from '../src/core/chess/fen';

describe('Xiangqi Studio V0.4 — 复盘打谱与变化研究专项测试', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('A. 空棋谱初始盘面直接手动打谱', () => {
    it('1. 无需对战历史，初始盘面即可直接切换手动打谱，红黑交替走子生成标准棋谱', () => {
      const replayStore = useReplayStore();

      // 验证初始状态：拥有 root 节点，但没有走步
      expect(replayStore.hasAnyHistory).toBe(false);
      expect(replayStore.activeMovePath.length).toBe(0);
      expect(replayStore.activeColor).toBe('red');

      // 切换至手动打谱模式
      replayStore.setMode('manual');
      expect(replayStore.mode).toBe('manual');

      // 1. 红方走：炮二平五 (7, 2) -> (4, 2)
      replayStore.selectSquare({ file: 7, rank: 2 });
      expect(replayStore.selectedPos).toEqual({ file: 7, rank: 2 });
      expect(replayStore.legalTargets.length).toBeGreaterThan(0);
      const move1Ok = replayStore.makeMove({ file: 7, rank: 2 }, { file: 4, rank: 2 });
      expect(move1Ok).toBe(true);

      // 验证第 1 步记录
      expect(replayStore.activeMovePath.length).toBe(1);
      expect(replayStore.activeMovePath[0].move?.notation).toBe('炮二平五');
      expect(replayStore.activeColor).toBe('black'); // 轮到黑方

      // 2. 黑方走：马2进3 (1, 9) -> (2, 7)
      replayStore.selectSquare({ file: 1, rank: 9 });
      expect(replayStore.selectedPos).toEqual({ file: 1, rank: 9 });
      const move2Ok = replayStore.makeMove({ file: 1, rank: 9 }, { file: 2, rank: 7 });
      expect(move2Ok).toBe(true);

      expect(replayStore.activeMovePath.length).toBe(2);
      expect(replayStore.activeMovePath[1].move?.notation).toBe('马2进3');
      expect(replayStore.activeColor).toBe('red'); // 轮到红方

      // 3. 红方走：马二进三 (7, 0) -> (6, 2)
      replayStore.selectSquare({ file: 7, rank: 0 });
      const move3Ok = replayStore.makeMove({ file: 7, rank: 0 }, { file: 6, rank: 2 });
      expect(move3Ok).toBe(true);
      expect(replayStore.activeMovePath.length).toBe(3);
      expect(replayStore.activeMovePath[2].move?.notation).toBe('马二进三');
      expect(replayStore.activeColor).toBe('black');

      // 4. 黑方走：车1平2 (0, 9) -> (1, 9)
      replayStore.selectSquare({ file: 0, rank: 9 });
      const move4Ok = replayStore.makeMove({ file: 0, rank: 9 }, { file: 1, rank: 9 });
      expect(move4Ok).toBe(true);
      expect(replayStore.activeMovePath.length).toBe(4);
      expect(replayStore.activeMovePath[3].move?.notation).toBe('车1平2');
      expect(replayStore.activeColor).toBe('red');
    });

    it('2. 非法走法严格校验拦截，不产生错误记录', () => {
      const replayStore = useReplayStore();
      replayStore.setMode('manual');

      // 尝试非法走法：帅尝试飞过楚河汉界 (4, 0) -> (4, 5)
      replayStore.selectSquare({ file: 4, rank: 0 });
      const badMove1 = replayStore.makeMove({ file: 4, rank: 0 }, { file: 4, rank: 5 });
      expect(badMove1).toBe(false);
      expect(replayStore.activeMovePath.length).toBe(0);

      // 红相飞象位但被蹩相眼
      // 先走红相 (6, 0) -> (4, 2) 这是合法的
      const goodMove = replayStore.makeMove({ file: 6, rank: 0 }, { file: 4, rank: 2 });
      expect(goodMove).toBe(true);

      // 现在轮到黑方，若黑方试图走红方棋子，直接被 selectSquare 拦截
      replayStore.selectSquare({ file: 4, rank: 2 });
      expect(replayStore.selectedPos).toBeNull();
      expect(replayStore.legalTargets.length).toBe(0);
    });
  });

  describe('B. 已有对局历史导入与只读安全回放', () => {
    it('3. 正确载入已有对战历史，步进导航与跳转精确同步', () => {
      const replayStore = useReplayStore();

      // 模拟已有对局的 4 步着法
      const mockMoves = [
        { from: { file: 7, rank: 2 }, to: { file: 4, rank: 2 }, piece: { type: 'c', color: 'red' as const, id: 'c1' }, notation: '炮二平五', uci: 'b2e2' },
        { from: { file: 1, rank: 9 }, to: { file: 2, rank: 7 }, piece: { type: 'n', color: 'black' as const, id: 'n1' }, notation: '马８进７', uci: 'h9g7' },
        { from: { file: 7, rank: 0 }, to: { file: 6, rank: 2 }, piece: { type: 'n', color: 'red' as const, id: 'n2' }, notation: '马二进三', uci: 'b0c2' },
        { from: { file: 0, rank: 9 }, to: { file: 1, rank: 9 }, piece: { type: 'r', color: 'black' as const, id: 'r1' }, notation: '车９平８', uci: 'a9b9' },
      ];

      replayStore.loadHistory(mockMoves, INITIAL_FEN);
      expect(replayStore.hasAnyHistory).toBe(true);
      expect(replayStore.activeMovePath.length).toBe(4);
      expect(replayStore.currentNode?.stepIndex).toBe(4);

      // 验证回到起点
      replayStore.goToFirst();
      expect(replayStore.currentNodeId).toBe(replayStore.rootId);
      expect(replayStore.currentNode?.stepIndex).toBe(0);
      expect(replayStore.lastMove).toBeNull();

      // 验证下一步
      replayStore.goToNext();
      expect(replayStore.currentNode?.stepIndex).toBe(1);
      expect(replayStore.lastMove?.notation).toBe('炮二平五');

      // 验证上一步
      replayStore.goToPrev();
      expect(replayStore.currentNode?.stepIndex).toBe(0);

      // 验证终点
      replayStore.goToLast();
      expect(replayStore.currentNode?.stepIndex).toBe(4);
      expect(replayStore.lastMove?.notation).toBe('车９平８');

      // 验证只读回放模式下，禁止走子修改棋谱
      replayStore.setMode('replay');
      const forbiddenMove = replayStore.makeMove({ file: 6, rank: 2 }, { file: 4, rank: 3 });
      expect(forbiddenMove).toBe(false);
      expect(replayStore.activeMovePath.length).toBe(4); // 步数未变
    });
  });

  describe('C. 历史节点创建变化分支与分支切换', () => {
    it('4. 在历史节点走出新招法，自动创建变化分支且绝不破坏主线', () => {
      const replayStore = useReplayStore();

      // 先建立一条 4 步的主线对局
      const mockMoves = [
        { from: { file: 7, rank: 2 }, to: { file: 4, rank: 2 }, piece: { type: 'c', color: 'red' as const, id: 'c1' }, notation: '炮二平五', uci: 'b2e2' },
        { from: { file: 1, rank: 9 }, to: { file: 2, rank: 7 }, piece: { type: 'n', color: 'black' as const, id: 'n1' }, notation: '马８进７', uci: 'h9g7' },
        { from: { file: 7, rank: 0 }, to: { file: 6, rank: 2 }, piece: { type: 'n', color: 'red' as const, id: 'n2' }, notation: '马二进三', uci: 'b0c2' },
        { from: { file: 0, rank: 9 }, to: { file: 1, rank: 9 }, piece: { type: 'r', color: 'black' as const, id: 'r1' }, notation: '车９平８', uci: 'a9b9' },
      ];
      replayStore.loadHistory(mockMoves);

      // 回到第 1 步 (炮二平五)
      const step1Node = replayStore.activeMovePath[0];
      replayStore.jumpToNode(step1Node.id);
      expect(replayStore.currentNode?.stepIndex).toBe(1);
      expect(replayStore.isCurrentOnMainline).toBe(true);

      // 切换至手动打谱模式，准备派生黑方应对变化
      replayStore.setMode('manual');

      // 原始主线黑方走的是 马８进７ (1, 9) -> (2, 7)
      // 现在黑方尝试走出另一种变化：卒７进１ (2, 6) -> (2, 5)
      const varMoveOk = replayStore.makeMove({ file: 2, rank: 6 }, { file: 2, rank: 5 });
      expect(varMoveOk).toBe(true);

      // 验证此时父节点 (第 1 步) 拥有了 2 个子分支
      expect(step1Node.childrenIds.length).toBe(2);

      // 验证当前处于变化分支上
      expect(replayStore.currentNode?.stepIndex).toBe(2);
      expect(replayStore.currentNode?.move?.notation).toBe('卒3进1');
      expect(replayStore.isCurrentOnMainline).toBe(false);

      // 验证同级候选分支列表包含两个选项：主线 马８进７ 和 变着 卒3进1
      expect(replayStore.siblingVariations.length).toBe(2);
      expect(replayStore.siblingVariations[0].isMain).toBe(true);
      expect(replayStore.siblingVariations[0].node.move?.notation).toBe('马８进７');
      expect(replayStore.siblingVariations[1].isMain).toBe(false);
      expect(replayStore.siblingVariations[1].node.move?.notation).toBe('卒3进1');
      expect(replayStore.siblingVariations[1].isActive).toBe(true);

      // 验证一键返回主线
      replayStore.returnToMainline();
      expect(replayStore.isCurrentOnMainline).toBe(true);
      expect(replayStore.currentNode?.stepIndex).toBe(2);
      expect(replayStore.currentNode?.move?.notation).toBe('马８进７'); // 回到了主线的第 2 步！

      // 验证主线第 3 步和第 4 步依然完好无损
      replayStore.goToLast();
      expect(replayStore.currentNode?.stepIndex).toBe(4);
      expect(replayStore.lastMove?.notation).toBe('车９平８');

      // 再次切回刚才的变化分支
      const variationNodeId = step1Node.childrenIds[1];
      replayStore.switchVariation(variationNodeId);
      expect(replayStore.currentNodeId).toBe(variationNodeId);
      expect(replayStore.currentNode?.move?.notation).toBe('卒3进1');
      expect(replayStore.isCurrentOnMainline).toBe(false);
    });
  });

  describe('D. 复盘状态与普通对战状态严格隔离', () => {
    it('5. 在复盘打谱中进行多步操作与分支创建，绝对不影响 gameStore 对战状态与 AI', () => {
      const gameStore = useGameStore();
      const replayStore = useReplayStore();

      // 普通对战进入初始状态
      expect(gameStore.gameMode).toBe('pve');
      expect(gameStore.currentStep).toBe(0);
      expect(gameStore.history.length).toBe(0);
      expect(gameStore.isAiThinking).toBe(false);

      // 玩家在对战中走 1 步红炮
      gameStore.selectSquare({ file: 7, rank: 2 });
      gameStore.makeUserMove({ file: 7, rank: 2 }, { file: 4, rank: 2 });
      expect(gameStore.currentStep).toBe(1);
      expect(gameStore.history.length).toBe(1);
      const battleBoardFen = gameStore.board.getFen();

      // 用户切到复盘打谱
      replayStore.initEmptyGame();
      replayStore.setMode('manual');

      // 在复盘中疯狂走 6 步并建立分支
      replayStore.makeMove({ file: 1, rank: 2 }, { file: 4, rank: 2 }); // 红炮
      replayStore.makeMove({ file: 7, rank: 9 }, { file: 6, rank: 7 }); // 黑马
      replayStore.makeMove({ file: 1, rank: 0 }, { file: 2, rank: 2 }); // 红马
      replayStore.makeMove({ file: 8, rank: 9 }, { file: 7, rank: 9 }); // 黑车
      replayStore.goToPrev(); // 回到第 3 步
      replayStore.makeMove({ file: 6, rank: 9 }, { file: 4, rank: 7 }); // 黑象（生成变化分支）

      expect(replayStore.activeMovePath.length).toBe(4);
      expect(replayStore.currentNode?.stepIndex).toBe(4);

      // 检验核心：普通对局完全没有被污染！
      expect(gameStore.currentStep).toBe(1); // 依然是 1
      expect(gameStore.history.length).toBe(1); // 依然只有 1 步
      expect(gameStore.history[0].notation).toBe('炮二平五'); // 依然是对战走的炮二平五
      expect(gameStore.board.getFen()).toBe(battleBoardFen); // 棋盘 FEN 丝毫不差
      expect(gameStore.isAiThinking).toBe(false); // AI 绝没有被错误触发
    });
  });
});
