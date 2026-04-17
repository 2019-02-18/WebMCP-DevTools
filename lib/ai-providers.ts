export type AIProvider = 'gemini' | 'openai' | 'claude' | 'deepseek' | 'custom';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  endpoint?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCall?: { id: string; name: string; args: any };
  toolResult?: { id: string; name: string; result: any };
}

const DEFAULT_MODELS: Record<AIProvider, string> = {
  gemini: 'gemini-2.0-flash',
  openai: 'gpt-4o',
  claude: 'claude-sonnet-4-20250514',
  deepseek: 'deepseek-chat',
  custom: '',
};

const ENDPOINTS: Record<AIProvider, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  openai: 'https://api.openai.com/v1',
  claude: 'https://api.anthropic.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  custom: '',
};

export function getDefaultModel(provider: AIProvider): string {
  return DEFAULT_MODELS[provider];
}

export function getEndpoint(provider: AIProvider, custom?: string): string {
  if (provider === 'custom') return custom || '';
  return ENDPOINTS[provider];
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema?: any;
}

interface ToolCallResult {
  id: string;
  name: string;
  arguments: any;
}

let callIdCounter = 0;
function genCallId(): string {
  return `call_${Date.now()}_${++callIdCounter}`;
}

function buildOpenAIMessages(messages: ChatMessage[]): any[] {
  const result: any[] = [];
  for (const m of messages) {
    if (m.toolCall) {
      result.push({
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: m.toolCall.id,
          type: 'function',
          function: { name: m.toolCall.name, arguments: JSON.stringify(m.toolCall.args) },
        }],
      });
    } else if (m.toolResult) {
      result.push({
        role: 'tool',
        content: m.content,
        tool_call_id: m.toolResult.id,
      });
    } else {
      result.push({ role: m.role, content: m.content });
    }
  }
  return result;
}

function buildOpenAITools(tools: ToolDef[]): any[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: typeof t.inputSchema === 'string' ? JSON.parse(t.inputSchema) : (t.inputSchema ?? {}),
    },
  }));
}

function buildHeaders(config: AIConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.provider === 'claude') {
    headers['x-api-key'] = config.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  } else {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }
  return headers;
}

export async function chatWithAI(
  config: AIConfig,
  messages: ChatMessage[],
  tools?: ToolDef[],
): Promise<{ content: string; toolCalls?: ToolCallResult[] }> {
  if (config.provider === 'gemini') {
    return chatGemini(config, messages, tools);
  }
  return chatOpenAICompatible(config, messages, tools);
}

async function chatOpenAICompatible(
  config: AIConfig,
  messages: ChatMessage[],
  tools?: ToolDef[],
): Promise<{ content: string; toolCalls?: ToolCallResult[] }> {
  const url = `${getEndpoint(config.provider, config.endpoint)}/chat/completions`;

  const body: any = {
    model: config.model,
    messages: buildOpenAIMessages(messages),
    max_tokens: 4096,
  };

  if (tools && tools.length > 0) body.tools = buildOpenAITools(tools);

  const response = await fetch(url, { method: 'POST', headers: buildHeaders(config), body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`API Error ${response.status}: ${await response.text()}`);

  const data = await response.json();
  const msg = data.choices?.[0]?.message ?? {};

  const toolCalls = msg.tool_calls?.map((tc: any) => ({
    id: tc.id || genCallId(),
    name: tc.function?.name,
    arguments: typeof tc.function?.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function?.arguments,
  }));

  return { content: msg.content ?? '', toolCalls };
}

async function chatGemini(
  config: AIConfig,
  messages: ChatMessage[],
  tools?: ToolDef[],
): Promise<{ content: string; toolCalls?: ToolCallResult[] }> {
  const url = `${getEndpoint('gemini')}/models/${config.model}:generateContent?key=${config.apiKey}`;

  const contents = messages
    .filter((m) => m.role !== 'system' && !m.toolCall && !m.toolResult)
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const body: any = { contents };
  const systemMsg = messages.find((m) => m.role === 'system');
  if (systemMsg) body.systemInstruction = { parts: [{ text: systemMsg.content }] };

  if (tools && tools.length > 0) {
    body.tools = [{
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: typeof t.inputSchema === 'string' ? JSON.parse(t.inputSchema) : (t.inputSchema ?? {}),
      })),
    }];
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`Gemini API Error ${response.status}: ${await response.text()}`);

  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts ?? [];

  let content = '';
  const toolCalls: ToolCallResult[] = [];

  for (const part of parts) {
    if (part.text) content += part.text;
    if (part.functionCall) {
      toolCalls.push({ id: genCallId(), name: part.functionCall.name, arguments: part.functionCall.args ?? {} });
    }
  }

  return { content, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
}

export async function chatWithAIStream(
  config: AIConfig,
  messages: ChatMessage[],
  tools: ToolDef[],
  onChunk: (text: string) => void,
): Promise<{ content: string; toolCalls?: ToolCallResult[] }> {
  if (config.provider === 'gemini') {
    return chatGeminiStream(config, messages, tools, onChunk);
  }
  return chatOpenAICompatibleStream(config, messages, tools, onChunk);
}

async function chatOpenAICompatibleStream(
  config: AIConfig,
  messages: ChatMessage[],
  tools: ToolDef[],
  onChunk: (text: string) => void,
): Promise<{ content: string; toolCalls?: ToolCallResult[] }> {
  const url = `${getEndpoint(config.provider, config.endpoint)}/chat/completions`;

  const body: any = {
    model: config.model,
    messages: buildOpenAIMessages(messages),
    max_tokens: 4096,
    stream: true,
  };

  if (tools.length > 0) body.tools = buildOpenAITools(tools);

  const response = await fetch(url, { method: 'POST', headers: buildHeaders(config), body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`API Error ${response.status}: ${await response.text()}`);

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';
  const rawToolCalls: Array<{ id: string; name: string; arguments: string }> = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') break;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta;
        if (delta?.content) {
          fullContent += delta.content;
          onChunk(delta.content);
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!rawToolCalls[idx]) rawToolCalls[idx] = { id: tc.id || genCallId(), name: '', arguments: '' };
            if (tc.id) rawToolCalls[idx].id = tc.id;
            if (tc.function?.name) rawToolCalls[idx].name += tc.function.name;
            if (tc.function?.arguments) rawToolCalls[idx].arguments += tc.function.arguments;
          }
        }
      } catch {}
    }
  }

  const toolCalls: ToolCallResult[] = rawToolCalls
    .filter((tc) => tc.name)
    .map((tc) => ({
      id: tc.id,
      name: tc.name,
      arguments: (() => { try { return JSON.parse(tc.arguments); } catch { return {}; } })(),
    }));

  return { content: fullContent, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
}

async function chatGeminiStream(
  config: AIConfig,
  messages: ChatMessage[],
  tools: ToolDef[],
  onChunk: (text: string) => void,
): Promise<{ content: string; toolCalls?: ToolCallResult[] }> {
  const url = `${getEndpoint('gemini')}/models/${config.model}:streamGenerateContent?key=${config.apiKey}&alt=sse`;

  const contents = messages
    .filter((m) => m.role !== 'system' && !m.toolCall && !m.toolResult)
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const body: any = { contents };
  const systemMsg = messages.find((m) => m.role === 'system');
  if (systemMsg) body.systemInstruction = { parts: [{ text: systemMsg.content }] };

  if (tools.length > 0) {
    body.tools = [{
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: typeof t.inputSchema === 'string' ? JSON.parse(t.inputSchema) : (t.inputSchema ?? {}),
      })),
    }];
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`Gemini API Error ${response.status}: ${await response.text()}`);

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';
  const toolCalls: ToolCallResult[] = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      try {
        const parsed = JSON.parse(data);
        const parts = parsed.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          if (part.text) {
            fullContent += part.text;
            onChunk(part.text);
          }
          if (part.functionCall) {
            toolCalls.push({ id: genCallId(), name: part.functionCall.name, arguments: part.functionCall.args ?? {} });
          }
        }
      } catch {}
    }
  }

  return { content: fullContent, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
}

export async function testConnection(config: AIConfig): Promise<boolean> {
  try {
    const result = await chatWithAI(config, [{ role: 'user', content: 'Say "ok"' }]);
    return !!result.content;
  } catch {
    return false;
  }
}
