/**
 * Portable stdio smoke test. Does not need FigCraft Desktop: it forces an
 * unused control port and verifies that the bridge still answers MCP requests.
 */
import { spawn } from "node:child_process";

const REPO_DIR = new URL("..", import.meta.url).pathname;
const PORT = "49199";

const child = spawn("bun", ["run", "src/index.ts"], {
  cwd: REPO_DIR,
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...process.env,
    FIGCRAFT_PORT: PORT,
    FIGCRAFT_LOG_FILE: "none",
    FIGCRAFT_POLL_INTERVAL_MS: "500",
  },
});

let buffer = "";
const pending = new Map<number, (value: any) => void>();
let nextId = 1;

child.stdout!.on("data", (chunk) => {
  buffer += chunk.toString();
  let index: number;
  while ((index = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)!(message);
      pending.delete(message.id);
    }
  }
});

child.stderr!.on("data", () => {
  // stderr is intentionally ignored: the server logs there, stdout is JSON-RPC only.
});

function send(payload: unknown): void {
  child.stdin!.write(`${JSON.stringify(payload)}\n`);
}

function request(method: string, params?: unknown): Promise<any> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${method}`)), 15000);
    pending.set(id, (value) => {
      clearTimeout(timer);
      resolve(value);
    });
    send({ jsonrpc: "2.0", id, method, params });
  });
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
  console.log(`ok - ${message}`);
}

let failed = false;
try {
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const init = await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke", version: "0.0.0" },
  });
  assert(init.result?.serverInfo?.name === "figcraft-mcp", "initialize returns figcraft-mcp");

  send({ jsonrpc: "2.0", method: "notifications/initialized" });

  const listed = await request("tools/list");
  const names: string[] = (listed.result?.tools ?? []).map((tool: any) => tool.name);
  assert(names.includes("figcraft_status"), "figcraft_status is listed");
  assert(names.includes("figcraft_commands"), "figcraft_commands is listed");
  assert(names.includes("figcraft_launch"), "figcraft_launch is listed");

  const status = await request("tools/call", { name: "figcraft_status", arguments: {} });
  const payload = JSON.parse(status.result.content[0].text);
  assert(payload.state === "waiting_for_app", "status is waiting_for_app with app closed");
  assert(payload.port === Number(PORT), "status reports the configured port");
  assert(typeof payload.hint === "string", "status includes an actionable hint");
} catch (error) {
  failed = true;
  const message = error instanceof Error ? error.message : String(error);
  console.error(`not ok - ${message}`);
} finally {
  child.kill();
}

process.exit(failed ? 1 : 0);
