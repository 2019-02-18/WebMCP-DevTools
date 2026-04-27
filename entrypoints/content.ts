export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',

  main() {
    const CHANNEL = 'WEBMCP_DEVTOOLS_EVENT';
    let contextValid = true;
    let pendingListRequest = false;

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
      if (pendingListRequest && event.data?.event === 'TOOLS_LIST') return;
      const evt = event.data?.event;
      if (evt === 'SCAN_RESULT' || evt === 'INJECT_RESULT' || evt === 'EXTRACT_CONTENT_RESULT' || evt === 'BATCH_INJECT_RESULT') return;
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
        if (message.action === 'SCAN_PAGE') {
          scanPage(sendResponse);
          return true;
        }
        if (message.action === 'INJECT_TOOL') {
          injectTool(message.payload, sendResponse);
          return true;
        }
        if (message.action === 'EXTRACT_CONTENT') {
          extractContent(message.payload, sendResponse);
          return true;
        }
        if (message.action === 'BATCH_INJECT') {
          batchInject(message.payload, sendResponse);
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
      pendingListRequest = true;

      const handler = (event: MessageEvent) => {
        if (event.data?.type !== CHANNEL) return;
        if (event.data?.event !== 'TOOLS_LIST') return;
        if (responded) return;
        responded = true;
        pendingListRequest = false;
        window.removeEventListener('message', handler);
        sendResponse({ tools: event.data.data });
      };

      window.addEventListener('message', handler);
      window.postMessage({ type: CHANNEL, action: 'REQUEST_TOOLS_LIST' }, '*');

      setTimeout(() => {
        if (responded) return;
        responded = true;
        pendingListRequest = false;
        window.removeEventListener('message', handler);
        sendResponse({ tools: [] });
      }, 3000);
    }

    function scanPage(sendResponse: (response: any) => void) {
      let responded = false;

      const handler = (event: MessageEvent) => {
        if (event.data?.type !== CHANNEL) return;
        if (event.data?.event !== 'SCAN_RESULT') return;
        if (responded) return;
        responded = true;
        window.removeEventListener('message', handler);
        sendResponse({ elements: event.data.data });
      };

      window.addEventListener('message', handler);
      window.postMessage({ type: CHANNEL, action: 'SCAN_PAGE' }, '*');

      setTimeout(() => {
        if (responded) return;
        responded = true;
        window.removeEventListener('message', handler);
        sendResponse({ elements: [] });
      }, 5000);
    }

    function injectTool(payload: any, sendResponse: (response: any) => void) {
      let responded = false;

      const handler = (event: MessageEvent) => {
        if (event.data?.type !== CHANNEL) return;
        if (event.data?.event !== 'INJECT_RESULT') return;
        if (responded) return;
        responded = true;
        window.removeEventListener('message', handler);
        sendResponse(event.data.data);
      };

      window.addEventListener('message', handler);
      window.postMessage({ type: CHANNEL, action: 'INJECT_TOOL', data: payload }, '*');

      setTimeout(() => {
        if (responded) return;
        responded = true;
        window.removeEventListener('message', handler);
        sendResponse({ success: false, error: 'Injection timed out' });
      }, 10000);
    }

    function extractContent(payload: any, sendResponse: (response: any) => void) {
      let responded = false;
      const contentType = payload?.contentType || 'page';

      const handler = (event: MessageEvent) => {
        if (event.data?.type !== CHANNEL) return;
        if (event.data?.event !== 'EXTRACT_CONTENT_RESULT') return;
        if (event.data?.data?.contentType !== contentType) return;
        if (responded) return;
        responded = true;
        window.removeEventListener('message', handler);
        sendResponse({ contentType, result: event.data.data.result });
      };

      window.addEventListener('message', handler);
      window.postMessage({ type: CHANNEL, action: 'EXTRACT_CONTENT', data: { contentType } }, '*');

      setTimeout(() => {
        if (responded) return;
        responded = true;
        window.removeEventListener('message', handler);
        sendResponse({ contentType, result: null, error: 'Extraction timed out' });
      }, 10000);
    }

    function batchInject(payload: any, sendResponse: (response: any) => void) {
      let responded = false;

      const handler = (event: MessageEvent) => {
        if (event.data?.type !== CHANNEL) return;
        if (event.data?.event !== 'BATCH_INJECT_RESULT') return;
        if (responded) return;
        responded = true;
        window.removeEventListener('message', handler);
        sendResponse({ results: event.data.data });
      };

      window.addEventListener('message', handler);
      window.postMessage({ type: CHANNEL, action: 'BATCH_INJECT', data: payload }, '*');

      setTimeout(() => {
        if (responded) return;
        responded = true;
        window.removeEventListener('message', handler);
        sendResponse({ results: [], error: 'Batch injection timed out' });
      }, 30000);
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
