import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ExtensionBridge } from './bridge.js';

export async function startMcpServer(port: number) {
  const bridge = new ExtensionBridge(port);
  await bridge.start();

  const server = new McpServer({
    name: 'webmcp-devtools',
    version: '1.0.0',
  });

  server.tool(
    'webmcp_list_tools',
    'List all WebMCP tools available in the browser. Returns tools from all open tabs that have WebMCP tools registered.',
    {},
    async () => {
      const tools = bridge.getTools();
      if (tools.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: bridge.isConnected()
              ? 'No WebMCP tools found. Make sure you have pages with WebMCP tools open in the browser.'
              : 'Browser extension not connected. Please click the Bridge button in the WebMCP DevTools side panel to connect.',
          }],
        };
      }
      const connectionNote = bridge.isConnected() ? '' : '\n\n⚠️ Note: Extension is currently disconnected. Tools shown are from last known state. Reconnect the Bridge in the extension to execute tools.\n';

      const grouped = new Map<string, typeof tools>();
      for (const tool of tools) {
        const key = tool.tabTitle || `Tab ${tool.tabId}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(tool);
      }

      let output = `Found ${tools.length} WebMCP tool(s) across ${grouped.size} tab(s):\n\n`;
      for (const [tab, tabTools] of grouped) {
        const tabId = tabTools[0]?.tabId;
        output += `## ${tab} (tab_id: ${tabId})\n`;
        for (const t of tabTools) {
          output += `- **${t.name}**: ${t.description || 'No description'}`;
          if (t.source === 'declarative') output += ' [declarative]';
          if (t.annotations?.readOnlyHint) output += ' [read-only]';
          output += '\n';
          if (t.inputSchema) {
            const schema = typeof t.inputSchema === 'string' ? JSON.parse(t.inputSchema) : t.inputSchema;
            if (schema.properties) {
              for (const [key, prop] of Object.entries(schema.properties as Record<string, any>)) {
                const req = schema.required?.includes(key) ? ' (required)' : '';
                output += `  - \`${key}\`: ${prop.type || 'any'}${req}${prop.description ? ' — ' + prop.description : ''}\n`;
              }
            }
          }
        }
        output += '\n';
      }
      return { content: [{ type: 'text' as const, text: output + connectionNote }] };
    },
  );

  server.tool(
    'webmcp_call_tool',
    'Execute a WebMCP tool by name. First use webmcp_list_tools to discover available tools and their parameters.',
    {
      tool_name: z.string().describe('The name of the WebMCP tool to execute'),
      arguments: z.string().describe('JSON string of arguments to pass to the tool'),
    },
    async ({ tool_name, arguments: argsStr }) => {
      if (!bridge.isConnected()) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Browser extension not connected. Please click the Bridge button in the WebMCP DevTools side panel.',
          }],
          isError: true,
        };
      }

      let args: Record<string, unknown>;
      try {
        args = JSON.parse(argsStr);
      } catch {
        return {
          content: [{ type: 'text' as const, text: `Invalid JSON arguments: ${argsStr}` }],
          isError: true,
        };
      }

      const tools = bridge.getTools();
      const tool = tools.find((t) => t.name === tool_name);
      if (!tool) {
        return {
          content: [{
            type: 'text' as const,
            text: `Tool "${tool_name}" not found. Use webmcp_list_tools to see available tools.`,
          }],
          isError: true,
        };
      }

      try {
        const result = await bridge.executeTool(tool_name, args, tool.tabId);
        return {
          content: [{
            type: 'text' as const,
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Execution error: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'webmcp_scan_page',
    'Scan a browser page to discover injectable elements (forms, buttons, API endpoints) that can become WebMCP tools. Use webmcp_list_tools to find tab_id values. If tab_id is omitted, scans the active tab.',
    {
      tab_id: z.number().optional().describe('Target tab ID (from webmcp_list_tools). Omit to scan active tab.'),
    },
    async ({ tab_id }) => {
      if (!bridge.isConnected()) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Browser extension not connected. Please click the Bridge button in the WebMCP DevTools side panel.',
          }],
          isError: true,
        };
      }

      try {
        const result = await bridge.scanPage(tab_id);
        const elements = result?.elements ?? [];
        if (elements.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: 'No injectable elements found on the current page. The page may not have forms, buttons, or API calls that can be converted to WebMCP tools.',
            }],
          };
        }

        let output = `Found ${elements.length} injectable element(s):\n\n`;
        for (const el of elements) {
          const status = el.alreadyRegistered ? ' [already registered]' : '';
          output += `### ${el.suggestedName}${status}\n`;
          output += `- **Type**: ${el.type}\n`;
          output += `- **Description**: ${el.suggestedDescription}\n`;
          if (el.selector) output += `- **Selector**: \`${el.selector}\`\n`;
          if (el.inferredSchema?.properties) {
            output += `- **Fields**:\n`;
            const props = el.inferredSchema.properties as Record<string, any>;
            for (const [key, prop] of Object.entries(props)) {
              const req = (el.inferredSchema.required as string[])?.includes(key) ? ' (required)' : '';
              output += `  - \`${key}\`: ${prop.type}${req}${prop.description ? ' — ' + prop.description : ''}\n`;
            }
          }
          if (el.metadata) {
            const meta = el.metadata as Record<string, any>;
            if (meta.method) output += `- **Method**: ${meta.method}\n`;
            if (meta.url) output += `- **URL**: ${meta.url}\n`;
          }
          output += '\n';
        }
        output += '\nUse `webmcp_create_tool` to inject any of these as a WebMCP tool.';
        return { content: [{ type: 'text' as const, text: output }] };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Scan error: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'webmcp_create_tool',
    'Create and inject a new WebMCP tool into the active browser page. The tool will be registered via navigator.modelContext.registerTool() and become callable by AI agents. Use webmcp_scan_page first to discover injectable elements.',
    {
      name: z.string().describe('Tool name (snake_case recommended)'),
      description: z.string().describe('Human-readable description of what the tool does'),
      input_schema: z.string().describe('JSON string of the input schema (JSON Schema format)'),
      execute_type: z.enum(['form-submit', 'click', 'navigate', 'fetch', 'custom']).describe('How the tool should execute: form-submit (fill and submit a form), click (click an element), navigate (go to URL), fetch (make HTTP request), custom (no auto-execute)'),
      selector: z.string().optional().describe('CSS selector for the target element (required for form-submit and click)'),
      url: z.string().optional().describe('URL for navigate or fetch execute types'),
      method: z.string().optional().describe('HTTP method for fetch execute type (GET, POST, etc.)'),
      tab_id: z.number().optional().describe('Target tab ID (from webmcp_list_tools). Omit to use active tab.'),
    },
    async ({ name, description, input_schema, execute_type, selector, url, method, tab_id }) => {
      if (!bridge.isConnected()) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Browser extension not connected. Please click the Bridge button in the WebMCP DevTools side panel.',
          }],
          isError: true,
        };
      }

      let inputSchema: Record<string, unknown>;
      try {
        inputSchema = JSON.parse(input_schema);
      } catch {
        return {
          content: [{ type: 'text' as const, text: `Invalid input_schema JSON: ${input_schema}` }],
          isError: true,
        };
      }

      const toolDef = {
        name,
        description,
        inputSchema,
        executeType: execute_type,
        executeConfig: {
          ...(selector ? { selector } : {}),
          ...(url ? { url } : {}),
          ...(method ? { method } : {}),
        },
      };

      try {
        const result = await bridge.createTool(toolDef, tab_id);
        if (result?.success) {
          return {
            content: [{
              type: 'text' as const,
              text: `Tool "${name}" successfully created and injected! It is now registered as a WebMCP tool and can be called via webmcp_call_tool.`,
            }],
          };
        }
        return {
          content: [{
            type: 'text' as const,
            text: `Failed to inject tool: ${result?.error || 'Unknown error'}`,
          }],
          isError: true,
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Creation error: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  // ===== Site Profile Tools =====

  server.tool(
    'webmcp_list_profiles',
    'List all saved site profiles. Site profiles contain tool definitions that are auto-injected when visiting matching domains.',
    {},
    async () => {
      if (!bridge.isConnected()) {
        return {
          content: [{ type: 'text' as const, text: 'Browser extension not connected.' }],
          isError: true,
        };
      }

      try {
        const result = await bridge.listProfiles();
        const profiles = result?.profiles ?? [];
        if (profiles.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No site profiles saved. Use webmcp_save_profile to create one.' }],
          };
        }

        let output = `Found ${profiles.length} site profile(s):\n\n`;
        for (const p of profiles) {
          output += `### ${p.name}\n`;
          output += `- **Domain**: ${p.domain}\n`;
          if (p.urlPattern) output += `- **URL Pattern**: \`${p.urlPattern}\`\n`;
          output += `- **Auto-inject**: ${p.autoInject ? 'Yes' : 'No'}\n`;
          output += `- **Tools**: ${p.tools.length} tool(s)\n`;
          for (const tool of p.tools) {
            output += `  - \`${tool.name}\`: ${tool.description || 'No description'} (${tool.executeType})\n`;
          }
          output += `- **Updated**: ${new Date(p.updatedAt).toISOString()}\n\n`;
        }
        return { content: [{ type: 'text' as const, text: output }] };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'webmcp_save_profile',
    'Save a site profile that will auto-inject WebMCP tools when visiting a matching domain. Use webmcp_scan_page first to discover elements, then save the tool definitions for future visits.',
    {
      domain: z.string().describe('Domain to match (e.g. "example.com")'),
      name: z.string().describe('Human-readable profile name'),
      tools: z.string().describe('JSON string array of tool definitions. Each tool: {name, description, inputSchema, executeType, executeConfig}'),
      url_pattern: z.string().optional().describe('Optional regex pattern to match URLs more specifically'),
      auto_inject: z.boolean().optional().describe('Whether to auto-inject on page load (default: true)'),
    },
    async ({ domain, name, tools: toolsStr, url_pattern, auto_inject }) => {
      if (!bridge.isConnected()) {
        return {
          content: [{ type: 'text' as const, text: 'Browser extension not connected.' }],
          isError: true,
        };
      }

      let tools: any[];
      try {
        tools = JSON.parse(toolsStr);
        if (!Array.isArray(tools)) throw new Error('tools must be an array');
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Invalid tools JSON: ${err.message}` }],
          isError: true,
        };
      }

      const profile = {
        id: crypto.randomUUID(),
        domain,
        urlPattern: url_pattern,
        name,
        tools,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        autoInject: auto_inject ?? true,
      };

      try {
        const result = await bridge.saveProfile(profile);
        if (result?.ok) {
          return {
            content: [{
              type: 'text' as const,
              text: `Profile "${name}" saved for domain "${domain}" with ${tools.length} tool(s). Auto-inject: ${profile.autoInject ? 'enabled' : 'disabled'}.`,
            }],
          };
        }
        return {
          content: [{ type: 'text' as const, text: `Failed to save profile: ${result?.error || 'Unknown error'}` }],
          isError: true,
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  // ===== MCP Resources =====

  function listTabResources() {
    const tools = bridge.getTools();
    const tabIds = new Set(tools.map((t) => t.tabId));
    const resources = [];
    for (const tabId of tabIds) {
      const tabTitle = tools.find((t) => t.tabId === tabId)?.tabTitle || `Tab ${tabId}`;
      for (const type of ['page', 'content', 'tables', 'forms', 'links', 'selection']) {
        resources.push({
          uri: `webmcp://tab/${tabId}/${type}`,
          name: `${tabTitle} - ${type}`,
        });
      }
    }
    return { resources };
  }

  async function readResourceFromBridge(contentType: string, tabId: number) {
    if (!bridge.isConnected()) {
      throw new Error('Browser extension not connected');
    }
    const resp = await bridge.readResource(contentType, tabId);
    if (resp?.error) throw new Error(resp.error);
    return resp?.result ?? resp;
  }

  server.resource(
    'tab-page',
    new ResourceTemplate('webmcp://tab/{tabId}/page', { list: async () => listTabResources() }),
    { description: 'Page metadata (title, URL, meta tags, Open Graph)' },
    async (uri, { tabId }) => {
      const result = await readResourceFromBridge('page', Number(tabId));
      return { contents: [{ uri: uri.href, text: JSON.stringify(result, null, 2), mimeType: 'application/json' }] };
    },
  );

  server.resource(
    'tab-content',
    new ResourceTemplate('webmcp://tab/{tabId}/content', { list: undefined }),
    { description: 'Visible text content of a browser tab (body text, excluding scripts and styles)' },
    async (uri, { tabId }) => {
      const result = await readResourceFromBridge('content', Number(tabId));
      return { contents: [{ uri: uri.href, text: typeof result === 'string' ? result : JSON.stringify(result) }] };
    },
  );

  server.resource(
    'tab-tables',
    new ResourceTemplate('webmcp://tab/{tabId}/tables', { list: undefined }),
    { description: 'All HTML tables on the page, parsed into structured JSON with headers and rows' },
    async (uri, { tabId }) => {
      const result = await readResourceFromBridge('tables', Number(tabId));
      return { contents: [{ uri: uri.href, text: JSON.stringify(result, null, 2), mimeType: 'application/json' }] };
    },
  );

  server.resource(
    'tab-forms',
    new ResourceTemplate('webmcp://tab/{tabId}/forms', { list: undefined }),
    { description: 'All forms on the page with their current field values' },
    async (uri, { tabId }) => {
      const result = await readResourceFromBridge('forms', Number(tabId));
      return { contents: [{ uri: uri.href, text: JSON.stringify(result, null, 2), mimeType: 'application/json' }] };
    },
  );

  server.resource(
    'tab-links',
    new ResourceTemplate('webmcp://tab/{tabId}/links', { list: undefined }),
    { description: 'Navigation links on the page with text and URLs' },
    async (uri, { tabId }) => {
      const result = await readResourceFromBridge('links', Number(tabId));
      return { contents: [{ uri: uri.href, text: JSON.stringify(result, null, 2), mimeType: 'application/json' }] };
    },
  );

  server.resource(
    'tab-selection',
    new ResourceTemplate('webmcp://tab/{tabId}/selection', { list: undefined }),
    { description: 'Currently selected text on the page' },
    async (uri, { tabId }) => {
      const result = await readResourceFromBridge('selection', Number(tabId));
      return { contents: [{ uri: uri.href, text: typeof result === 'string' ? result : JSON.stringify(result) }] };
    },
  );

  // ===== MCP Prompts =====

  function buildToolsSummary(tools: ReturnType<typeof bridge.getTools>) {
    if (tools.length === 0) return 'No WebMCP tools are currently available.';
    let summary = '';
    for (const t of tools) {
      summary += `- **${t.name}**: ${t.description || 'No description'}`;
      if (t.annotations?.readOnlyHint) summary += ' [read-only]';
      summary += '\n';
    }
    return summary;
  }

  server.prompt(
    'page-context',
    'Get comprehensive context about the current browser page including metadata, available tools, and resources. Use this prompt to understand what the page is about and what you can do with it.',
    { tab_id: z.string().optional().describe('Tab ID to get context for. Omit for the first available tab.') },
    async ({ tab_id }) => {
      const tools = bridge.getTools();
      const tabId = tab_id ? Number(tab_id) : tools[0]?.tabId;

      let pageInfo: any = {};
      if (tabId && bridge.isConnected()) {
        try { pageInfo = await readResourceFromBridge('page', tabId); } catch {}
      }

      const tabTitle = tools.find((t) => t.tabId === tabId)?.tabTitle || 'Unknown';
      const toolsSummary = buildToolsSummary(tools.filter((t) => !tabId || t.tabId === tabId));

      const text = [
        `# Page Context: ${pageInfo.title || tabTitle}`,
        '',
        `**URL:** ${pageInfo.url || 'N/A'}`,
        pageInfo.description ? `**Description:** ${pageInfo.description}` : '',
        pageInfo.lang ? `**Language:** ${pageInfo.lang}` : '',
        '',
        '## Available WebMCP Tools',
        toolsSummary,
        '',
        '## Available Resources',
        tabId ? `You can read page content using these resource URIs:` : 'No tab available.',
        tabId ? `- \`webmcp://tab/${tabId}/content\` - Full visible text` : '',
        tabId ? `- \`webmcp://tab/${tabId}/tables\` - Structured table data` : '',
        tabId ? `- \`webmcp://tab/${tabId}/forms\` - Form fields and current values` : '',
        tabId ? `- \`webmcp://tab/${tabId}/links\` - Navigation links` : '',
        tabId ? `- \`webmcp://tab/${tabId}/selection\` - User-selected text` : '',
      ].filter(Boolean).join('\n');

      return {
        messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }],
      };
    },
  );

  server.prompt(
    'operate-page',
    'Get guidance on how to operate the current browser page using available WebMCP tools. Includes page context, tool descriptions, and recommended workflows.',
    {
      tab_id: z.string().optional().describe('Tab ID. Omit for first available tab.'),
      goal: z.string().optional().describe('What you want to accomplish on this page'),
    },
    async ({ tab_id, goal }) => {
      const tools = bridge.getTools();
      const tabId = tab_id ? Number(tab_id) : tools[0]?.tabId;
      const tabTools = tools.filter((t) => !tabId || t.tabId === tabId);

      let pageInfo: any = {};
      if (tabId && bridge.isConnected()) {
        try { pageInfo = await readResourceFromBridge('page', tabId); } catch {}
      }

      let toolDetails = '';
      for (const t of tabTools) {
        toolDetails += `### ${t.name}\n${t.description || 'No description'}\n`;
        if (t.inputSchema) {
          const schema = typeof t.inputSchema === 'string' ? JSON.parse(t.inputSchema) : t.inputSchema;
          if (schema.properties) {
            toolDetails += 'Parameters:\n';
            for (const [key, prop] of Object.entries(schema.properties as Record<string, any>)) {
              const req = schema.required?.includes(key) ? ' (required)' : '';
              toolDetails += `- \`${key}\`: ${prop.type || 'any'}${req}${prop.description ? ' — ' + prop.description : ''}\n`;
            }
          }
        }
        toolDetails += '\n';
      }

      const text = [
        `# Operate Page: ${pageInfo.title || 'Browser Page'}`,
        '',
        `**URL:** ${pageInfo.url || 'N/A'}`,
        goal ? `**Goal:** ${goal}` : '',
        '',
        '## Available Tools',
        toolDetails || 'No tools available on this page.',
        '',
        '## How to Use',
        '1. Use `webmcp_call_tool` to execute any tool listed above',
        '2. Arguments must be passed as a JSON string',
        '3. Use `webmcp_list_tools` to refresh the tools list if the page changes',
        tabId ? `4. Read page content with resource URI \`webmcp://tab/${tabId}/content\`` : '',
        '',
        goal ? `Please help accomplish the goal: "${goal}"` : 'What would you like to do on this page?',
      ].filter(Boolean).join('\n');

      return {
        messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }],
      };
    },
  );

  server.prompt(
    'extract-data',
    'Guide for extracting structured data from the current browser page. Lists available data sources (text, tables, forms, links) and how to access them.',
    { tab_id: z.string().optional().describe('Tab ID. Omit for first available tab.') },
    async ({ tab_id }) => {
      const tools = bridge.getTools();
      const tabId = tab_id ? Number(tab_id) : tools[0]?.tabId;

      let pageInfo: any = {};
      if (tabId && bridge.isConnected()) {
        try { pageInfo = await readResourceFromBridge('page', tabId); } catch {}
      }

      const text = [
        `# Extract Data from: ${pageInfo.title || 'Browser Page'}`,
        '',
        `**URL:** ${pageInfo.url || 'N/A'}`,
        '',
        '## Available Data Sources',
        '',
        tabId ? '### Page Content (visible text)' : '',
        tabId ? `Resource: \`webmcp://tab/${tabId}/content\`` : '',
        tabId ? 'Returns all visible text on the page, useful for understanding page context.\n' : '',
        tabId ? '### Tables (structured data)' : '',
        tabId ? `Resource: \`webmcp://tab/${tabId}/tables\`` : '',
        tabId ? 'Returns all HTML tables parsed into JSON with headers and rows. Best for extracting tabular data.\n' : '',
        tabId ? '### Forms (field values)' : '',
        tabId ? `Resource: \`webmcp://tab/${tabId}/forms\`` : '',
        tabId ? 'Returns all forms with their current field values. Useful for reading form state.\n' : '',
        tabId ? '### Links (navigation)' : '',
        tabId ? `Resource: \`webmcp://tab/${tabId}/links\`` : '',
        tabId ? 'Returns all links on the page with text and URLs.\n' : '',
        tabId ? '### Selection (user-selected text)' : '',
        tabId ? `Resource: \`webmcp://tab/${tabId}/selection\`` : '',
        tabId ? 'Returns text currently selected by the user.\n' : '',
        !tabId ? 'No tab available. Connect the Bridge and open a page with WebMCP tools.' : '',
        '',
        '## Usage',
        'Use the FetchMcpResource tool with server "user-webmcp" and the resource URI above to read the data.',
      ].filter(Boolean).join('\n');

      return {
        messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }],
      };
    },
  );

  bridge.on('connected', () => {
    console.error('[MCP] Extension connected, tools will be available via webmcp_list_tools');
  });

  bridge.on('disconnected', () => {
    console.error('[MCP] Extension disconnected');
  });

  bridge.on('toolsUpdated', () => {
    console.error(`[MCP] Tools updated: ${bridge.getTools().length} tools available`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP] Server started on stdio transport');
  console.error(`[MCP] Waiting for WebMCP DevTools extension to connect on ws://127.0.0.1:${bridge.actualPort}`);

  function cleanup() {
    console.error('[MCP] Shutting down, closing WebSocket server...');
    bridge.stop();
    process.exit(0);
  }

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', () => bridge.stop());

  process.stdin.on('close', () => {
    console.error('[MCP] stdin closed, shutting down...');
    bridge.stop();
    process.exit(0);
  });
}
