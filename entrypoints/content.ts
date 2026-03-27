export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',

  main() {
    const CHANNEL = 'WEBMCP_DEVTOOLS_EVENT';
    let contextValid = true;

    function checkContext(): boolean {
      if (!contextValid) return false;
      try {
        if (!chrome.runtime?.id) {
          contextValid = false;
          return false;
        }
        return true;
      } catch {
        contextValid = false;
        return false;
      }
    }

    function safeSendMessage(message: any) {
      if (!checkContext()) return;
      try {
        chrome.runtime.sendMessage(message).catch(() => { contextValid = false; });
      } catch {
        contextValid = false;
      }
    }

    window.addEventListener('message', (event) => {
      if (!contextValid) return;
      if (event.source !== window) return;
      if (event.data?.type !== CHANNEL) return;
      if (event.data?.action) return;
      safeSendMessage({ action: 'TOOL_EVENT', payload: event.data });
    });

    if (!checkContext()) return;

    try {
      chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (!checkContext()) return false;
        if (message.action === 'LIST_TOOLS') {
          requestToolsList(sendResponse);
          return true;
        }
        if (message.action === 'EXECUTE_TOOL') {
          executeTool(message.payload, sendResponse);
          return true;
        }
        return false;
      });
    } catch {
      contextValid = false;
      return;
    }

    function requestToolsList(sendResponse: (response: any) => void) {
      let responded = false;

      const handler = (event: MessageEvent) => {
        if (event.data?.type !== CHANNEL) return;
        if (event.data?.event !== 'TOOLS_LIST') return;
        if (responded) return;
        responded = true;
        window.removeEventListener('message', handler);
        sendResponse({ tools: event.data.data });
      };

      window.addEventListener('message', handler);
      window.postMessage({ type: CHANNEL, action: 'REQUEST_TOOLS_LIST' }, '*');

      setTimeout(() => {
        if (responded) return;
        responded = true;
        window.removeEventListener('message', handler);
        sendResponse({ tools: [] });
      }, 3000);
    }

    function executeTool(payload: any, sendResponse: (response: any) => void) {
      const { name, args } = payload;
      let responded = false;

      const responseHandler = (event: MessageEvent) => {
        if (event.data?.type !== CHANNEL) return;
        if (event.data?.event !== 'EXECUTE_RESULT') return;
        if (event.data?.data?.name !== name) return;
        if (responded) return;
        responded = true;
        window.removeEventListener('message', responseHandler);
        sendResponse(event.data.data);
      };

      window.addEventListener('message', responseHandler);
      window.postMessage({
        type: CHANNEL,
        action: 'EXECUTE_TOOL',
        data: { name, args },
      }, '*');

      setTimeout(() => {
        if (responded) return;
        responded = true;
        window.removeEventListener('message', responseHandler);
        sendResponse({ error: 'Execution timed out' });
      }, 30000);
    }
  },
});
