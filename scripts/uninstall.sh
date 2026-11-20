#!/usr/bin/env bash
# Uninstall helper for figcraft-mcp.
# Usage: ./scripts/uninstall.sh [--keep-config]
# By default also removes the MCP entry from opencode.json and omcp.json (with .bak backups).
set -uo pipefail

KEEP_CONFIG=0
if [[ "${1:-}" == "--keep-config" ]]; then
  KEEP_CONFIG=1
elif [[ -n "${1:-}" ]]; then
  echo "Usage: $0 [--keep-config]" >&2
  exit 1
fi

echo "== figcraft-mcp uninstall =="

LAUNCHER="$HOME/.local/bin/figcraft-gui"
if [[ -f "$LAUNCHER" ]]; then
  if grep -q 'figcraft --control' "$LAUNCHER"; then
    rm -f "$LAUNCHER"
    echo "dihapus: $LAUNCHER"
  else
    echo "dilewati (bukan launcher figcraft-mcp): $LAUNCHER"
  fi
else
  echo "tidak ada launcher: $LAUNCHER"
fi

DESKTOP_DIR="$HOME/.local/share/applications"
DESKTOP="$DESKTOP_DIR/ai.storyteller.figcraft.desktop"
if [[ -f "$DESKTOP" ]]; then
  if grep -Eq 'figcraft-gui|--control' "$DESKTOP"; then
    rm -f "$DESKTOP"
    echo "dihapus: $DESKTOP"
    if command -v update-desktop-database >/dev/null 2>&1; then
      update-desktop-database "$DESKTOP_DIR" >/dev/null 2>&1 || true
    fi
  else
    echo "dilewati (bukan override figcraft-mcp): $DESKTOP"
  fi
else
  echo "tidak ada override .desktop: $DESKTOP"
fi

if [[ "$KEEP_CONFIG" -eq 1 ]]; then
  echo "config dilewati (--keep-config)"
else
  for P in "$HOME/.config/opencode/opencode.json" "$HOME/.config/opencode/omcp.json"; do
    if [[ ! -f "$P" ]]; then
      echo "tidak ada config: $P"
      continue
    fi
    P="$P" bun -e '
      const fs = require("fs");
      const p = process.env.P;
      const original = fs.readFileSync(p, "utf8");
      const d = JSON.parse(original);
      fs.writeFileSync(`${p}.bak`, original);
      if (d.mcp && d.mcp.servers) delete d.mcp.servers["figcraft-mcp"];
      if (d.catalog) delete d.catalog["figcraft-mcp"];
      if (d.profiles) {
        for (const profile of Object.values(d.profiles)) {
          if (Array.isArray(profile.servers)) {
            profile.servers = profile.servers.filter((s) => s !== "figcraft-mcp");
          }
        }
      }
      fs.writeFileSync(p, JSON.stringify(d, null, 2) + "\n");
      console.log("dibersihkan:", p, "(backup:", `${p}.bak`, ")");
    '
  done
fi

echo
echo "Selesai. Folder source tidak dihapus — jalankan scripts/install.sh untuk pasang lagi."
echo "Catatan: proses bridge yang sedang berjalan akan berhenti setelah OpenCode direstart."
