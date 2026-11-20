import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG, DEFAULT_LOG_FILE, loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  test("uses documented defaults", () => {
    const config = loadConfig({});
    expect(config.host).toBe(DEFAULT_CONFIG.host);
    expect(config.port).toBe(7979);
    expect(config.autoPort).toBe(false);
    expect(config.cliPath).toBe("/usr/bin/figcraft-cli");
    expect(config.appPath).toBe("/usr/bin/figcraft");
    expect(config.pollIntervalMs).toBe(1500);
    expect(config.attachTimeoutMs).toBe(5000);
    expect(config.launchTimeoutMs).toBe(20000);
    expect(config.logFile).toBe(DEFAULT_LOG_FILE);
  });

  test("honours env overrides", () => {
    const config = loadConfig({
      FIGCRAFT_HOST: "127.0.0.2",
      FIGCRAFT_PORT: "8765",
      FIGCRAFT_CLI_PATH: "/opt/figcraft-cli",
      FIGCRAFT_APP_PATH: "/opt/figcraft",
      FIGCRAFT_POLL_INTERVAL_MS: "300",
      FIGCRAFT_ATTACH_TIMEOUT_MS: "900",
      FIGCRAFT_LAUNCH_TIMEOUT_MS: "7000",
      FIGCRAFT_LOG_FILE: "/tmp/bridge.log",
      FIGCRAFT_LOG_MAX_BYTES: "5000",
    });

    expect(config.host).toBe("127.0.0.2");
    expect(config.port).toBe(8765);
    expect(config.cliPath).toBe("/opt/figcraft-cli");
    expect(config.appPath).toBe("/opt/figcraft");
    expect(config.pollIntervalMs).toBe(300);
    expect(config.attachTimeoutMs).toBe(900);
    expect(config.launchTimeoutMs).toBe(7000);
    expect(config.logFile).toBe("/tmp/bridge.log");
    expect(config.logMaxBytes).toBe(5000);
  });

  test("treats FIGCRAFT_PORT=auto as auto-detect", () => {
    const config = loadConfig({ FIGCRAFT_PORT: "auto" });
    expect(config.autoPort).toBe(true);
    expect(config.port).toBe(7979);
  });

  test("disables the log file on 'none'", () => {
    expect(loadConfig({ FIGCRAFT_LOG_FILE: "none" }).logFile).toBeUndefined();
  });

  test("falls back for invalid positive integers", () => {
    const config = loadConfig({
      FIGCRAFT_PORT: "nope",
      FIGCRAFT_POLL_INTERVAL_MS: "0",
      FIGCRAFT_ATTACH_TIMEOUT_MS: "-5",
      FIGCRAFT_LOG_MAX_BYTES: "abc",
    });
    expect(config.port).toBe(7979);
    expect(config.pollIntervalMs).toBe(1500);
    expect(config.attachTimeoutMs).toBe(5000);
    expect(config.logMaxBytes).toBe(1_000_000);
  });
});
