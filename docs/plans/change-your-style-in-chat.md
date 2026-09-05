# Change your training style in chat — and Settings finally offers the rebuild

**5 Sep 2026.** Ashley asked for a whole-app audit and then chose the first gap
to close: *"change training style in chat"*. This records what was built, the
second half the build uncovered, and every judgement call.

## Why

VISION.md: *"Settings and chat are equal paths… Anything a user can do in the
Profile screens they should be able to ask the coach for."* Ten settings
failed that test. Style was the right one to start with because it is the one
that reshapes the programme: `exercise-plan.ts` reads `training_style` for the
pool's style filter, the base rep range per tier, and `STYLE_CONFIGS`.

## What the research found first

`PLAN_INVALIDATING_FIELDS` was `injuries, equipment_access, training_days`.
**Style was not in it.** So changing style in Settings saved the field and
never offered a rebuild: Profile said "bodybuilding" while the plan on screen
stayed the "combat" one until the next full regeneration. The same
profile-disagrees-with-plan divergence the §2.4 schedule fix closed. Shipping
the chat tool alone would have made chat the *more* honest door, the opposite
of parity. So both doors were fixed, and both open onto one rebuild path.

## What was built

**Settings** — `src/lib/plan-invalidation.ts`: `training_style` joins the
invalidating list with its own offer text ("the exercises and rep ranges still
follow it… I can rebuild it from this week onwards in the new style").
`ProfileScreen`, `App.tsx`'s dialog and `handleConfirmRebuild` needed nothing:
they were already field-agnostic.

**Chat** — `propose_style_change`, built as `propose_schedule_change` with the
field swapped, because it is the same operation: a lasting profile change the
plan has to follow, from the live week forward, past weeks untouched, undo
restores both. *Not* `propose_equipment_adaptation`, which is temporary and
auto-reverts.

- Server (`chat-gemini/index.ts`): declaration (enum of the four styles, the
  same anti-misfire language §3e earned live: "make today harder" is not a
  style change), a pass-through handler that writes nothing, a new §3f prompt
  section, and the two rule lines that enumerate proposal tools.
- Executor (`pending-action-executor.ts`): `executeStyleChange` — rebuild
  first, write second, so the field only changes once a plan matches it.
  Receipt says "Training style: Combat / conditioning", the card's own words.
- Client (`ChatAssistant.tsx`): builder validates against `STYLE_OPTIONS`, not
  the model's spelling; the card shows old → new label with two implications
  (weeks rebuilt and logged work safe; exercises *and* rep ranges change, not
  just the name); confirm mirrors the profile field into App state; undo
  restores the week range **and** the field.
- Registries: `ChatReceiptView.kind`, `kindsRequiringPreImage`.

## Gates

- `test:rebuild-offer`: the exact-list assertion now names four fields; style
  offers a rebuild, says what changes, promises logged work untouched, names
  no field; re-saving the same style does not.
- `test:pending-actions` §6d, production-shaped: save wire-clean rows, load
  them back the way App does, compare normalised. Proves: the store refuses
  the kind without a pre-image; execute writes the field and rebuilds only the
  live week forward; past weeks are untouched on disk **and kept by identity in
  memory**; undo restores every week and the field; and, source-read, the UI's
  undo branch restores the field too.
- `test:coach-promises` found the new declaration/handler pair on its own
  ("all 28 declared tools have an executor branch").

**Mutations, each confirmed to apply:**

| mutation | result |
|---|---|
| style removed from the invalidating list | rebuild-offer red |
| executor skips the profile write | pending-actions red |
| executor rebuilds from week 1, not the live week | red — caught by the identity check |
| server handler deleted | coach-promises red |
| UI undo drops the field restore | pending-actions red (source check) |
| executor saves every week, not only the live week forward | **not red, and recorded as such**: the rebuild returns the original objects for past weeks, so re-saving them writes identical content and a content check cannot see it |

## A defect in my own test, and what it taught

The first §6d generated a mesocycle, saved the raw objects, and compared
against a JSON snapshot. Every week "differed" before anything ran, with no
field differing under JSON. Cause: the generator writes explicit
undefined-valued keys (`selection_note: undefined`, 3 sites); the in-memory
mock stores objects by reference so they survive; the gate's `stableStringify`
walks `Object.keys` and keeps them; JSON drops them. A real Supabase wire drops
them too. The test was measuring the mock, not the app. Rewritten to mirror
production's save → load path with normalised comparison.

## Flagged, then ruled on the same day

`fitness_goal` sat on `test:rebuild-offer`'s **must-not-invalidate** list, yet
the goal drives set volume, rest, the main-lift rest floor, rep ranges per
tier, allowed phases, the split and the conditioning profile. Changing goal in
Settings had the same silent shape style had. Put to Ashley as one question;
**she chose to offer the rebuild, same as style.** Built as the Settings half
only (commit follows this one); a chat tool for the goal is the natural next
step and was not asked for.

## Needs Ashley's machine

`npm run deploy:functions:prod -- chat-gemini` — the third pending addition to
the same function (session feel, meal food add, now style change). The Settings
half ships with the Vercel push and works without it.

## Decision log

- Template = schedule, not equipment. Unprompted; the alternative auto-reverts.
- Fix Settings in the same change. Unprompted; see "What the research found".
- Chat executor rebuild-then-write; Settings stays write-then-offer. The same
  asymmetry the two doors already have for training days.
- Receipt uses the human label. Unprompted; the card already did.
- No product question was needed: every semantic follows a live-verified
  precedent.
