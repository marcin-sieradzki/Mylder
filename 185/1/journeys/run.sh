#!/usr/bin/env bash
# run.sh <main|branch> <journey> [--phone] ... : copies journeys into the run and drives each in turn.
side=$1; shift
wt=/home/user/mylder-verify/185r1-$side; run=$side-185-r1
mkdir -p $wt/.verify/$run/journeys && cp /home/user/mylder-verify/185-r1-evidence/journeys/*.ts $wt/.verify/$run/journeys/
cd $wt
for spec in "$@"; do
  j=${spec%:*}; flag=""; [ "${spec#*:}" = phone ] && flag=--phone
  echo "== $(date +%T) $j $flag (rec $(curl -s localhost:$(cat .verify/$run/port)/api/snapshot | grep -o '"fetched":[^,]*'))"
  PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium node .claude/skills/verify-mylder/scripts/drive.ts $run .verify/$run/journeys/$j.ts $flag 2>&1 | grep -v '^\s*$' | tail -25
done
