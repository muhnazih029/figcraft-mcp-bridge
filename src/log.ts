import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname } from "node:path";

export type LogLevel = "info" | "warn" | "error";

const DEFAULT_MAX_BYTES = 1_000_000;

let target: string | null = null;
let maxBytes = DEFAULT_MAX_BYTES;

/**
 * Enables append-only file logging. OpenCode swallows an MCP server's stderr,
 * so a file is the only durable way to inspect bridge state transitions.
 */
export function initLogger(file: string | undefined, limitBytes = DEFAULT_MAX_BYTES): void {
  maxBytes = limitBytes > 0 ? limitBytes : DEFAULT_MAX_BYTES;
  if (!file) {
    target = null;
    return;
  }
  try {
    mkdirSync(dirname(file), { recursive: true });
    target = file;
  } catch {
    target = null;
  }
}

export function logFilePath(): string | null {
  return target;
}

function rotateIfNeeded(file: string): void {
  try {
    if (statSync(file).size < maxBytes) return;
    // Keep exactly one previous generation: bridge.log.1
    renameSync(file, `${file}.1`);
  } catch {
    // file missing or unreadable: nothing to rotate
  }
}

export function log(level: LogLevel, message: string): void {
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`;
  process.stderr.write(`[figcraft-mcp] ${line}\n`);

  if (!target) return;
  try {
    rotateIfNeeded(target);
    appendFileSync(target, `${line}\n`);
  } catch {
    // logging must never break the bridge
  }
}
