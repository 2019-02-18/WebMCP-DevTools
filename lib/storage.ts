import type { Snapshot, ExecutionRecord, Settings, ThemeSetting, Locale } from './types';

const DEFAULTS: Settings = {
  theme: 'system',
  locale: 'en',
  exportFormat: 'json',
};

export async function getSettings(): Promise<Settings> {
  const data = await chrome.storage.local.get(['theme', 'locale', 'export_format']);
  return {
    theme: (data.theme as ThemeSetting) ?? DEFAULTS.theme,
    locale: (data.locale as Locale) ?? DEFAULTS.locale,
    exportFormat: (data.export_format as Settings['exportFormat']) ?? DEFAULTS.exportFormat,
  };
}

export async function saveSettings(settings: Partial<Settings>) {
  const update: Record<string, unknown> = {};
  if (settings.theme) update.theme = settings.theme;
  if (settings.locale) update.locale = settings.locale;
  if (settings.exportFormat) update.export_format = settings.exportFormat;
  await chrome.storage.local.set(update);
}

export async function getSnapshots(): Promise<Snapshot[]> {
  const data = await chrome.storage.local.get('snapshots');
  return (data.snapshots as Snapshot[] | undefined) ?? [];
}

export async function saveSnapshot(snapshot: Snapshot) {
  const snapshots = await getSnapshots();
  snapshots.push(snapshot);
  while (snapshots.length > 20) {
    snapshots.shift();
  }
  await chrome.storage.local.set({ snapshots });
}

export async function deleteSnapshot(id: string) {
  const snapshots = await getSnapshots();
  const filtered = snapshots.filter((s) => s.id !== id);
  await chrome.storage.local.set({ snapshots: filtered });
}

export async function getExecutionHistory(): Promise<ExecutionRecord[]> {
  const data = await chrome.storage.local.get('execution_history');
  return (data.execution_history as ExecutionRecord[] | undefined) ?? [];
}

export async function addExecutionRecord(record: ExecutionRecord) {
  const history = await getExecutionHistory();
  history.push(record);
  while (history.length > 20) {
    history.shift();
  }
  await chrome.storage.local.set({ execution_history: history });
}
