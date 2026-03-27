import type { ThemeSetting } from './types';

export function applyTheme(setting: ThemeSetting) {
  const root = document.documentElement;

  if (setting === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', setting);
  }
}

export function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function onSystemThemeChange(callback: (theme: 'light' | 'dark') => void) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', (e) => {
    callback(e.matches ? 'dark' : 'light');
  });
}
