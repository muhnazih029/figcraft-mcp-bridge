import { homedir } from "node:os";
import { join } from "node:path";

export interface FigcraftMcpConfig {
  host: string;
  port: number;
  /** When true (`FIGCRAFT_PORT=auto`), adopt the port found in the running app's `--control` flag. */
  autoPort: boolean;
  cliPath: string;
  appPath: string;
  pollIntervalMs: number;
  attachTimeoutMs: number;
  launchTimeoutMs: number;
  logFile?: string;
  logMaxBytes: number;
  automationReadRoot?: string;
  automationWriteRoot?: string;
}

export const DEFAULT_LOG_FILE = join(
  process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
  "figcraft-mcp",
  "bridge.log",
);

export const DEFAULT_CONFIG: FigcraftMcpConfig = {
  host: "127.0.0.1",
  port: 7979,
  autoPort: false,
  cliPath: "/usr/bin/figcraft-cli",
  appPath: "/usr/bin/figcraft",
  pollIntervalMs: 1500,
  attachTimeoutMs: 5000,
  launchTimeoutMs: 20000,
  logFile: DEFAULT_LOG_FILE,
  logMaxBytes: 1_000_000,
};

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): FigcraftMcpConfig {
  const logFile = env.FIGCRAFT_LOG_FILE;
  const portValue = env.FIGCRAFT_PORT;

  return {
    host: env.FIGCRAFT_HOST ?? DEFAULT_CONFIG.host,
    port: positiveInt(portValue, DEFAULT_CONFIG.port),
    autoPort: portValue === "auto",
    cliPath: env.FIGCRAFT_CLI_PATH ?? DEFAULT_CONFIG.cliPath,
    appPath: env.FIGCRAFT_APP_PATH ?? DEFAULT_CONFIG.appPath,
    pollIntervalMs: positiveInt(env.FIGCRAFT_POLL_INTERVAL_MS, DEFAULT_CONFIG.pollIntervalMs),
    attachTimeoutMs: positiveInt(env.FIGCRAFT_ATTACH_TIMEOUT_MS, DEFAULT_CONFIG.attachTimeoutMs),
    launchTimeoutMs: positiveInt(env.FIGCRAFT_LAUNCH_TIMEOUT_MS, DEFAULT_CONFIG.launchTimeoutMs),
    // "none" disables file logging; unset keeps the default path.
    logFile: logFile === "none" ? undefined : (logFile ?? DEFAULT_CONFIG.logFile),
    logMaxBytes: positiveInt(env.FIGCRAFT_LOG_MAX_BYTES, DEFAULT_CONFIG.logMaxBytes),
    automationReadRoot: env.FIGCRAFT_AUTOMATION_READ_ROOT,
    automationWriteRoot: env.FIGCRAFT_AUTOMATION_WRITE_ROOT,
  };
}
