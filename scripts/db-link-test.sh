#!/usr/bin/env bash
# Returns the Supabase CLI to the safe default link (TEST). Run this any
# time you're not sure what's currently linked, or right after finishing
# whatever you needed db-link-prod.sh for.
set -euo pipefail

TEST_REF="vswuurrtbzbrgubddefv"
npx supabase link --project-ref "$TEST_REF"
echo "Linked to TEST ($TEST_REF) -- the safe default."
