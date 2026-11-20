# Contributing

## Setup

```bash
bun install
bun run typecheck
bun run test
bun run smoke
```

`smoke` spawns the MCP server over stdio with an unused control port, so it works
without FigCraft Desktop installed.

## Structure

| Path | Responsibility |
|---|---|
| `src/index.ts` | MCP server wiring, stdio transport, shutdown handling |
| `src/config.ts` | environment configuration |
| `src/state.ts` | connection state machine, re-attach, relaunch, diagnostics |
| `src/backend.ts` | child `figcraft-cli mcp --attach` client |
| `src/discover.ts` | finds running FigCraft GUI processes via `/proc` |
| `src/probe.ts` | TCP port probe |
| `src/tools.ts` | meta-tools and backend tool forwarding |
| `src/log.ts` | stderr + rotating file log |

## Adding a meta-tool

Register it in `META_TOOLS` in `src/tools.ts` and handle its name in
`createCallToolHandler`. Keep stdout clean: write diagnostics through `log()`.

## Before opening a PR

- `bun run typecheck` must pass.
- `bun run test` and `bun run smoke` must pass.
- Update `README.md` when behaviour or environment variables change.
