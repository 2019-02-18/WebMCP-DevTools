#!/usr/bin/env node

import { startMcpServer } from './mcp-server.js';

const port = parseInt(process.env.WEBMCP_PORT ?? '3789', 10);

console.error('╔══════════════════════════════════════════════╗');
console.error('║       WebMCP DevTools — MCP Bridge Server    ║');
console.error('╚══════════════════════════════════════════════╝');
console.error('');

startMcpServer(port).catch((err) => {
  console.error('Failed to start MCP server:', err);
  process.exit(1);
});
