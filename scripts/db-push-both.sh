#!/usr/bin/env bash
# Pushes all pending migrations to BOTH the test and production Supabase
# projects, by mechanism rather than memory. This is the ONLY sanctioned way
# to apply a new migration — never run a bare `supabase db push` by hand,
# since the CLI's ambient link defaults to the TEST project (see
# db-link-test.sh) and a bare push only reaches whichever project is
# currently linked.
#
# Always leaves the CLI linked back to TEST when it finishes, whether it
# succeeds or fails on the prod leg -- a stray follow-up command should land
# on the safe project, not on whatever project this script happened to be
# mid-push against.
set -euo pipefail

PROD_REF="sdkhuczcfnqqimdgfiks"
TEST_REF="vswuurrtbzbrgubddefv"

# The CLI's `supabase link` reliably fails with
# "AlreadyExists: FileSystem.makeDirectory (.../supabase/.temp)" if that
# directory already exists from a PRIOR link — including one this same
# script just did a moment ago (TEST, then PRODUCTION, both call `link`).
# supabase/.temp is a pure, regenerable local cache (project ref, version
# info) written fresh by every successful link, so clearing it immediately
# before each `link` call is safe and is what makes both legs of this
# script reliable in one run, rather than only ever the first.
clear_link_cache() {
  rm -rf supabase/.temp
}

relink_test() {
  clear_link_cache
  npx supabase link --project-ref "$TEST_REF" >/dev/null 2>&1 || true
}
trap relink_test EXIT

echo "== Pushing migrations to TEST ($TEST_REF) =="
clear_link_cache
npx supabase link --project-ref "$TEST_REF"
npx supabase db push --linked --yes

echo ""
echo "TEST is up to date. Next: pushing the SAME migrations to PRODUCTION ($PROD_REF)."
read -r -p "Type 'yes-production' to continue: " CONFIRM
if [ "$CONFIRM" != "yes-production" ]; then
  echo "Not confirmed -- stopping here. TEST is updated, PRODUCTION is untouched."
  exit 1
fi

echo "== Pushing migrations to PRODUCTION ($PROD_REF) =="
clear_link_cache
npx supabase link --project-ref "$PROD_REF"
npx supabase db push --linked --yes

echo "== Done. Both projects share the same migration set. CLI relinked to TEST. =="
