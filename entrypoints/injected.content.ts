export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  world: 'MAIN',

  main() {
    if ((window as any).__WEBMCP_DEVTOOLS_INJECTED__) return;
    (window as any).__WEBMCP_DEVTOOLS_INJECTED__ = true;

    const CHANNEL = 'WEBMCP_DEVTOOLS_EVENT';
    const trackedTools = new Map<string, any>();
    const toolExecutors = new Map<string, (args: any) => Promise<any>>();
    const toolRegistrationIds = new Map<string, string>();
    let apiHooked = false;

    // For registering tools — only modelContext has registerTool
    function getRegistrationAPI(): any | null {
      return (navigator as any).modelContext || null;
    }

    // For querying tools — modelContextTesting has listTools/executeTool
    function getTestingAPI(): any | null {
      return (navigator as any).modelContextTesting || null;
    }

    function getModelContext(): any | null {
      return getRegistrationAPI() || getTestingAPI() || null;
    }

    function postEvent(event: string, data: any) {
      window.postMessage(
        { type: CHANNEL, event, timestamp: performance.now(), data },
        '*',
      );
    }

    function serializeTool(tool: any, source: 'imperative' | 'declarative' = 'imperative'): any {
      let schema = tool.inputSchema;
      if (schema && typeof schema === 'object') {
        schema = JSON.stringify(schema);
      }
      return {
        name: tool.name,
        description: tool.description,
        inputSchema: schema,
        annotations: tool.annotations,
        source,
      };
    }

    function scanDeclarativeForms() {
      const forms = document.querySelectorAll<HTMLFormElement>('form[toolname]');
      forms.forEach((form) => {
        const name = form.getAttribute('toolname');
        if (!name || trackedTools.has(name)) return;

        const description = form.getAttribute('tooldescription') || '';
        const properties: Record<string, any> = {};
        const required: string[] = [];

        form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          'input[name], select[name], textarea[name]',
        ).forEach((el) => {
          const fieldName = el.getAttribute('name');
          if (!fieldName) return;

          const prop: Record<string, any> = {};
          if (el instanceof HTMLSelectElement) {
            prop.type = 'string';
            const options = Array.from(el.options).map((o) => o.value).filter((v) => v !== '');
            if (options.length > 0) prop.enum = options;
          } else if (el instanceof HTMLTextAreaElement) {
            prop.type = 'string';
          } else {
            const inputType = el.type?.toLowerCase() || 'text';
            if (inputType === 'number' || inputType === 'range') prop.type = 'number';
            else if (inputType === 'checkbox') prop.type = 'boolean';
            else if (inputType === 'date' || inputType === 'datetime-local') { prop.type = 'string'; prop.format = 'date'; }
            else prop.type = 'string';
            if (el.min) prop.minimum = Number(el.min);
            if (el.max) prop.maximum = Number(el.max);
          }

          if ('placeholder' in el && el.placeholder) prop.description = el.placeholder;
          if (el.required) required.push(fieldName);
          properties[fieldName] = prop;
        });

        const schema: Record<string, any> = { type: 'object', properties };
        if (required.length > 0) schema.required = required;

        const serialized = {
          name, description,
          inputSchema: JSON.stringify(schema),
          annotations: undefined,
          source: 'declarative' as const,
        };
        trackedTools.set(name, serialized);

        const formExecutor = async (args: any) => {
          Object.entries(args).forEach(([key, value]) => {
            const input = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${key}"]`);
            if (!input) return;
            if (input instanceof HTMLInputElement && input.type === 'checkbox') {
              input.checked = Boolean(value);
            } else {
              input.value = String(value);
            }
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          });
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          return { submitted: true, tool: name };
        };
        toolExecutors.set(name, formExecutor);
        postEvent('REGISTER_TOOL', serialized);
      });
    }

    function pruneRemovedDeclarativeForms(): boolean {
      let changed = false;
      for (const [name, tool] of trackedTools.entries()) {
        if (tool.source === 'declarative') {
          if (!document.querySelector<HTMLFormElement>(`form[toolname="${name}"]`)) {
            trackedTools.delete(name);
            toolExecutors.delete(name);
            postEvent('UNREGISTER_TOOL', { name });
            changed = true;
          }
        }
      }
      return changed;
    }

    function syncWithNativeAPI() {
      const mc = getTestingAPI();
      if (!mc || typeof mc.listTools !== 'function') return;

      try {
        const liveTools = mc.listTools();
        if (!Array.isArray(liveTools)) return;

        const liveNames = new Set(liveTools.map((t: any) => t.name));

        // Remove imperative tools that are no longer registered natively
        for (const [name, tool] of trackedTools.entries()) {
          if (tool.source === 'imperative' && !liveNames.has(name)) {
            trackedTools.delete(name);
            toolExecutors.delete(name);
            toolRegistrationIds.delete(name);
          }
        }

        // Add tools that exist natively but we missed
        for (const liveTool of liveTools) {
          if (!trackedTools.has(liveTool.name)) {
            const serialized = serializeTool(liveTool);
            trackedTools.set(liveTool.name, serialized);
            if (typeof liveTool.execute === 'function') {
              toolExecutors.set(liveTool.name, liveTool.execute);
            }
          }
        }
      } catch {}
    }

    function sendToolsList() {
      syncWithNativeAPI();
      scanDeclarativeForms();
      const tools = Array.from(trackedTools.values());
      postEvent('TOOLS_LIST', tools);
    }

    async function executeToolByName(name: string, args: any) {
      try {
        const executor = toolExecutors.get(name);
        if (executor) {
          const result = await executor(args);
          postEvent('EXECUTE_RESULT', { name, result, success: true });
          return;
        }
        // Fallback: use native executeTool API (expects JSON string args)
        const mc = getTestingAPI();
        if (mc && typeof mc.executeTool === 'function') {
          const argsStr = typeof args === 'string' ? args : JSON.stringify(args);
          const result = await mc.executeTool(name, argsStr);
          postEvent('EXECUTE_RESULT', { name, result, success: true });
          return;
        }
        postEvent('EXECUTE_RESULT', { name, error: `Tool "${name}" has no execute function`, success: false });
      } catch (e: any) {
        postEvent('EXECUTE_RESULT', { name, error: e?.message ?? String(e), success: false });
      }
    }

    // Hook into the WebMCP API's registerTool
    function hookModelContextAPI(mc: any) {
      if (apiHooked || !mc || typeof mc.registerTool !== 'function') return;
      apiHooked = true;

      const origRegister = mc.registerTool.bind(mc);
      mc.registerTool = function (tool: any, options?: any) {
        const regId = crypto.randomUUID();
        const serialized = serializeTool(tool);
        trackedTools.set(tool.name, serialized);
        toolRegistrationIds.set(tool.name, regId);
        if (typeof tool.execute === 'function') {
          toolExecutors.set(tool.name, tool.execute);
        }

        let result;
        try {
          result = origRegister(tool, options);
        } catch (e) {
          trackedTools.delete(tool.name);
          toolExecutors.delete(tool.name);
          toolRegistrationIds.delete(tool.name);
          throw e;
        }

        postEvent('REGISTER_TOOL', serialized);

        if (options?.signal) {
          const capturedRegId = regId;
          options.signal.addEventListener('abort', () => {
            if (toolRegistrationIds.get(tool.name) !== capturedRegId) return;
            trackedTools.delete(tool.name);
            toolExecutors.delete(tool.name);
            toolRegistrationIds.delete(tool.name);
            postEvent('UNREGISTER_TOOL', { name: tool.name });
          }, { once: true });
        }

        return result;
      };

      listenTestingAPI();
    }

    // Try to hook API now or watch for it to appear
    function tryHookAPI(): boolean {
      const mc = getModelContext();
      if (mc && typeof mc.registerTool === 'function') {
        hookModelContextAPI(mc);
        return true;
      }
      return false;
    }

    let testingAPIListening = false;

    function listenTestingAPI() {
      const testing = getTestingAPI();
      if (!testing || testingAPIListening) return;
      testingAPIListening = true;

      if ('ontoolchange' in (testing.__proto__ || testing)) {
        testing.addEventListener('toolchange', () => {
          postEvent('TOOL_CHANGE', null);
          sendToolsList();
        });
      } else if (typeof testing.registerToolsChangedCallback === 'function') {
        testing.registerToolsChangedCallback(() => {
          postEvent('TOOL_CHANGE', null);
          sendToolsList();
        });
      }
    }

    function watchForAPI() {
      for (const prop of ['modelContext', 'modelContextTesting']) {
        const existing = (navigator as any)[prop];
        if (existing) continue;

        let stored: any = undefined;
        try {
          Object.defineProperty(navigator, prop, {
            configurable: true,
            get() { return stored; },
            set(val: any) {
              stored = val;
              Object.defineProperty(navigator, prop, {
                configurable: true,
                writable: true,
                value: val,
              });
              if (val && typeof val.registerTool === 'function') {
                hookModelContextAPI(val);
              }
              listenTestingAPI();
              setTimeout(sendToolsList, 100);
            },
          });
        } catch {}
      }

      // Fallback: poll for API availability
      let pollCount = 0;
      const pollInterval = setInterval(() => {
        pollCount++;
        if (tryHookAPI()) {
          clearInterval(pollInterval);
          setTimeout(sendToolsList, 100);
        }
        if (pollCount > 100) clearInterval(pollInterval); // Stop after ~10s
      }, 100);
    }

    // Message handler
    window.addEventListener('message', (msgEvent) => {
      if (msgEvent.source !== window) return;
      if (msgEvent.data?.type !== CHANNEL) return;
      if (msgEvent.data.action === 'REQUEST_TOOLS_LIST') {
        scanDeclarativeForms();
        sendToolsList();
      }
      if (msgEvent.data.action === 'EXECUTE_TOOL') {
        const { name, args } = msgEvent.data.data;
        executeToolByName(name, args);
      }
    });

    // Declarative form scanning with MutationObserver
    function initDeclarativeScanning() {
      scanDeclarativeForms();
      const observer = new MutationObserver(() => {
        const prevSize = trackedTools.size;
        const pruned = pruneRemovedDeclarativeForms();
        scanDeclarativeForms();
        if (trackedTools.size !== prevSize || pruned) sendToolsList();
      });
      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          scanDeclarativeForms();
          observer.observe(document.body, { childList: true, subtree: true });
        });
      }
    }

    // SPA route change detection
    let lastUrl = location.href;
    let routeChangeTimer: ReturnType<typeof setTimeout> | null = null;

    function onRouteChange() {
      const currentUrl = location.href;
      if (currentUrl === lastUrl) return;
      lastUrl = currentUrl;

      if (routeChangeTimer) { clearTimeout(routeChangeTimer); routeChangeTimer = null; }

      // Wait for the new route to mount and register/unregister tools naturally,
      // then send an authoritative tools list.
      routeChangeTimer = setTimeout(() => {
        routeChangeTimer = null;
        pruneRemovedDeclarativeForms();
        scanDeclarativeForms();
        sendToolsList();
      }, 600);
    }

    const origPushState = history.pushState.bind(history);
    const origReplaceState = history.replaceState.bind(history);
    history.pushState = function (data: any, unused: string, url?: string | URL | null) {
      origPushState(data, unused, url);
      setTimeout(onRouteChange, 50);
    };
    history.replaceState = function (data: any, unused: string, url?: string | URL | null) {
      origReplaceState(data, unused, url);
      setTimeout(onRouteChange, 50);
    };
    window.addEventListener('popstate', () => setTimeout(onRouteChange, 50));
    window.addEventListener('hashchange', () => setTimeout(onRouteChange, 50));

    // === Initialize ===
    if (!tryHookAPI()) {
      watchForAPI();
    }
    listenTestingAPI();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        tryHookAPI();
        initDeclarativeScanning();
        setTimeout(sendToolsList, 500);
      });
    } else {
      initDeclarativeScanning();
      setTimeout(sendToolsList, 500);
    }
  },
});
