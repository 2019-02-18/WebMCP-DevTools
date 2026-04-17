import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'node:events';

export interface BridgeTool {
  name: string;
  description: string;
  inputSchema?: any;
  annotations?: { readOnlyHint?: boolean };
  source?: string;
  tabId: number;
  tabTitle: string;
}

export class ExtensionBridge extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private client: WebSocket | null = null;
  private tools: BridgeTool[] = [];
  private pendingRequests = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private requestId = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  actualPort: number;

  constructor(private port: number = 3789) {
    super();
    this.actualPort = port;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.tryListen(this.port, resolve, reject, 0);
    });
  }

  private tryListen(port: number, resolve: () => void, reject: (e: Error) => void, attempt: number) {
    if (attempt > 5) {
      reject(new Error('Could not find an available port'));
      return;
    }

    this.wss = new WebSocketServer({ port, host: '127.0.0.1' });

    this.wss.on('listening', () => {
      this.actualPort = port;
      console.error(`[WebMCP Bridge] WebSocket server listening on ws://127.0.0.1:${port}`);
      this.setupConnectionHandler();
      resolve();
    });

    this.wss.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[WebMCP Bridge] Port ${port} in use, trying ${port + 1}...`);
        this.wss?.close();
        this.tryListen(port + 1, resolve, reject, attempt + 1);
      } else {
        reject(err);
      }
    });
  }

  private setupConnectionHandler() {
    if (!this.wss) return;

    this.wss.on('connection', (ws) => {
      if (this.client) {
        this.client.close();
      }
      this.client = ws;
      this.startHeartbeat();
      console.error(`[WebMCP Bridge] Extension connected`);
      this.emit('connected');

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'HANDSHAKE') {
            ws.send(JSON.stringify({ type: 'HANDSHAKE_ACK', server: 'webmcp-bridge', version: '2.0' }));
            return;
          }
          if (msg.type === 'PING') {
            ws.send(JSON.stringify({ type: 'PONG' }));
            return;
          }
          this.handleMessage(msg);
        } catch {}
      });

      ws.on('close', () => {
        if (this.client === ws) {
          this.client = null;
          this.stopHeartbeat();
          this.emit('disconnected');
          console.error(`[WebMCP Bridge] Extension disconnected (${this.tools.length} tools cached)`);
        }
      });

      this.sendToExtension({ action: 'LIST_ALL_TOOLS' });
    });
  }

  private handleMessage(msg: any) {
    if (msg.type === 'TOOLS_UPDATE') {
      this.tools = msg.tools ?? [];
      this.emit('toolsUpdated');
      return;
    }

    if (msg.type === 'RESPONSE' && msg.id) {
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        this.pendingRequests.delete(msg.id);
        if (msg.error) pending.reject(new Error(msg.error));
        else pending.resolve(msg.result);
      }
      return;
    }
  }

  private sendToExtension(msg: any) {
    if (this.client?.readyState === WebSocket.OPEN) {
      this.client.send(JSON.stringify(msg));
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.client?.readyState === WebSocket.OPEN) {
        this.client.send(JSON.stringify({ type: 'PING' }));
      }
    }, 20000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  getTools(): BridgeTool[] {
    return this.tools;
  }

  isConnected(): boolean {
    return this.client?.readyState === WebSocket.OPEN;
  }

  async executeTool(name: string, args: Record<string, unknown>, tabId?: number): Promise<any> {
    if (!this.isConnected()) {
      throw new Error('Extension not connected');
    }

    const id = String(++this.requestId);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Tool execution timed out'));
      }, 30000);

      this.pendingRequests.set(id, {
        resolve: (v) => { clearTimeout(timeout); resolve(v); },
        reject: (e) => { clearTimeout(timeout); reject(e); },
      });

      this.sendToExtension({
        action: 'EXECUTE_TOOL',
        id,
        name,
        args,
        tabId,
      });
    });
  }

  stop() {
    this.stopHeartbeat();
    this.pendingRequests.forEach(({ reject }) => reject(new Error('Server stopped')));
    this.pendingRequests.clear();
    if (this.client) {
      try { this.client.terminate(); } catch {}
      this.client = null;
    }
    if (this.wss) {
      for (const ws of this.wss.clients) {
        try { ws.terminate(); } catch {}
      }
      try { this.wss.close(); } catch {}
      this.wss = null;
    }
  }
}
