import { defineStore } from 'pinia';
import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';

export interface UciOptionMeta {
  name: string;
  option_type: 'spin' | 'check' | 'combo' | 'string' | 'button';
  default?: string;
  min?: number;
  max?: number;
  vars: string[];
  current_value?: string;
}

export interface EngineStatusPayload {
  ready: boolean;
  running: boolean;
  searching: boolean;
  engine_name: string;
  engine_author: string;
  engine_path: string;
  nnue_path: string;
  options_count: number;
}

const STORAGE_KEY = 'xiangqi_engine_settings_v03';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export const useEngineSettingsStore = defineStore('engineSettings', () => {
  // Engine Discovery
  const availableOptions = ref<UciOptionMeta[]>([]);
  const engineName = ref('Pikafish');
  const engineAuthor = ref('the Pikafish developers');
  const enginePath = ref('');
  const nnuePath = ref('');
  const isEngineReady = ref(false);

  // Core UCI Parameters
  const logicalCores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4;
  // Leave at least 2 cores for Windows OS and Vue/WebView2 rendering to prevent stuttering
  const defaultThreads = Math.max(1, Math.min(4, logicalCores - 2));
  const threads = ref<number>(defaultThreads);
  const hash = ref<number>(128);
  const multiPv = ref<number>(1);
  const skillLevel = ref<number>(20);
  const limitStrength = ref<boolean>(false);
  const elo = ref<number>(2500);
  const repetitionRule = ref<string>('AsianRule');
  const scoreType = ref<string>('Elo');

  // Match Mode Search Limits
  const matchSearchType = ref<'movetime' | 'depth' | 'nodes'>('movetime');
  const matchMovetimeMs = ref<number>(2000);
  const matchDepth = ref<number>(16);
  const matchNodes = ref<number>(200000);

  // Analysis Mode Search Limits
  const analysisSearchType = ref<'infinite' | 'depth' | 'movetime' | 'nodes'>('infinite');
  const analysisMovetimeMs = ref<number>(5000);
  const analysisDepth = ref<number>(22);
  const analysisNodes = ref<number>(500000);

  // Advanced UCI Custom Overrides: optionName -> stringValue
  const customOptions = ref<Record<string, string>>({});

  // Status message
  const lastError = ref<string | null>(null);
  const isApplying = ref(false);

  function loadFromStorage() {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data.threads === 'number') threads.value = data.threads;
      if (typeof data.hash === 'number') hash.value = data.hash;
      if (typeof data.multiPv === 'number') multiPv.value = data.multiPv;
      if (typeof data.skillLevel === 'number') skillLevel.value = data.skillLevel;
      if (typeof data.limitStrength === 'boolean') limitStrength.value = data.limitStrength;
      if (typeof data.elo === 'number') elo.value = data.elo;
      if (typeof data.repetitionRule === 'string') repetitionRule.value = data.repetitionRule;
      if (typeof data.scoreType === 'string') scoreType.value = data.scoreType;

      if (data.matchSearchType && ['movetime', 'depth', 'nodes'].includes(data.matchSearchType)) {
        matchSearchType.value = data.matchSearchType;
      } else {
        matchSearchType.value = 'movetime';
      }
      if (typeof data.matchMovetimeMs === 'number' && data.matchMovetimeMs >= 500) {
        matchMovetimeMs.value = data.matchMovetimeMs;
      } else {
        matchMovetimeMs.value = 1500;
      }
      if (typeof data.matchDepth === 'number') matchDepth.value = data.matchDepth;
      if (typeof data.matchNodes === 'number') matchNodes.value = data.matchNodes;

      if (data.analysisSearchType) analysisSearchType.value = data.analysisSearchType;
      if (typeof data.analysisMovetimeMs === 'number') analysisMovetimeMs.value = data.analysisMovetimeMs;
      if (typeof data.analysisDepth === 'number') analysisDepth.value = data.analysisDepth;
      if (typeof data.analysisNodes === 'number') analysisNodes.value = data.analysisNodes;

      if (data.customOptions && typeof data.customOptions === 'object') {
        customOptions.value = data.customOptions;
      }
    } catch (e) {
      console.warn('Failed to parse engine settings from storage:', e);
    }
  }

  function saveToStorage() {
    try {
      const data = {
        threads: threads.value,
        hash: hash.value,
        multiPv: multiPv.value,
        skillLevel: skillLevel.value,
        limitStrength: limitStrength.value,
        elo: elo.value,
        repetitionRule: repetitionRule.value,
        scoreType: scoreType.value,

        matchSearchType: matchSearchType.value,
        matchMovetimeMs: matchMovetimeMs.value,
        matchDepth: matchDepth.value,
        matchNodes: matchNodes.value,

        analysisSearchType: analysisSearchType.value,
        analysisMovetimeMs: analysisMovetimeMs.value,
        analysisDepth: analysisDepth.value,
        analysisNodes: analysisNodes.value,

        customOptions: customOptions.value,
      };
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save engine settings to storage:', e);
    }
  }

  async function fetchEngineStatus() {
    if (!isTauri()) return;
    try {
      const status = await invoke<EngineStatusPayload>('get_engine_status');
      isEngineReady.value = status.ready;
      engineName.value = status.engine_name || 'Pikafish';
      engineAuthor.value = status.engine_author || 'the Pikafish developers';
      enginePath.value = status.engine_path || '';
      nnuePath.value = status.nnue_path || '';

      const opts = await invoke<UciOptionMeta[]>('get_engine_options');
      availableOptions.value = opts;
    } catch (err: any) {
      lastError.value = String(err);
      console.warn('Fetch engine status error:', err);
    }
  }

  async function applySettings(): Promise<boolean> {
    saveToStorage();
    if (!isTauri()) return true;

    isApplying.value = true;
    lastError.value = null;

    try {
      // Ensure threads does not exceed logical cores
      threads.value = Math.max(1, Math.min(threads.value, logicalCores));

      // Build verified options list based on active availableOptions
      const optionsList: [string, string][] = [
        ['Threads', String(threads.value)],
        ['Hash', String(hash.value)],
        ['MultiPV', String(multiPv.value)],
      ];

      // If engine supports Skill Level
      if (availableOptions.value.some((o) => o.name === 'Skill Level')) {
        optionsList.push(['Skill Level', String(skillLevel.value)]);
      }

      // If engine supports UCI_LimitStrength and UCI_Elo
      if (availableOptions.value.some((o) => o.name === 'UCI_LimitStrength')) {
        optionsList.push(['UCI_LimitStrength', limitStrength.value ? 'true' : 'false']);
        if (limitStrength.value && availableOptions.value.some((o) => o.name === 'UCI_Elo')) {
          optionsList.push(['UCI_Elo', String(elo.value)]);
        }
      }

      // If engine supports Repetition Rule
      if (availableOptions.value.some((o) => o.name === 'Repetition Rule')) {
        optionsList.push(['Repetition Rule', repetitionRule.value]);
      }

      // If engine supports ScoreType
      if (availableOptions.value.some((o) => o.name === 'ScoreType')) {
        optionsList.push(['ScoreType', scoreType.value]);
      }

      // Custom options
      for (const [k, v] of Object.entries(customOptions.value)) {
        if (!optionsList.some(([optName]) => optName === k)) {
          optionsList.push([k, String(v)]);
        }
      }

      await invoke('set_engine_options', { options: optionsList });
      await fetchEngineStatus();
      isApplying.value = false;
      return true;
    } catch (err: any) {
      lastError.value = String(err);
      isApplying.value = false;
      return false;
    }
  }

  async function restartEngine(): Promise<boolean> {
    if (!isTauri()) return false;
    isApplying.value = true;
    lastError.value = null;
    try {
      await invoke('restart_engine', {});
      await fetchEngineStatus();
      await applySettings();
      isApplying.value = false;
      return true;
    } catch (err: any) {
      lastError.value = String(err);
      isApplying.value = false;
      return false;
    }
  }

  async function clearHash(): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke('set_engine_options', { options: [['Clear Hash', '']] });
    } catch (err: any) {
      console.warn('Clear hash error:', err);
    }
  }

  function resetToDefaults() {
    threads.value = defaultThreads;
    hash.value = 128;
    multiPv.value = 1;
    skillLevel.value = 20;
    limitStrength.value = false;
    elo.value = 2500;
    repetitionRule.value = 'AsianRule';
    scoreType.value = 'Elo';

    matchSearchType.value = 'movetime';
    matchMovetimeMs.value = 2000;
    matchDepth.value = 16;
    matchNodes.value = 200000;

    analysisSearchType.value = 'infinite';
    analysisMovetimeMs.value = 5000;
    analysisDepth.value = 22;
    analysisNodes.value = 500000;

    customOptions.value = {};
    saveToStorage();
    applySettings();
  }

  // Load saved settings immediately on store creation
  loadFromStorage();

  return {
    availableOptions,
    engineName,
    engineAuthor,
    enginePath,
    nnuePath,
    isEngineReady,

    threads,
    hash,
    multiPv,
    skillLevel,
    limitStrength,
    elo,
    repetitionRule,
    scoreType,

    matchSearchType,
    matchMovetimeMs,
    matchDepth,
    matchNodes,

    analysisSearchType,
    analysisMovetimeMs,
    analysisDepth,
    analysisNodes,

    customOptions,
    lastError,
    isApplying,

    loadFromStorage,
    saveToStorage,
    fetchEngineStatus,
    applySettings,
    restartEngine,
    clearHash,
    resetToDefaults,
  };
});
