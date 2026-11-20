#!/usr/bin/env bash
# Read-only health check for figcraft-mcp.
set -uo pipefail

echo "== figcraft-mcp doctor =="

for bin in bun figcraft figcraft-cli; do
  if path="$(command -v "$bin" 2>/dev/null)"; then
    echo "OK   $bin -> $path"
  else
    echo "WARN $bin not on PATH (can be set via FIGCRAFT_*_PATH)"
  fi
done

echo
echo "== FigCraft processes and control port =="
FOUND=0
for cmdline in /proc/[0-9]*/cmdline; do
  [[ -r "$cmdline" ]] || continue
  args="$(tr '\0' ' ' < "$cmdline" 2>/dev/null)" || continue
  [[ -z "$args" ]] && continue

  # Only the GUI `figcraft` process, not figcraft-cli or shells mentioning the name.
  first="${args%% *}"
  exe="${first##*/}"
  [[ "$exe" == "figcraft" ]] || continue

  pid="${cmdline#/proc/}"
  pid="${pid%/cmdline}"
  port="$(printf '%s' "$args" | sed -n 's/.*--control[ =]\([0-9][0-9]*\).*/\1/p')"
  if [[ -n "$port" ]]; then
    echo "OK   pid $pid running with --control $port"
    if timeout 2 bash -c "exec 3<>/dev/tcp/127.0.0.1/$port" 2>/dev/null; then
      echo "OK   port $port is reachable"
    else
      echo "WARN port $port is not reachable"
    fi
  else
    echo "WARN pid $pid running WITHOUT --control (cannot be attached)"
  fi
  FOUND=1
done
if [[ "$FOUND" -eq 0 ]]; then
  echo "INFO no FigCraft process found. Call figcraft_launch or open it from your DMS."
fi

echo
echo "== .desktop entry =="
DESKTOP="$HOME/.local/share/applications/ai.storyteller.figcraft.desktop"
if [[ -f "$DESKTOP" ]]; then
  grep -E '^(Exec|TryExec)=' "$DESKTOP" || true
  if grep -Eq '(--control|figcraft-gui)' "$DESKTOP"; then
    echo "OK   .desktop carries a control port (directly or via the launcher)"
  else
    echo "WARN .desktop has no --control; run scripts/install.sh"
  fi
else
  entry="$(grep -rl 'figcraft' /usr/share/applications 2>/dev/null | head -1 || true)"
  if [[ -n "$entry" ]]; then
    echo "WARN no user override yet. System entry: $entry"
    grep -E '^Exec=' "$entry" || true
  else
    echo "INFO no FigCraft .desktop entry found."
  fi
fi

echo
echo "== Recent log =="
LOG="${XDG_DATA_HOME:-$HOME/.local/share}/figcraft-mcp/bridge.log"
if [[ -f "$LOG" ]]; then
  tail -n 12 "$LOG"
else
  echo "INFO no log yet: $LOG"
fi

echo
echo "== Suggestions =="
echo "- waiting_for_app + app without a control port -> close FigCraft and reopen via launcher/DMS"
echo "- waiting_for_app + no process -> call figcraft_launch"
echo "- design tools missing -> check figcraft_status, then call figcraft_launch"
