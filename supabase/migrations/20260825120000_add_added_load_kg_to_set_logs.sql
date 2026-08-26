/*
# Recording the weight you hung off yourself

The prescription side landed first: a weighted pull-up or dip now carries a
`suggested_added_load_kg` (see load-prescription.ts's prescribeAddedLoad).
The app could tell you to add 15kg and had nowhere to record that you did.

Worse than a gap. SetGrid already let you type a weight on a pull-up, and
wrote `weight_kg: 15, is_bodyweight: false` — "the pull-up weighed 15kg".
That row is indistinguishable from an ordinary 15kg lift, so it did not
merely fail to capture the truth, it recorded something else.

SEPARATE COLUMN, NOT A REINTERPRETATION OF weight_kg. That column means "the
weight of the thing you lifted"; overloading it to mean "the weight you hung
off yourself", switched on is_bodyweight, would be one field answering two
questions — the defect class this codebase has hit five times now
(loads_joints answering "is this dangerous", the shrug isolation_trap, the
slot-inheritance leak). A weighted pull-up is
`weight_kg: 0, is_bodyweight: true, added_load_kg: 15`, and every existing
reader — isMalformedZeroWeight, maxWorkingWeight, the ghost values, the PR
cache — keeps seeing exactly what it saw before.

Nullable and additive, so no existing row changes meaning and nothing needs
backfilling. Like assistance_kg, 0 here is unambiguous ("no added weight",
a valid state), so it needs none of weight_kg's malformed-zero treatment.

UNLIKE assistance_kg (migration 20260811100000), the write path and the
progression read-back ship in the SAME round as this column. That migration's
own comment scoped them as "its own pass"; two weeks later the column exists
and nothing writes it. A column with no writer is not a foundation, it is a
loose end.
*/

alter table exercise_set_logs
  add column if not exists added_load_kg numeric null;

comment on column exercise_set_logs.added_load_kg is
  'Weight ADDED to bodyweight for this set — a dip belt, a dumbbell between the feet, a loaded backpack. NULL for every ordinary lift. Distinct from weight_kg, which is the weight of the implement itself.';
