<template>
  <div v-if="modelValue" class="modal-backdrop" @click.self="closeModal">
    <div class="settings-modal-card">
      <!-- Header -->
      <div class="settings-modal-header">
        <div class="header-title-box">
          <Cpu :size="20" class="header-icon" />
          <div class="header-text">
            <h3>皮卡鱼 (Pikafish) 引擎专业控制中心</h3>
            <span class="header-subtitle">专业中国象棋引擎算力调度、搜索限制与 UCI 深度配置</span>
          </div>
        </div>
        <button class="close-btn" @click="closeModal">
          <X :size="18" />
        </button>
      </div>

      <!-- Navigation Tabs -->
      <div class="settings-tabs">
        <button 
          class="settings-tab-btn" 
          :class="{ active: activeSection === 'resources' }"
          @click="activeSection = 'resources'"
        >
          <SlidersHorizontal :size="14" />
          <span>算力资源</span>
        </button>

        <button 
          class="settings-tab-btn" 
          :class="{ active: activeSection === 'search' }"
          @click="activeSection = 'search'"
        >
          <Target :size="14" />
          <span>搜索限制与 MultiPV</span>
        </button>

        <button 
          class="settings-tab-btn" 
          :class="{ active: activeSection === 'strength' }"
          @click="activeSection = 'strength'"
        >
          <ShieldAlert :size="14" />
          <span>棋力与规例</span>
        </button>

        <button 
          class="settings-tab-btn" 
          :class="{ active: activeSection === 'info' }"
          @click="activeSection = 'info'"
        >
          <Info :size="14" />
          <span>引擎概况</span>
        </button>

        <button 
          class="settings-tab-btn" 
          :class="{ active: activeSection === 'advanced' }"
          @click="activeSection = 'advanced'"
        >
          <Wrench :size="14" />
          <span>高级 UCI 参数</span>
        </button>
      </div>

      <!-- Content Body -->
      <div class="settings-modal-body">
        <!-- 1. 算力与计算资源 -->
        <div v-show="activeSection === 'resources'" class="settings-section">
          <div class="field-card">
            <div class="field-title-row">
              <label class="field-label">CPU 计算线程数 (Threads)</label>
              <span class="field-val-badge">{{ engineSettings.threads }} 线程</span>
            </div>
            <p class="field-hint">控制皮卡鱼同时调用的 CPU 逻辑核心数。当前系统检测到最高推荐 {{ maxHardwareThreads }} 线程。</p>
            <div class="slider-row">
              <input 
                type="range" 
                min="1" 
                :max="maxHardwareThreads" 
                v-model.number="engineSettings.threads"
                class="settings-slider"
              />
              <input 
                type="number" 
                min="1" 
                :max="128" 
                v-model.number="engineSettings.threads"
                class="num-input"
              />
            </div>
          </div>

          <div class="field-card">
            <div class="field-title-row">
              <label class="field-label">置换表哈希内存 (Hash MB)</label>
              <span class="field-val-badge">{{ engineSettings.hash }} MB</span>
            </div>
            <p class="field-hint">用于缓存历史搜索剪枝节点的内存大小。较大哈希表在长局研究中可显著提升搜索深度。</p>
            <div class="slider-row">
              <input 
                type="range" 
                min="16" 
                max="2048" 
                step="16"
                v-model.number="engineSettings.hash"
                class="settings-slider"
              />
              <input 
                type="number" 
                min="16" 
                max="8192" 
                v-model.number="engineSettings.hash"
                class="num-input"
              />
            </div>
            <div class="field-footer-action">
              <button class="small-action-btn" @click="handleClearHash">
                <Trash2 :size="13" />
                <span>清空当前哈希缓存 (Clear Hash)</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 2. 搜索限制与 MultiPV -->
        <div v-show="activeSection === 'search'" class="settings-section">
          <!-- MultiPV 多候选分支 -->
          <div class="field-card highlight-card">
            <div class="field-title-row">
              <label class="field-label">多候选变化分支数 (MultiPV)</label>
              <span class="field-val-badge gold-badge">{{ engineSettings.multiPv }} 条主要路线</span>
            </div>
            <p class="field-hint">同时解算并对比盘面排名前 N 的优势走法与应对变例。支持在 AI 分析面板中切换查看各分支。</p>
            <div class="chip-group">
              <button 
                v-for="pv in [1, 2, 3, 4, 5]" 
                :key="'pv_' + pv"
                class="chip-btn"
                :class="{ active: engineSettings.multiPv === pv }"
                @click="engineSettings.multiPv = pv"
              >
                {{ pv === 1 ? '单路精算 (MultiPV 1)' : `${pv} 条候选路线` }}
              </button>
            </div>
          </div>

          <!-- 对战模式思考限制 -->
          <div class="field-card">
            <label class="field-label">人机对战模式搜索限制</label>
            <div class="mode-select-row">
              <button 
                class="mode-chip"
                :class="{ active: engineSettings.matchSearchType === 'movetime' }"
                @click="engineSettings.matchSearchType = 'movetime'"
              >
                固定单步时间
              </button>
              <button 
                class="mode-chip"
                :class="{ active: engineSettings.matchSearchType === 'depth' }"
                @click="engineSettings.matchSearchType = 'depth'"
              >
                固定搜索深度
              </button>
              <button 
                class="mode-chip"
                :class="{ active: engineSettings.matchSearchType === 'nodes' }"
                @click="engineSettings.matchSearchType = 'nodes'"
              >
                固定计算节点
              </button>
            </div>

            <div v-if="engineSettings.matchSearchType === 'movetime'" class="sub-input-row">
              <span>每步限定耗时:</span>
              <input 
                type="number" 
                min="200" 
                max="60000" 
                step="500" 
                v-model.number="engineSettings.matchMovetimeMs"
                class="num-input-wide"
              />
              <span class="unit-text">毫秒 ({{ (engineSettings.matchMovetimeMs / 1000).toFixed(1) }} 秒)</span>
            </div>

            <div v-else-if="engineSettings.matchSearchType === 'depth'" class="sub-input-row">
              <span>每步限定深度:</span>
              <input 
                type="number" 
                min="5" 
                max="50" 
                v-model.number="engineSettings.matchDepth"
                class="num-input-wide"
              />
              <span class="unit-text">层 (Depth)</span>
            </div>

            <div v-else-if="engineSettings.matchSearchType === 'nodes'" class="sub-input-row">
              <span>每步限定节点:</span>
              <input 
                type="number" 
                min="10000" 
                max="10000000" 
                step="50000" 
                v-model.number="engineSettings.matchNodes"
                class="num-input-wide"
              />
              <span class="unit-text">节点 (约 {{ (engineSettings.matchNodes / 10000).toFixed(0) }} 万步)</span>
            </div>
          </div>

          <!-- 分析研究模式思考限制 -->
          <div class="field-card">
            <label class="field-label">局面分析 / 复盘研究限制</label>
            <div class="mode-select-row">
              <button 
                class="mode-chip"
                :class="{ active: engineSettings.analysisSearchType === 'infinite' }"
                @click="engineSettings.analysisSearchType = 'infinite'"
              >
                无限分析 (手动停止)
              </button>
              <button 
                class="mode-chip"
                :class="{ active: engineSettings.analysisSearchType === 'depth' }"
                @click="engineSettings.analysisSearchType = 'depth'"
              >
                固定深度分析
              </button>
              <button 
                class="mode-chip"
                :class="{ active: engineSettings.analysisSearchType === 'movetime' }"
                @click="engineSettings.analysisSearchType = 'movetime'"
              >
                固定时间分析
              </button>
            </div>

            <div v-if="engineSettings.analysisSearchType === 'depth'" class="sub-input-row">
              <span>分析目标深度:</span>
              <input 
                type="number" 
                min="10" 
                max="60" 
                v-model.number="engineSettings.analysisDepth"
                class="num-input-wide"
              />
              <span class="unit-text">层</span>
            </div>

            <div v-else-if="engineSettings.analysisSearchType === 'movetime'" class="sub-input-row">
              <span>分析单次耗时:</span>
              <input 
                type="number" 
                min="1000" 
                max="120000" 
                step="1000" 
                v-model.number="engineSettings.analysisMovetimeMs"
                class="num-input-wide"
              />
              <span class="unit-text">毫秒 ({{ (engineSettings.analysisMovetimeMs / 1000).toFixed(1) }} 秒)</span>
            </div>
          </div>
        </div>

        <!-- 3. 棋力与规例 -->
        <div v-show="activeSection === 'strength'" class="settings-section">
          <!-- 限制棋力 Elo -->
          <div class="field-card">
            <div class="field-title-row">
              <label class="field-label">引擎限制棋力 (UCI_LimitStrength)</label>
              <input 
                type="checkbox" 
                v-model="engineSettings.limitStrength" 
                class="checkbox-input"
              />
            </div>
            <p class="field-hint">启用后，皮卡鱼将根据设定的 Elo 等级分模拟对应水平的人类大师或棋手，不再全力碾压。</p>

            <div v-if="engineSettings.limitStrength" class="sub-strength-box">
              <div class="field-title-row">
                <span>目标 Elo 等级分:</span>
                <span class="field-val-badge">{{ engineSettings.elo }} Elo</span>
              </div>
              <div class="slider-row">
                <input 
                  type="range" 
                  min="1280" 
                  max="3133" 
                  step="20"
                  v-model.number="engineSettings.elo"
                  class="settings-slider"
                />
                <input 
                  type="number" 
                  min="1280" 
                  max="3133" 
                  v-model.number="engineSettings.elo"
                  class="num-input"
                />
              </div>
            </div>
          </div>

          <!-- 技能等级 Skill Level -->
          <div class="field-card">
            <div class="field-title-row">
              <label class="field-label">综合技能等级 (Skill Level)</label>
              <span class="field-val-badge">{{ engineSettings.skillLevel }} / 20</span>
            </div>
            <p class="field-hint">数值越小，引擎越容易犯错；20 为不限制的最高算力水准。</p>
            <div class="slider-row">
              <input 
                type="range" 
                min="0" 
                max="20" 
                v-model.number="engineSettings.skillLevel"
                class="settings-slider"
              />
              <input 
                type="number" 
                min="0" 
                max="20" 
                v-model.number="engineSettings.skillLevel"
                class="num-input"
              />
            </div>
          </div>

          <!-- 规例 Repetition Rule -->
          <div class="field-card">
            <label class="field-label">重复局面判和/判负规例 (Repetition Rule)</label>
            <p class="field-hint">中国象棋特有的长打长将判罚标准。</p>
            <select v-model="engineSettings.repetitionRule" class="select-input">
              <option value="AsianRule">亚洲象棋联合会规例 (AsianRule - 推荐)</option>
              <option value="ChineseRule">中国象棋规则 (ChineseRule)</option>
              <option value="SkyRule">天天象棋/天规 (SkyRule)</option>
              <option value="ComputerRule">计算机对弈规例 (ComputerRule)</option>
              <option value="YitianRule">弈天棋缘规例 (YitianRule)</option>
              <option value="AllowChase">允许捉子 (AllowChase)</option>
              <option value="NoJudgement">不判定重现 (NoJudgement)</option>
            </select>
          </div>
        </div>

        <!-- 4. 引擎概况与状态 -->
        <div v-show="activeSection === 'info'" class="settings-section">
          <div class="info-grid">
            <div class="info-row">
              <span class="info-label">引擎识别名称</span>
              <span class="info-val font-mono">{{ engineSettings.engineName }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">引擎作者团队</span>
              <span class="info-val">{{ engineSettings.engineAuthor }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">可执行文件路径</span>
              <span class="info-val path-text" :title="engineSettings.enginePath">
                {{ engineSettings.enginePath || '未检测到引擎' }}
              </span>
            </div>
            <div class="info-row">
              <span class="info-label">NNUE 神经网络权重</span>
              <span class="info-val path-text" :title="engineSettings.nnuePath">
                {{ engineSettings.nnuePath ? '已正确挂载 (pikafish.nnue)' : '未挂载' }}
              </span>
            </div>
            <div class="info-row">
              <span class="info-label">引擎通信状态</span>
              <span class="info-val" :class="engineSettings.isEngineReady ? 'text-green' : 'text-yellow'">
                {{ engineSettings.isEngineReady ? '正常就绪 (Ready)' : '等待握手 / 未就绪' }}
              </span>
            </div>
            <div class="info-row">
              <span class="info-label">探测到的 UCI 选项数</span>
              <span class="info-val">{{ engineSettings.availableOptions.length }} 个原生参数</span>
            </div>
          </div>

          <div class="engine-ctrl-actions">
            <button class="secondary-btn" @click="handleRestartEngine" :disabled="engineSettings.isApplying">
              <RotateCcw :size="14" />
              <span>重新启动引擎进程</span>
            </button>
            <button class="secondary-btn" @click="handleRefreshStatus">
              <RefreshCw :size="14" />
              <span>刷新握手状态</span>
            </button>
          </div>
        </div>

        <!-- 5. 高级 UCI 参数 -->
        <div v-show="activeSection === 'advanced'" class="settings-section">
          <div class="advanced-table-box">
            <table class="advanced-table">
              <thead>
                <tr>
                  <th width="140">UCI 参数名称</th>
                  <th width="70">类型</th>
                  <th width="120">默认值</th>
                  <th>当前设定值</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="opt in advancedOptions" :key="opt.name">
                  <td class="opt-name">{{ opt.name }}</td>
                  <td class="opt-type">{{ opt.option_type }}</td>
                  <td class="opt-default">{{ opt.default || '-' }}</td>
                  <td class="opt-input-td">
                    <!-- check -->
                    <input 
                      v-if="opt.option_type === 'check'"
                      type="checkbox"
                      :checked="getCustomVal(opt.name) === 'true'"
                      @change="(e: any) => setCustomVal(opt.name, e.target.checked ? 'true' : 'false')"
                    />
                    <!-- spin -->
                    <input 
                      v-else-if="opt.option_type === 'spin'"
                      type="number"
                      :min="opt.min"
                      :max="opt.max"
                      :value="getCustomVal(opt.name)"
                      @input="(e: any) => setCustomVal(opt.name, e.target.value)"
                      class="adv-input"
                    />
                    <!-- combo -->
                    <select 
                      v-else-if="opt.option_type === 'combo'"
                      :value="getCustomVal(opt.name)"
                      @change="(e: any) => setCustomVal(opt.name, e.target.value)"
                      class="adv-select"
                    >
                      <option v-for="v in opt.vars" :key="v" :value="v">{{ v }}</option>
                    </select>
                    <!-- string -->
                    <input 
                      v-else-if="opt.option_type === 'string'"
                      type="text"
                      :value="getCustomVal(opt.name)"
                      @input="(e: any) => setCustomVal(opt.name, e.target.value)"
                      class="adv-input-text"
                    />
                    <!-- button -->
                    <button 
                      v-else-if="opt.option_type === 'button'"
                      class="adv-btn"
                      @click="triggerButtonOption(opt.name)"
                    >
                      触发执行
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Footer Buttons -->
      <div class="settings-modal-footer">
        <div class="footer-left">
          <button class="reset-btn" @click="handleResetDefaults">
            <RotateCcw :size="13" />
            <span>恢复默认配置</span>
          </button>
          <span v-if="saveSuccessMsg" class="success-tip">{{ saveSuccessMsg }}</span>
          <span v-if="engineSettings.lastError" class="error-tip">{{ engineSettings.lastError }}</span>
        </div>

        <div class="footer-right">
          <button class="cancel-btn" @click="closeModal">取消</button>
          <button class="save-btn" @click="handleSaveAndApply" :disabled="engineSettings.isApplying">
            <Check :size="15" />
            <span>{{ engineSettings.isApplying ? '正在同步应用...' : '保存并下发设置' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { 
  Cpu, X, SlidersHorizontal, Target, ShieldAlert, Info, 
  Wrench, RotateCcw, Trash2, RefreshCw, Check 
} from 'lucide-vue-next';
import { useEngineSettingsStore } from '../../stores/engineSettingsStore';

defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
}>();

const engineSettings = useEngineSettingsStore();
const activeSection = ref<'resources' | 'search' | 'strength' | 'info' | 'advanced'>('resources');
const saveSuccessMsg = ref('');

const maxHardwareThreads = computed(() => {
  return Math.min(Math.max(2, navigator.hardwareConcurrency || 8), 64);
});

// Advanced options excluding standard ones handled in dedicated tabs
const standardNames = new Set([
  'Threads', 'Hash', 'MultiPV', 'Skill Level', 
  'UCI_LimitStrength', 'UCI_Elo', 'Repetition Rule', 
  'Clear Hash', 'EvalFile'
]);

const advancedOptions = computed(() => {
  return engineSettings.availableOptions.filter(o => !standardNames.has(o.name));
});

function getCustomVal(name: string): string {
  if (engineSettings.customOptions[name] !== undefined) {
    return engineSettings.customOptions[name];
  }
  const opt = engineSettings.availableOptions.find(o => o.name === name);
  return opt?.default || '';
}

function setCustomVal(name: string, val: string) {
  engineSettings.customOptions[name] = val;
}

function triggerButtonOption(name: string) {
  engineSettings.customOptions[name] = '';
}

function closeModal() {
  emit('update:modelValue', false);
}

async function handleSaveAndApply() {
  saveSuccessMsg.value = '';
  const success = await engineSettings.applySettings();
  if (success) {
    saveSuccessMsg.value = '设置已成功同步至 Pikafish！';
    setTimeout(() => {
      saveSuccessMsg.value = '';
      closeModal();
    }, 1200);
  }
}

async function handleClearHash() {
  await engineSettings.clearHash();
  alert('已向皮卡鱼发送 Clear Hash 清空置换表缓存指令');
}

async function handleRestartEngine() {
  if (confirm('确定要重新启动皮卡鱼引擎子进程吗？')) {
    const success = await engineSettings.restartEngine();
    if (success) {
      alert('引擎进程已成功重启');
    }
  }
}

async function handleRefreshStatus() {
  await engineSettings.fetchEngineStatus();
}

function handleResetDefaults() {
  if (confirm('确定恢复所有引擎配置为推荐默认值吗？')) {
    engineSettings.resetToDefaults();
    saveSuccessMsg.value = '已恢复默认参数';
    setTimeout(() => { saveSuccessMsg.value = ''; }, 1500);
  }
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.78);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  user-select: none;
}

.settings-modal-card {
  width: 660px;
  max-width: min(660px, 92vw);
  max-height: min(660px, 84vh);
  background: #24140b;
  border: 1px solid #5a341a;
  border-radius: 12px;
  box-shadow: 0 16px 50px rgba(0, 0, 0, 0.85);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: #1a0c06;
  border-bottom: 1px solid #452410;
  flex-shrink: 0;
}

.header-title-box {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon {
  color: #ffd700;
}

.header-text h3 {
  margin: 0;
  font-size: 15px;
  color: #eed6b3;
  font-weight: bold;
}

.header-subtitle {
  font-size: 11px;
  color: #9c7b5c;
  margin-top: 2px;
  display: block;
}

.close-btn {
  background: transparent;
  border: none;
  color: #a88d74;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #3d2212;
  color: #ffd700;
}

/* Tabs */
.settings-tabs {
  display: flex;
  background: #1e0f08;
  border-bottom: 1px solid #3d1f0e;
  overflow-x: auto;
  flex-shrink: 0;
}

.settings-tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 8px 6px;
  background: transparent;
  border: none;
  color: #9c7f66;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
  white-space: nowrap;
}

.settings-tab-btn:hover {
  color: #eed6b3;
}

.settings-tab-btn.active {
  color: #ffd700;
  background: rgba(212, 175, 55, 0.08);
  border-bottom-color: #d4af37;
  font-weight: bold;
}

/* Body */
.settings-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field-card {
  background: rgba(20, 10, 5, 0.65);
  border: 1px solid #3d2212;
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-card.highlight-card {
  border-color: #69401f;
  background: rgba(45, 23, 12, 0.45);
}

.field-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.field-label {
  font-size: 13px;
  font-weight: 600;
  color: #eed6b3;
}

.field-val-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #361f10;
  border: 1px solid #5a341a;
  color: #ffd700;
  font-weight: bold;
}

.gold-badge {
  background: rgba(212, 175, 55, 0.15);
  border-color: #d4af37;
}

.field-hint {
  margin: 0;
  font-size: 11px;
  color: #8c6f54;
  line-height: 1.4;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.settings-slider {
  flex: 1;
  accent-color: #d4af37;
  cursor: pointer;
}

.num-input {
  width: 68px;
  padding: 5px 8px;
  border-radius: 4px;
  border: 1px solid #4a2c16;
  background: #140a05;
  color: #ffd700;
  font-size: 12px;
  font-weight: bold;
  text-align: center;
}

.num-input-wide {
  width: 90px;
  padding: 5px 8px;
  border-radius: 4px;
  border: 1px solid #4a2c16;
  background: #140a05;
  color: #ffd700;
  font-size: 12px;
  font-weight: bold;
  text-align: center;
}

.chip-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chip-btn {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #4a2c16;
  background: #1a0e07;
  color: #eed6b3;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.chip-btn.active {
  border-color: #d4af37;
  background: #4a2610;
  color: #ffd700;
  font-weight: bold;
  box-shadow: 0 0 8px rgba(212, 175, 55, 0.2);
}

.mode-select-row {
  display: flex;
  gap: 8px;
}

.mode-chip {
  flex: 1;
  padding: 7px;
  font-size: 11px;
  border-radius: 6px;
  border: 1px solid #4a2c16;
  background: #190c06;
  color: #eed6b3;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-chip.active {
  border-color: #d4af37;
  background: #522c14;
  color: #fff4d6;
  font-weight: bold;
}

.sub-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: #eed6b3;
  margin-top: 4px;
}

.unit-text {
  font-size: 11px;
  color: #9c7b5c;
}

.sub-strength-box {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #361f10;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  color: #eed6b3;
}

.checkbox-input {
  width: 18px;
  height: 18px;
  accent-color: #d4af37;
  cursor: pointer;
}

.select-input {
  padding: 8px;
  border-radius: 6px;
  border: 1px solid #4a2c16;
  background: #140a05;
  color: #eed6b3;
  font-size: 12px;
}

.small-action-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 4px;
  border: 1px solid #4a2c16;
  background: #24140b;
  color: #eed6b3;
  font-size: 11px;
  cursor: pointer;
  align-self: flex-start;
  transition: all 0.2s;
}

.small-action-btn:hover {
  border-color: #d4af37;
  color: #ffd700;
}

/* Info Grid */
.info-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(18, 9, 5, 0.6);
  border: 1px solid #3d2313;
  border-radius: 8px;
  padding: 12px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  border-bottom: 1px solid rgba(61, 35, 19, 0.4);
  padding-bottom: 6px;
}

.info-label {
  color: #8c6f54;
}

.info-val {
  color: #eed6b3;
  font-weight: 500;
}

.path-text {
  max-width: 440px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: monospace;
  font-size: 11px;
}

.text-green { color: #5cd67b; }
.text-yellow { color: #ffd700; }

.engine-ctrl-actions {
  display: flex;
  gap: 10px;
}

.secondary-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 6px;
  border: 1px solid #4a2c16;
  background: #2b170c;
  color: #eed6b3;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.secondary-btn:hover {
  border-color: #d4af37;
  color: #ffd700;
}

/* Advanced Table */
.advanced-table-box {
  max-height: 420px;
  overflow-y: auto;
  border: 1px solid #3d2313;
  border-radius: 8px;
}

.advanced-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.advanced-table th {
  background: #180c06;
  color: #8c6f54;
  padding: 8px;
  font-weight: 600;
  text-align: left;
  position: sticky;
  top: 0;
  border-bottom: 1px solid #3d2313;
  z-index: 2;
}

.advanced-table td {
  padding: 6px 8px;
  border-bottom: 1px solid rgba(61, 35, 19, 0.4);
}

.opt-name {
  color: #eed6b3;
  font-family: monospace;
  font-size: 11px;
}

.opt-type {
  color: #8c6f54;
  font-size: 11px;
}

.opt-default {
  color: #6e5642;
  font-size: 11px;
}

.adv-input {
  width: 70px;
  padding: 3px 6px;
  border-radius: 4px;
  border: 1px solid #4a2c16;
  background: #140a05;
  color: #ffd700;
  font-size: 11px;
}

.adv-input-text {
  width: 120px;
  padding: 3px 6px;
  border-radius: 4px;
  border: 1px solid #4a2c16;
  background: #140a05;
  color: #ffd700;
  font-size: 11px;
}

.adv-select {
  padding: 3px 6px;
  border-radius: 4px;
  border: 1px solid #4a2c16;
  background: #140a05;
  color: #ffd700;
  font-size: 11px;
}

.adv-btn {
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid #4a2c16;
  background: #2b170c;
  color: #eed6b3;
  font-size: 10px;
  cursor: pointer;
}

/* Footer */
.settings-modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: #1a0c06;
  border-top: 1px solid #452410;
  flex-shrink: 0;
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.reset-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #4a2c16;
  background: transparent;
  color: #9c7b5c;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.reset-btn:hover {
  color: #ffd700;
  border-color: #69401f;
}

.success-tip {
  font-size: 12px;
  color: #5cd67b;
  font-weight: 500;
}

.error-tip {
  font-size: 12px;
  color: #ff6b6b;
}

.footer-right {
  display: flex;
  gap: 10px;
}

.cancel-btn {
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid #4a2c16;
  background: transparent;
  color: #eed6b3;
  font-size: 12px;
  cursor: pointer;
}

.save-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border-radius: 6px;
  border: 1px solid #d4af37;
  background: linear-gradient(180deg, #b02424 0%, #751414 100%);
  color: #fff4d6;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(176, 36, 36, 0.4);
  transition: all 0.2s;
}

.save-btn:hover:not(:disabled) {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
