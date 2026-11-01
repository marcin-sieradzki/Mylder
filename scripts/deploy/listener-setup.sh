#!/usr/bin/env bash
# One-time setup of the SIRI-ET listener on Fly.io (#218, docs/live-data.md, "The listener"), run
# by the maintainer on their own machine. It reads the Dataudveksleren settings from an env file,
# makes the token the listener and the tracker share, and puts each value where it belongs: Fly's
# secrets, the repository's FLY_API_TOKEN, Vercel's Production environment. No value is printed,
# passed on a command line or written to disk.
#
# Needs fly (`fly auth login`), gh (logged in as the repository's owner) and Node (for npx vercel,
# which asks to log in the first time). Run again to replace every value, the shared token too.
#
#   scripts/deploy/listener-setup.sh <env-file>
#
# The env file holds DU_CLIENT_ID, DU_TENANT_ID, DU_SECRET, and the four amqps:// addresses: as
# DU_ADDRESSES, separated by spaces or commas, or as variables of any name whose values start
# with amqps://.
set -euo pipefail

APP=mylder-listener
ORG=personal
REPO=marcin-sieradzki/mylder
APP_URL=https://mylder-liard.vercel.app
VERCEL_SCOPE=mylder
VERCEL_PROJECT=mylder

env_file=${1:?usage: scripts/deploy/listener-setup.sh <env-file>}
[ -r "$env_file" ] || { echo "Can't read $env_file" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
. "$env_file"
set +a

if [ -z "${DU_ADDRESSES:-}" ]; then
  DU_ADDRESSES=$(env | sed -n 's/^[A-Za-z_][A-Za-z0-9_]*=\(amqps:\/\/[^ ]*\)$/\1/p' | sort -u | paste -sd, -)
fi
DU_ADDRESSES=$(printf '%s' "$DU_ADDRESSES" | tr ' ' ',' | tr -s ',')
missing=0
for name in DU_CLIENT_ID DU_TENANT_ID DU_SECRET DU_ADDRESSES; do
  if [ -z "${!name:-}" ]; then echo "$name is missing from $env_file" >&2; missing=1; fi
done
[ "$missing" -eq 0 ] || exit 1
count=$(printf '%s' "$DU_ADDRESSES" | tr ',' '\n' | grep -c '^amqps://' || true)
echo "Read the service account and $count AMQP addresses (four expected)."

echo "Checking the tools..."
fly auth whoami >/dev/null 2>&1 || { echo "Run fly auth login first." >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Run gh auth login first." >&2; exit 1; }
[ "$(gh api user --jq .login)" = "${REPO%%/*}" ] || {
  echo "gh's active account isn't ${REPO%%/*}: gh auth switch to it first." >&2
  exit 1
}

if fly status -a "$APP" >/dev/null 2>&1; then
  echo "Fly app $APP is there."
else
  echo "Creating the Fly app $APP..."
  fly apps create "$APP" --org "$ORG" >/dev/null
fi

token=$(openssl rand -hex 32)

echo "Setting the listener's secrets on Fly (staged for the first deploy)..."
printf '%s\n' \
  "DU_CLIENT_ID=$DU_CLIENT_ID" \
  "DU_TENANT_ID=$DU_TENANT_ID" \
  "DU_SECRET=$DU_SECRET" \
  "DU_ADDRESSES=$DU_ADDRESSES" \
  "MYLDER_APP_URL=$APP_URL" \
  "MYLDER_UPDATES_TOKEN=$token" |
  fly secrets import --stage -a "$APP" >/dev/null

echo "Setting the deploy token as the repository's FLY_API_TOKEN..."
fly tokens create deploy -a "$APP" -x 8760h | gh secret set FLY_API_TOKEN -R "$REPO" >/dev/null

echo "Setting Vercel's Production variables..."
link=$(mktemp -d)
trap 'rm -rf "$link"' EXIT
npx --yes vercel link --yes --cwd "$link" --scope "$VERCEL_SCOPE" --project "$VERCEL_PROJECT" >/dev/null
vercel_env() {
  npx --yes vercel env rm "$1" production --yes --cwd "$link" >/dev/null 2>&1 || true
  printf '%s' "$2" | npx --yes vercel env add "$1" production --cwd "$link" >/dev/null
}
vercel_env MYLDER_UPDATES_TOKEN "$token"
vercel_env MYLDER_UPDATES_URL "https://$APP.fly.dev/table"
vercel_env MYLDER_UPDATES siri

echo "Done. Merging the PR that adds fly.toml deploys the listener; the next production deploy reads the delays."
