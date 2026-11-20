# Changelog

Semua perubahan penting dicatat di sini. Format mengikuti
[Keep a Changelog](https://keepachangelog.com/id/1.1.0/) dan proyek menggunakan
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-20

### Added

- MCP server Bun/TypeScript (stdio) untuk FigCraft Desktop.
- Auto-attach ke `figcraft-cli mcp --attach <port>` saat control port tersedia.
- Auto-reconnect saat FigCraft ditutup lalu dibuka lagi.
- Tool `figcraft_launch` untuk menyalakan FigCraft dari agent.
- Tool `figcraft_status` dan `figcraft_commands` beserta diagnosa proses.
- Deteksi port otomatis lewat `FIGCRAFT_PORT=auto`.
- Forward 19 tool design FigCraft ke OpenCode.
- Log file dengan rotasi otomatis.
- Skrip `install.sh`, `uninstall.sh`, `doctor.sh`.
- Unit test, smoke test, dan CI GitHub Actions.
