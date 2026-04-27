# webmcp-devtools-server

MCP Bridge Server for [WebMCP DevTools](https://github.com/2019-02-18/WebMCP-DevTools) — exposes browser WebMCP tools to AI clients (Cursor, Claude Desktop, etc.) via the [Model Context Protocol](https://modelcontextprotocol.io).

## How It Works

```
AI Client (Cursor/Claude) ←stdio→ MCP Server ←WebSocket→ Chrome Extension ←→ Browser Page
```

The server acts as a bridge between AI clients and browser-based WebMCP tools:

1. Connects to the WebMCP DevTools Chrome extension via WebSocket
2. Exposes browser tools through MCP meta-tools, Resources, and Prompts
3. AI clients can discover, execute, and read page content from any browser tab

## Setup

### With Cursor

Add to your Cursor MCP settings (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "webmcp-devtools": {
      "command": "npx",
      "args": ["-y", "webmcp-devtools-server@latest"]
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
      "args": ["-y", "webmcp-devtools-server@latest"]
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

Lists all WebMCP tools available in the browser, grouped by tab. Returns `tab_id` for targeting specific tabs.

### `webmcp_call_tool`

Executes a WebMCP tool by name.

| Parameter | Type | Description |
|-----------|------|-------------|
| `tool_name` | string | Name of the tool to execute |
| `arguments` | string | JSON string of arguments |

### `webmcp_scan_page`

Scans a browser page for interactive elements (forms, buttons, links, API calls) and returns discoverable tool definitions.

| Parameter | Type | Description |
|-----------|------|-------------|
| `tab_id` | number (optional) | Target tab ID (defaults to active tab) |

### `webmcp_create_tool`

Injects a tool definition into a browser page, making it callable via `webmcp_call_tool`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `tool_definition` | object | Tool definition with name, description, inputSchema, executionType |
| `tab_id` | number (optional) | Target tab ID (defaults to active tab) |

### `webmcp_save_profile`

Saves a set of tool definitions as a reusable site profile for automatic injection.

### `webmcp_list_profiles`

Lists all saved site profiles.

## MCP Resources

Dynamic resources for reading page content from any browser tab:

| Resource URI | Description |
|-------------|-------------|
| `webmcp://tab/{tabId}/page` | Page metadata (title, URL, meta tags, OpenGraph) |
| `webmcp://tab/{tabId}/content` | Visible text content of the page |
| `webmcp://tab/{tabId}/tables` | All HTML tables extracted as structured data |
| `webmcp://tab/{tabId}/forms` | Form elements with their current values and states |
| `webmcp://tab/{tabId}/links` | All links on the page with text and URLs |
| `webmcp://tab/{tabId}/selection` | Currently selected text in the browser |

## MCP Prompts

Contextual prompt templates for AI-assisted page interaction:

| Prompt | Description |
|--------|-------------|
| `page-context` | Builds a comprehensive context from page metadata, tools, and content |
| `operate-page` | Guides AI to perform a specific operation using available tools |
| `extract-data` | Guides AI to extract structured data from page content |

## Usage

1. Install the [WebMCP DevTools Chrome extension](https://github.com/2019-02-18/WebMCP-DevTools)
2. Open a page with WebMCP tools
3. Click the Bridge button in the extension's side panel
4. The AI client can now discover and call browser tools, read page content, and use prompts

## License

MIT
