export type ToolSource = 'imperative' | 'declarative';

export interface ToolInfo {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown> | string;
  annotations?: {
    readOnlyHint?: boolean;
  };
  source?: ToolSource;
}

export interface TimelineEvent {
  id: string;
  timestamp: number;
  type: 'register' | 'unregister' | 'toolchange';
  toolName: string;
  data?: ToolInfo;
}

export interface Snapshot {
  id: string;
  name: string;
  url: string;
  timestamp: number;
  tools: ToolInfo[];
}

export type ExecutionSource = 'manual' | 'ai-panel' | 'mcp-bridge';

export interface ExecutionRecord {
  id: string;
  toolName: string;
  input: any;
  output: any;
  duration: number;
  timestamp: number;
  success: boolean;
  source?: ExecutionSource;
}

export interface WebMCPDevToolsEvent {
  type: 'WEBMCP_DEVTOOLS_EVENT';
  event:
    | 'REGISTER_TOOL'
    | 'UNREGISTER_TOOL'
    | 'TOOL_CHANGE'
    | 'TOOLS_LIST'
    | 'API_NOT_AVAILABLE'
    | 'EXECUTE_RESULT';
  timestamp: number;
  data: any;
}

export interface ChromeMessage {
  action:
    | 'LIST_TOOLS'
    | 'EXECUTE_TOOL'
    | 'TOOL_EVENT'
    | 'GET_SNAPSHOTS'
    | 'SAVE_SNAPSHOT'
    | 'DELETE_SNAPSHOT';
  payload?: any;
}

export type ThemeSetting = 'system' | 'light' | 'dark';
export type Locale = 'en' | 'zh';

export interface Settings {
  theme: ThemeSetting;
  locale: Locale;
  exportFormat: 'json' | 'markdown' | 'postman';
}
