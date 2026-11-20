# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-20

### Added

- Bun/TypeScript MCP server (stdio) for FigCraft Desktop.
- Auto-attach to `figcraft-cli mcp --attach <port>` when the control port opens.
- Auto-reconnect when FigCraft is closed and reopened.
- `figcraft_launch` tool for starting FigCraft from the agent.
- `figcraft_status` and `figcraft_commands` meta-tools with process diagnostics.
- Automatic port detection via `FIGCRAFT_PORT=auto`.
- Forwarding of all 19 FigCraft design tools to OpenCode.
- Rotating log file.
- `install.sh`, `uninstall.sh` and `doctor.sh` helper scripts.
- Unit tests, smoke test and GitHub Actions CI.
