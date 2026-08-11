#!/usr/bin/env bash
# The ONLY sanctioned way to point the Supabase CLI at PRODUCTION. The
# ambient/default link is TEST (see db-link-test.sh) so that any bare
# `supabase db push`/`db query --linked`/etc. lands somewhere safe to be
# wrong about. Reaching production requires running this script AND typing
# the confirmation phrase -- a wrong-target push should cost deliberate
# effort, not just a missing argument or an old terminal tab.
set -euo pipefail

PROD_REF="sdkhuczcfnqqimdgfiks"

echo "This will link the Supabase CLI to PRODUCTION ($PROD_REF)."
echo "Every subsequent --linked command (db push, db query, functions deploy)"
echo "will act on the LIVE database until you run db-link-test.sh to switch back."
echo ""
read -r -p "Type 'yes-production' to continue: " CONFIRM

if [ "$CONFIRM" != "yes-production" ]; then
  echo "Not confirmed -- staying on whatever project was already linked. Nothing changed."
  exit 1
fi

npx supabase link --project-ref "$PROD_REF"
echo ""
echo "Linked to PRODUCTION. Run db-link-test.sh when you're done to return to the safe default."
