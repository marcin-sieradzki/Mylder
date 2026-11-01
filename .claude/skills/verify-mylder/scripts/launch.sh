#!/usr/bin/env bash
# Builds this checkout and starts it on a recording, or on the timetable source, for one
# verification run.
# Usage: launch.sh <run-id> [port] [recording|timetable|timetable:<folder>]. The port defaults to
# 4300 and the recording to weekday; `timetable` starts it on MYLDER_SOURCE=timetable instead, on
# the deployed timetable at the real time, and `timetable:<folder>` on the timetable source with a
# saved folder's timetable and clock (MYLDER_TIMETABLE_FROM), such as `timetable-ending`, the
# timetable's last week. The aircraft are always the weekday recording's. Prints the URL once the
# map's snapshot answers with vehicles. VERIFY_SKIP_BUILD=1 reuses a build of the same commit.
set -euo pipefail
set -m # the server gets a process group of its own, so cleanup.sh stops all of it

run=${1:?usage: launch.sh <run-id> [port] [recording|timetable|timetable:<folder>]}
port=${2:-4300}
recording=${3:-weekday}
dir=".verify/$run"
url="http://localhost:$port"

from=
if [ "$recording" = timetable ]; then
  source=timetable
  on="the timetable source"
elif [ "${recording#timetable:}" != "$recording" ]; then
  source=timetable
  from=${recording#timetable:}
  if [ ! -f "recordings/$from/clock.json" ] || [ ! -d "recordings/$from/timetable" ]; then
    echo "No saved folder recordings/$from with a clock.json and a timetable/ for the timetable source." >&2
    exit 1
  fi
  on="the timetable source on recordings/$from"
elif [ -f "recordings/$recording/clock.json" ]; then
  source=recording:$recording
  on="recording $recording"
else
  echo "No recording named $recording in recordings/, and not timetable." >&2
  exit 1
fi
if curl -s -o /dev/null "$url"; then
  echo "Port $port already answers: another run, or the maintainer's own server. Pick another port." >&2
  exit 1
fi
mkdir -p "$dir"

if [ "${VERIFY_SKIP_BUILD:-}" = 1 ] && [ "$(cat .next/verify-head 2>/dev/null)" = "$(git rev-parse HEAD)" ] && git diff --quiet; then
  echo "Reusing the build of $(git rev-parse --short HEAD)."
else
  echo "Building $(git rev-parse --short HEAD) (log: $dir/build.log)..."
  npm run build >"$dir/build.log" 2>&1
  git rev-parse HEAD >.next/verify-head
fi

MYLDER_SOURCE=$source MYLDER_TIMETABLE_FROM=$from MYLDER_AIRCRAFT_SOURCE=recording:weekday \
  node_modules/.bin/next start --port "$port" >"$dir/server.log" 2>&1 &
echo $! >"$dir/server.pid"
echo "$port" >"$dir/port"
echo "$recording" >"$dir/recording"
git rev-parse HEAD >"$dir/head"
date +%s >"$dir/started"

for _ in $(seq 60); do
  if curl -sf "$url/api/snapshot" | grep -q '"trips":\[{'; then
    echo "Ready: $url/en (run $run on $on, server pid $(cat "$dir/server.pid"))"
    exit 0
  fi
  sleep 1
done
echo "Not ready after 60 s; see $dir/server.log. Run cleanup.sh $run." >&2
exit 1
