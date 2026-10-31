#!/usr/bin/env bash
# run.sh <run-id> <worktree side main|branch> <journey[:phone]> ... : copies journeys into the run and drives each in turn.
run=$1; side=$2; shift 2
wt=/home/user/mylder-verify/186-$side
mkdir -p $wt/.verify/$run/journeys && cp /home/user/mylder-verify/186-r1-evidence/journeys/*.ts $wt/.verify/$run/journeys/
cd $wt
for spec in "$@"; do
  j=${spec%:*}; flag=""; [ "${spec#*:}" = phone ] && flag=--phone
  echo "== $(date +%T) $run $j $flag (rec $(curl -s localhost:$(cat .verify/$run/port)/api/snapshot | grep -o '"fetched":[^,]*'))"
  rm -rf .verify/$run/$j
  PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium timeout 400 node .claude/skills/verify-mylder/scripts/drive.ts $run .verify/$run/journeys/$j.ts $flag 2>&1 | grep -v '^\s*$' | tail -60
done
