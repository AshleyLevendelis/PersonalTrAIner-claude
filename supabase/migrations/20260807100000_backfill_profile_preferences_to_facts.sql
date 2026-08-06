/*
# Backfill profile-column preferences into user_facts

Bug (reported by real usage): a user added "Marmite" to Disliked foods in
the Profile screen. Asking the chat what foods it disliked came back
empty — chat's context only ever included `user_facts` (via `active_facts`),
never `fitness_profiles.disliked_foods`. Saying "I hate marmite" in chat
then created a SECOND, separate entry under Food preferences (a
`user_facts` row) that the chat did remember. Two stores, one fact,
visible twice on the same merged Profile screen.

Meal generation already merged both stores (App.tsx's `effectiveDislikedFoods`/
`effectiveExclusions`) — the gap was specifically the chat's own knowledge
and the doubled UI, not filtering. Still, the fix unifies the STORE, not
just the read site: going forward, `fitness_profiles.disliked_foods` and
`.exercise_exclusions` are frozen/deprecated (kept for audit/history, no
longer written or read by app code) and `user_facts` is the one source
for both. This migration is the one-time copy of whatever already lived
in the two columns into the table that's now authoritative, so no
existing user's preferences silently vanish the moment the code stops
reading the old columns.

`favorite_cuisines`, `dietary_preferences`, and `injuries` are NOT
touched here — they were never duplicated (see the "Fix — food/exercise
preferences have two competing stores" trace report): no chat tool
records a cuisine/dietary-category/injury as a `user_facts` row, so
there is nothing on the other side to unify with.

Idempotency: guarded with a `NOT EXISTS` check against already-active
facts with the same profile/kind/resolved_refs, so a second application
(e.g. a `supabase db reset` replaying every migration) cannot duplicate
rows. `source='onboarding'` for both — these values originated from the
onboarding flow or a later manual profile edit, never a real chat turn,
so `source='chat'` (which implies a `chat_messages` provenance) would be
inaccurate; 'onboarding' is the closest existing enum value and matches
how disliked_foods itself originated for most rows.

Food resolution mirrors `resolveFoodTarget` in fact-compiler.ts (a plain
trim+lowercase, not a food-db lookup — meal-generation.ts's own dislike
filter is a lowercase substring match, so the resolved ref must match
that exact convention). Exercise resolution mirrors exercise_exclusions'
own existing convention: exact catalog names, no fuzzy matching needed
since these values were already exact names when written by the ban
button.
*/

DO $$
DECLARE
  profile_row RECORD;
  food_value  text;
  ex_value    text;
BEGIN
  FOR profile_row IN
    SELECT id, disliked_foods, exercise_exclusions
    FROM fitness_profiles
    WHERE (disliked_foods IS NOT NULL AND array_length(disliked_foods, 1) > 0)
       OR (exercise_exclusions IS NOT NULL AND array_length(exercise_exclusions, 1) > 0)
  LOOP
    IF profile_row.disliked_foods IS NOT NULL THEN
      FOREACH food_value IN ARRAY profile_row.disliked_foods LOOP
        IF trim(food_value) = '' THEN
          CONTINUE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM user_facts
          WHERE profile_id = profile_row.id
            AND kind = 'food_preference'
            AND status = 'active'
            AND resolved_refs @> ARRAY[lower(trim(food_value))]
        ) THEN
          INSERT INTO user_facts (
            profile_id, kind, status, source, raw_phrase, display_text,
            polarity, hardness, resolved_refs
          ) VALUES (
            profile_row.id, 'food_preference', 'active', 'onboarding',
            food_value, 'won''t eat/do ' || food_value,
            'dislike', 'hard', ARRAY[lower(trim(food_value))]
          );
        END IF;
      END LOOP;
    END IF;

    IF profile_row.exercise_exclusions IS NOT NULL THEN
      FOREACH ex_value IN ARRAY profile_row.exercise_exclusions LOOP
        IF trim(ex_value) = '' THEN
          CONTINUE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM user_facts
          WHERE profile_id = profile_row.id
            AND kind = 'exercise_preference'
            AND status = 'active'
            AND resolved_refs @> ARRAY[ex_value]
        ) THEN
          INSERT INTO user_facts (
            profile_id, kind, status, source, raw_phrase, display_text,
            polarity, hardness, resolved_refs
          ) VALUES (
            profile_row.id, 'exercise_preference', 'active', 'onboarding',
            ex_value, 'won''t eat/do ' || ex_value,
            'dislike', 'hard', ARRAY[ex_value]
          );
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;
