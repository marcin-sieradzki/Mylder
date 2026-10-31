#!/usr/bin/env bash
# Usage: run.sh <worktree> <run-id> <port> <main|branch>. Launches on the recording and drives the journeys in timed groups.
set -u
wt=$1 run=$2 port=$3 mode=$4
cd "$wt"
export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium
mkdir -p .verify/$run/journeys && cp /home/user/mylder-verify/180-r2-evidence/journeys-src/*.ts .verify/$run/journeys/
S=.claude/skills/verify-mylder/scripts
VERIFY_SKIP_BUILD=1 $S/launch.sh $run $port || exit 1
$S/doctor.sh $run
J=.verify/$run/journeys
d() { local j=$1; shift; node $S/drive.ts $run $J/$j.ts "$@" > .verify/$run/$j.log 2>&1; echo "$(date +%T) $(tail -n +1 .verify/$run/$j.log | grep -E '^(PASS|FAIL) ' ) $(grep -m1 -A2 '^FAIL' .verify/$run/$j.log | tail -n +2 | head -2 | tr '\n' ' ')"; }
echo "== group A (07:20-07:22, Refshaleøen)"
d pr3-standing-refshaleoen & d pr3-standing-refshaleoen-phone --phone & d pr6-standing-phone-row --phone &
if [ $mode = branch ]; then d reg-standing-refshaleoen & d reg-standing-tap & fi
wait
echo "== group B (07:22, track)"
if [ $mode = branch ]; then d reg-standing-track & d reg-standing-track-phone --phone & wait; fi
echo "== group C (before 07:26)"
d pr1-dep-norreport & d pr1-dep-norreport-phone --phone & d pr2-arr-norreport & d pr2-arr-norreport-phone --phone &
if [ $mode = branch ]; then d reg-metro-arrivals & fi
wait
if [ $mode = branch ]; then d reg-first-paint & d reg-arrivals-norreport & d reg-arrivals-link-keys & wait; fi
echo "== group D (any time / from 07:25)"
d pr4-dep-kbhsyd & d pr4-dep-kbhsyd-phone --phone & d pr5-arr-kbhsyd & d pr5-arr-kbhsyd-phone --phone & wait
if [ $mode = branch ]; then
  d reg-stop-standing-orientkaj & d reg-stop-from-map & d reg-arrivals-board & wait
  d reg-stop-language & d reg-stop-missing & d reg-no-arrivals & d reg-none-standing & d reg-vehicle-from-list & wait
fi
$S/doctor.sh $run
echo "== done $(date +%T), recording minute per doctor above"
