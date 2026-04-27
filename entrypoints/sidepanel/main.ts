import type { ToolInfo, TimelineEvent, Snapshot, ExecutionRecord, ThemeSetting } from '../../lib/types';
import {
  t,
  setLocale,
  getLocale,
  onLocaleChange,
  formatToolCount,
  type Locale,
} from '../../lib/i18n';
import {
  getSettings,
  saveSettings,
  getSnapshots,
  saveSnapshot,
  deleteSnapshot,
  getExecutionHistory,
  addExecutionRecord,
} from '../../lib/storage';
import { applyTheme } from '../../lib/theme';
import { renderSchemaTree } from '../../lib/schema-renderer';
import { SchemaForm } from '../../lib/schema-form';
import { renderJsonHighlight } from '../../lib/json-highlight';
import { exportAsJSON, exportAsMarkdown, exportAsPostman, exportAsScriptToolConfig, exportAsTypeScript } from '../../lib/export';
import { diffTools, renderDiffView } from '../../lib/diff';
import { icon } from '../../lib/icons';
import {
  type AIConfig,
  type AIProvider,
  type ChatMessage,
  chatWithAIStream,
  testConnection,
  getDefaultModel,
} from '../../lib/ai-providers';
import { renderMarkdown } from '../../lib/markdown';

interface TabToolGroup {
  tabId: number;
  title: string;
  url: string;
  tools: ToolInfo[];
}

const tools: ToolInfo[] = [];
const timelineEvents: TimelineEvent[] = [];
let executionHistory: ExecutionRecord[] = [];
let selectedTool: (ToolInfo & { _tabId?: number }) | null = null;
let currentTheme: ThemeSetting = 'system';
let viewMode: 'current' | 'all' = 'current';
let allTabTools: TabToolGroup[] = [];

// ===== Tab Bar =====
interface TabDef {
  id: string;
  i18nKey: string;
  iconName: keyof typeof import('../../lib/icons').icons;
  primary?: boolean;
}

const TAB_DEFS: TabDef[] = [
  { id: 'tools', i18nKey: 'tab.tools', iconName: 'wrench', primary: true },
  { id: 'execute', i18nKey: 'tab.execute', iconName: 'play', primary: true },
  { id: 'generator', i18nKey: 'tab.generator', iconName: 'wand', primary: true },
  { id: 'ai', i18nKey: 'tab.ai', iconName: 'sparkles', primary: true },
  { id: 'timeline', i18nKey: 'tab.timeline', iconName: 'activity' },
  { id: 'history', i18nKey: 'history.title', iconName: 'history' },
  { id: 'snapshots', i18nKey: 'tab.snapshots', iconName: 'camera' },
];

function initTabBar() {
  const container = document.getElementById('tab-bar')!;
  container.innerHTML = '';

  const primaryTabs = TAB_DEFS.filter((d) => d.primary);
  const overflowTabs = TAB_DEFS.filter((d) => !d.primary);

  primaryTabs.forEach((def, idx) => {
    const btn = document.createElement('button');
    btn.className = `tab-bar__tab${idx === 0 ? ' tab-bar__tab--active' : ''}`;
    btn.dataset.tab = def.id;
    btn.title = t(def.i18nKey);
    btn.innerHTML = `${icon(def.iconName, 15, 'tab-icon')}<span class="tab-label">${t(def.i18nKey)}</span>`;
    container.appendChild(btn);
  });

  if (overflowTabs.length > 0) {
    const moreWrapper = document.createElement('div');
    moreWrapper.className = 'tab-bar__more';
    const moreBtn = document.createElement('button');
    moreBtn.className = 'tab-bar__tab tab-bar__more-btn';
    moreBtn.title = '…';
    moreBtn.innerHTML = `<span class="tab-more-dots">⋯</span>`;
    moreWrapper.appendChild(moreBtn);

    const dropdown = document.createElement('div');
    dropdown.className = 'tab-bar__dropdown';
    dropdown.style.display = 'none';

    overflowTabs.forEach((def) => {
      const item = document.createElement('button');
      item.className = 'tab-bar__dropdown-item';
      item.dataset.tab = def.id;
      item.innerHTML = `${icon(def.iconName, 14, 'tab-icon')}<span>${t(def.i18nKey)}</span>`;
      item.addEventListener('click', () => {
        activateTab(def.id);
        dropdown.style.display = 'none';
      });
      dropdown.appendChild(item);
    });

    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === 'none' ? 'flex' : 'none';
    });

    document.addEventListener('click', () => { dropdown.style.display = 'none'; });
    moreWrapper.appendChild(dropdown);
    container.appendChild(moreWrapper);
  }

  container.querySelectorAll<HTMLButtonElement>('.tab-bar__tab:not(.tab-bar__more-btn)').forEach((tab) => {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab!));
  });
}

function activateTab(tabId: string) {
  const container = document.getElementById('tab-bar')!;
  container.querySelectorAll('.tab-bar__tab').forEach((tb) => tb.classList.remove('tab-bar__tab--active'));
  container.querySelectorAll('.tab-bar__dropdown-item').forEach((di) => di.classList.remove('tab-bar__dropdown-item--active'));

  const primaryBtn = container.querySelector<HTMLButtonElement>(`.tab-bar__tab[data-tab="${tabId}"]`);
  if (primaryBtn) {
    primaryBtn.classList.add('tab-bar__tab--active');
  } else {
    const dropdownItem = container.querySelector<HTMLButtonElement>(`.tab-bar__dropdown-item[data-tab="${tabId}"]`);
    if (dropdownItem) dropdownItem.classList.add('tab-bar__dropdown-item--active');
    const moreBtn = container.querySelector('.tab-bar__more-btn');
    if (moreBtn) moreBtn.classList.add('tab-bar__tab--active');
  }

  document.querySelectorAll('.panel').forEach((p) => p.classList.remove('panel--active'));
  document.getElementById(`panel-${tabId}`)?.classList.add('panel--active');
}

function refreshTabLabels() {
  const container = document.getElementById('tab-bar')!;
  TAB_DEFS.forEach((def) => {
    const btn = container.querySelector<HTMLButtonElement>(`.tab-bar__tab[data-tab="${def.id}"]`);
    if (btn) {
      btn.title = t(def.i18nKey);
      const label = btn.querySelector('.tab-label');
      if (label) label.textContent = t(def.i18nKey);
    }
    const dropdownItem = container.querySelector<HTMLButtonElement>(`.tab-bar__dropdown-item[data-tab="${def.id}"]`);
    if (dropdownItem) {
      const span = dropdownItem.querySelector('span:not(.tab-icon):not([class])');
      if (span) span.textContent = t(def.i18nKey);
    }
  });
}

function initLangToggle() {
  document.getElementById('lang-toggle')?.addEventListener('click', async () => {
    const next: Locale = getLocale() === 'en' ? 'zh' : 'en';
    setLocale(next);
    await saveSettings({ locale: next });
    reRenderAll();
  });
}

function initThemeToggle() {
  const btn = document.getElementById('theme-toggle')!;
  updateThemeIcon(btn);
  btn.addEventListener('click', async () => {
    const cycle: ThemeSetting[] = ['system', 'light', 'dark'];
    const idx = cycle.indexOf(currentTheme);
    currentTheme = cycle[(idx + 1) % cycle.length];
    applyTheme(currentTheme);
    updateThemeIcon(btn);
    await saveSettings({ theme: currentTheme });
  });
}

function updateThemeIcon(btn: HTMLElement) {
  const themeIcons: Record<ThemeSetting, string> = {
    system: icon('monitor', 16),
    light: icon('sun', 16),
    dark: icon('moon', 16),
  };
  const labels: Record<ThemeSetting, string> = {
    system: t('theme.system'),
    light: t('theme.light'),
    dark: t('theme.dark'),
  };
  btn.innerHTML = themeIcons[currentTheme];
  btn.title = labels[currentTheme];
}

function reRenderAll() {
  refreshTabLabels();
  renderToolsList();
  renderTimeline();
  updateStatusBar();
  renderSnapshotsPanel();
  renderHistoryPanel();
  renderGeneratorList();
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) updateThemeIcon(themeBtn);
  if (selectedTool) renderExecutePanel(selectedTool);
}

function switchToTab(tabName: string) {
  document.querySelectorAll('.tab-bar__tab').forEach((tb) => {
    tb.classList.toggle('tab-bar__tab--active', (tb as HTMLElement).dataset.tab === tabName);
  });
  document.querySelectorAll('.panel').forEach((p) => p.classList.remove('panel--active'));
  document.getElementById(`panel-${tabName}`)?.classList.add('panel--active');
}

// ===== Tools Panel =====
function renderToolsList() {
  const container = document.getElementById('tools-list')!;
  const searchValue = (document.getElementById('tools-search') as HTMLInputElement)?.value.toLowerCase().trim();

  if (viewMode === 'all') {
    renderAllTabsToolsList(container, searchValue);
    return;
  }

  const filtered = searchValue
    ? tools.filter((tool) => tool.name.toLowerCase().includes(searchValue) || tool.description.toLowerCase().includes(searchValue))
    : tools;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">${icon('search', 40)}</div>
        <p class="empty-state__text">${tools.length === 0 ? t('tools.empty_title') : t('tools.no_match')}</p>
        ${tools.length === 0 ? `<p class="empty-state__hint">${t('tools.empty_hint')}</p>` : ''}
      </div>`;
    return;
  }

  container.innerHTML = '';
  filtered.forEach((tool) => container.appendChild(createToolCard(tool)));
}

function renderAllTabsToolsList(container: HTMLElement, searchValue: string) {
  container.innerHTML = '';

  if (allTabTools.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">${icon('search', 40)}</div>
        <p class="empty-state__text">${t('tools.no_tabs')}</p>
      </div>`;
    return;
  }

  let hasAny = false;
  allTabTools.forEach((group) => {
    const filtered = searchValue
      ? group.tools.filter((tool) => tool.name.toLowerCase().includes(searchValue) || tool.description.toLowerCase().includes(searchValue))
      : group.tools;
    if (filtered.length === 0) return;
    hasAny = true;

    const section = document.createElement('div');
    section.className = 'tab-group';
    const header = document.createElement('div');
    header.className = 'tab-group__header';
    const titleText = group.title || new URL(group.url || 'about:blank').hostname || `Tab ${group.tabId}`;
    header.innerHTML = `${icon('globe', 14)} <span class="tab-group__title">${escapeHtml(titleText)}</span> <span class="tab-group__count">${filtered.length}</span>`;
    section.appendChild(header);

    filtered.forEach((tool) => {
      const toolWithTab = { ...tool, _tabId: group.tabId };
      section.appendChild(createToolCard(toolWithTab as any));
    });
    container.appendChild(section);
  });

  if (!hasAny) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">${icon('search', 40)}</div>
        <p class="empty-state__text">${t('tools.no_match')}</p>
      </div>`;
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function requestAllTabsTools() {
  chrome.runtime.sendMessage({ action: 'LIST_ALL_TOOLS' })
    .then((response) => {
      if (response?.tabs && Array.isArray(response.tabs)) {
        allTabTools = response.tabs;
        if (viewMode === 'all') {
          renderToolsList();
          updateStatusBar();
        }
      }
    })
    .catch(() => {});
}

function createToolCard(tool: ToolInfo): HTMLElement {
  const card = document.createElement('div');
  card.className = 'tool-card';
  card.dataset.toolName = tool.name;

  const header = document.createElement('div');
  header.className = 'tool-card__header';
  const nameEl = document.createElement('span');
  nameEl.className = 'tool-card__name';
  nameEl.textContent = tool.name;
  header.appendChild(nameEl);

  if (tool.source === 'declarative') {
    const badge = document.createElement('span');
    badge.className = 'tool-card__badge tool-card__badge--declarative';
    badge.textContent = t('tools.declarative');
    header.appendChild(badge);
  }
  if (tool.annotations?.readOnlyHint) {
    const badge = document.createElement('span');
    badge.className = 'tool-card__badge tool-card__badge--readonly';
    badge.textContent = t('tools.readonly');
    header.appendChild(badge);
  }
  card.appendChild(header);

  const desc = document.createElement('div');
  desc.className = 'tool-card__description';
  desc.textContent = tool.description;
  card.appendChild(desc);

  if (tool.inputSchema) {
    const schemaToggle = document.createElement('button');
    schemaToggle.className = 'tool-card__schema-toggle';
    schemaToggle.textContent = '▶ Schema';
    const schemaContainer = document.createElement('div');
    schemaContainer.className = 'tool-card__schema';
    schemaContainer.style.display = 'none';
    try { schemaContainer.appendChild(renderSchemaTree(tool.inputSchema)); } catch { schemaContainer.textContent = 'Invalid schema'; }
    schemaToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const visible = schemaContainer.style.display !== 'none';
      schemaContainer.style.display = visible ? 'none' : 'block';
      schemaToggle.textContent = visible ? '▶ Schema' : '▼ Schema';
    });
    card.appendChild(schemaToggle);
    card.appendChild(schemaContainer);
  }

  card.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.tool-card__schema-toggle, .schema-nested__toggle')) return;
    selectedTool = tool as any;
    renderExecutePanel(tool);
    switchToTab('execute');
  });

  return card;
}

// ===== Execute Panel =====
function renderExecutePanel(tool: ToolInfo) {
  const panel = document.getElementById('panel-execute')!;
  panel.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'execute-header';
  const nameEl = document.createElement('span');
  nameEl.className = 'execute-header__name';
  nameEl.textContent = tool.name;
  header.appendChild(nameEl);

  let currentMode: 'form' | 'raw' = 'form';
  let schemaForm: SchemaForm | null = null;

  if (tool.inputSchema) {
    const modeToggle = document.createElement('div');
    modeToggle.className = 'execute-mode-toggle';
    const formBtn = document.createElement('button');
    formBtn.className = 'execute-mode-toggle__btn execute-mode-toggle__btn--active';
    formBtn.textContent = t('execute.form_mode');
    const rawBtn = document.createElement('button');
    rawBtn.className = 'execute-mode-toggle__btn';
    rawBtn.textContent = t('execute.raw_json');
    formBtn.addEventListener('click', () => { currentMode = 'form'; formBtn.classList.add('execute-mode-toggle__btn--active'); rawBtn.classList.remove('execute-mode-toggle__btn--active'); showFormMode(); });
    rawBtn.addEventListener('click', () => { currentMode = 'raw'; rawBtn.classList.add('execute-mode-toggle__btn--active'); formBtn.classList.remove('execute-mode-toggle__btn--active'); showRawMode(); });
    modeToggle.appendChild(formBtn);
    modeToggle.appendChild(rawBtn);
    header.appendChild(modeToggle);
  }
  panel.appendChild(header);

  const inputArea = document.createElement('div');
  inputArea.className = 'execute-form-area';
  panel.appendChild(inputArea);

  const actions = document.createElement('div');
  actions.className = 'execute-actions';
  const execBtn = document.createElement('button');
  execBtn.className = 'btn btn--primary';
  execBtn.textContent = t('execute.run');
  execBtn.addEventListener('click', () => executeTool(tool, currentMode, schemaForm, inputArea));
  actions.appendChild(execBtn);
  panel.appendChild(actions);

  const resultContainer = document.createElement('div');
  resultContainer.id = 'execute-result';
  resultContainer.className = 'execute-result';
  panel.appendChild(resultContainer);

  function showFormMode() {
    inputArea.innerHTML = '';
    inputArea.className = 'execute-form-area';
    if (tool.inputSchema) {
      try { schemaForm = new SchemaForm(tool.inputSchema); inputArea.appendChild(schemaForm.getElement()); }
      catch { inputArea.textContent = 'Failed to generate form'; }
    }
  }
  function showRawMode() {
    inputArea.innerHTML = '';
    inputArea.className = 'execute-raw-area';
    const textarea = document.createElement('textarea');
    textarea.placeholder = '{\n  "key": "value"\n}';
    if (tool.inputSchema) {
      try { const schema = JSON.parse(tool.inputSchema); textarea.value = JSON.stringify(generateExampleFromSchema(schema), null, 2); }
      catch { textarea.value = '{}'; }
    }
    inputArea.appendChild(textarea);
    schemaForm = null;
  }
  if (tool.inputSchema) showFormMode();
  else inputArea.innerHTML = `<p class="sf__hint">${t('execute.empty_title')}</p>`;
}

function executeTool(tool: ToolInfo, mode: 'form' | 'raw', schemaForm: SchemaForm | null, inputArea: HTMLElement) {
  let args: Record<string, unknown> = {};
  if (mode === 'form' && schemaForm) {
    if (!schemaForm.validate()) return;
    args = schemaForm.getValues() as Record<string, unknown>;
  } else if (mode === 'raw') {
    const textarea = inputArea.querySelector('textarea');
    if (textarea?.value) {
      try { args = JSON.parse(textarea.value); }
      catch (e) { showResult({ error: `Invalid JSON: ${e}` }, 0, false); return; }
    }
  }
  const start = performance.now();
  getMyWindowId().then((wid) => {
  const msg: any = { action: 'EXECUTE_TOOL', payload: { name: tool.name, args }, windowId: wid };
  if ((tool as any)._tabId != null) msg.targetTabId = (tool as any)._tabId;
  chrome.runtime.sendMessage(msg)
    .then(async (response) => {
      const duration = performance.now() - start;
      const success = !response?.error;
      showResult(response, duration, success);
      const record: ExecutionRecord = {
        id: crypto.randomUUID(),
        toolName: tool.name,
        input: args,
        output: response,
        duration,
        timestamp: Date.now(),
        success,
        source: 'manual',
      };
      await addExecutionRecord(record);
      executionHistory.push(record);
      while (executionHistory.length > 20) executionHistory.shift();
      renderHistoryPanel();
    })
    .catch(async (err) => {
      const duration = performance.now() - start;
      showResult({ error: String(err) }, duration, false);
      const record: ExecutionRecord = {
        id: crypto.randomUUID(),
        toolName: tool.name,
        input: args,
        output: { error: String(err) },
        duration,
        timestamp: Date.now(),
        success: false,
        source: 'manual',
      };
      await addExecutionRecord(record);
      executionHistory.push(record);
      while (executionHistory.length > 20) executionHistory.shift();
      renderHistoryPanel();
    });
  });
}

function showResult(data: unknown, duration: number, success: boolean) {
  const container = document.getElementById('execute-result');
  if (!container) return;
  container.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'execute-result__header';
  const title = document.createElement('span');
  title.className = 'execute-result__title';
  title.textContent = t('execute.result');
  header.appendChild(title);
  const dur = document.createElement('span');
  dur.className = 'execute-result__duration';
  dur.textContent = `${duration.toFixed(1)}ms`;
  header.appendChild(dur);
  container.appendChild(header);

  if (!success && typeof data === 'object' && data && 'error' in data) {
    const errEl = document.createElement('div');
    errEl.className = 'execute-result__error';
    errEl.textContent = String((data as { error: unknown }).error);
    container.appendChild(errEl);
  } else {
    container.appendChild(renderJsonHighlight(data, { collapsible: true, initialDepth: 3 }));
  }
}

function generateExampleFromSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!props) return result;
  for (const [name, prop] of Object.entries(props)) {
    const type = Array.isArray(prop.type) ? prop.type[0] : prop.type;
    if (prop.default !== undefined) result[name] = prop.default;
    else if (prop.enum && Array.isArray(prop.enum) && prop.enum.length > 0) result[name] = prop.enum[0];
    else if (type === 'string') result[name] = '';
    else if (type === 'number' || type === 'integer') result[name] = 0;
    else if (type === 'boolean') result[name] = false;
    else if (type === 'object') result[name] = {};
    else if (type === 'array') result[name] = [];
  }
  return result;
}

function resetExecutePanel() {
  const panel = document.getElementById('panel-execute')!;
  panel.innerHTML = `<div class="empty-state"><div class="empty-state__icon">${icon('zap', 40)}</div><p class="empty-state__text">${t('execute.empty_title')}</p></div>`;
}

// ===== Timeline Panel =====
function addTimelineEvent(event: TimelineEvent) {
  timelineEvents.push(event);
  renderTimeline();
}

function renderTimeline() {
  const container = document.getElementById('timeline-list')!;
  if (timelineEvents.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state__icon">${icon('clipboard', 40)}</div><p class="empty-state__text">${t('timeline.empty_title')}</p><p class="empty-state__hint">${t('timeline.empty_hint')}</p></div>`;
    return;
  }

  container.innerHTML = '';
  timelineEvents.forEach((evt, i) => {
    const row = document.createElement('div');
    row.className = `timeline-event ${i === timelineEvents.length - 1 ? 'timeline-event--new' : ''}`;

    const time = document.createElement('span');
    time.className = 'timeline-event__time';
    time.textContent = formatTimestamp(evt.timestamp);
    const type = document.createElement('span');
    type.className = `timeline-event__type timeline-event__type--${evt.type}`;
    type.textContent = t(`timeline.${evt.type}`);
    const name = document.createElement('span');
    name.className = 'timeline-event__name';
    name.textContent = evt.toolName;

    row.appendChild(time);
    row.appendChild(type);
    row.appendChild(name);

    if (evt.data) {
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'timeline-event__toggle';
      toggleBtn.innerHTML = icon('chevronRight', 14);
      const dataContainer = document.createElement('div');
      dataContainer.className = 'timeline-event__data';
      dataContainer.style.display = 'none';
      dataContainer.appendChild(renderJsonHighlight(evt.data, { collapsible: true, initialDepth: 1 }));
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const visible = dataContainer.style.display !== 'none';
        dataContainer.style.display = visible ? 'none' : 'block';
        toggleBtn.innerHTML = visible ? icon('chevronRight', 14) : icon('chevronDown', 14);
      });
      row.appendChild(toggleBtn);
      row.style.flexWrap = 'wrap';
      dataContainer.style.width = '100%';
      row.appendChild(dataContainer);
    }
    container.appendChild(row);
  });
  container.scrollTop = container.scrollHeight;
}

// ===== Execution History Panel =====
function renderHistoryPanel() {
  const container = document.getElementById('history-list')!;
  if (executionHistory.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state__icon">${icon('history', 40)}</div><p class="empty-state__text">${t('history.empty_title')}</p><p class="empty-state__hint">${t('history.empty_hint')}</p></div>`;
    return;
  }

  container.innerHTML = '';

  const statsEl = document.createElement('div');
  statsEl.className = 'history-stats';
  const total = executionHistory.length;
  const successes = executionHistory.filter((r) => r.success).length;
  const failures = total - successes;
  const avgDuration = executionHistory.reduce((sum, r) => sum + r.duration, 0) / total;
  const minDuration = Math.min(...executionHistory.map((r) => r.duration));
  const maxDuration = Math.max(...executionHistory.map((r) => r.duration));
  const rate = total > 0 ? ((successes / total) * 100).toFixed(0) : '0';
  statsEl.innerHTML = `
    <div class="history-stats__row">
      <span>${t('history.stats_total')}: <strong>${total}</strong></span>
      <span class="history-stats__success">${t('history.success')}: ${successes}</span>
      <span class="history-stats__failure">${t('history.failure')}: ${failures}</span>
      <span>${t('history.stats_rate')}: <strong>${rate}%</strong></span>
    </div>
    <div class="history-stats__row">
      <span>${t('history.stats_avg')}: <strong>${avgDuration.toFixed(1)}ms</strong></span>
      <span>Min: ${minDuration.toFixed(1)}ms</span>
      <span>Max: ${maxDuration.toFixed(1)}ms</span>
    </div>`;
  container.appendChild(statsEl);
  [...executionHistory].reverse().forEach((record) => {
    const card = document.createElement('div');
    card.className = `history-card ${record.success ? 'history-card--success' : 'history-card--failure'}`;

    const header = document.createElement('div');
    header.className = 'history-card__header';
    const nameEl = document.createElement('span');
    nameEl.className = 'history-card__name';
    nameEl.textContent = record.toolName;
    const statusBadge = document.createElement('span');
    statusBadge.className = `history-card__badge history-card__badge--${record.success ? 'success' : 'failure'}`;
    statusBadge.textContent = record.success ? t('history.success') : t('history.failure');
    if (record.source && record.source !== 'manual') {
      const sourceBadge = document.createElement('span');
      sourceBadge.className = `history-card__badge history-card__badge--source history-card__badge--${record.source}`;
      sourceBadge.textContent = record.source === 'ai-panel' ? 'AI' : 'Bridge';
      header.appendChild(sourceBadge);
    }
    header.appendChild(nameEl);
    header.appendChild(statusBadge);

    const meta = document.createElement('div');
    meta.className = 'history-card__meta';
    meta.textContent = `${new Date(record.timestamp).toLocaleTimeString()} · ${record.duration.toFixed(1)}ms`;

    card.appendChild(header);
    card.appendChild(meta);

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'history-card__toggle';
    toggleBtn.innerHTML = `${icon('chevronRight', 12)} Details`;

    const details = document.createElement('div');
    details.className = 'history-card__details';
    details.style.display = 'none';

    const inputLabel = document.createElement('div');
    inputLabel.className = 'history-card__label';
    inputLabel.textContent = t('history.input');
    details.appendChild(inputLabel);
    details.appendChild(renderJsonHighlight(record.input, { collapsible: true, initialDepth: 1 }));

    const outputLabel = document.createElement('div');
    outputLabel.className = 'history-card__label';
    outputLabel.textContent = t('history.output');
    details.appendChild(outputLabel);
    details.appendChild(renderJsonHighlight(record.output, { collapsible: true, initialDepth: 1 }));

    toggleBtn.addEventListener('click', () => {
      const visible = details.style.display !== 'none';
      details.style.display = visible ? 'none' : 'block';
      toggleBtn.innerHTML = visible ? `${icon('chevronRight', 12)} Details` : `${icon('chevronDown', 12)} Details`;
    });

    card.appendChild(toggleBtn);
    card.appendChild(details);
    container.appendChild(card);
  });
}

// ===== Snapshots Panel =====
async function renderSnapshotsPanel() {
  const panel = document.getElementById('panel-snapshots')!;
  const snapshots = await getSnapshots();
  panel.innerHTML = '';

  const toolbar = document.createElement('div');
  toolbar.className = 'panel__toolbar';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn--primary btn--sm';
  saveBtn.textContent = t('snapshots.save');
  saveBtn.addEventListener('click', () => saveCurrentSnapshot());
  toolbar.appendChild(saveBtn);
  panel.appendChild(toolbar);

  if (snapshots.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `<div class="empty-state__icon">${icon('camera', 40)}</div><p class="empty-state__text">${t('snapshots.empty_title')}</p><p class="empty-state__hint">${t('snapshots.empty_hint')}</p>`;
    panel.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'snapshots-list';

  snapshots.slice().reverse().forEach((snap) => {
    const card = document.createElement('div');
    card.className = 'snapshot-card';
    const info = document.createElement('div');
    info.className = 'snapshot-card__info';
    const nameEl = document.createElement('div');
    nameEl.className = 'snapshot-card__name';
    nameEl.textContent = snap.name;
    const meta = document.createElement('div');
    meta.className = 'snapshot-card__meta';
    meta.textContent = `${new Date(snap.timestamp).toLocaleString()} · ${t('snapshots.tools_count', { count: snap.tools.length })}`;
    info.appendChild(nameEl);
    info.appendChild(meta);
    const actions = document.createElement('div');
    actions.className = 'snapshot-card__actions';
    const compareBtn = document.createElement('button');
    compareBtn.className = 'btn btn--sm';
    compareBtn.textContent = t('diff.compare_with_current');
    compareBtn.addEventListener('click', () => {
      const diff = diffTools(snap.tools, tools);
      const diffPanel = document.getElementById('snapshot-diff-area')!;
      diffPanel.innerHTML = '';
      diffPanel.appendChild(renderDiffView(diff));
    });
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn--sm snapshot-card__delete';
    delBtn.textContent = t('snapshots.delete');
    delBtn.addEventListener('click', async () => { await deleteSnapshot(snap.id); renderSnapshotsPanel(); });
    actions.appendChild(compareBtn);
    actions.appendChild(delBtn);
    card.appendChild(info);
    card.appendChild(actions);
    list.appendChild(card);
  });

  panel.appendChild(list);
  const diffArea = document.createElement('div');
  diffArea.id = 'snapshot-diff-area';
  diffArea.className = 'snapshot-diff-area';
  panel.appendChild(diffArea);
}

async function saveCurrentSnapshot() {
  const snap: Snapshot = {
    id: crypto.randomUUID(),
    name: `Snapshot ${new Date().toLocaleTimeString()}`,
    url: '',
    timestamp: Date.now(),
    tools: tools.map((t) => ({ ...t })),
  };
  await saveSnapshot(snap);
  showToast(t('snapshots.saved'));
  renderSnapshotsPanel();
}

async function copyToClipboard(text: string) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  showToast(t('export.copied'));
}

function showToast(message: string) {
  document.querySelector('.toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

// ===== Status Bar =====
function updateStatusBar() {
  const connEl = document.getElementById('status-connection')!;
  const toolsEl = document.getElementById('status-tools')!;
  const displayTools = viewMode === 'all'
    ? allTabTools.reduce((sum, g) => sum + g.tools.length, 0)
    : tools.length;
  if (displayTools > 0) {
    connEl.textContent = t('status.connected');
    connEl.className = 'status-bar__item status-bar__item--connected';
  } else {
    connEl.textContent = t('status.disconnected');
    connEl.className = 'status-bar__item status-bar__item--disconnected';
  }
  const suffix = viewMode === 'all' ? ` (${allTabTools.length} tabs)` : '';
  toolsEl.textContent = formatToolCount(displayTools) + suffix;
}

// ===== Window Tracking =====
let myWindowId: number | undefined;

async function getMyWindowId(): Promise<number> {
  if (myWindowId != null) return myWindowId;
  const win = await chrome.windows.getCurrent();
  myWindowId = win.id;
  return myWindowId;
}

// ===== Message Handling =====
function handleMessage(message: { action: string; payload?: any; windowId?: number }) {
  if (message.action === 'TAB_CHANGED') {
    getMyWindowId().then((wid) => {
      if (message.windowId != null && message.windowId !== wid) return;
      tools.length = 0;
      timelineEvents.length = 0;
      selectedTool = null;
      renderToolsList();
      renderTimeline();
      resetExecutePanel();
      updateStatusBar();
      requestToolsList();
    });
    return;
  }
  if (message.action !== 'TOOL_EVENT') return;
  const payload = message.payload;
  if (!payload) return;
  const { event, data, timestamp } = payload;

  if (event === 'TOOLS_LIST' && Array.isArray(data)) {
    tools.length = 0;
    tools.push(...data);
    renderToolsList();
    updateStatusBar();
  } else if (event === 'REGISTER_TOOL' && data) {
    const existing = tools.findIndex((item) => item.name === data.name);
    if (existing >= 0) tools[existing] = data;
    else tools.push(data);
    renderToolsList();
    updateStatusBar();
    addTimelineEvent({ id: crypto.randomUUID(), timestamp: timestamp ?? Date.now(), type: 'register', toolName: data.name, data });
  } else if (event === 'UNREGISTER_TOOL' && data) {
    const idx = tools.findIndex((item) => item.name === data.name);
    if (idx >= 0) tools.splice(idx, 1);
    renderToolsList();
    updateStatusBar();
    addTimelineEvent({ id: crypto.randomUUID(), timestamp: timestamp ?? Date.now(), type: 'unregister', toolName: data.name });
  } else if (event === 'TOOL_CHANGE') {
    addTimelineEvent({ id: crypto.randomUUID(), timestamp: timestamp ?? Date.now(), type: 'toolchange', toolName: '(all)' });
    requestToolsList();
  } else if (event === 'API_NOT_AVAILABLE') {
    const connEl = document.getElementById('status-connection')!;
    connEl.textContent = t('status.api_unavailable');
    connEl.className = 'status-bar__item status-bar__item--disconnected';
  }
}

function requestToolsList() {
  getMyWindowId().then((wid) => {
    chrome.runtime.sendMessage({ action: 'LIST_TOOLS', windowId: wid })
      .then((response) => {
        if (response?.tools && Array.isArray(response.tools)) {
          tools.length = 0;
          tools.push(...response.tools);
          renderToolsList();
          updateStatusBar();
        }
      })
      .catch(() => {});
  });
}

async function requestToolsListAsync(): Promise<void> {
  try {
    const wid = await getMyWindowId();
    const response = await chrome.runtime.sendMessage({ action: 'LIST_TOOLS', windowId: wid });
    if (response?.tools && Array.isArray(response.tools)) {
      tools.length = 0;
      tools.push(...response.tools);
      renderToolsList();
      updateStatusBar();
    }
  } catch {}
}

// ===== Utilities =====
function formatTimestamp(ts: number): string {
  if (ts < 1e10) return `${ts.toFixed(1)}ms`;
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ===== View Mode Toggle =====
function initViewModeToggle() {
  const btn = document.getElementById('view-mode-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    viewMode = viewMode === 'current' ? 'all' : 'current';
    btn.textContent = viewMode === 'current' ? t('tools.view_current') : t('tools.view_all');
    if (viewMode === 'all') {
      requestAllTabsTools();
    }
    renderToolsList();
    updateStatusBar();
  });
}

// ===== Export Dropdown =====
function initExportDropdown() {
  const container = document.getElementById('tools-export');
  if (!container) return;
  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn btn--sm';
  exportBtn.textContent = t('export.title');
  const exportMenu = document.createElement('div');
  exportMenu.className = 'dropdown__menu';
  exportMenu.style.display = 'none';

  [{ key: 'export.json', fn: () => copyToClipboard(exportAsJSON(tools)) },
   { key: 'export.markdown', fn: () => copyToClipboard(exportAsMarkdown(tools)) },
   { key: 'export.postman', fn: () => copyToClipboard(exportAsPostman(tools)) },
   { key: 'export.script', fn: () => copyToClipboard(exportAsScriptToolConfig(tools)) },
   { key: 'export.typescript', fn: () => copyToClipboard(exportAsTypeScript(tools)) }].forEach(({ key, fn }) => {
    const item = document.createElement('button');
    item.className = 'dropdown__item';
    item.textContent = t(key);
    item.addEventListener('click', () => { fn(); exportMenu.style.display = 'none'; });
    exportMenu.appendChild(item);
  });

  exportBtn.addEventListener('click', () => {
    if (tools.length === 0) {
      showToast(t('tools.empty_title'), 'warning');
      return;
    }
    const isVisible = exportMenu.style.display !== 'none';
    if (isVisible) { exportMenu.style.display = 'none'; return; }
    const rect = exportBtn.getBoundingClientRect();
    exportMenu.style.position = 'fixed';
    exportMenu.style.top = `${rect.bottom + 2}px`;
    exportMenu.style.left = `${Math.max(4, rect.right - 180)}px`;
    exportMenu.style.display = 'block';
  });
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target as Node)) exportMenu.style.display = 'none';
  });
  container.appendChild(exportBtn);
  container.appendChild(exportMenu);
}

// ===== Init =====
async function init() {
  const settings = await getSettings();
  setLocale(settings.locale);
  currentTheme = settings.theme;
  applyTheme(currentTheme);

  initTabBar();
  initLangToggle();
  initThemeToggle();
  onLocaleChange(() => reRenderAll());

  executionHistory = await getExecutionHistory();
  renderHistoryPanel();

  document.getElementById('tools-search')?.addEventListener('input', () => renderToolsList());
  document.getElementById('tools-refresh')?.addEventListener('click', () => {
    requestToolsList();
    showToast(t('tools.refreshed'));
  });
  initViewModeToggle();
  initExportDropdown();
  document.getElementById('timeline-clear')?.addEventListener('click', () => { timelineEvents.length = 0; renderTimeline(); });
  document.getElementById('history-clear')?.addEventListener('click', async () => {
    executionHistory.length = 0;
    await chrome.storage.local.set({ execution_history: [] });
    renderHistoryPanel();
  });

  chrome.runtime.onMessage.addListener(async (message) => {
    handleMessage(message);
    if (message.action === 'BRIDGE_STATUS') {
      updateBridgeUI(message.connected);
    }
    if (message.action === 'HISTORY_UPDATED') {
      executionHistory = await getExecutionHistory();
      renderHistoryPanel();
    }
  });

  initBridge();
  initAIPanel();
  initGenerator();
  requestToolsList();
  renderSnapshotsPanel();
}

// ===== Generator Panel =====
interface DiscoveredElement {
  id: string;
  type: 'form' | 'button' | 'link' | 'api';
  selector: string;
  suggestedName: string;
  suggestedDescription: string;
  inferredSchema?: Record<string, unknown>;
  metadata: Record<string, unknown>;
  alreadyRegistered: boolean;
}

let discoveredElements: DiscoveredElement[] = [];
let generatorEdits: Map<string, { name: string; description: string }> = new Map();

function initGenerator() {
  document.getElementById('generator-scan')?.addEventListener('click', scanPage);
  document.getElementById('generator-inject-all')?.addEventListener('click', injectAllTools);
  document.getElementById('generator-save-profile')?.addEventListener('click', saveCurrentAsProfile);
  document.getElementById('profiles-import')?.addEventListener('click', importProfileFromFile);

  document.querySelectorAll<HTMLButtonElement>('.gen-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.gen-tab').forEach((t) => t.classList.remove('gen-tab--active'));
      tab.classList.add('gen-tab--active');
      const target = tab.dataset.genTab;
      const scanPanel = document.getElementById('gen-scan-panel')!;
      const profilesPanel = document.getElementById('gen-profiles-panel')!;
      if (target === 'profiles') {
        scanPanel.style.display = 'none';
        profilesPanel.style.display = '';
        renderProfilesList();
      } else {
        scanPanel.style.display = '';
        profilesPanel.style.display = 'none';
      }
    });
  });
}

async function scanPage() {
  const scanBtn = document.getElementById('generator-scan') as HTMLButtonElement;
  if (scanBtn) {
    scanBtn.disabled = true;
    scanBtn.textContent = t('generator.scanning');
  }

  try {
    const wid = await getMyWindowId();
    const response = await chrome.runtime.sendMessage({ action: 'SCAN_PAGE', windowId: wid });
    discoveredElements = response?.elements ?? [];
    generatorEdits.clear();
    renderGeneratorList();
    if (discoveredElements.length > 0) {
      showToast(t('generator.found', { count: discoveredElements.length }));
    }
  } catch {
    discoveredElements = [];
    renderGeneratorList();
  } finally {
    if (scanBtn) {
      scanBtn.disabled = false;
      scanBtn.textContent = t('generator.scan');
    }
  }
}

function renderGeneratorList() {
  const container = document.getElementById('generator-list')!;
  const injectAllBtn = document.getElementById('generator-inject-all') as HTMLButtonElement;
  const countEl = document.getElementById('generator-count')!;

  if (discoveredElements.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">🔍</div>
        <p class="empty-state__text">${t('generator.empty_title')}</p>
        <p class="empty-state__hint">${t('generator.empty_hint')}</p>
      </div>
    `;
    if (injectAllBtn) injectAllBtn.style.display = 'none';
    countEl.textContent = '';
    return;
  }

  const injectableCount = discoveredElements.filter((e) => !e.alreadyRegistered).length;
  if (injectAllBtn) injectAllBtn.style.display = injectableCount > 0 ? '' : 'none';
  countEl.textContent = t('generator.found', { count: discoveredElements.length });

  container.innerHTML = '';
  discoveredElements.forEach((el) => {
    const card = createGenCard(el);
    container.appendChild(card);
  });
  updateSaveProfileVisibility();
}

function createGenCard(el: DiscoveredElement): HTMLElement {
  const card = document.createElement('div');
  card.className = `gen-card${el.alreadyRegistered ? ' gen-card--registered' : ''}`;
  card.dataset.elementId = el.id;

  const edits = generatorEdits.get(el.id);
  const name = edits?.name ?? el.suggestedName;
  const desc = edits?.description ?? el.suggestedDescription;

  const typeLabel: Record<string, string> = {
    form: t('generator.form'),
    button: t('generator.button'),
    link: t('generator.link'),
    api: t('generator.api'),
  };

  // Header
  const header = document.createElement('div');
  header.className = 'gen-card__header';

  const typeBadge = document.createElement('span');
  typeBadge.className = `gen-card__type gen-card__type--${el.type}`;
  typeBadge.textContent = typeLabel[el.type] || el.type;
  header.appendChild(typeBadge);

  const nameContainer = document.createElement('div');
  nameContainer.className = 'gen-card__name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = name;
  nameInput.addEventListener('input', () => {
    const current = generatorEdits.get(el.id) ?? { name: el.suggestedName, description: el.suggestedDescription };
    generatorEdits.set(el.id, { ...current, name: nameInput.value });
  });
  nameContainer.appendChild(nameInput);
  header.appendChild(nameContainer);

  if (el.alreadyRegistered) {
    const regBadge = document.createElement('span');
    regBadge.className = 'gen-card__tag';
    regBadge.textContent = t('generator.already_registered');
    header.appendChild(regBadge);
  }

  card.appendChild(header);

  // Description (editable)
  const descDiv = document.createElement('div');
  descDiv.className = 'gen-card__desc';
  const descInput = document.createElement('input');
  descInput.type = 'text';
  descInput.value = desc;
  descInput.addEventListener('input', () => {
    const current = generatorEdits.get(el.id) ?? { name: el.suggestedName, description: el.suggestedDescription };
    generatorEdits.set(el.id, { ...current, description: descInput.value });
  });
  descDiv.appendChild(descInput);
  card.appendChild(descDiv);

  // Metadata tags
  const metaDiv = document.createElement('div');
  metaDiv.className = 'gen-card__meta';

  if (el.selector) {
    const selTag = document.createElement('span');
    selTag.className = 'gen-card__tag';
    selTag.textContent = el.selector.length > 30 ? el.selector.substring(0, 30) + '…' : el.selector;
    selTag.title = el.selector;
    metaDiv.appendChild(selTag);
  }

  if (el.type === 'form' && el.metadata.fieldCount) {
    const fieldTag = document.createElement('span');
    fieldTag.className = 'gen-card__tag';
    fieldTag.textContent = t('generator.fields', { count: el.metadata.fieldCount as number });
    metaDiv.appendChild(fieldTag);
  }

  if (el.type === 'api' && el.metadata.method) {
    const methodTag = document.createElement('span');
    methodTag.className = 'gen-card__tag';
    methodTag.textContent = `${el.metadata.method} ${(el.metadata.pathname as string) || ''}`;
    metaDiv.appendChild(methodTag);
  }

  if (el.type === 'form' && el.metadata.method) {
    const methodTag = document.createElement('span');
    methodTag.className = 'gen-card__tag';
    methodTag.textContent = el.metadata.method as string;
    metaDiv.appendChild(methodTag);
  }

  card.appendChild(metaDiv);

  // Schema preview (collapsible)
  if (el.inferredSchema && el.type === 'form') {
    const schemaDiv = document.createElement('div');
    schemaDiv.className = 'gen-card__schema';
    try {
      const schemaStr = typeof el.inferredSchema === 'string' ? el.inferredSchema : JSON.stringify(el.inferredSchema);
      const tree = renderSchemaTree(schemaStr);
      schemaDiv.appendChild(tree);
    } catch {}
    card.appendChild(schemaDiv);
  }

  // Actions
  if (!el.alreadyRegistered) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'gen-card__actions';

    const injectBtn = document.createElement('button');
    injectBtn.className = 'btn btn--primary btn--sm';
    injectBtn.textContent = t('generator.inject');
    injectBtn.addEventListener('click', () => injectSingleTool(el, injectBtn));
    actionsDiv.appendChild(injectBtn);

    card.appendChild(actionsDiv);
  }

  return card;
}

async function injectSingleTool(el: DiscoveredElement, btn: HTMLButtonElement) {
  const edits = generatorEdits.get(el.id);
  const name = edits?.name ?? el.suggestedName;
  const desc = edits?.description ?? el.suggestedDescription;

  btn.disabled = true;
  btn.textContent = '...';

  const executeTypeMap: Record<string, string> = {
    form: 'form-submit',
    button: 'click',
    link: 'navigate',
    api: 'fetch',
  };

  const toolDef = {
    name,
    description: desc,
    inputSchema: el.inferredSchema ?? { type: 'object', properties: {} },
    executeType: executeTypeMap[el.type] || 'custom',
    executeConfig: {
      selector: el.selector,
      ...(el.type === 'api' ? { url: el.metadata.url, method: el.metadata.method } : {}),
    },
  };

  try {
    const wid = await getMyWindowId();
    const response = await chrome.runtime.sendMessage({
      action: 'INJECT_TOOL',
      payload: toolDef,
      windowId: wid,
    });

    if (response?.success) {
      el.alreadyRegistered = true;
      renderGeneratorList();
      showToast(t('generator.injected', { name }));
      requestToolsList();
    } else {
      showToast(t('generator.inject_failed', { error: response?.error || 'Unknown error' }));
      btn.disabled = false;
      btn.textContent = t('generator.inject');
    }
  } catch (e: any) {
    showToast(t('generator.inject_failed', { error: e?.message || 'Unknown error' }));
    btn.disabled = false;
    btn.textContent = t('generator.inject');
  }
}

async function injectAllTools() {
  const injectables = discoveredElements.filter((e) => !e.alreadyRegistered);
  for (const el of injectables) {
    const edits = generatorEdits.get(el.id);
    const name = edits?.name ?? el.suggestedName;
    const desc = edits?.description ?? el.suggestedDescription;

    const executeTypeMap: Record<string, string> = {
      form: 'form-submit',
      button: 'click',
      link: 'navigate',
      api: 'fetch',
    };

    const toolDef = {
      name,
      description: desc,
      inputSchema: el.inferredSchema ?? { type: 'object', properties: {} },
      executeType: executeTypeMap[el.type] || 'custom',
      executeConfig: {
        selector: el.selector,
        ...(el.type === 'api' ? { url: el.metadata.url, method: el.metadata.method } : {}),
      },
    };

    try {
      const wid = await getMyWindowId();
      const response = await chrome.runtime.sendMessage({
        action: 'INJECT_TOOL',
        payload: toolDef,
        windowId: wid,
      });
      if (response?.success) {
        el.alreadyRegistered = true;
      }
    } catch {}
  }

  renderGeneratorList();
  requestToolsList();
  const injectedCount = injectables.filter((e) => e.alreadyRegistered).length;
  showToast(t('generator.found', { count: injectedCount }) + ' injected');
}

// ===== Site Profiles UI =====

function updateSaveProfileVisibility() {
  const btn = document.getElementById('generator-save-profile') as HTMLButtonElement;
  if (!btn) return;
  const injected = discoveredElements.filter((e) => e.alreadyRegistered);
  btn.style.display = injected.length > 0 ? '' : 'none';
}

async function saveCurrentAsProfile() {
  const injected = discoveredElements.filter((e) => e.alreadyRegistered);
  if (injected.length === 0) return;

  let domain = '';
  try {
    const tab = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab[0]?.url) domain = new URL(tab[0].url).hostname;
  } catch {}

  const executeTypeMap: Record<string, string> = {
    form: 'form-submit', button: 'click', link: 'navigate', api: 'fetch',
  };

  const tools = injected.map((el) => {
    const edits = generatorEdits.get(el.id);
    return {
      name: edits?.name ?? el.suggestedName,
      description: edits?.description ?? el.suggestedDescription,
      inputSchema: el.inferredSchema ?? { type: 'object', properties: {} },
      executeType: executeTypeMap[el.type] || 'custom',
      executeConfig: {
        selector: el.selector,
        ...(el.type === 'api' ? { url: el.metadata.url, method: el.metadata.method } : {}),
      },
    };
  });

  const profileName = prompt(t('generator.profile_name'), domain) || domain || 'Unnamed';

  const profile = {
    id: crypto.randomUUID(),
    domain,
    name: profileName,
    tools,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    autoInject: true,
  };

  try {
    await chrome.runtime.sendMessage({ action: 'SAVE_PROFILE', payload: profile });
    showToast(t('generator.profile_saved'));
  } catch (e: any) {
    showToast(e?.message || 'Save failed');
  }
}

async function renderProfilesList() {
  const container = document.getElementById('profiles-list')!;
  try {
    const response = await chrome.runtime.sendMessage({ action: 'LIST_PROFILES' });
    const profiles = response?.profiles || [];

    if (profiles.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">📁</div>
          <p class="empty-state__text">${t('generator.no_profiles')}</p>
          <p class="empty-state__hint">${t('generator.no_profiles_hint')}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    for (const profile of profiles) {
      const card = document.createElement('div');
      card.className = 'profile-card';

      const header = document.createElement('div');
      header.className = 'profile-card__header';

      const nameEl = document.createElement('strong');
      nameEl.className = 'profile-card__name';
      nameEl.textContent = profile.name;
      header.appendChild(nameEl);

      const domainEl = document.createElement('span');
      domainEl.className = 'profile-card__domain';
      domainEl.textContent = profile.domain;
      header.appendChild(domainEl);

      card.appendChild(header);

      const info = document.createElement('div');
      info.className = 'profile-card__info';
      info.textContent = t('generator.tools_count', { count: profile.tools.length });
      card.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'profile-card__actions';

      const autoLabel = document.createElement('label');
      autoLabel.className = 'profile-card__toggle';
      const autoCheck = document.createElement('input');
      autoCheck.type = 'checkbox';
      autoCheck.checked = profile.autoInject;
      autoCheck.addEventListener('change', async () => {
        await chrome.runtime.sendMessage({
          action: 'TOGGLE_PROFILE_AUTO_INJECT',
          payload: { id: profile.id, enabled: autoCheck.checked },
        });
      });
      autoLabel.appendChild(autoCheck);
      autoLabel.append(` ${t('generator.auto_inject')}`);
      actions.appendChild(autoLabel);

      const exportBtn = document.createElement('button');
      exportBtn.className = 'btn btn--sm';
      exportBtn.textContent = t('generator.export_profile');
      exportBtn.addEventListener('click', () => {
        const json = JSON.stringify(profile, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `webmcp-profile-${profile.domain}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
      actions.appendChild(exportBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn--sm btn--danger';
      delBtn.textContent = t('snapshots.delete');
      delBtn.addEventListener('click', async () => {
        if (!confirm(t('generator.confirm_delete_profile'))) return;
        await chrome.runtime.sendMessage({ action: 'DELETE_PROFILE', payload: { id: profile.id } });
        showToast(t('generator.profile_deleted'));
        renderProfilesList();
      });
      actions.appendChild(delBtn);

      card.appendChild(actions);
      container.appendChild(card);
    }
  } catch {
    container.innerHTML = '<p>Error loading profiles</p>';
  }
}

function importProfileFromFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.domain || !data.name || !Array.isArray(data.tools)) {
        showToast(t('generator.import_error'));
        return;
      }
      const profile = {
        id: crypto.randomUUID(),
        domain: data.domain,
        urlPattern: data.urlPattern,
        name: data.name,
        tools: data.tools,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        autoInject: data.autoInject ?? true,
      };
      await chrome.runtime.sendMessage({ action: 'SAVE_PROFILE', payload: profile });
      showToast(t('generator.profile_imported'));
      renderProfilesList();
    } catch {
      showToast(t('generator.import_error'));
    }
  });
  input.click();
}

// ===== Bridge UI =====
let bridgeConnected = false;

function initBridge() {
  const btn = document.getElementById('bridge-toggle');
  if (!btn) return;

  chrome.runtime.sendMessage({ action: 'BRIDGE_STATUS_REQUEST' })
    .then((res) => updateBridgeUI(res?.connected ?? false))
    .catch(() => {});

  btn.addEventListener('click', () => {
    if (bridgeConnected) {
      chrome.runtime.sendMessage({ action: 'BRIDGE_DISCONNECT' }).catch(() => {});
    } else {
      chrome.runtime.sendMessage({ action: 'BRIDGE_CONNECT', port: 3789 }).catch(() => {});
    }
  });
}

function updateBridgeUI(connected: boolean) {
  bridgeConnected = connected;
  const iconEl = document.getElementById('bridge-status-icon');
  const btn = document.getElementById('bridge-toggle');
  if (iconEl) {
    iconEl.textContent = connected ? '●' : '○';
    iconEl.className = connected ? 'bridge-btn__icon bridge-btn__icon--on' : 'bridge-btn__icon';
  }
  if (btn) {
    btn.title = connected ? t('bridge.disconnect') : t('bridge.connect');
  }
}

// ===== AI Panel =====
let aiConfig: AIConfig | null = null;
let aiMessages: ChatMessage[] = [];
let aiProcessing = false;

interface AIChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

let aiSessions: AIChatSession[] = [];
let currentSessionId: string | null = null;
let historyPanelOpen = false;

function generateSessionTitle(messages: ChatMessage[]): string {
  const firstUserMsg = messages.find((m) => m.role === 'user');
  if (!firstUserMsg) return t('ai.new_conversation');
  const text = firstUserMsg.content;
  return text.length > 30 ? text.slice(0, 30) + '…' : text;
}

async function loadAISessions() {
  try {
    const stored = await chrome.storage.local.get('ai_sessions');
    aiSessions = (stored.ai_sessions as AIChatSession[] | undefined) || [];
  } catch {
    aiSessions = [];
  }
}

async function saveAISessions() {
  try {
    while (aiSessions.length > 20) aiSessions.pop();
    await chrome.storage.local.set({ ai_sessions: aiSessions });
  } catch {}
}

function saveCurrentSession() {
  if (!currentSessionId || aiMessages.length <= 1) return;
  const idx = aiSessions.findIndex((s) => s.id === currentSessionId);
  const session: AIChatSession = {
    id: currentSessionId,
    title: generateSessionTitle(aiMessages),
    messages: [...aiMessages],
    createdAt: idx >= 0 ? aiSessions[idx].createdAt : Date.now(),
    updatedAt: Date.now(),
  };
  if (idx >= 0) {
    aiSessions[idx] = session;
  } else {
    aiSessions.unshift(session);
  }
  saveAISessions();
}

function startNewChat() {
  saveCurrentSession();
  currentSessionId = crypto.randomUUID();
  aiMessages.length = 0;
  const messagesEl = document.getElementById('ai-messages');
  if (messagesEl) messagesEl.innerHTML = '';
  if (historyPanelOpen) renderHistoryList();
}

function loadSession(sessionId: string) {
  saveCurrentSession();
  const session = aiSessions.find((s) => s.id === sessionId);
  if (!session) return;
  currentSessionId = session.id;
  aiMessages.length = 0;
  aiMessages.push(...session.messages);
  renderAIMessages();
  if (historyPanelOpen) renderHistoryList();
}

function deleteSession(sessionId: string) {
  aiSessions = aiSessions.filter((s) => s.id !== sessionId);
  saveAISessions();
  if (currentSessionId === sessionId) {
    startNewChat();
  }
  renderHistoryList();
}

function toggleHistoryPanel() {
  historyPanelOpen = !historyPanelOpen;
  const panel = document.getElementById('ai-history-panel');
  if (panel) {
    panel.style.display = historyPanelOpen ? '' : 'none';
    if (historyPanelOpen) renderHistoryList();
  }
}

function renderHistoryList() {
  const list = document.getElementById('ai-history-list');
  if (!list) return;

  if (aiSessions.length === 0) {
    list.innerHTML = `<div class="ai-history__empty">${t('ai.no_history')}</div>`;
    return;
  }

  list.innerHTML = aiSessions.map((s) => {
    const isActive = s.id === currentSessionId;
    const time = new Date(s.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `<div class="ai-history__item${isActive ? ' ai-history__item--active' : ''}" data-session-id="${s.id}">
      <span class="ai-history__title">${escapeHtml(s.title)}</span>
      <span class="ai-history__time">${time}</span>
      <button class="ai-history__delete" data-delete-id="${s.id}" title="Delete">×</button>
    </div>`;
  }).join('');

  list.querySelectorAll('.ai-history__item').forEach((el) => {
    el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('ai-history__delete')) return;
      const sid = (el as HTMLElement).dataset.sessionId!;
      loadSession(sid);
    });
  });

  list.querySelectorAll('.ai-history__delete').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const sid = (btn as HTMLElement).dataset.deleteId!;
      deleteSession(sid);
    });
  });
}

async function initAIPanel() {
  await loadAISessions();
  currentSessionId = crypto.randomUUID();

  const stored = await chrome.storage.local.get('ai_config');
  if (stored.ai_config) {
    aiConfig = stored.ai_config;
    const providerEl = document.getElementById('ai-provider') as HTMLSelectElement;
    const keyEl = document.getElementById('ai-apikey') as HTMLInputElement;
    const modelEl = document.getElementById('ai-model') as HTMLInputElement;
    const endpointEl = document.getElementById('ai-endpoint') as HTMLInputElement;
    if (providerEl) providerEl.value = aiConfig!.provider;
    if (keyEl) keyEl.value = aiConfig!.apiKey;
    if (modelEl) modelEl.value = aiConfig!.model;
    if (endpointEl && aiConfig!.endpoint) endpointEl.value = aiConfig!.endpoint;
    if (aiConfig!.provider === 'custom') {
      document.getElementById('ai-custom-endpoint')!.style.display = '';
    }
    showAIChat();
  }

  const providerEl = document.getElementById('ai-provider') as HTMLSelectElement;
  providerEl?.addEventListener('change', () => {
    const modelEl = document.getElementById('ai-model') as HTMLInputElement;
    const provider = providerEl.value as AIProvider;
    modelEl.value = getDefaultModel(provider);
    document.getElementById('ai-custom-endpoint')!.style.display =
      provider === 'custom' ? '' : 'none';
  });

  document.getElementById('ai-save')?.addEventListener('click', async () => {
    const provider = (document.getElementById('ai-provider') as HTMLSelectElement).value as AIProvider;
    const apiKey = (document.getElementById('ai-apikey') as HTMLInputElement).value.trim();
    const model = (document.getElementById('ai-model') as HTMLInputElement).value.trim();
    const endpoint = (document.getElementById('ai-endpoint') as HTMLInputElement).value.trim();
    if (!apiKey) return;
    aiConfig = { provider, apiKey, model: model || getDefaultModel(provider), endpoint: endpoint || undefined };
    await chrome.storage.local.set({ ai_config: aiConfig });
    showToast(t('ai.saved'));
    showAIChat();
  });

  document.getElementById('ai-test')?.addEventListener('click', async () => {
    const provider = (document.getElementById('ai-provider') as HTMLSelectElement).value as AIProvider;
    const apiKey = (document.getElementById('ai-apikey') as HTMLInputElement).value.trim();
    const model = (document.getElementById('ai-model') as HTMLInputElement).value.trim();
    const endpoint = (document.getElementById('ai-endpoint') as HTMLInputElement).value.trim();
    if (!apiKey) { showToast(t('ai.no_key'), 'warning'); return; }
    const cfg: AIConfig = { provider, apiKey, model: model || getDefaultModel(provider), endpoint: endpoint || undefined };
    const ok = await testConnection(cfg);
    showToast(ok ? t('ai.test_success') : t('ai.test_fail'), ok ? undefined : 'warning');
  });

  document.getElementById('ai-send')?.addEventListener('click', sendAIMessage);
  document.getElementById('ai-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAIMessage(); }
  });

  document.getElementById('ai-settings-btn')?.addEventListener('click', () => {
    document.getElementById('ai-setup')!.style.display = '';
    document.getElementById('ai-chat')!.style.display = 'none';
  });

  document.getElementById('ai-new-chat')?.addEventListener('click', () => startNewChat());
  document.getElementById('ai-history-btn')?.addEventListener('click', () => toggleHistoryPanel());
}

function showAIChat() {
  document.getElementById('ai-setup')!.style.display = 'none';
  document.getElementById('ai-chat')!.style.display = 'flex';
}

async function sendAIMessage() {
  if (aiProcessing || !aiConfig) return;
  const inputEl = document.getElementById('ai-input') as HTMLTextAreaElement;
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';

  await requestToolsListAsync();
  const toolsSummary = tools.map((t) => `- ${t.name}: ${t.description}`).join('\n');
  const systemContent = `You are the AI assistant for WebMCP DevTools, a Chrome extension for inspecting and testing WebMCP tools on web pages. Always respond in the same language as the user.

Your capabilities:
1. See all WebMCP tools currently registered on the active page
2. Execute any tool by calling it with the function calling feature
3. Explain tool schemas, parameters, and usage
4. Help debug tool execution results

Current page tools (${tools.length} total):
${toolsSummary || '(No tools detected on this page)'}

Rules:
- When asked to use/call/execute a tool, use function calling immediately
- Report execution results clearly and format output for readability
- If no tools are detected, suggest the user navigate to a page with WebMCP tools or check if the WebMCP flag is enabled
- When listing tools, include their descriptions and parameter info`;
  if (aiMessages.length === 0) {
    aiMessages.push({ role: 'system', content: systemContent });
  } else if (aiMessages[0]?.role === 'system') {
    aiMessages[0].content = systemContent;
  }

  aiMessages.push({ role: 'user', content: text });
  renderAIMessages();

  const toolDefs = tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));

  aiProcessing = true;
  addThinkingIndicator();

  try {
    streamBuffer = '';
    removeThinkingIndicator();

    let response = await chatWithAIStream(aiConfig, aiMessages, toolDefs, appendStreamChunk);
    if (response.content) {
      finalizeStream();
      aiMessages.push({ role: 'assistant', content: response.content });
    }

    let toolRounds = 0;
    const MAX_TOOL_ROUNDS = 50;
    while (response.toolCalls && response.toolCalls.length > 0 && toolRounds < MAX_TOOL_ROUNDS) {
      toolRounds++;
      for (const tc of response.toolCalls) {
        const callId = tc.id;
        aiMessages.push({
          role: 'assistant',
          content: t('ai.tool_call', { name: tc.name }),
          toolCall: { id: callId, name: tc.name, args: tc.arguments },
        });
        renderAIMessages();

        const result = await executeToolForAI(tc.name, tc.arguments);
        aiMessages.push({
          role: 'tool',
          content: JSON.stringify(result),
          toolResult: { id: callId, name: tc.name, result },
        });
        renderAIMessages();
      }

      streamBuffer = '';
      response = await chatWithAIStream(aiConfig, aiMessages, toolDefs, appendStreamChunk);
      if (response.content) {
        finalizeStream();
        aiMessages.push({ role: 'assistant', content: response.content });
      }
    }
    if (toolRounds >= MAX_TOOL_ROUNDS && response.toolCalls?.length) {
      finalizeStream();
      aiMessages.push({ role: 'assistant', content: t('ai.tool_limit') });
    }
  } catch (err: any) {
    finalizeStream();
    aiMessages.push({ role: 'assistant', content: `Error: ${err.message}` });
  }

  aiProcessing = false;
  removeThinkingIndicator();
  renderAIMessages();
  saveCurrentSession();
}

async function executeToolForAI(name: string, args: any): Promise<any> {
  const start = performance.now();
  const wid = await getMyWindowId();
  try {
    const response = await chrome.runtime.sendMessage({ action: 'EXECUTE_TOOL', payload: { name, args }, windowId: wid });
    const duration = performance.now() - start;
    const record: ExecutionRecord = {
      id: crypto.randomUUID(),
      toolName: name,
      input: args,
      output: response,
      duration,
      timestamp: Date.now(),
      success: !response?.error,
      source: 'ai-panel',
    };
    await addExecutionRecord(record);
    executionHistory.push(record);
    while (executionHistory.length > 20) executionHistory.shift();
    renderHistoryPanel();
    return response;
  } catch (e: any) {
    const duration = performance.now() - start;
    const record: ExecutionRecord = {
      id: crypto.randomUUID(),
      toolName: name,
      input: args,
      output: { error: e.message },
      duration,
      timestamp: Date.now(),
      success: false,
      source: 'ai-panel',
    };
    await addExecutionRecord(record);
    executionHistory.push(record);
    while (executionHistory.length > 20) executionHistory.shift();
    renderHistoryPanel();
    return { error: e.message };
  }
}

function renderAIMessages() {
  const container = document.getElementById('ai-messages')!;
  container.innerHTML = '';
  for (const msg of aiMessages) {
    if (msg.role === 'system') continue;
    const el = document.createElement('div');
    el.className = `ai-msg ai-msg--${msg.role}`;

    if (msg.toolCall) {
      el.innerHTML = `<div class="ai-msg__tool-call">${icon('zap', 14)} ${escapeHtml(msg.content)}</div>
        <pre class="ai-msg__code">${escapeHtml(JSON.stringify(msg.toolCall.args, null, 2))}</pre>`;
    } else if (msg.toolResult) {
      el.innerHTML = `<pre class="ai-msg__code">${escapeHtml(JSON.stringify(msg.toolResult.result, null, 2))}</pre>`;
    } else if (msg.role === 'assistant') {
      el.innerHTML = renderMarkdown(msg.content);
    } else {
      el.textContent = msg.content;
    }
    container.appendChild(el);
  }
  container.scrollTop = container.scrollHeight;
}

function getOrCreateStreamingBubble(): HTMLDivElement {
  const container = document.getElementById('ai-messages')!;
  let el = document.getElementById('ai-streaming') as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = 'ai-streaming';
    el.className = 'ai-msg ai-msg--assistant';
    container.appendChild(el);
  }
  return el;
}

let streamBuffer = '';
let streamRenderTimer: ReturnType<typeof setTimeout> | null = null;

function appendStreamChunk(chunk: string) {
  streamBuffer += chunk;
  if (!streamRenderTimer) {
    streamRenderTimer = setTimeout(() => {
      const el = getOrCreateStreamingBubble();
      el.innerHTML = renderMarkdown(streamBuffer);
      const container = document.getElementById('ai-messages')!;
      container.scrollTop = container.scrollHeight;
      streamRenderTimer = null;
    }, 30);
  }
}

function finalizeStream() {
  if (streamRenderTimer) {
    clearTimeout(streamRenderTimer);
    streamRenderTimer = null;
  }
  const el = getOrCreateStreamingBubble();
  el.innerHTML = renderMarkdown(streamBuffer);
  el.removeAttribute('id');
  const container = document.getElementById('ai-messages')!;
  container.scrollTop = container.scrollHeight;
  streamBuffer = '';
}

function addThinkingIndicator() {
  const container = document.getElementById('ai-messages')!;
  const el = document.createElement('div');
  el.className = 'ai-msg ai-msg--thinking';
  el.id = 'ai-thinking';
  el.textContent = t('ai.thinking');
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function removeThinkingIndicator() {
  document.getElementById('ai-thinking')?.remove();
}

document.addEventListener('DOMContentLoaded', init);
