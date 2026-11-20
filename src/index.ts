import { Server } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types";
import type {
  CallToolRequest,
  CallToolResult,
  ListToolsRequest,
  ListToolsResult,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types";
import { loadConfig } from "./config.js";
import { FigcraftController } from "./state.js";
import { createCallToolHandler, createListToolsHandler } from "./tools.js";
import { initLogger, log, logFilePath } from "./log.js";

// This process is long-running by design: a stray rejection must never take it down.
process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  log("error", `unhandled rejection: ${message}`);
});

process.on("uncaughtException", (error) => {
  log("error", `uncaught exception: ${error?.stack ?? String(error)}`);
});

async function main(): Promise<void> {
  const config = loadConfig();
  initLogger(config.logFile, config.logMaxBytes);

  const controller = new FigcraftController(config);

  const server = new Server<ListToolsRequest, ServerNotification, ListToolsResult>(
    { name: "figcraft-mcp", version: "0.1.0" },
    { capabilities: { tools: { listChanged: true } } },
  );

  const listToolsHandler = async (
    _request: ListToolsRequest,
    _extra: unknown,
  ): Promise<ListToolsResult> => {
    const handler = createListToolsHandler(controller);
    return handler();
  };

  const callToolHandler = async (
    request: CallToolRequest,
    _extra: unknown,
  ): Promise<CallToolResult> => {
    const handler = createCallToolHandler(controller);
    return handler(request);
  };

  server.setRequestHandler(ListToolsRequestSchema, listToolsHandler);
  server.setRequestHandler(CallToolRequestSchema, callToolHandler);

  await server.connect(new StdioServerTransport());

  // Tell the client to re-list tools whenever the backend appears/disappears,
  // so FigCraft's design tools show up without restarting OpenCode.
  controller.onStateChange = () => {
    void server.sendToolListChanged().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      log("warn", `sendToolListChanged failed: ${message}`);
    });
  };

  log(
    "info",
    `started (port ${config.autoPort ? "auto" : `${config.host}:${config.port}`}, poll ${config.pollIntervalMs}ms, log ${logFilePath() ?? "off"})`,
  );
  controller.start();

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log("info", "shutting down");
    await controller.dispose();
    try {
      await server.close();
    } catch {
      // ignore shutdown errors
    }
    process.exit(0);
  };

  process.on("SIGTERM", () => {
    void shutdown();
  });
  process.on("SIGINT", () => {
    void shutdown();
  });

  // The client going away (OpenCode reload/quit) also means we should exit cleanly.
  process.stdin.on("end", () => {
    void shutdown();
  });
  process.stdin.on("close", () => {
    void shutdown();
  });
}

void main().catch((error) => {
  process.stderr.write(
    `[figcraft-mcp] fatal: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
