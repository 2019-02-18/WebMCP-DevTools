export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  interface TabToolsEntry {
    tabId: number;
    title: string;
    url: string;
    tools: any[];
  }

  const tabToolsMap = new Map<number, TabToolsEntry>();

  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    updateBadge(activeInfo.tabId);
    notifyTabChanged(activeInfo.windowId);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.active) {
      notifyTabChanged(tab.windowId);
    }
    if (changeInfo.title || changeInfo.url) {
      const entry = tabToolsMap.get(tabId);
      if (entry) {
        if (changeInfo.title) entry.title = changeInfo.title;
        if (changeInfo.url) entry.url = changeInfo.url;
      }
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
        updateTabTools(tabId, sender.tab!, message.payload);
        updateBadgeFromEvent(tabId, message.payload);
      }
      broadcastToSidePanel(message);
      return false;
    }

    if (message.action === 'LIST_TOOLS') {
      handleListTools(message.windowId, sendResponse);
      return true;
    }

    if (message.action === 'LIST_ALL_TOOLS') {
      handleListAllTools(sendResponse);
      return true;
    }

    if (message.action === 'EXECUTE_TOOL') {
      const targetTabId = message.targetTabId;
      if (targetTabId != null) {
        forwardToTab(targetTabId, message, sendResponse);
      } else {
        forwardToContentScript(message, sendResponse);
      }
      return true;
    }

    return false;
  });

  function updateTabTools(tabId: number, tab: chrome.tabs.Tab, payload: any) {
    if (payload?.event === 'TOOLS_LIST' && Array.isArray(payload?.data)) {
      tabToolsMap.set(tabId, {
        tabId,
        title: tab.title || `Tab ${tabId}`,
        url: tab.url || '',
        tools: payload.data,
      });
      pushToolsToBridge();
    } else if (payload?.event === 'REGISTER_TOOL' && payload?.data) {
      const entry = tabToolsMap.get(tabId) ?? {
        tabId,
        title: tab.title || `Tab ${tabId}`,
        url: tab.url || '',
        tools: [],
      };
      const idx = entry.tools.findIndex((t: any) => t.name === payload.data.name);
      if (idx >= 0) entry.tools[idx] = payload.data;
      else entry.tools.push(payload.data);
      tabToolsMap.set(tabId, entry);
      pushToolsToBridge();
    } else if (payload?.event === 'UNREGISTER_TOOL' && payload?.data) {
      const entry = tabToolsMap.get(tabId);
      if (entry) {
        entry.tools = entry.tools.filter((t: any) => t.name !== payload.data.name);
        pushToolsToBridge();
      }
    }
  }

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
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'LIST_TOOLS' });
        sendResponse(response);
      } catch {
        await ensureContentScriptsInjected(tab.id);
        await new Promise((r) => setTimeout(r, 800));
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'LIST_TOOLS' });
          sendResponse(response);
        } catch {
          sendResponse({ tools: [] });
        }
      }
    } catch {
      sendResponse({ tools: [] });
    }
  }

  function handleListAllTools(sendResponse: (response: any) => void) {
    const result: Array<{ tabId: number; title: string; url: string; tools: any[] }> = [];
    for (const entry of tabToolsMap.values()) {
      if (entry.tools.length > 0) {
        result.push({ ...entry });
      }
    }
    sendResponse({ tabs: result });
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

  async function forwardToContentScript(message: any, sendResponse: (response: any) => void) {
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

  async function forwardToTab(tabId: number, message: any, sendResponse: (response: any) => void) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      sendResponse(response);
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
    tabToolsMap.delete(tabId);
    broadcastToSidePanel({
      action: 'TOOL_EVENT',
      payload: { event: 'TAB_REMOVED', data: { tabId } },
    });
    pushToolsToBridge();
  });

  // ===== MCP Bridge WebSocket =====
  const KEEPALIVE_ALARM = 'bridge-keepalive';
  let bridgeWs: WebSocket | null = null;
  let bridgeConnected = false;
  let bridgeAutoReconnect = false;
  let bridgeReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let userRequestedDisconnect = false;
  let bridgePort = 3789;

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === KEEPALIVE_ALARM) {
      if (bridgeWs && bridgeWs.readyState === WebSocket.OPEN) {
        bridgeWs.send(JSON.stringify({ type: 'PING' }));
      } else if (bridgeAutoReconnect && !userRequestedDisconnect) {
        connectBridge(bridgePort);
      }
    }
  });

  function startKeepalive() {
    chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.4 });
  }

  function stopKeepalive() {
    chrome.alarms.clear(KEEPALIVE_ALARM);
  }

  let verifyTimer: ReturnType<typeof setTimeout> | null = null;

  function connectBridge(port = 3789) {
    bridgePort = port;
    userRequestedDisconnect = false;
    if (bridgeReconnectTimer) { clearTimeout(bridgeReconnectTimer); bridgeReconnectTimer = null; }
    if (verifyTimer) { clearTimeout(verifyTimer); verifyTimer = null; }
    if (bridgeWs) { try { bridgeWs.close(); } catch {} bridgeWs = null; }

    let ws: WebSocket;
    try {
      ws = new WebSocket(`ws://127.0.0.1:${port}`);
    } catch {
      bridgeConnected = false;
      broadcastBridgeStatus();
      return;
    }
    bridgeWs = ws;
    let verified = false;

    ws.onopen = () => {
      if (bridgeWs !== ws) return;
      verifyTimer = setTimeout(() => {
        if (!verified && bridgeWs === ws) {
          try { ws.close(); } catch {}
          bridgeWs = null;
          bridgeConnected = false;
          broadcastBridgeStatus();
        }
      }, 5000);
    };

    ws.onmessage = (event) => {
      if (userRequestedDisconnect) return;
      try {
        const msg = JSON.parse(String(event.data));
        if (!verified) {
          if (msg.action || msg.type === 'HANDSHAKE_ACK') {
            verified = true;
            if (verifyTimer) { clearTimeout(verifyTimer); verifyTimer = null; }
            bridgeConnected = true;
            bridgeAutoReconnect = true;
            startKeepalive();
            broadcastBridgeStatus();
            refreshAllTabTools().then(() => pushToolsToBridge());
          }
        }
        handleBridgeMessage(msg);
      } catch {}
    };

    ws.onclose = () => {
      if (verifyTimer) { clearTimeout(verifyTimer); verifyTimer = null; }
      if (bridgeWs === ws) bridgeWs = null;
      verified = false;
      bridgeConnected = false;
      broadcastBridgeStatus();
      if (!userRequestedDisconnect && bridgeAutoReconnect) {
        bridgeReconnectTimer = setTimeout(() => connectBridge(port), 5000);
      }
    };

    ws.onerror = () => {};
  }

  function disconnectBridge() {
    userRequestedDisconnect = true;
    bridgeAutoReconnect = false;
    stopKeepalive();
    if (bridgeReconnectTimer) { clearTimeout(bridgeReconnectTimer); bridgeReconnectTimer = null; }
    if (verifyTimer) { clearTimeout(verifyTimer); verifyTimer = null; }
    const ws = bridgeWs;
    bridgeWs = null;
    bridgeConnected = false;
    broadcastBridgeStatus();
    if (ws) { try { ws.close(); } catch {} }
  }

  async function refreshAllTabTools() {
    try {
      const tabs = await chrome.tabs.query({});
      const requests = tabs
        .filter((tab) => tab.id != null)
        .map(async (tab) => {
          try {
            const response = await chrome.tabs.sendMessage(tab.id!, { action: 'LIST_TOOLS' });
            if (response?.tools?.length > 0) {
              tabToolsMap.set(tab.id!, {
                tabId: tab.id!,
                title: tab.title || `Tab ${tab.id}`,
                url: tab.url || '',
                tools: response.tools,
              });
            }
          } catch {}
        });
      await Promise.allSettled(requests);
    } catch {}
  }

  function pushToolsToBridge() {
    if (!bridgeWs || bridgeWs.readyState !== WebSocket.OPEN) return;

    const allTools: any[] = [];
    for (const entry of tabToolsMap.values()) {
      entry.tools.forEach((tool: any) => {
        allTools.push({
          ...tool,
          tabId: entry.tabId,
          tabTitle: entry.title,
        });
      });
    }

    bridgeWs.send(JSON.stringify({
      type: 'TOOLS_UPDATE',
      tools: allTools,
    }));
  }

  async function handleBridgeMessage(msg: any) {
    if (msg.type === 'PING') {
      if (bridgeWs?.readyState === WebSocket.OPEN) {
        bridgeWs.send(JSON.stringify({ type: 'PONG' }));
      }
      return;
    }

    if (msg.action === 'LIST_ALL_TOOLS') {
      await refreshAllTabTools();
      pushToolsToBridge();
      return;
    }

    if (msg.action === 'EXECUTE_TOOL') {
      const { id, name, args, tabId } = msg;
      const startTime = Date.now();
      const perfStart = performance.now();
      try {
        let targetTabId = tabId;
        if (targetTabId == null) {
          for (const entry of tabToolsMap.values()) {
            if (entry.tools.some((t: any) => t.name === name)) {
              targetTabId = entry.tabId;
              break;
            }
          }
        }
        if (targetTabId == null) {
          sendToBridge({ type: 'RESPONSE', id, error: `Tool "${name}" not found` });
          return;
        }
        const response = await chrome.tabs.sendMessage(targetTabId, {
          action: 'EXECUTE_TOOL',
          payload: { name, args },
        });
        const duration = performance.now() - perfStart;
        sendToBridge({ type: 'RESPONSE', id, result: response });
        await saveBridgeExecution(name, args, response, duration, startTime, !response?.error);
      } catch (e: any) {
        const duration = performance.now() - perfStart;
        sendToBridge({ type: 'RESPONSE', id, error: e?.message ?? String(e) });
        await saveBridgeExecution(name, args, { error: e?.message }, duration, startTime, false);
      }
    }
  }

  async function saveBridgeExecution(
    toolName: string, input: any, output: any,
    duration: number, timestamp: number, success: boolean,
  ) {
    try {
      const { execution_history = [] } = await chrome.storage.local.get('execution_history');
      const record = {
        id: crypto.randomUUID(),
        toolName, input, output, duration, timestamp, success,
        source: 'mcp-bridge',
      };
      execution_history.push(record);
      while (execution_history.length > 50) execution_history.shift();
      await chrome.storage.local.set({ execution_history });
      chrome.runtime.sendMessage({ action: 'HISTORY_UPDATED' }).catch(() => {});
    } catch {}
  }

  function sendToBridge(msg: any) {
    if (bridgeWs?.readyState === WebSocket.OPEN) {
      bridgeWs.send(JSON.stringify(msg));
    }
  }

  function broadcastBridgeStatus() {
    chrome.runtime.sendMessage({
      action: 'BRIDGE_STATUS',
      connected: bridgeConnected,
    }).catch(() => {});
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'BRIDGE_CONNECT') {
      connectBridge(message.port ?? 3789);
      sendResponse({ ok: true });
      return false;
    }
    if (message.action === 'BRIDGE_DISCONNECT') {
      disconnectBridge();
      sendResponse({ ok: true });
      return false;
    }
    if (message.action === 'BRIDGE_STATUS_REQUEST') {
      sendResponse({ connected: bridgeConnected });
      return false;
    }
    return false;
  });
});
