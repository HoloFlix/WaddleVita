#!/bin/sh
# macOS: double-click to start the server in a Terminal window.
cd "$(dirname "$0")" || exit 1
sh ./start-server.sh
echo
printf "Press Return to close this window. "
read _
