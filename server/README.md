# webmcp-devtools-server

MCP Bridge Server for [WebMCP DevTools](https://github.com/2019-02-18/WebMCP-DevTools) — exposes browser WebMCP tools to AI clients (Cursor, Claude Desktop, etc.) via the [Model Context Protocol](https://modelcontextprotocol.io).

## How It Works

```
AI Client (Cursor/Claude) ←stdio→ MCP Server ←WebSocket→ Chrome Extension ←→ Browser Page
```

The server acts as a bridge between AI clients and browser-based WebMCP tools:

1. Connects to the WebMCP DevTools Chrome extension via WebSocket
2. Exposes browser tools through two MCP meta-tools
3. AI clients can discover and execute any WebMCP tool registered in the browser

## Setup

### With Cursor

Add to your Cursor MCP settings (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "webmcp-devtools": {
      "command": "npx",
      "args": ["-y", "webmcp-devtools-server"]
    }
  }
}
```

### With Claude Desktop

Add to Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "webmcp-devtools": {
      "command": "npx",
      "args": ["-y", "webmcp-devtools-server"]
    }
  }
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBMCP_PORT` | `3789` | WebSocket server port for extension connection |

## MCP Tools

### `webmcp_list_tools`

Lists all WebMCP tools available in the browser, grouped by tab.

### `webmcp_call_tool`

Executes a WebMCP tool by name.

| Parameter | Type | Description |
|-----------|------|-------------|
| `tool_name` | string | Name of the tool to execute |
| `arguments` | string | JSON string of arguments |

## Usage

1. Install the [WebMCP DevTools Chrome extension](https://github.com/2019-02-18/WebMCP-DevTools)
2. Open a page with WebMCP tools
3. Click the Bridge button in the extension's side panel
4. The AI client can now discover and call browser tools

## License

MIT
