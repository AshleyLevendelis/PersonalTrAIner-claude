#!/usr/bin/env bash
# Gate: fails (non-zero exit) when TEST and PRODUCTION have applied a
# different set of migrations. This is the mechanical backstop for
# db-push-both.sh -- that script SHOULD keep both projects identical, but
# "should" isn't a guarantee (a push that partially failed, a migration run
# by hand against only one side). This script is what actually catches it.
#
# Compares APPLIED MIGRATION VERSIONS rather than a raw schema dump:
# `supabase db dump` shells out to a local Docker container to run pg_dump
# even for a remote-only dump, and this environment has no Docker. Since
# every schema change in this repo goes through a migration file (no
# hand-edited DDL, confirmed by convention elsewhere in this codebase), two
# projects with the identical ordered set of applied migrations have the
# identical schema -- this is a Docker-free, equally rigorous signal for
# the specific way this repo manages schema.
#
# Always leaves the CLI linked back to TEST when it finishes, same
# convention as db-push-both.sh.
set -euo pipefail

PROD_REF="sdkhuczcfnqqimdgfiks"
TEST_REF="vswuurrtbzbrgubddefv"

trap 'npx supabase link --project-ref "$TEST_REF" >/dev/null 2>&1 || true' EXIT

applied_versions() {
  # Extract just the "remote" (applied) migration version list, one per
  # line, from `migration list --linked`'s JSON output.
  npx supabase migration list --linked --output-format json 2>/dev/null \
    | node -e "
        let data = '';
        process.stdin.on('data', d => data += d);
        process.stdin.on('end', () => {
          const parsed = JSON.parse(data);
          for (const m of parsed.migrations) if (m.remote) console.log(m.remote);
        });
      "
}

echo "== Reading TEST ($TEST_REF) applied migrations =="
npx supabase link --project-ref "$TEST_REF" >/dev/null
applied_versions > /tmp/test-migrations.txt

echo "== Reading PRODUCTION ($PROD_REF) applied migrations =="
npx supabase link --project-ref "$PROD_REF" >/dev/null
applied_versions > /tmp/prod-migrations.txt

if diff -u /tmp/prod-migrations.txt /tmp/test-migrations.txt > /tmp/migration-diff.txt; then
  echo "PASS: TEST and PRODUCTION have applied the identical migration set ($(wc -l < /tmp/test-migrations.txt) migrations)."
  exit 0
else
  echo "FAIL: TEST and PRODUCTION have diverged."
  echo ""
  cat /tmp/migration-diff.txt
  echo ""
  echo "Run 'npm run db:push-both' to reconcile, or investigate a migration applied to only one side."
  exit 1
fi
