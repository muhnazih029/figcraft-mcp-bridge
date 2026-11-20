# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | ✅ |

## Reporting a vulnerability

Do not open a public issue for security problems. Use GitHub Security Advisory
("Report a vulnerability") on this repository and include:

- versions of the bridge, Bun, FigCraft and OpenCode;
- steps to reproduce;
- the potential impact.

Reports are answered within 7 days.

## Important note

The FigCraft control port is a loopback TCP socket **without authentication**.
Any process running as the same user on the same machine can send design commands
(read documents, edit layers, export/save files). Never forward this port to a
network, and never put credentials in the bridge environment.
