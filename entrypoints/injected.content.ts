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

    // ===== Page Scanning Engine =====
    const interceptedAPIs: Array<{ method: string; url: string; timestamp: number }> = [];
    let fetchPatched = false;

    function patchFetchForDiscovery() {
      if (fetchPatched) return;
      fetchPatched = true;
      const origFetch = window.fetch.bind(window);
      (window as any).fetch = function (input: RequestInfo | URL, init?: RequestInit) {
        try {
          const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input?.url ?? '';
          const method = (init?.method || (typeof input !== 'string' && !(input instanceof URL) && input?.method) || 'GET').toUpperCase();
          if (url && !url.startsWith('chrome-extension://') && !url.includes('WEBMCP')) {
            interceptedAPIs.push({ method, url: url.toString(), timestamp: Date.now() });
            if (interceptedAPIs.length > 100) interceptedAPIs.shift();
          }
        } catch {}
        return origFetch(input, init);
      };

      const origXHROpen = XMLHttpRequest.prototype.open;
      (XMLHttpRequest.prototype as any).open = function (method: string, url: string | URL, async_?: boolean, user?: string | null, password?: string | null) {
        try {
          const urlStr = url.toString();
          if (urlStr && !urlStr.startsWith('chrome-extension://') && !urlStr.includes('WEBMCP')) {
            interceptedAPIs.push({ method: method.toUpperCase(), url: urlStr, timestamp: Date.now() });
            if (interceptedAPIs.length > 100) interceptedAPIs.shift();
          }
        } catch {}
        return origXHROpen.call(this, method, url, async_ ?? true, user, password);
      };
    }

    function inferSchemaFromInput(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): { type: string; [key: string]: any } {
      if (el instanceof HTMLSelectElement) {
        const options = Array.from(el.options).map((o) => o.value).filter((v) => v !== '');
        return options.length > 0 ? { type: 'string', enum: options } : { type: 'string' };
      }
      if (el instanceof HTMLTextAreaElement) return { type: 'string' };

      const inputType = el.type?.toLowerCase() || 'text';
      if (inputType === 'hidden' || inputType === 'password' || inputType === 'file') return { type: '_skip_' };

      const prop: { type: string; [key: string]: any } = { type: 'string' };
      if (inputType === 'number' || inputType === 'range') prop.type = 'number';
      else if (inputType === 'checkbox') prop.type = 'boolean';
      else if (inputType === 'date' || inputType === 'datetime-local') { prop.type = 'string'; prop.format = 'date'; }
      else if (inputType === 'email') { prop.type = 'string'; prop.format = 'email'; }
      else if (inputType === 'url') { prop.type = 'string'; prop.format = 'uri'; }

      if (el.min) prop.minimum = Number(el.min);
      if (el.max) prop.maximum = Number(el.max);
      if (el.pattern) prop.pattern = el.pattern;
      return prop;
    }

    function inferToolName(text: string): string {
      return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').substring(0, 40) || 'unnamed';
    }

    function getLabel(el: HTMLElement): string {
      const id = el.getAttribute('id');
      if (id) {
        const label = document.querySelector<HTMLLabelElement>(`label[for="${id}"]`);
        if (label) return label.textContent?.trim() || '';
      }
      const parent = el.closest('label');
      if (parent) return parent.textContent?.trim() || '';
      return '';
    }

    function buildUniqueSelector(el: Element): string {
      if (el.id) return `#${el.id}`;
      const tag = el.tagName.toLowerCase();
      const name = el.getAttribute('name');
      if (name) return `${tag}[name="${name}"]`;
      const action = el.getAttribute('action');
      if (action) return `${tag}[action="${action}"]`;
      const cls = el.className;
      if (cls && typeof cls === 'string') {
        const firstClass = cls.trim().split(/\s+/)[0];
        if (firstClass) return `${tag}.${firstClass}`;
      }
      return tag;
    }

    function scanPageElements() {
      const elements: any[] = [];
      const registeredNames = new Set(trackedTools.keys());

      // Scan forms (excluding already-registered declarative forms)
      document.querySelectorAll<HTMLFormElement>('form').forEach((form) => {
        const toolname = form.getAttribute('toolname');
        if (toolname && registeredNames.has(toolname)) return;

        const properties: Record<string, any> = {};
        const required: string[] = [];
        let fieldCount = 0;

        form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          'input[name], select[name], textarea[name]',
        ).forEach((el) => {
          const fieldName = el.getAttribute('name');
          if (!fieldName) return;
          const prop = inferSchemaFromInput(el);
          if (prop.type === '_skip_') return;

          const desc = getLabel(el) || ('placeholder' in el ? el.placeholder : '') || '';
          if (desc) prop.description = desc;
          if (el.required) required.push(fieldName);
          properties[fieldName] = prop;
          fieldCount++;
        });

        if (fieldCount === 0) return;

        const schema: Record<string, any> = { type: 'object', properties };
        if (required.length > 0) schema.required = required;

        const action = form.getAttribute('action') || '';
        const formId = form.id || form.getAttribute('name') || '';
        const heading = form.querySelector('h1, h2, h3, h4, legend')?.textContent?.trim() || '';
        const nameBase = toolname || formId || heading || action || `form_${elements.length}`;
        const suggestedName = inferToolName(nameBase);

        elements.push({
          id: `form_${elements.length}_${Date.now()}`,
          type: 'form',
          selector: buildUniqueSelector(form),
          suggestedName,
          suggestedDescription: heading || `Submit form: ${suggestedName}`,
          inferredSchema: schema,
          metadata: {
            action,
            method: (form.method || 'GET').toUpperCase(),
            fieldCount,
            hasToolname: !!toolname,
          },
          alreadyRegistered: toolname ? registeredNames.has(toolname) : false,
        });
      });

      // Scan buttons with meaningful text (not inside forms)
      document.querySelectorAll<HTMLButtonElement>('button:not(form button), [role="button"]').forEach((btn) => {
        const text = btn.textContent?.trim();
        if (!text || text.length < 2 || text.length > 50) return;
        if (btn.closest('[data-no-webmcp]')) return;

        elements.push({
          id: `btn_${elements.length}_${Date.now()}`,
          type: 'button',
          selector: buildUniqueSelector(btn),
          suggestedName: `click_${inferToolName(text)}`,
          suggestedDescription: `Click button: ${text}`,
          inferredSchema: { type: 'object', properties: {} },
          metadata: { text, tagName: btn.tagName.toLowerCase() },
          alreadyRegistered: false,
        });
      });

      // Include intercepted API endpoints
      const uniqueAPIs = new Map<string, typeof interceptedAPIs[0]>();
      interceptedAPIs.forEach((api) => {
        const key = `${api.method}:${new URL(api.url, location.origin).pathname}`;
        if (!uniqueAPIs.has(key)) uniqueAPIs.set(key, api);
      });

      uniqueAPIs.forEach((api) => {
        try {
          const url = new URL(api.url, location.origin);
          const pathParts = url.pathname.split('/').filter(Boolean);
          const nameParts = pathParts.slice(-2).join('_');

          elements.push({
            id: `api_${elements.length}_${Date.now()}`,
            type: 'api',
            selector: '',
            suggestedName: `${api.method.toLowerCase()}_${inferToolName(nameParts || 'api')}`,
            suggestedDescription: `${api.method} ${url.pathname}`,
            inferredSchema: { type: 'object', properties: {} },
            metadata: { method: api.method, url: api.url, pathname: url.pathname },
            alreadyRegistered: false,
          });
        } catch {}
      });

      return elements;
    }

    function injectToolFromDefinition(def: any) {
      const mc = getRegistrationAPI();
      if (!mc || typeof mc.registerTool !== 'function') {
        postEvent('INJECT_RESULT', { success: false, error: 'WebMCP API not available for registration' });
        return;
      }

      try {
        let executeFn: (args: any) => Promise<any>;

        if (def.executeType === 'form-submit') {
          const formSelector = def.executeConfig?.selector;
          executeFn = async (args: any) => {
            const form = document.querySelector<HTMLFormElement>(formSelector);
            if (!form) return { error: 'Form not found' };
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
            return { submitted: true, tool: def.name };
          };
        } else if (def.executeType === 'click') {
          const selector = def.executeConfig?.selector;
          executeFn = async () => {
            const el = document.querySelector<HTMLElement>(selector);
            if (!el) return { error: 'Element not found' };
            el.click();
            return { clicked: true, tool: def.name };
          };
        } else if (def.executeType === 'navigate') {
          executeFn = async (args: any) => {
            const url = args.url || def.executeConfig?.url;
            if (url) window.location.href = url;
            return { navigated: true, url };
          };
        } else if (def.executeType === 'fetch') {
          executeFn = async (args: any) => {
            const url = def.executeConfig?.url;
            const method = def.executeConfig?.method || 'GET';
            const resp = await fetch(url, {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: method !== 'GET' ? JSON.stringify(args) : undefined,
            });
            return { status: resp.status, body: await resp.text() };
          };
        } else {
          executeFn = async () => ({ info: 'Custom tool - no auto-execute configured' });
        }

        // Chrome's registerTool accepts inputSchema as string; try string first, then object as fallback
        let schema: any = def.inputSchema || '{"type":"object","properties":{}}';
        if (typeof schema === 'object') schema = JSON.stringify(schema);

        try {
          mc.registerTool({
            name: def.name,
            description: def.description,
            inputSchema: schema,
            execute: executeFn,
          });
        } catch {
          // Fallback: pass schema as object if string form fails
          mc.registerTool({
            name: def.name,
            description: def.description,
            inputSchema: typeof schema === 'string' ? JSON.parse(schema) : schema,
            execute: executeFn,
          });
        }

        postEvent('INJECT_RESULT', { success: true, name: def.name });
      } catch (e: any) {
        postEvent('INJECT_RESULT', { success: false, error: e?.message ?? String(e) });
      }
    }

    // ===== Page Content Extraction (MCP Resources) =====

    function extractPageMeta() {
      const getMeta = (name: string) => {
        const el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"], meta[property="${name}"]`);
        return el?.content || '';
      };
      const ogTags: Record<string, string> = {};
      document.querySelectorAll<HTMLMetaElement>('meta[property^="og:"]').forEach((el) => {
        const prop = el.getAttribute('property');
        if (prop) ogTags[prop] = el.content;
      });
      return {
        title: document.title,
        url: location.href,
        description: getMeta('description'),
        keywords: getMeta('keywords'),
        ogTags,
        lang: document.documentElement.lang || '',
        charset: document.characterSet,
      };
    }

    function extractVisibleText(maxLen = 50000): string {
      const skipTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'TEMPLATE', 'IFRAME']);
      const blocks: string[] = [];

      function walk(node: Node) {
        if (blocks.join('\n').length >= maxLen) return;
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent?.trim();
          if (text) blocks.push(text);
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const el = node as HTMLElement;
        if (skipTags.has(el.tagName)) return;
        try {
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return;
        } catch {}
        for (const child of el.childNodes) walk(child);
      }

      if (document.body) walk(document.body);
      let result = blocks.join('\n');
      if (result.length > maxLen) result = result.substring(0, maxLen) + '\n...[truncated]';
      return result;
    }

    function extractTables() {
      const tables: Array<{ selector: string; caption: string; headers: string[]; rows: string[][] }> = [];
      document.querySelectorAll<HTMLTableElement>('table').forEach((table) => {
        const caption = table.querySelector('caption')?.textContent?.trim() || '';
        const headers: string[] = [];
        table.querySelectorAll('thead th, thead td, tr:first-child th').forEach((th) => {
          headers.push(th.textContent?.trim() || '');
        });
        const rows: string[][] = [];
        const bodyRows = table.querySelectorAll('tbody tr, tr');
        bodyRows.forEach((tr) => {
          if (tr.querySelector('th') && rows.length === 0 && headers.length > 0) return;
          const cells: string[] = [];
          tr.querySelectorAll('td, th').forEach((td) => {
            cells.push(td.textContent?.trim() || '');
          });
          if (cells.length > 0) rows.push(cells);
        });
        if (headers.length > 0 || rows.length > 0) {
          tables.push({ selector: buildUniqueSelector(table), caption, headers, rows: rows.slice(0, 200) });
        }
      });
      return tables;
    }

    function extractFormStates() {
      const forms: Array<{ selector: string; name: string; fields: Array<{ name: string; type: string; value: string; label: string }> }> = [];
      document.querySelectorAll<HTMLFormElement>('form').forEach((form) => {
        const fields: Array<{ name: string; type: string; value: string; label: string }> = [];
        form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          'input[name], select[name], textarea[name]',
        ).forEach((el) => {
          const fieldName = el.getAttribute('name');
          if (!fieldName) return;
          const fieldType = el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase();
          if (fieldType === 'hidden' || fieldType === 'password') return;
          let value = '';
          if (el instanceof HTMLInputElement && el.type === 'checkbox') value = String(el.checked);
          else value = el.value;
          fields.push({ name: fieldName, type: fieldType, value, label: getLabel(el) });
        });
        forms.push({
          selector: buildUniqueSelector(form),
          name: form.getAttribute('toolname') || form.getAttribute('name') || form.id || '',
          fields,
        });
      });
      return forms;
    }

    function extractLinks(maxLinks = 500) {
      const links: Array<{ text: string; href: string; isExternal: boolean }> = [];
      const seen = new Set<string>();
      document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
        if (links.length >= maxLinks) return;
        const href = a.href;
        if (!href || href.startsWith('javascript:') || href.startsWith('#') || seen.has(href)) return;
        seen.add(href);
        const text = a.textContent?.trim() || a.title || '';
        if (!text) return;
        let isExternal = false;
        try { isExternal = new URL(href).origin !== location.origin; } catch {}
        links.push({ text: text.substring(0, 200), href, isExternal });
      });
      return links;
    }

    function extractSelection(): string {
      return window.getSelection()?.toString()?.trim() || '';
    }

    function handleExtractContent(contentType: string) {
      let result: any;
      switch (contentType) {
        case 'page': result = extractPageMeta(); break;
        case 'content': result = extractVisibleText(); break;
        case 'tables': result = extractTables(); break;
        case 'forms': result = extractFormStates(); break;
        case 'links': result = extractLinks(); break;
        case 'selection': result = extractSelection(); break;
        default: result = { error: `Unknown content type: ${contentType}` };
      }
      postEvent('EXTRACT_CONTENT_RESULT', { contentType, result });
    }

    // ===== Batch Injection (for Site Profiles) =====

    function batchInjectTools(toolDefs: any[]) {
      const results: Array<{ name: string; success: boolean; error?: string }> = [];
      for (const def of toolDefs) {
        try {
          injectToolFromDefinition(def);
          results.push({ name: def.name, success: true });
        } catch (e: any) {
          results.push({ name: def.name, success: false, error: e?.message ?? String(e) });
        }
      }
      postEvent('BATCH_INJECT_RESULT', results);
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
      if (msgEvent.data.action === 'SCAN_PAGE') {
        patchFetchForDiscovery();
        const elements = scanPageElements();
        postEvent('SCAN_RESULT', elements);
      }
      if (msgEvent.data.action === 'INJECT_TOOL') {
        injectToolFromDefinition(msgEvent.data.data);
      }
      if (msgEvent.data.action === 'EXTRACT_CONTENT') {
        handleExtractContent(msgEvent.data.data?.contentType || 'page');
      }
      if (msgEvent.data.action === 'BATCH_INJECT') {
        batchInjectTools(msgEvent.data.data || []);
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
