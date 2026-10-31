#!/usr/bin/env bash
# Usage: reg.sh <worktree> <run-id>: the stop-panel feature's desktop journeys, in timed groups, on a fresh launch.
set -u
wt=$1 run=$2
cd "$wt"
export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium
mkdir -p .verify/$run/journeys && cp /home/user/mylder-verify/184-r1-evidence/journeys-src/*.ts .verify/$run/journeys/
S=.claude/skills/verify-mylder/scripts
$S/doctor.sh $run
J=.verify/$run/journeys
d() { local j=$1; shift; node $S/drive.ts $run $J/$j.ts "$@" > .verify/$run/$j.log 2>&1; echo "$(date +%T) $(grep -E '^(PASS|FAIL) ' .verify/$run/$j.log) $(grep -m1 -A2 '^FAIL' .verify/$run/$j.log | tail -n +2 | head -2 | tr '\n' ' ')"; }
echo "== group A (first minutes: Refshaleøen standing, first paint)"
d reg-standing-refshaleoen & d reg-standing-tap & d reg-first-paint & wait
echo "== group B (07:22 track; before 07:26 metro arrivals, Nørreport arrivals, link keys)"
d reg-standing-track & d reg-metro-arrivals & wait
d reg-arrivals-norreport & d reg-arrivals-link-keys & wait
echo "== group C (from 07:25 Orientkaj; any time)"
d reg-stop-standing-orientkaj & d reg-stop-from-map & d reg-arrivals-board & wait
d reg-stop-language & d reg-stop-missing & d reg-no-arrivals & d reg-none-standing & wait
$S/doctor.sh $run
