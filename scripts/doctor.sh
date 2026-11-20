#!/usr/bin/env bash
# Read-only health check for figcraft-mcp.
set -uo pipefail

echo "== figcraft-mcp doctor =="

for bin in bun figcraft figcraft-cli; do
  if path="$(command -v "$bin" 2>/dev/null)"; then
    echo "OK   $bin -> $path"
  else
    echo "WARN $bin tidak ada di PATH (boleh di-set lewat FIGCRAFT_*_PATH)"
  fi
done

echo
echo "== Proses FigCraft & control port =="
FOUND=0
for cmdline in /proc/[0-9]*/cmdline; do
  [[ -r "$cmdline" ]] || continue
  args="$(tr '\0' ' ' < "$cmdline" 2>/dev/null)" || continue
  [[ -z "$args" ]] && continue

  # Hanya proses GUI `figcraft`, bukan figcraft-cli / shell yang menyebut nama figcraft.
  first="${args%% *}"
  exe="${first##*/}"
  [[ "$exe" == "figcraft" ]] || continue

  pid="${cmdline#/proc/}"
  pid="${pid%/cmdline}"
  port="$(printf '%s' "$args" | sed -n 's/.*--control[ =]\([0-9][0-9]*\).*/\1/p')"
  if [[ -n "$port" ]]; then
    echo "OK   pid $pid jalan dengan --control $port"
    if timeout 2 bash -c "exec 3<>/dev/tcp/127.0.0.1/$port" 2>/dev/null; then
      echo "OK   port $port bisa dihubungkan"
    else
      echo "WARN port $port tidak bisa dihubungkan"
    fi
  else
    echo "WARN pid $pid jalan TANPA --control (tidak bisa di-attach)"
  fi
  FOUND=1
done
if [[ "$FOUND" -eq 0 ]]; then
  echo "INFO tidak ada proses FigCraft. Panggil tool figcraft_launch atau buka dari DMS."
fi

echo
echo "== Entry .desktop =="
DESKTOP="$HOME/.local/share/applications/ai.storyteller.figcraft.desktop"
if [[ -f "$DESKTOP" ]]; then
  grep -E '^(Exec|TryExec)=' "$DESKTOP" || true
  if grep -Eq '(--control|figcraft-gui)' "$DESKTOP"; then
    echo "OK   .desktop membawa control port (langsung atau lewat launcher)"
  else
    echo "WARN .desktop tidak punya --control; jalankan scripts/install.sh"
  fi
else
  entry="$(grep -rl 'figcraft' /usr/share/applications 2>/dev/null | head -1 || true)"
  if [[ -n "$entry" ]]; then
    echo "WARN override user belum ada. Entry sistem: $entry"
    grep -E '^Exec=' "$entry" || true
  else
    echo "INFO entry .desktop FigCraft tidak ditemukan."
  fi
fi

echo
echo "== Log terakhir =="
LOG="${XDG_DATA_HOME:-$HOME/.local/share}/figcraft-mcp/bridge.log"
if [[ -f "$LOG" ]]; then
  tail -n 12 "$LOG"
else
  echo "INFO belum ada log: $LOG"
fi

echo
echo "== Saran =="
echo "- waiting_for_app + app tanpa control port -> tutup FigCraft, buka via launcher/DMS"
echo "- waiting_for_app + tidak ada proses -> panggil figcraft_launch"
echo "- tool design tidak muncul -> cek figcraft_status, lalu figcraft_launch"
