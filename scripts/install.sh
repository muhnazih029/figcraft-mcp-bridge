#!/usr/bin/env bash
# Install helper for figcraft-mcp: deps, launcher, .desktop override, and config hint.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${FIGCRAFT_PORT:-7979}"
case "$PORT" in
  '' | *[!0-9]*) PORT=7979 ;;
esac

echo "== figcraft-mcp installer =="
echo "repo: $REPO_DIR"
echo "control port: $PORT"

if ! command -v bun >/dev/null 2>&1; then
  echo "ERROR: bun not found. Install it from https://bun.sh" >&2
  exit 1
fi

(cd "$REPO_DIR" && bun install)

FIGCRAFT_BIN="$(command -v figcraft || true)"
CLI_BIN="$(command -v figcraft-cli || true)"

if [[ -z "$FIGCRAFT_BIN" ]]; then
  echo "WARNING: 'figcraft' is not on PATH. Set FIGCRAFT_APP_PATH in your OpenCode config."
fi
if [[ -z "$CLI_BIN" ]]; then
  echo "WARNING: 'figcraft-cli' is not on PATH. Set FIGCRAFT_CLI_PATH in your OpenCode config."
fi

mkdir -p "$HOME/.local/bin"
LAUNCHER="$HOME/.local/bin/figcraft-gui"

if [[ -e "$LAUNCHER" ]]; then
  echo "launcher already exists, skipping: $LAUNCHER"
else
  cat > "$LAUNCHER" <<EOF
#!/bin/sh
# Open FigCraft Desktop with its MCP control port enabled.
exec "${FIGCRAFT_BIN:-/usr/bin/figcraft}" --control $PORT "\$@"
EOF
  chmod +x "$LAUNCHER"
  echo "created: $LAUNCHER"
fi

DESKTOP_DIR="$HOME/.local/share/applications"
mkdir -p "$DESKTOP_DIR"
DESKTOP="$DESKTOP_DIR/ai.storyteller.figcraft.desktop"

if [[ -f "$DESKTOP" ]] && grep -Eq '(--control|figcraft-gui)' "$DESKTOP"; then
  echo "desktop entry already carries a control port, skipping: $DESKTOP"
else
  cat > "$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=FigCraft
GenericName=Interface Design Tool
Comment=Design and prototype user interfaces (MCP control port enabled)
Exec=$LAUNCHER %U
TryExec=$LAUNCHER
Icon=ai.storyteller.figcraft
Terminal=false
StartupNotify=true
StartupWMClass=ai.storyteller.figcraft
Categories=Graphics;2DGraphics;VectorGraphics;X-Design;
Keywords=design;interface;ui;ux;prototype;wireframe;mockup;vector;layout;components;
MimeType=application/x-figcraft;image/svg+xml;image/png;image/jpeg;application/x-sketch;x-scheme-handler/figcraft;
EOF
  echo "created: $DESKTOP"
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$DESKTOP_DIR" >/dev/null 2>&1 || true
fi

echo
echo "== Add this entry under mcp.servers in opencode.json =="
cat <<EOF
"figcraft-mcp": {
  "type": "local",
  "command": ["bun", "run", "$REPO_DIR/src/index.ts"],
  "environment": { "FIGCRAFT_PORT": "auto" },
  "enabled": true
}
EOF
echo
echo "Then restart OpenCode once. Verify with: ./scripts/doctor.sh"
