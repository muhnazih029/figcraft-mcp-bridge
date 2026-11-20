import { spawn } from "node:child_process";
import type { FigcraftMcpConfig } from "./config.js";
import { isPortOpen } from "./probe.js";
import { FigcraftBackend } from "./backend.js";
import { findFigcraftProcesses, type FigcraftProcessInfo } from "./discover.js";
import { log } from "./log.js";

export type FigcraftState = "waiting_for_app" | "attaching" | "connected";

export interface FigcraftStatus {
  appRunning: boolean;
  host: string;
  port: number;
  state: FigcraftState;
  backendToolNames: string[];
  lastError?: string;
  /** Explanation when a FigCraft process exists but its control port is missing/mismatched. */
  diagnostic?: string;
  hint?: string;
  startedAt?: string;
  attachAttempts?: number;
  detectedPort?: number | null;
  appProcesses?: Array<{ pid: number; controlPort: number | null }>;
}

export interface LaunchResult {
  ok: boolean;
  message: string;
}

const MAX_BACKOFF_MS = 30_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class FigcraftController {
  readonly config: FigcraftMcpConfig;
  status: FigcraftStatus;
  /** Fired whenever the visible tool set may have changed. */
  onStateChange?: (state: FigcraftState) => void;
  private _backend: FigcraftBackend | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private failures = 0;
  private nextAttemptAt = 0;
  private activePort: number;
  private lastDiagnostic?: string;

  constructor(config: FigcraftMcpConfig) {
    this.config = config;
    this.activePort = config.port;
    this.status = {
      appRunning: false,
      host: config.host,
      port: config.port,
      state: "waiting_for_app",
      backendToolNames: [],
      attachAttempts: 0,
      detectedPort: null,
      appProcesses: [],
      hint: this.hintFor("waiting_for_app"),
    };
  }

  get backend(): FigcraftBackend | null {
    return this._backend;
  }

  get port(): number {
    return this.activePort;
  }

  private setState(state: FigcraftState): void {
    if (this.status.state === state) return;
    const previous = this.status.state;
    this.status.state = state;
    this.status.hint = this.hintFor(state);
    log(
      "info",
      `state ${previous} -> ${state}` +
        (state === "connected" ? ` (${this.status.backendToolNames.length} tools)` : "") +
        (state === "waiting_for_app" && this.status.lastError
          ? ` (${this.status.lastError})`
          : ""),
    );
    this.onStateChange?.(state);
  }

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.pollIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async dispose(): Promise<void> {
    this.stop();
    const backend = this._backend;
    this._backend = null;
    this.status.state = "waiting_for_app";
    this.status.backendToolNames = [];
    if (backend) {
      await backend.close();
    }
  }

  /**
   * Starts FigCraft Desktop with its control port (unless it is already running),
   * waits for the port, then attaches. Used by the `figcraft_launch` tool.
   */
  async launchAndAttach(waitMs = this.config.launchTimeoutMs): Promise<LaunchResult> {
    if (this.status.state === "connected") {
      return { ok: true, message: `Already connected on ${this.config.host}:${this.activePort}.` };
    }

    const processes = await findFigcraftProcesses();
    this.status.appProcesses = processes.map(({ pid, controlPort }) => ({ pid, controlPort }));

    const withoutControl = processes.filter((proc) => proc.controlPort === null);
    if (withoutControl.length > 0) {
      const pids = withoutControl.map((proc) => proc.pid).join(", ");
      return {
        ok: false,
        message: `FigCraft is already running without a control port (pid ${pids}). Close it and reopen it via the FigCraft launcher so it starts with --control ${this.activePort}.`,
      };
    }

    const withControl = processes.find((proc): proc is FigcraftProcessInfo & { controlPort: number } =>
      proc.controlPort !== null,
    );

    if (withControl) {
      if (withControl.controlPort !== this.activePort) {
        if (!this.config.autoPort) {
          return {
            ok: false,
            message: `FigCraft is running on control port ${withControl.controlPort}, but this bridge expects ${this.activePort}. Set FIGCRAFT_PORT=${withControl.controlPort} or FIGCRAFT_PORT=auto.`,
          };
        }
        this.adoptPort(withControl.controlPort);
      }
      log("info", `reusing running FigCraft on port ${this.activePort}`);
    } else {
      const launched = this.spawnApp();
      if (!launched.ok) return launched;
    }

    const deadline = Date.now() + waitMs;
    let open = false;
    while (Date.now() < deadline) {
      if (await isPortOpen(this.config.host, this.activePort, 500)) {
        open = true;
        break;
      }
      await sleep(400);
    }

    if (!open) {
      return {
        ok: false,
        message: `FigCraft did not open its control port on ${this.config.host}:${this.activePort} within ${waitMs}ms.`,
      };
    }

    this.failures = 0;
    this.nextAttemptAt = 0;
    await this.tick();

    return String(this.status.state) === "connected"
      ? {
          ok: true,
          message: `Connected to FigCraft on ${this.config.host}:${this.activePort} (${this.status.backendToolNames.length} tools).`,
        }
      : {
          ok: false,
          message: `Control port ${this.activePort} is open, but attaching failed: ${this.status.lastError ?? "unknown error"}.`,
        };
  }

  private spawnApp(): LaunchResult {
    try {
      const child = spawn(this.config.appPath, ["--control", String(this.activePort)], {
        detached: true,
        stdio: "ignore",
      });
      child.on("error", (error) => {
        log("error", `failed to launch ${this.config.appPath}: ${error.message}`);
      });
      child.unref();
      log("info", `launching ${this.config.appPath} --control ${this.activePort}`);
      return { ok: true, message: "launched" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("error", `failed to launch FigCraft: ${message}`);
      return { ok: false, message: `Could not launch ${this.config.appPath}: ${message}` };
    }
  }

  private adoptPort(port: number): void {
    if (port === this.activePort) return;
    log("info", `adopting FigCraft control port ${port} (was ${this.activePort})`);
    this.activePort = port;
    this.status.port = port;
    this.status.detectedPort = port;
  }

  private hintFor(state: FigcraftState): string | undefined {
    switch (state) {
      case "waiting_for_app":
        return `FigCraft Desktop is not reachable on ${this.config.host}:${this.activePort}. Use the figcraft_launch tool, or open it via the FigCraft launcher; this bridge attaches automatically.`;
      case "attaching":
        return "Attaching to FigCraft Desktop control server...";
      case "connected":
        return undefined;
    }
  }

  private resetConnection(reason?: string): void {
    const backend = this._backend;
    this._backend = null;
    this.status.backendToolNames = [];
    this.status.startedAt = undefined;
    this.status.lastError = reason;
    this.setState("waiting_for_app");
    if (backend) {
      void backend.close();
    }
  }

  private setDiagnostic(message: string | undefined): void {
    this.status.diagnostic = message;
    if (this.lastDiagnostic === message) return;
    this.lastDiagnostic = message;
    if (message) log("warn", message);
  }

  private async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;

    try {
      let appRunning = await isPortOpen(this.config.host, this.activePort, 1000);

      if (!appRunning) {
        // The configured port is closed: inspect the actual app process to explain why,
        // and adopt its port when FIGCRAFT_PORT=auto.
        const processes = await findFigcraftProcesses();
        this.status.appProcesses = processes.map(({ pid, controlPort }) => ({ pid, controlPort }));

        const withControl = processes.find(
          (proc): proc is FigcraftProcessInfo & { controlPort: number } => proc.controlPort !== null,
        );
        this.status.detectedPort = withControl?.controlPort ?? null;

        if (withControl && this.config.autoPort && withControl.controlPort !== this.activePort) {
          this.adoptPort(withControl.controlPort);
          this.setDiagnostic(undefined);
          appRunning = await isPortOpen(this.config.host, this.activePort, 1000);
        } else if (withControl && withControl.controlPort !== this.activePort) {
          this.setDiagnostic(
            `FigCraft is running on control port ${withControl.controlPort}, but this bridge expects ${this.activePort}. Set FIGCRAFT_PORT=${withControl.controlPort} (or FIGCRAFT_PORT=auto).`,
          );
        } else if (processes.length > 0) {
          this.setDiagnostic(
            `FigCraft is running without a control port (pid ${processes.map((p) => p.pid).join(", ")}). Close it and reopen it via the FigCraft launcher (or call figcraft_launch).`,
          );
        } else {
          this.setDiagnostic(undefined);
        }
      } else {
        this.setDiagnostic(undefined);
      }

      if (!appRunning) {
        this.failures = 0;
        this.nextAttemptAt = 0;
        this.status.appRunning = false;
        if (this.status.state !== "waiting_for_app") {
          this.resetConnection("FigCraft Desktop control port closed");
        }
        return;
      }

      this.status.appRunning = true;

      // Backend died while the app is still up: drop it and re-attach.
      if (this.status.state === "connected" && !this._backend?.isConnected) {
        this.resetConnection("backend connection lost");
      }

      if (this.status.state !== "waiting_for_app") return;
      if (Date.now() < this.nextAttemptAt) return;

      this.status.lastError = undefined;
      this.setState("attaching");

      const backend = new FigcraftBackend(this.config, {
        onLost: (reason) => {
          if (this._backend !== backend) return;
          this.resetConnection(reason);
          this.scheduleRetry();
        },
      });

      try {
        await backend.connect();
        this._backend = backend;
        this.failures = 0;
        this.nextAttemptAt = 0;
        this.status.backendToolNames = backend.tools.map((tool) => tool.name);
        this.status.startedAt = new Date().toISOString();
        this.status.attachAttempts = 0;
        this.setState("connected");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.status.lastError = message;
        log("warn", `attach failed: ${message}`);
        this.setState("waiting_for_app");
        await backend.close();
        this.scheduleRetry();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.status.lastError = message;
      log("error", `probe failed: ${message}`);
      this.scheduleRetry();
    } finally {
      this.busy = false;
    }
  }

  private scheduleRetry(): void {
    this.failures += 1;
    this.status.attachAttempts = this.failures;
    const delay = Math.min(MAX_BACKOFF_MS, this.config.pollIntervalMs * 2 ** this.failures);
    this.nextAttemptAt = Date.now() + delay;
    log("info", `retry in ${delay}ms (attempt ${this.failures})`);
  }
}
