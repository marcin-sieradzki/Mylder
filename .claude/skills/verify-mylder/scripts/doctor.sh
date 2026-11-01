#!/usr/bin/env bash
# Read-only: is this run's server worth driving? Exits 0 and prints "healthy", or names the fault.
# Usage: doctor.sh <run-id>
set -uo pipefail

run=${1:?usage: doctor.sh <run-id>}
dir=".verify/$run"
fail() { echo "unhealthy: $*" >&2; exit 1; }

[ -f "$dir/server.pid" ] || fail "run $run has no server; launch it"
pid=$(cat "$dir/server.pid")
port=$(cat "$dir/port")
kill -0 "$pid" 2>/dev/null || fail "server $pid has stopped; see $dir/server.log, then relaunch"
[ "$(git rev-parse HEAD)" = "$(cat "$dir/head")" ] || fail "the checkout moved since launch; clean up and relaunch to drive the new commit"
# The port's listener belongs to this run's process group. Where lsof sees no sockets (some
# sandboxes hide them), the server's own log saying it took the port stands in.
listeners=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null)
owned=no
for listener in $listeners; do
  [ "$(ps -o pgid= -p "$listener" | tr -d ' ')" = "$pid" ] && owned=yes
done
[ -z "$listeners" ] && grep -q "localhost:$port" "$dir/server.log" && owned=yes
[ "$owned" = yes ] || fail "port $port is not held by this run's server"

body=$(curl -sf "http://localhost:$port/api/snapshot") || fail "/api/snapshot does not answer 200"
echo "$body" | grep -q '"trips":\[{' || fail "the snapshot has no trips"
recording=$(cat "$dir/recording" 2>/dev/null || echo weekday)
# The timetable source runs at the real time and never runs out.
if [ "$recording" = timetable ]; then
  echo "healthy: http://localhost:$port/en, commit $(git rev-parse --short HEAD), the timetable source"
  exit 0
fi
minutes=$(ls "recordings/$recording/snapshots" | wc -l | tr -d ' ')
age=$(($(date +%s) - $(cat "$dir/started")))
if [ "$age" -gt $(((minutes - 1) * 60)) ]; then
  fail "the server has run ${age} s; the $recording recording holds $minutes minutes, after which every vehicle ages towards No signal. Clean up and relaunch with VERIFY_SKIP_BUILD=1"
fi
echo "healthy: http://localhost:$port/en, commit $(git rev-parse --short HEAD), $recording recording minute $((age / 60)) of $minutes"
