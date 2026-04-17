import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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
        output += `## ${tab}\n`;
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
