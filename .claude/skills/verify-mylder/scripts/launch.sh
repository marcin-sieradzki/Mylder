#!/usr/bin/env bash
# Builds this checkout and starts it on the weekday recording, for one verification run.
# Usage: launch.sh <run-id> [port]. The port defaults to 4300. Prints the URL once the map's
# snapshot answers with vehicles. VERIFY_SKIP_BUILD=1 reuses a build of the same commit.
set -euo pipefail
set -m # the server gets a process group of its own, so cleanup.sh stops all of it

run=${1:?usage: launch.sh <run-id> [port]}
port=${2:-4300}
dir=".verify/$run"
url="http://localhost:$port"

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

MYLDER_SOURCE=recording:weekday MYLDER_AIRCRAFT_SOURCE=recording:weekday \
  node_modules/.bin/next start --port "$port" >"$dir/server.log" 2>&1 &
echo $! >"$dir/server.pid"
echo "$port" >"$dir/port"
git rev-parse HEAD >"$dir/head"
date +%s >"$dir/started"

for _ in $(seq 60); do
  if curl -sf "$url/api/snapshot" | grep -q '"trips":\[{'; then
    echo "Ready: $url/en (run $run, server pid $(cat "$dir/server.pid"))"
    exit 0
  fi
  sleep 1
done
echo "Not ready after 60 s; see $dir/server.log. Run cleanup.sh $run." >&2
exit 1
