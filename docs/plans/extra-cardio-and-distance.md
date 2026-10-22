# Extra cardio by chat, distance, and the ease-off question (Sam live test, 20 Oct 2026)

Ashley's words: "Default for a past-tense activity on a lifting day should be: log it as additional work (like
Exercise → Add unplanned work, which works), with effort, and offer 'count it as today's workout' as the option.
Also capture distance when given." Her pick for distance, 22 Oct 2026: **a proper field** (one database change),
over writing it into the note. And on the knee: ask, never block.

## What was wrong (traced 20 Oct, BACKLOG)

- The coach had no tool that ADDS a past cardio session. The swap tool always replaces the day; the "put a run on the
  plan" tool's card refuses a day with a lift, which is the "instead of that one, or on a different day?" she got.
- The general workout logger's cardio branch is a client pattern that misses "40 minute run".
- `cardio_logs` has no distance column; the screen form has no distance box.
- Nothing links an active ease-off (knee until 22 Oct) to a logged run.

## What is built

1. **Distance.** Migration adds `cardio_logs.distance_km` (numeric, null, 0 < km <= 500). Every write names it only
   when there is one, and retries once without it on a missing-column error (`missing-column.ts`), so the app works
   before the migration is pushed. Reads are `select('*')` already. The line every screen shows gains it:
   "Run · 40 min · Hard · 6 km". The coach's history line says "6 km" too.
2. **Screen.** Add unplanned work's cardio row gets an optional Distance (km) box. Nothing pre-filled.
3. **Coach.** A new tool, `propose_cardio_log`: activity, minutes, effort, distance, date. The server takes minutes,
   effort and distance only from her own words (the circuit log's evidence rule); no effort in her words, it asks
   "How hard did that feel — easy, steady or hard?". The card's default is "Log it" (extra work, the lift stays).
   When that day's lifting session is still due with nothing logged, a second button, "Count it as today's workout",
   also marks the day as swapped for the run (the screen's existing "Count it as today's workout" write).
   The prompt and the swap tool's description say: something done, told in the past tense, is logged as extra;
   it replaces the session only when she says it was instead. "40 minute run" is read by the workout logger too.
4. **The ease-off question.** After a run, jog, hike, skipping, jumping or field/court sport is logged (either
   surface) while a knees, ankles or hips ease-off is active, the app asks one question: "How did your knees feel on
   the run? They're being eased off until 22 Oct." with "Felt fine" / "It hurt". Nothing is blocked or changed.
   In chat "It hurt" is her message to the coach, whose pain rules triage it. On the screen it opens the chat with
   "My knees hurt on the run" ready to send (the app's existing hand-over), never sent for her. Only temporary
   ease-offs ask: a lasting injury is already built around, and asking after every run for ever would nag.

## CSCS review

1. Training effect: none on the plan. Logging extra work does not change a prescription; "count it as today's
   workout" is the existing day swap, the lift returning next time at the same weight.
2. Takes away: nothing. The default keeps the lift.
3. Fundamentals: the week's conditioning count gains a session that happened, which is truer load accounting.
4. No floor or ceiling changes meaning. Distance is recorded, never used to prescribe.
5. Scope: the question asks; it does not diagnose, rehab or change the plan. "It hurt" goes to the existing triage,
   whose third answer (sharp, one-sided, worsening) names a professional and changes nothing.

## Deploys

Frontend on merge; `chat-gemini` (the new tool, prompt lines, the weigh-in fix); the migration via `db:push-both`
(her machine, her word). Until the migration, a distance is dropped from the saved row and everything else saves.
