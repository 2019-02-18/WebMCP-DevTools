# Privacy Policy — WebMCP DevTools

**Last updated:** March 27, 2026

## Summary

WebMCP DevTools is a browser developer tool extension. It does **not** collect, store, transmit, or share any personal data.

## Data Collection

This extension does **not** collect any personal information, browsing history, or user data.

## Permissions Explained

| Permission | Why it's needed |
|---|---|
| `activeTab` | To communicate with the active tab and detect WebMCP tools registered on the page |
| `sidePanel` | To display the developer tool UI in Chrome's Side Panel |
| `scripting` | To inject content scripts that detect `navigator.modelContext` tools on web pages |
| `storage` | To save user preferences (theme, language) and tool snapshots locally in the browser |
| `<all_urls>` | To detect WebMCP tools on any webpage the user visits |

## Data Storage

All data (settings, snapshots, execution history) is stored **locally** in the browser using `chrome.storage.local`. No data is transmitted to any external server.

## Third-Party Services

This extension does **not** use any third-party analytics, tracking, or advertising services.

## Changes

If this privacy policy changes, the updated version will be posted here.

## Contact

If you have questions about this privacy policy, please open an issue on the GitHub repository.
