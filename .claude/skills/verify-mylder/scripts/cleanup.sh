#!/usr/bin/env bash
# Stops what launch.sh started for one run, and keeps the run's evidence in .verify/<run-id>/.
# Usage: cleanup.sh <run-id>
set -uo pipefail

run=${1:?usage: cleanup.sh <run-id>}
dir=".verify/$run"
[ -f "$dir/server.pid" ] || { echo "run $run has no server to stop"; exit 0; }
pid=$(cat "$dir/server.pid")
kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
for _ in $(seq 10); do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
kill -KILL -- "-$pid" 2>/dev/null || true
rm -f "$dir/server.pid"
echo "stopped run $run; evidence kept in $dir/"
