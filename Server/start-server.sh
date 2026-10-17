#!/bin/sh
# WaddleVita server on Linux and macOS (untested on real machines so far: please report problems).
# Needs: Node.js 18 or newer, and Waddle Forever (for the game files and the server code):
#   - macOS: the app from https://github.com/nhaar/Waddle-Forever/releases in /Applications
#   - Linux: an unpacked release, or a source checkout that was built ("yarn install && yarn build" there),
#            in ~/Waddle-Forever, or anywhere with WF_APP=/path/to/it (the folder that contains "compiled")
# The game media ("media/default") must be next to it, as Waddle Forever's own instructions describe.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Install Node.js 18 or newer (https://nodejs.org, or your package manager)."
  exit 1
fi

if pgrep -f "Waddle Forever" >/dev/null 2>&1; then
  echo "Waddle Forever's own app seems to be open. Close it first: it uses the same ports."
  exit 1
fi

busy=""
for p in 24105 24106 24107 24110; do
  if command -v lsof >/dev/null 2>&1 && lsof -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then busy="$busy $p"; fi
done
if [ -n "$busy" ]; then
  echo "These ports are already in use:$busy (an earlier run of this script? stop it with Ctrl+C in its window)."
  exit 1
fi

# The firewall can't be opened from here without administrator rights: say what to do if one is active.
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  echo "Your firewall (ufw) is on. Once, run:  sudo ufw allow 24105:24107/tcp && sudo ufw allow 24110/tcp && sudo ufw allow 24111/udp"
elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  echo "Your firewall (firewalld) is on. Once, run:  sudo firewall-cmd --add-port=24105-24107/tcp --add-port=24110/tcp --add-port=24111/udp --permanent && sudo firewall-cmd --reload"
elif [ "$(uname)" = "Darwin" ]; then
  echo "If macOS asks whether node may accept incoming connections, choose Allow."
fi

exec node companion.js
