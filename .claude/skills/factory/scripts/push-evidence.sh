#!/usr/bin/env bash
# Commits a verdict's evidence to the orphan `evidence` branch under <pr>/<round>/ and pushes it,
# without checking the branch out or fetching its blobs: the branch holds every run's screenshots
# and outgrows the repository many times over. Run it from any checkout of the repository.
# Usage: push-evidence.sh <evidence-folder> <pr> <round>
set -euo pipefail

src=$(cd "${1:?usage: push-evidence.sh <evidence-folder> <pr> <round>}" && pwd)
pr=${2:?pr number}
round=${3:?round}

git fetch -q --depth=1 --filter=blob:none origin evidence:refs/remotes/origin/evidence
index=$(mktemp)
trap 'rm -f "$index"' EXIT
export GIT_INDEX_FILE=$index
git read-tree origin/evidence
# The run's bookkeeping (server logs, pid, port, head) stays behind; the journeys' files go up.
(cd "$src" && find . -type f -not -name '*.log' -not -name started -not -name port \
  -not -name head -not -name server.pid) | while read -r file; do
  hash=$(git hash-object -w "$src/${file#./}")
  git update-index --add --cacheinfo "100644,$hash,$pr/$round/${file#./}"
done
commit=$(git commit-tree "$(git write-tree)" -p origin/evidence -m "Evidence for PR #$pr, round $round")
git push -q origin "$commit:refs/heads/evidence"
echo "https://github.com/marcin-sieradzki/mylder/tree/evidence/$pr/$round"
