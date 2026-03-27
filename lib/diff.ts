import type { ToolInfo } from './types';
import { t } from './i18n';
import { icon } from './icons';

export interface DiffResult {
  added: ToolInfo[];
  removed: ToolInfo[];
  modified: Array<{ name: string; before: ToolInfo; after: ToolInfo; changes: string[] }>;
  unchanged: ToolInfo[];
}

export function diffTools(before: ToolInfo[], after: ToolInfo[]): DiffResult {
  const beforeMap = new Map(before.map((t) => [t.name, t]));
  const afterMap = new Map(after.map((t) => [t.name, t]));

  const added: ToolInfo[] = [];
  const removed: ToolInfo[] = [];
  const modified: DiffResult['modified'] = [];
  const unchanged: ToolInfo[] = [];

  for (const tool of after) {
    const prev = beforeMap.get(tool.name);
    if (!prev) {
      added.push(tool);
    } else {
      const changes = findChanges(prev, tool);
      if (changes.length > 0) {
        modified.push({ name: tool.name, before: prev, after: tool, changes });
      } else {
        unchanged.push(tool);
      }
    }
  }

  for (const tool of before) {
    if (!afterMap.has(tool.name)) {
      removed.push(tool);
    }
  }

  return { added, removed, modified, unchanged };
}

function findChanges(a: ToolInfo, b: ToolInfo): string[] {
  const changes: string[] = [];
  if (a.description !== b.description) changes.push('description');
  if (normalize(a.inputSchema) !== normalize(b.inputSchema)) changes.push('inputSchema');
  if (JSON.stringify(a.annotations) !== JSON.stringify(b.annotations)) changes.push('annotations');
  return changes;
}

function normalize(schema: ToolInfo['inputSchema']): string {
  if (!schema) return '';
  if (typeof schema === 'string') return schema;
  return JSON.stringify(schema);
}

export function renderDiffView(diff: DiffResult): HTMLElement {
  const container = document.createElement('div');
  container.className = 'diff-view';

  if (diff.added.length === 0 && diff.removed.length === 0 && diff.modified.length === 0) {
    const noChanges = document.createElement('div');
    noChanges.className = 'empty-state';
    noChanges.innerHTML = `<div class="empty-state__icon">${icon('checkCircle', 40)}</div><p class="empty-state__text">${t('diff.no_changes')}</p>`;
    container.appendChild(noChanges);
    return container;
  }

  for (const tool of diff.added) {
    container.appendChild(createDiffItem(tool.name, 'added', t('diff.added')));
  }

  for (const tool of diff.removed) {
    container.appendChild(createDiffItem(tool.name, 'removed', t('diff.removed')));
  }

  for (const mod of diff.modified) {
    const detail = mod.changes.join(', ');
    container.appendChild(createDiffItem(mod.name, 'modified', `${t('diff.modified')}: ${detail}`));
  }

  const summary = document.createElement('div');
  summary.className = 'diff-summary';
  summary.textContent = t('diff.summary', {
    added: diff.added.length,
    removed: diff.removed.length,
    modified: diff.modified.length,
  });
  container.appendChild(summary);

  return container;
}

function createDiffItem(name: string, type: string, label: string): HTMLElement {
  const el = document.createElement('div');
  el.className = `diff-item diff-item--${type}`;

  const nameEl = document.createElement('span');
  nameEl.className = 'diff-item__name';
  nameEl.textContent = name;

  const badge = document.createElement('span');
  badge.className = `diff-item__badge diff-item__badge--${type}`;
  badge.textContent = label;

  el.appendChild(nameEl);
  el.appendChild(badge);
  return el;
}
