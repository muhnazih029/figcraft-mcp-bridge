import { readFile, readdir } from "node:fs/promises";

export interface FigcraftProcessInfo {
  pid: number;
  command: string;
  /** Value of `--control <port>` / `--control=<port>`, or null when the app runs without it. */
  controlPort: number | null;
}

/**
 * Finds running FigCraft Desktop (GUI) processes by inspecting /proc, so the bridge
 * can tell "app closed" apart from "app open but no control port".
 */
export async function findFigcraftProcesses(): Promise<FigcraftProcessInfo[]> {
  let entries: string[];
  try {
    entries = await readdir("/proc");
  } catch {
    return [];
  }

  const pids = entries.filter((entry) => /^\d+$/.test(entry));
  const found = await Promise.all(
    pids.map(async (pidText) => {
      const pid = Number(pidText);
      if (pid === process.pid) return null;

      let raw: string;
      try {
        raw = await readFile(`/proc/${pid}/cmdline`, "utf8");
      } catch {
        return null;
      }
      if (!raw) return null;

      const args = raw.split("\0").filter((arg) => arg.length > 0);
      if (args.length === 0) return null;

      // Only the GUI binary; figcraft-cli is a separate tool and not the app.
      const executable = args[0].split("/").pop() ?? "";
      if (executable !== "figcraft") return null;

      let controlPort: number | null = null;
      for (let i = 1; i < args.length; i += 1) {
        const arg = args[i];
        if (arg === "--control" && args[i + 1]) {
          const parsed = Number(args[i + 1]);
          controlPort = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
        } else if (arg.startsWith("--control=")) {
          const parsed = Number(arg.slice("--control=".length));
          controlPort = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
        }
      }

      return { pid, command: args.join(" "), controlPort };
    }),
  );

  return found
    .filter((info): info is FigcraftProcessInfo => info !== null)
    .sort((a, b) => a.pid - b.pid);
}
