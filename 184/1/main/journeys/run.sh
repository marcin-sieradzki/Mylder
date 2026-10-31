#!/usr/bin/env bash
# Usage: run.sh <worktree> <run-id> <journey> [<journey> ...]: drives the journeys at once on the run's server.
set -u
wt=$1 run=$2; shift 2
cd "$wt"
export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium
mkdir -p .verify/$run/journeys && cp /home/user/mylder-verify/184-r1-evidence/journeys-src/*.ts .verify/$run/journeys/
S=.claude/skills/verify-mylder/scripts
J=.verify/$run/journeys
d() { local j=$1; shift; node $S/drive.ts $run $J/$j.ts "$@" > .verify/$run/$j.log 2>&1; echo "$(date +%T) $(grep -E '^(PASS|FAIL) ' .verify/$run/$j.log) $(grep -m1 -A2 '^FAIL' .verify/$run/$j.log | tail -n +2 | head -2 | tr '\n' ' ')"; }
for j in "$@"; do d $j & done
wait
$S/doctor.sh $run
