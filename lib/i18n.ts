export type Locale = 'en' | 'zh';

type TranslationDict = Record<string, string>;

const en: TranslationDict = {
  // Header
  'header.title': 'WebMCP DevTools',

  // Tabs
  'tab.tools': 'Tools',
  'tab.execute': 'Execute',
  'tab.timeline': 'Timeline',
  'tab.snapshots': 'Snapshots',

  // Tools panel
  'tools.search_placeholder': 'Search tools...',
  'tools.empty_title': 'No WebMCP tools detected on this page.',
  'tools.empty_hint': 'Make sure <code>chrome://flags/#enable-webmcp-testing</code> is enabled.',
  'tools.no_match': 'No tools match your search.',
  'tools.refreshed': 'Tools refreshed',
  'tools.readonly': 'Read-only',
  'tools.declarative': 'Declarative',
  'tools.view_current': 'Current Tab',
  'tools.view_all': 'All Tabs',
  'tools.no_tabs': 'No tools found across open tabs.',
  'tools.count': '{count} tool(s)',
  'tools.count_one': '1 tool',
  'tools.count_zero': '0 tools',

  // Execute panel
  'execute.empty_title': 'Select a tool from the Tools tab to execute it.',
  'execute.phase_hint': 'Tool execution form will be implemented in Phase 3.',
  'execute.run': 'Execute',
  'execute.result': 'Result',
  'execute.duration': 'Duration',
  'execute.raw_json': 'Raw JSON',
  'execute.form_mode': 'Form',

  // Form
  'form.required_error': '{field} is required',
  'form.select_placeholder': '-- Select --',

  // Timeline panel
  'timeline.clear': 'Clear',
  'timeline.empty_title': 'No events recorded yet.',
  'timeline.empty_hint': 'Events will appear here as tools are registered or unregistered.',
  'timeline.register': 'register',
  'timeline.unregister': 'unregister',
  'timeline.toolchange': 'toolchange',

  // Snapshots panel
  'snapshots.empty_title': 'No snapshots saved yet.',
  'snapshots.empty_hint': 'Save snapshots to compare tool definitions over time.',
  'snapshots.save': 'Save Snapshot',
  'snapshots.delete': 'Delete',
  'snapshots.compare': 'Compare',

  // Status bar
  'status.connected': '● Connected',
  'status.disconnected': '● Disconnected',
  'status.api_unavailable': '● WebMCP API not available',

  // Export
  'export.json': 'Copy as JSON',
  'export.markdown': 'Copy as Markdown',
  'export.postman': 'Export Postman Collection',
  'export.script': 'Copy as Script',
  'export.typescript': 'Copy as TypeScript',
  'export.title': 'Export',
  'export.copied': 'Copied!',

  // Diff
  'diff.added': 'Added',
  'diff.removed': 'Removed',
  'diff.modified': 'Modified',
  'diff.no_changes': 'No changes detected.',
  'diff.summary': '+{added} added, -{removed} removed, ~{modified} modified',
  'diff.select_snapshots': 'Select two snapshots to compare.',
  'diff.compare_with_current': 'Compare with Current',

  // Snapshots (extended)
  'snapshots.name_placeholder': 'Snapshot name...',
  'snapshots.tools_count': '{count} tools',
  'snapshots.confirm_delete': 'Delete this snapshot?',
  'snapshots.saved': 'Snapshot saved!',

  // Timeline (extended)
  'timeline.show_data': 'Show data',
  'timeline.hide_data': 'Hide data',

  // Execution History
  'history.title': 'History',
  'history.empty_title': 'No execution history.',
  'history.empty_hint': 'Execute a tool to see results here.',
  'history.clear': 'Clear History',
  'history.success': 'Success',
  'history.failure': 'Failed',
  'history.input': 'Input',
  'history.output': 'Output',
  'history.stats_total': 'Total',
  'history.stats_rate': 'Success Rate',
  'history.stats_avg': 'Avg Duration',

  // Theme
  'theme.system': 'System',
  'theme.light': 'Light',
  'theme.dark': 'Dark',

  // Error messages
  'error.restricted_page': 'WebMCP is not available on this page.',
  'error.injection_failed': 'Failed to inject content scripts.',

  // AI
  'tab.ai': 'AI',
  'ai.provider': 'Provider',
  'ai.api_key': 'API Key',
  'ai.model': 'Model',
  'ai.endpoint': 'Endpoint',
  'ai.save': 'Save',
  'ai.test': 'Test Connection',
  'ai.test_success': 'Connection successful!',
  'ai.test_fail': 'Connection failed.',
  'ai.placeholder': 'Ask AI about the tools...',
  'ai.send': 'Send',
  'ai.no_key': 'Please configure an API key first.',
  'ai.tool_call': 'Calling tool: {name}',
  'ai.thinking': 'Thinking...',
  'ai.saved': 'Settings saved!',
  'ai.new_conversation': 'New Chat',
  'ai.no_history': 'No chat history yet',
  'ai.tool_limit': 'Reached maximum tool call limit. Please try rephrasing your request.',

  // Bridge
  'bridge.connect': 'Connect to MCP Bridge Server',
  'bridge.disconnect': 'Disconnect from MCP Bridge Server',
  'bridge.connected': 'Bridge connected',
  'bridge.disconnected': 'Bridge disconnected',

  // Generator
  'tab.generator': 'Gen',
  'generator.title': 'Tool Generator',
  'generator.scan': 'Scan Page',
  'generator.scanning': 'Scanning...',
  'generator.empty_title': 'Scan the page to discover injectable elements.',
  'generator.empty_hint': 'Click "Scan Page" to find forms, buttons, and API endpoints that can become WebMCP tools.',
  'generator.inject': 'Inject',
  'generator.inject_all': 'Inject All',
  'generator.injected': 'Tool "{name}" injected!',
  'generator.inject_failed': 'Injection failed: {error}',
  'generator.form': 'Form',
  'generator.button': 'Button',
  'generator.link': 'Link',
  'generator.api': 'API',
  'generator.fields': '{count} fields',
  'generator.edit': 'Edit',
  'generator.preview': 'Preview',
  'generator.already_registered': 'Already Registered',
  'generator.found': 'Found {count} injectable element(s)',

  // Profiles
  'generator.scan_tab': 'Scan',
  'generator.profiles_tab': 'Profiles',
  'generator.save_profile': 'Save Profile',
  'generator.import_profile': 'Import',
  'generator.export_profile': 'Export',
  'generator.no_profiles': 'No site profiles saved yet.',
  'generator.no_profiles_hint': 'Save injected tools as a site profile to auto-inject them on future visits.',
  'generator.profile_saved': 'Profile saved!',
  'generator.profile_deleted': 'Profile deleted.',
  'generator.profile_name': 'Profile name...',
  'generator.auto_inject': 'Auto-inject',
  'generator.tools_count': '{count} tool(s)',
  'generator.confirm_delete_profile': 'Delete this profile?',
  'generator.profile_imported': 'Profile imported!',
  'generator.import_error': 'Invalid profile file.',

  // Language
  'lang.switch': '中文',
  'lang.current': 'EN',
};

const zh: TranslationDict = {
  // Header
  'header.title': 'WebMCP 开发工具',

  // Tabs
  'tab.tools': '工具',
  'tab.execute': '执行',
  'tab.timeline': '时间线',
  'tab.snapshots': '快照',

  // Tools panel
  'tools.search_placeholder': '搜索工具...',
  'tools.empty_title': '当前页面未检测到任何 WebMCP 工具。',
  'tools.empty_hint': '请确认已启用 <code>chrome://flags/#enable-webmcp-testing</code>。',
  'tools.no_match': '没有匹配的工具。',
  'tools.refreshed': '工具已刷新',
  'tools.readonly': '只读',
  'tools.declarative': '声明式',
  'tools.view_current': '当前标签页',
  'tools.view_all': '全部标签页',
  'tools.no_tabs': '未在打开的标签页中发现任何工具。',
  'tools.count': '{count} 个工具',
  'tools.count_one': '1 个工具',
  'tools.count_zero': '0 个工具',

  // Execute panel
  'execute.empty_title': '请从"工具"标签页选择一个工具来执行。',
  'execute.phase_hint': '工具执行表单将在第 3 阶段实现。',
  'execute.run': '执行',
  'execute.result': '结果',
  'execute.duration': '耗时',
  'execute.raw_json': '原始 JSON',
  'execute.form_mode': '表单',

  // Form
  'form.required_error': '{field} 为必填项',
  'form.select_placeholder': '-- 请选择 --',

  // Timeline panel
  'timeline.clear': '清空',
  'timeline.empty_title': '暂无事件记录。',
  'timeline.empty_hint': '工具注册或注销时，事件将显示在这里。',
  'timeline.register': '注册',
  'timeline.unregister': '注销',
  'timeline.toolchange': '工具变更',

  // Snapshots panel
  'snapshots.empty_title': '暂无已保存的快照。',
  'snapshots.empty_hint': '保存快照以对比不同时间的工具定义变化。',
  'snapshots.save': '保存快照',
  'snapshots.delete': '删除',
  'snapshots.compare': '对比',

  // Status bar
  'status.connected': '● 已连接',
  'status.disconnected': '● 未连接',
  'status.api_unavailable': '● WebMCP API 不可用',

  // Export
  'export.json': '复制为 JSON',
  'export.markdown': '复制为 Markdown',
  'export.postman': '导出 Postman Collection',
  'export.script': '复制为脚本代码',
  'export.typescript': '复制为 TypeScript',
  'export.title': '导出',
  'export.copied': '已复制！',

  // Diff
  'diff.added': '新增',
  'diff.removed': '删除',
  'diff.modified': '修改',
  'diff.no_changes': '未检测到变化。',
  'diff.summary': '+{added} 新增, -{removed} 删除, ~{modified} 修改',
  'diff.select_snapshots': '请选择两个快照进行对比。',
  'diff.compare_with_current': '与当前对比',

  // Snapshots (extended)
  'snapshots.name_placeholder': '快照名称...',
  'snapshots.tools_count': '{count} 个工具',
  'snapshots.confirm_delete': '确定删除此快照？',
  'snapshots.saved': '快照已保存！',

  // Timeline (extended)
  'timeline.show_data': '查看数据',
  'timeline.hide_data': '隐藏数据',

  // Execution History
  'history.title': '历史记录',
  'history.empty_title': '暂无执行历史。',
  'history.empty_hint': '执行工具后，结果将显示在这里。',
  'history.clear': '清空历史',
  'history.success': '成功',
  'history.failure': '失败',
  'history.input': '输入',
  'history.output': '输出',
  'history.stats_total': '总计',
  'history.stats_rate': '成功率',
  'history.stats_avg': '平均耗时',

  // Theme
  'theme.system': '跟随系统',
  'theme.light': '浅色',
  'theme.dark': '深色',

  // Error messages
  'error.restricted_page': '此页面不支持 WebMCP。',
  'error.injection_failed': '内容脚本注入失败。',

  // AI
  'tab.ai': 'AI',
  'ai.provider': '服务商',
  'ai.api_key': 'API 密钥',
  'ai.model': '模型',
  'ai.endpoint': '接口地址',
  'ai.save': '保存',
  'ai.test': '测试连接',
  'ai.test_success': '连接成功！',
  'ai.test_fail': '连接失败。',
  'ai.placeholder': '向 AI 询问关于工具的问题...',
  'ai.send': '发送',
  'ai.no_key': '请先配置 API 密钥。',
  'ai.tool_call': '调用工具: {name}',
  'ai.thinking': '思考中...',
  'ai.saved': '设置已保存！',
  'ai.new_conversation': '新对话',
  'ai.no_history': '暂无对话历史',
  'ai.tool_limit': '已达到工具调用次数上限，请尝试重新描述您的需求。',

  // Bridge
  'bridge.connect': '连接 MCP Bridge 服务',
  'bridge.disconnect': '断开 MCP Bridge 服务',
  'bridge.connected': 'Bridge 已连接',
  'bridge.disconnected': 'Bridge 未连接',

  // Generator
  'tab.generator': '生成',
  'generator.title': '工具生成器',
  'generator.scan': '扫描页面',
  'generator.scanning': '扫描中...',
  'generator.empty_title': '扫描页面以发现可注入的元素。',
  'generator.empty_hint': '点击"扫描页面"查找可作为 WebMCP 工具的表单、按钮和 API 端点。',
  'generator.inject': '注入',
  'generator.inject_all': '全部注入',
  'generator.injected': '工具 "{name}" 已注入！',
  'generator.inject_failed': '注入失败：{error}',
  'generator.form': '表单',
  'generator.button': '按钮',
  'generator.link': '链接',
  'generator.api': 'API',
  'generator.fields': '{count} 个字段',
  'generator.edit': '编辑',
  'generator.preview': '预览',
  'generator.already_registered': '已注册',
  'generator.found': '发现 {count} 个可注入元素',

  // Profiles
  'generator.scan_tab': '扫描',
  'generator.profiles_tab': '站点档案',
  'generator.save_profile': '保存档案',
  'generator.import_profile': '导入',
  'generator.export_profile': '导出',
  'generator.no_profiles': '暂无已保存的站点档案。',
  'generator.no_profiles_hint': '将注入的工具保存为站点档案，下次访问时自动注入。',
  'generator.profile_saved': '档案已保存！',
  'generator.profile_deleted': '档案已删除。',
  'generator.profile_name': '档案名称...',
  'generator.auto_inject': '自动注入',
  'generator.tools_count': '{count} 个工具',
  'generator.confirm_delete_profile': '确定删除此档案？',
  'generator.profile_imported': '档案已导入！',
  'generator.import_error': '无效的档案文件。',

  // Language
  'lang.switch': 'EN',
  'lang.current': '中文',
};

const translations: Record<Locale, TranslationDict> = { en, zh };

let currentLocale: Locale = 'en';
const listeners: Array<(locale: Locale) => void> = [];

export function setLocale(locale: Locale) {
  currentLocale = locale;
  document.documentElement.setAttribute('lang', locale);
  updateDOMTranslations();
  listeners.forEach((fn) => fn(locale));
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(key: string, params?: Record<string, string | number>): string {
  let text = translations[currentLocale][key] ?? translations['en'][key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}

export function onLocaleChange(callback: (locale: Locale) => void) {
  listeners.push(callback);
}

export function updateDOMTranslations() {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n')!;
    el.innerHTML = t(key);
  });

  document.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder')!;
    (el as HTMLInputElement).placeholder = t(key);
  });

  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title')!;
    el.title = t(key);
  });
}

export function formatToolCount(count: number): string {
  if (count === 0) return t('tools.count_zero');
  if (count === 1) return t('tools.count_one');
  return t('tools.count', { count });
}
