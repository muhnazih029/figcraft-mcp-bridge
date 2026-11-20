import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import type { FigcraftMcpConfig } from "./config.js";

export interface BackendTool {
  name: string;
  description?: string;
  inputSchema?: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface BackendOptions {
  /** Called when an established backend connection drops unexpectedly. */
  onLost?: (reason: string) => void;
}

export class FigcraftBackend {
  tools: BackendTool[] = [];
  connected = false;
  private client: Client | null = null;
  private readonly cliPath: string;
  private readonly port: number;
  private readonly attachTimeoutMs: number;
  private readonly onLost?: (reason: string) => void;

  constructor(config: FigcraftMcpConfig, options: BackendOptions = {}) {
    this.cliPath = config.cliPath;
    this.port = config.port;
    this.attachTimeoutMs = config.attachTimeoutMs;
    this.onLost = options.onLost;
  }

  get isConnected(): boolean {
    return this.connected && this.client !== null;
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;

    const transport = new StdioClientTransport({
      command: this.cliPath,
      args: ["mcp", "--attach", String(this.port)],
      stderr: "pipe",
    });

    const client = new Client(
      { name: "figcraft-mcp", version: "0.1.0" },
      { capabilities: {} },
    );

    // Never let backend stderr leak into our stdout: stdout is the MCP channel.
    transport.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(`[figcraft-cli] ${chunk.toString()}`);
    });

    try {
      await this.withTimeout(client.connect(transport), this.attachTimeoutMs, "attach");
      this.client = client;

      const list = await this.withTimeout(client.listTools(), this.attachTimeoutMs, "listTools");
      this.tools = (list.tools ?? []).map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
      }));
      this.connected = true;
      this.installLifecycleHooks(client);
    } catch (error) {
      await this.teardown(client);
      throw error;
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    const client = this.client;
    if (!client || !this.connected) {
      throw new Error("FIGCRAFT_NOT_CONNECTED");
    }

    try {
      const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
      return { content: result.content, isError: result.isError };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!this.isConnected) {
        throw new Error(`FIGCRAFT_NOT_CONNECTED: ${message}`);
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.tools = [];
    this.connected = false;
    if (client) {
      await this.teardown(client);
    }
  }

  /** Marks the backend dead and reports it once, without throwing. */
  markLost(reason: string): void {
    if (!this.connected && !this.client) return;
    this.connected = false;
    this.client = null;
    this.tools = [];
    this.onLost?.(reason);
  }

  private installLifecycleHooks(client: Client): void {
    client.onclose = () => {
      if (this.client !== client) return;
      this.markLost("backend connection closed");
    };
    client.onerror = (error: Error) => {
      if (this.client !== client) return;
      this.markLost(error.message || "backend error");
    };
  }

  private async teardown(client: Client): Promise<void> {
    try {
      await client.close();
    } catch {
      // ignore shutdown errors
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    if (!Number.isFinite(ms) || ms <= 0) return promise;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`FIGCRAFT_${label.toUpperCase()}_TIMEOUT after ${ms}ms`));
      }, ms);
      timer.unref?.();
    });

    return Promise.race([promise, timeout]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }
}
