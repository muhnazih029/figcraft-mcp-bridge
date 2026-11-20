import type { CallToolRequest, CallToolResult, ListToolsResult, Tool } from "@modelcontextprotocol/sdk/types";
import type { FigcraftController } from "./state.js";

const META_TOOLS: Tool[] = [
  {
    name: "figcraft_status",
    description:
      "Check whether the FigCraft Desktop control server is running and whether this MCP bridge is attached.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "figcraft_commands",
    description:
      "List available FigCraft design tools. Only populated when attached to a running FigCraft Desktop.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "figcraft_launch",
    description:
      "Start FigCraft Desktop with its MCP control port (or reuse an already running instance), wait for the port, and attach the bridge. Call this when figcraft_status reports waiting_for_app and you want to design.",
    inputSchema: {
      type: "object",
      properties: {
        waitMs: {
          type: "number",
          description: "How long to wait for the control port to open (default 20000 ms).",
        },
      },
    },
  },
];

export function createListToolsHandler(controller: FigcraftController) {
  return async (): Promise<ListToolsResult> => {
    const tools: Tool[] = [...META_TOOLS];

    if (controller.status.state === "connected" && controller.backend) {
      for (const backendTool of controller.backend.tools) {
        tools.push({
          name: backendTool.name,
          description: backendTool.description ?? "FigCraft design tool.",
          inputSchema:
            (backendTool.inputSchema ?? { type: "object", properties: {} }) as Tool["inputSchema"],
        });
      }
    }

    return { tools };
  };
}

export function createCallToolHandler(controller: FigcraftController) {
  return async (request: CallToolRequest): Promise<CallToolResult> => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;

    if (name === "figcraft_status") {
      return { content: [{ type: "text", text: JSON.stringify(controller.status, null, 2) }] };
    }

    if (name === "figcraft_commands") {
      const payload =
        controller.status.state === "connected" && controller.backend
          ? {
              state: controller.status.state,
              tools: controller.backend.tools.map((tool) => ({
                name: tool.name,
                description: tool.description ?? null,
              })),
            }
          : {
              state: controller.status.state,
              hint: controller.status.hint,
              lastError: controller.status.lastError ?? null,
              diagnostic: controller.status.diagnostic ?? null,
              detectedPort: controller.status.detectedPort ?? null,
              appProcesses: controller.status.appProcesses ?? [],
            };
      return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
    }

    if (name === "figcraft_launch") {
      const waitMs =
        typeof args.waitMs === "number" && Number.isFinite(args.waitMs) && args.waitMs > 0
          ? args.waitMs
          : undefined;
      const result = await controller.launchAndAttach(waitMs);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { ok: result.ok, message: result.message, status: controller.status },
              null,
              2,
            ),
          },
        ],
        isError: !result.ok,
      };
    }

    if (controller.status.backendToolNames.includes(name)) {
      const backend = controller.backend;
      if (!backend) {
        return {
          content: [
            { type: "text", text: JSON.stringify({ ok: false, error: `FIGCRAFT_NOT_CONNECTED: ${controller.status.state}` }) },
          ],
          isError: true,
        };
      }

      try {
        const result = await backend.callTool(name, args);
        return { content: result.content, isError: result.isError };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ok: false,
                error: message.startsWith("FIGCRAFT_NOT_CONNECTED")
                  ? message
                  : `FIGCRAFT_TOOL_FAILED: ${message}`,
                state: controller.status.state,
                hint: controller.status.hint,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    return {
      content: [{ type: "text", text: JSON.stringify({ ok: false, error: `UNKNOWN_TOOL: ${name}` }) }],
      isError: true,
    };
  };
}
