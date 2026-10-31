#!/usr/bin/env bash
# Second launch: the phone standing row's rest, and a second sample of the race-sensitive pass rules.
set -u
wt=$1 run=$2 port=$3
cd "$wt"
export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium
mkdir -p .verify/$run/journeys && cp /home/user/mylder-verify/180-r2-evidence/journeys-src/*.ts .verify/$run/journeys/
S=.claude/skills/verify-mylder/scripts
VERIFY_SKIP_BUILD=1 $S/launch.sh $run $port || exit 1
$S/doctor.sh $run
J=.verify/$run/journeys
d() { local j=$1; shift; node $S/drive.ts $run $J/$j.ts "$@" > .verify/$run/$j.log 2>&1; echo "$(date +%T) $(grep -E '^(PASS|FAIL) ' .verify/$run/$j.log) $(grep -m1 -A2 '^FAIL' .verify/$run/$j.log | tail -n +2 | head -2 | tr '\n' ' ')"; }
d pr6b-standing-phone-row-rest --phone & d pr3-standing-refshaleoen & d pr3-standing-refshaleoen-phone --phone & wait
d pr1-dep-norreport & d pr2-arr-norreport-phone --phone & d pr4-dep-kbhsyd-phone --phone & d pr5-arr-kbhsyd & wait
$S/doctor.sh $run
$S/cleanup.sh $run
