import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'WebMCP DevTools',
    description: 'A developer tool for inspecting, testing, and monitoring WebMCP tools registered via navigator.modelContext.',
    version: '1.0.0',
    permissions: ['sidePanel', 'activeTab', 'scripting', 'storage'],
    host_permissions: ['<all_urls>'],
    side_panel: {
      default_path: 'sidepanel.html',
    },
    action: {
      default_title: 'WebMCP DevTools',
      default_icon: {
        '16': 'icons/icon-16.png',
        '32': 'icons/icon-32.png',
        '48': 'icons/icon-48.png',
        '128': 'icons/icon-128.png',
      },
    },
    icons: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png',
    },
  },
});
