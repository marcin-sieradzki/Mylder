#!/usr/bin/env bash
# relaunch.sh <side> <run> <port> [recording]
side=$1; run=$2; port=$3; rec=${4:-weekday}
cd /home/user/mylder-verify/186-$side
.claude/skills/verify-mylder/scripts/cleanup.sh $run >/dev/null 2>&1
VERIFY_SKIP_BUILD=1 .claude/skills/verify-mylder/scripts/launch.sh $run $port $rec && .claude/skills/verify-mylder/scripts/doctor.sh $run
