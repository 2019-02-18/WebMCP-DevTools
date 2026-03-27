export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    updateBadge(activeInfo.tabId);
    notifyTabChanged(activeInfo.windowId);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.active) {
      notifyTabChanged(tab.windowId);
    }
  });

  function notifyTabChanged(windowId: number) {
    chrome.runtime.sendMessage({
      action: 'TAB_CHANGED',
      windowId,
    }).catch(() => {});
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'TOOL_EVENT') {
      const tabId = sender.tab?.id;
      if (tabId != null) {
        updateBadgeFromEvent(tabId, message.payload);
      }
      broadcastToSidePanel(message);
      return false;
    }

    if (message.action === 'LIST_TOOLS') {
      handleListTools(message.windowId, sendResponse);
      return true;
    }

    if (message.action === 'EXECUTE_TOOL') {
      forwardToContentScript(message, sendResponse);
      return true;
    }

    return false;
  });

  async function getActiveTabForWindow(windowId?: number): Promise<chrome.tabs.Tab | null> {
    const query: chrome.tabs.QueryInfo = { active: true };
    if (windowId != null) {
      query.windowId = windowId;
    } else {
      query.lastFocusedWindow = true;
    }
    const tabs = await chrome.tabs.query(query);
    return tabs[0] ?? null;
  }

  async function handleListTools(windowId: number | undefined, sendResponse: (response: any) => void) {
    try {
      const tab = await getActiveTabForWindow(windowId);
      if (!tab?.id) {
        sendResponse({ tools: [] });
        return;
      }

      try {
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'LIST_TOOLS',
        });
        sendResponse(response);
      } catch {
        await ensureContentScriptsInjected(tab.id);
        await new Promise((r) => setTimeout(r, 800));
        try {
          const response = await chrome.tabs.sendMessage(tab.id, {
            action: 'LIST_TOOLS',
          });
          sendResponse(response);
        } catch {
          sendResponse({ tools: [] });
        }
      }
    } catch {
      sendResponse({ tools: [] });
    }
  }

  async function ensureContentScriptsInjected(tabId: number) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content-scripts/injected.js'],
        world: 'MAIN' as any,
      });
    } catch {}

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content-scripts/content.js'],
      });
    } catch {}
  }

  async function forwardToContentScript(
    message: any,
    sendResponse: (response: any) => void,
  ) {
    try {
      const tab = await getActiveTabForWindow(message.windowId);
      if (tab?.id) {
        const response = await chrome.tabs.sendMessage(tab.id, message);
        sendResponse(response);
      } else {
        sendResponse({ error: 'No active tab', tools: [] });
      }
    } catch (e) {
      sendResponse({ error: String(e), tools: [] });
    }
  }

  function broadcastToSidePanel(message: any) {
    chrome.runtime.sendMessage(message).catch(() => {});
  }

  const toolCountMap = new Map<number, number>();

  function updateBadge(tabId: number) {
    const count = toolCountMap.get(tabId) ?? 0;
    chrome.action.setBadgeText({
      text: count > 0 ? String(count) : '',
      tabId,
    });
    chrome.action.setBadgeBackgroundColor({ color: '#2563EB', tabId });
  }

  function updateBadgeFromEvent(tabId: number, payload: any) {
    if (payload?.event === 'TOOLS_LIST' && Array.isArray(payload?.data)) {
      toolCountMap.set(tabId, payload.data.length);
      updateBadge(tabId);
    } else if (payload?.event === 'REGISTER_TOOL') {
      toolCountMap.set(tabId, (toolCountMap.get(tabId) ?? 0) + 1);
      updateBadge(tabId);
    } else if (payload?.event === 'UNREGISTER_TOOL') {
      const current = toolCountMap.get(tabId) ?? 0;
      toolCountMap.set(tabId, Math.max(0, current - 1));
      updateBadge(tabId);
    }
  }

  chrome.tabs.onRemoved.addListener((tabId) => {
    toolCountMap.delete(tabId);
  });
});
