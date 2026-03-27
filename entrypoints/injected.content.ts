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

    function serializeTool(tool: any): any {
      let schema = tool.inputSchema;
      if (schema && typeof schema === 'object') {
        schema = JSON.stringify(schema);
      }
      return {
        name: tool.name,
        description: tool.description,
        inputSchema: schema,
        annotations: tool.annotations,
      };
    }

    function sendToolsList() {
      const tools = Array.from(trackedTools.values());
      postEvent('TOOLS_LIST', tools);
    }

    const mc = getModelContext();
    if (!mc) {
      postEvent('API_NOT_AVAILABLE', null);
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

    setTimeout(sendToolsList, 500);
  },
});
