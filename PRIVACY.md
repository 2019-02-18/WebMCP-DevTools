# Privacy Policy — WebMCP DevTools

**Last updated:** April 17, 2026

## Summary

WebMCP DevTools is a browser developer tool extension. It does **not** collect, store, transmit, or share any personal data with the extension developer or any third party.

## Data Collection

This extension does **not** collect any personal information, browsing history, or user data.

## Permissions Explained

| Permission | Why it's needed |
|---|---|
| `activeTab` | To communicate with the active tab and detect WebMCP tools registered on the page |
| `sidePanel` | To display the developer tool UI in Chrome's Side Panel |
| `scripting` | To inject content scripts that detect `navigator.modelContext` tools on web pages |
| `storage` | To save user preferences (theme, language), tool snapshots, execution history, and AI configuration locally in the browser |
| `alarms` | To maintain stable connections between the extension and the MCP Bridge server by sending periodic keepalive signals |
| `<all_urls>` | To detect WebMCP tools on any webpage the user visits |

## Data Storage

All data (settings, snapshots, execution history, AI configuration) is stored **locally** in the browser using `chrome.storage.local`. No data is transmitted to the extension developer or any third-party service.

## Network Communication

### AI Assistant (Optional)
The built-in AI assistant panel is entirely optional. If the user configures and uses it, chat messages are sent directly from the browser to the AI API endpoint configured by the user. The extension does not route, log, or store these messages on any intermediate server. The user has full control over which API endpoint is used.

### MCP Bridge (Optional)
The MCP Bridge feature allows the extension to connect to a locally running WebSocket server (localhost only) for bridging browser tools to local AI coding assistants. All communication is local (127.0.0.1) and does not traverse the internet.

## Third-Party Services

This extension does **not** use any third-party analytics, tracking, or advertising services. The optional AI assistant feature communicates only with the API endpoint explicitly configured by the user.

## Changes

If this privacy policy changes, the updated version will be posted here.

## Contact

If you have questions about this privacy policy, please open an issue on the [GitHub repository](https://github.com/2019-02-18/WebMCP-DevTools).
