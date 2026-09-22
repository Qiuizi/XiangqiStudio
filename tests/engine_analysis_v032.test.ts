import { describe, it, expect } from 'vitest';

describe('Xiangqi Studio V0.3.2 — Professional Engine Data Sync & State Isolation Verification', () => {
  interface EngineInfoState {
    depth: number;
    seldepth?: number;
    scoreCp: number | null;
    scoreMate: number | null;
    nodes: number;
    nps: number;
    timeMs: number;
    hashfull: number;
    pv: string[];
    bestMove: string;
    multipvLines: Array<{
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
    }>;
  }

  function createEngineInfoReducer() {
    let currentSearchId = 0;
    const state: EngineInfoState = {
      depth: 0,
      seldepth: undefined,
      scoreCp: null,
      scoreMate: null,
      nodes: 0,
      nps: 0,
      timeMs: 0,
      hashfull: 0,
      pv: [],
      bestMove: '',
      multipvLines: [],
    };

    function startSearch(searchId: number) {
      currentSearchId = searchId;
      state.depth = 0;
      state.seldepth = undefined;
      state.nodes = 0;
      state.nps = 0;
      state.timeMs = 0;
      state.multipvLines = [];
    }

    function handleEngineInfo(payload: {
      search_id: number;
      depth?: number;
      seldepth?: number;
      score_cp?: number;
      score_mate?: number;
      nodes?: number;
      nps?: number;
      time_ms?: number;
      hashfull?: number;
      multipv?: number;
      pv?: string[];
    }) {
      if (currentSearchId && payload.search_id !== currentSearchId) {
        return; // Reject stale search
      }

      if (payload.depth !== undefined && payload.depth !== null) state.depth = payload.depth;
      if (payload.seldepth !== undefined && payload.seldepth !== null) state.seldepth = payload.seldepth;
      if (payload.time_ms !== undefined && payload.time_ms !== null) state.timeMs = payload.time_ms;
      if (payload.hashfull !== undefined && payload.hashfull !== null) state.hashfull = payload.hashfull;
      if (payload.nodes !== undefined && payload.nodes !== null) state.nodes = payload.nodes;
      if (payload.nps !== undefined && payload.nps !== null) state.nps = payload.nps;

      const lineNum = payload.multipv || 1;
      const existingIdx = state.multipvLines.findIndex(l => l.multipv === lineNum);
      const prevLine = existingIdx >= 0 ? state.multipvLines[existingIdx] : null;

      const lineObj = {
        multipv: lineNum,
        depth: payload.depth || (prevLine?.depth ?? 0),
        seldepth: payload.seldepth !== undefined && payload.seldepth !== null ? payload.seldepth : prevLine?.seldepth,
        scoreCp: payload.score_cp !== undefined ? payload.score_cp : (prevLine?.scoreCp ?? null),
        scoreMate: payload.score_mate !== undefined ? payload.score_mate : (prevLine?.scoreMate ?? null),
        nodes: payload.nodes !== undefined && payload.nodes !== null ? payload.nodes : (prevLine?.nodes ?? 0),
        nps: payload.nps !== undefined && payload.nps !== null ? payload.nps : (prevLine?.nps ?? 0),
        timeMs: payload.time_ms !== undefined && payload.time_ms !== null ? payload.time_ms : prevLine?.timeMs,
        hashfull: payload.hashfull !== undefined && payload.hashfull !== null ? payload.hashfull : prevLine?.hashfull,
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
        if (payload.score_cp !== undefined) state.scoreCp = payload.score_cp;
        if (payload.score_mate !== undefined) state.scoreMate = payload.score_mate;
        if (payload.pv && payload.pv.length > 0) {
          state.pv = payload.pv;
          state.bestMove = payload.pv[0];
        }
      }
    }

    return { state, startSearch, handleEngineInfo, getCurrentSearchId: () => currentSearchId };
  }

  it('1. 验证 UCI info 缺失字段不会导致 nodes/nps 归零 (防零跳变)', () => {
    const reducer = createEngineInfoReducer();
    reducer.startSearch(100);

    // Initial info with full telemetry
    reducer.handleEngineInfo({
      search_id: 100,
      depth: 12,
      seldepth: 15,
      score_cp: 45,
      nodes: 350000,
      nps: 1200000,
      time_ms: 290,
      multipv: 1,
      pv: ['h2e2', 'b9c7'],
    });

    expect(reducer.state.nodes).toBe(350000);
    expect(reducer.state.nps).toBe(1200000);
    expect(reducer.state.multipvLines[0].nodes).toBe(350000);

    // Partial info emitted by Pikafish (without nodes/nps, only depth and pv)
    reducer.handleEngineInfo({
      search_id: 100,
      depth: 13,
      seldepth: 16,
      score_cp: 52,
      multipv: 1,
      pv: ['h2e2', 'b9c7', 'b0c2'],
    });

    // Nodes and nps should NOT be reset to 0!
    expect(reducer.state.depth).toBe(13);
    expect(reducer.state.nodes).toBe(350000);
    expect(reducer.state.nps).toBe(1200000);
    expect(reducer.state.multipvLines[0].nodes).toBe(350000);
    expect(reducer.state.multipvLines[0].pv).toEqual(['h2e2', 'b9c7', 'b0c2']);
  });

  it('2. 验证新旧搜索任务隔离：旧任务 info 和 bestmove 坚决不污染新任务', () => {
    const reducer = createEngineInfoReducer();
    reducer.startSearch(101);

    reducer.handleEngineInfo({
      search_id: 101,
      depth: 10,
      score_cp: 30,
      nodes: 100000,
      nps: 800000,
      multipv: 1,
      pv: ['h2e2'],
    });

    expect(reducer.state.depth).toBe(10);
    expect(reducer.state.bestMove).toBe('h2e2');

    // User moves or undos -> new search starts with ID 102
    reducer.startSearch(102);
    expect(reducer.state.depth).toBe(0);
    expect(reducer.state.nodes).toBe(0);
    expect(reducer.state.multipvLines).toEqual([]);

    // Stale late message from search 101 arrives
    reducer.handleEngineInfo({
      search_id: 101,
      depth: 15,
      score_cp: 999,
      nodes: 500000,
      nps: 900000,
      multipv: 1,
      pv: ['b0c2'],
    });

    // It MUST be ignored!
    expect(reducer.state.depth).toBe(0);
    expect(reducer.state.nodes).toBe(0);
    expect(reducer.state.multipvLines.length).toBe(0);

    // Active search 102 message arrives
    reducer.handleEngineInfo({
      search_id: 102,
      depth: 8,
      score_cp: -15,
      nodes: 80000,
      nps: 600000,
      multipv: 1,
      pv: ['b2e2'],
    });
    expect(reducer.state.depth).toBe(8);
    expect(reducer.state.scoreCp).toBe(-15);
    expect(reducer.state.bestMove).toBe('b2e2');
  });

  it('3. 验证 MultiPV 1~5 候选变化按 multipv 索引有序合并', () => {
    const reducer = createEngineInfoReducer();
    reducer.startSearch(200);

    reducer.handleEngineInfo({
      search_id: 200,
      depth: 14,
      score_cp: 60,
      multipv: 2,
      pv: ['b0c2', 'h9g7'],
    });
    reducer.handleEngineInfo({
      search_id: 200,
      depth: 14,
      score_cp: 85,
      multipv: 1,
      pv: ['h2e2', 'b9c7'],
    });
    reducer.handleEngineInfo({
      search_id: 200,
      depth: 14,
      score_cp: 40,
      multipv: 3,
      pv: ['b2e2', 'c9e7'],
    });

    expect(reducer.state.multipvLines.length).toBe(3);
    expect(reducer.state.multipvLines[0].multipv).toBe(1);
    expect(reducer.state.multipvLines[0].bestMove).toBe('h2e2');
    expect(reducer.state.multipvLines[1].multipv).toBe(2);
    expect(reducer.state.multipvLines[1].bestMove).toBe('b0c2');
    expect(reducer.state.multipvLines[2].multipv).toBe(3);
    expect(reducer.state.multipvLines[2].bestMove).toBe('b2e2');
  });

  it('4. 验证引擎配置持久化 JSON 序列化与反序列化完整性', () => {
    const mockStorage: Record<string, string> = {};
    const key = 'xiangqi_studio_engine_settings_v03';

    const originalSettings = {
      threads: 6,
      hash: 128,
      multiPv: 3,
      skillLevel: 18,
      limitStrength: true,
      elo: 2200,
      repetitionRule: 'AsianRule',
      scoreType: 'Elo',
      matchSearchType: 'depth',
      matchMovetimeMs: 3000,
      matchDepth: 18,
      matchNodes: 500000,
      analysisSearchType: 'infinite',
      analysisMovetimeMs: 8000,
      analysisDepth: 26,
      analysisNodes: 1000000,
      customOptions: { ClearHash: '' },
    };

    mockStorage[key] = JSON.stringify(originalSettings);

    const parsed = JSON.parse(mockStorage[key]);
    expect(parsed.threads).toBe(6);
    expect(parsed.hash).toBe(128);
    expect(parsed.multiPv).toBe(3);
    expect(parsed.limitStrength).toBe(true);
    expect(parsed.elo).toBe(2200);
    expect(parsed.matchSearchType).toBe('depth');
    expect(parsed.matchDepth).toBe(18);
    expect(parsed.analysisSearchType).toBe('infinite');
  });
});
