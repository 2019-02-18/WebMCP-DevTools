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

    function getModelContext(): any | null {
      return (
        (navigator as any).modelContext ||
        (navigator as any).modelContextTesting ||
        null
      );
    }

    function postEvent(event: string, data: any) {
      window.postMessage(
        {
          type: CHANNEL,
          event,
          timestamp: performance.now(),
          data,
        },
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
            const options = Array.from(el.options)
              .map((o) => o.value)
              .filter((v) => v !== '');
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

          if (el.placeholder) prop.description = el.placeholder;
          if (el.required) required.push(fieldName);
          properties[fieldName] = prop;
        });

        const schema: Record<string, any> = { type: 'object', properties };
        if (required.length > 0) schema.required = required;

        const serialized = {
          name,
          description,
          inputSchema: JSON.stringify(schema),
          annotations: undefined,
          source: 'declarative' as const,
        };
        trackedTools.set(name, serialized);

        const formExecutor = async (args: any) => {
          Object.entries(args).forEach(([key, value]) => {
            const el = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${key}"]`);
            if (!el) return;
            if (el instanceof HTMLInputElement && el.type === 'checkbox') {
              el.checked = Boolean(value);
            } else {
              el.value = String(value);
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          });
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          return { submitted: true, tool: name };
        };
        toolExecutors.set(name, formExecutor);

        postEvent('REGISTER_TOOL', serialized);
      });
    }

    function sendToolsList() {
      scanDeclarativeForms();
      const tools = Array.from(trackedTools.values());
      postEvent('TOOLS_LIST', tools);
    }

    const mc = getModelContext();
    if (!mc || typeof mc.registerTool !== 'function') {
      scanDeclarativeForms();
      if (trackedTools.size > 0) {
        setTimeout(sendToolsList, 500);
      } else {
        postEvent('API_NOT_AVAILABLE', null);
      }

      const observer = new MutationObserver(() => {
        const prevSize = trackedTools.size;
        scanDeclarativeForms();
        if (trackedTools.size !== prevSize) sendToolsList();
      });
      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          scanDeclarativeForms();
          if (trackedTools.size > 0) sendToolsList();
          observer.observe(document.body, { childList: true, subtree: true });
        });
      }

      window.addEventListener('message', (msgEvent) => {
        if (msgEvent.source !== window) return;
        if (msgEvent.data?.type !== CHANNEL) return;
        if (msgEvent.data.action === 'REQUEST_TOOLS_LIST') { scanDeclarativeForms(); sendToolsList(); }
        if (msgEvent.data.action === 'EXECUTE_TOOL') {
          const { name: n, args } = msgEvent.data.data;
          executeToolByName(n, args);
        }
      });
      return;
    }

    const origRegister = mc.registerTool.bind(mc);
    mc.registerTool = function (tool: any, options?: any) {
      const serialized = serializeTool(tool);
      trackedTools.set(tool.name, serialized);
      if (typeof tool.execute === 'function') {
        toolExecutors.set(tool.name, tool.execute);
      }

      let result;
      try {
        result = origRegister(tool, options);
      } catch (e) {
        trackedTools.delete(tool.name);
        toolExecutors.delete(tool.name);
        throw e;
      }

      postEvent('REGISTER_TOOL', serialized);

      if (options?.signal) {
        options.signal.addEventListener(
          'abort',
          () => {
            trackedTools.delete(tool.name);
            toolExecutors.delete(tool.name);
            postEvent('UNREGISTER_TOOL', { name: tool.name });
          },
          { once: true },
        );
      }

      return result;
    };

    mc.addEventListener?.('toolchange', () => {
      postEvent('TOOL_CHANGE', null);
      sendToolsList();
    });

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

    async function executeToolByName(name: string, args: any) {
      try {
        const executor = toolExecutors.get(name);
        if (!executor) {
          postEvent('EXECUTE_RESULT', {
            name,
            error: `Tool "${name}" has no execute function`,
            success: false,
          });
          return;
        }
        const result = await executor(args);
        postEvent('EXECUTE_RESULT', { name, result, success: true });
      } catch (e: any) {
        postEvent('EXECUTE_RESULT', {
          name,
          error: e?.message ?? String(e),
          success: false,
        });
      }
    }

    function initDeclarativeScanning() {
      scanDeclarativeForms();
      const observer = new MutationObserver(() => {
        const prevSize = trackedTools.size;
        scanDeclarativeForms();
        if (trackedTools.size !== prevSize) sendToolsList();
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

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        initDeclarativeScanning();
        setTimeout(sendToolsList, 500);
      });
    } else {
      initDeclarativeScanning();
      setTimeout(sendToolsList, 500);
    }
  },
});
