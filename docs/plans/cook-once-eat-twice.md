# Cook once, eat twice

Ashley, 19 Sep 2026, from the meal-engagement proposal: **a setting, on by
default.** Tonight's dinner is tomorrow's lunch; a switch in Profile turns it
off, and the dinner card says what is happening so a deliberate repeat never
reads as the accidental one fixed this morning.

---

## The collision I flagged, and the measurement that shrank it

Leftovers deliberately repeat a meal, which is precisely what the variety fix
shipped hours earlier works to avoid. CLAUDE.md's rule is that a new ruling
breaking an old one is a finding to put in front of Ashley, not something to
resolve quietly — so it was measured before anything was built, over 400
profiles on 3- and 4-meal splits:

| | |
|---|---|
| distinct days in a week, lunch free to vary | **4.58** |
| distinct days in a week, lunch held to last night's dinner | **4.45** |

**An eighth of a day a week.** Breakfast and dinner keep varying around the
held slot and the rotation works round it. The conflict is real in principle
and almost absent in practice; recorded because the honest move was to measure
it rather than either assume it away or abandon the feature for it.

Two other numbers from the same run:

- **93.3% of dinners can serve as the next day's lunch** inside the app's own
  rules. Nothing failed on portion size at all. The 6.7% that failed missed
  the LUNCH PROTEIN FLOOR, which is the one real constraint here.
- **The portion factor is a median 1.26x, not 2x.** Lunch takes 0.40 of a
  3-meal day and dinner 0.30, so "cook double" is the wrong instruction and
  would overshoot lunch by a third.

## It does not need a future-day screen

No screen in the app renders another day's meals — that is why moving a meal to
another DAY is still missing, and it was the first thing I expected to block
this. It does not: tonight's dinner card carries the instruction, and tomorrow
the lunch slot simply IS that dish. **What makes tomorrow knowable tonight is
the date-derived rotation built this morning** — before it, "tomorrow's lunch"
had no fixed answer to promise.

## The build

### 1. The setting
`batch_cooking boolean NOT NULL DEFAULT true`, mirroring `include_snacks` in
every respect: the column, the `UserProfile` field, App's profile load, **App's
onboarding INSERT** (that insert is column-by-column, and a column missing from
it is written once and never read back), and a Yes/No row in Profile beside
meals per day.

### 2. Placement
In `buildRotation`, day N's lunch is day N-1's dinner rescaled to the lunch
budget, through `scaleToTarget` and then a **recompute from food-db** — never
by multiplying the old macros, the same rule meal-refit already lives under.
Where the rescaled dish would miss the lunch protein floor, that day gets an
ordinary lunch instead; the feature is a preference, not a constraint the pool
must satisfy.

**EACH SLOT KEEPS ITS OWN ONE-PORTION COPY, and this is the part to get right.**
The obvious model — store dinner at 2.26x and leave lunch empty — double-counts
the moment anything sums a day's macros or a week's ingredients, which is a bug
class this repo has already had once. Instead dinner stays dinner-sized, lunch
stays lunch-sized, they happen to be the same dish, and "cook them together" is
a sentence on the card rather than a number in the data. The shopping list then
sums 1x + 1.26x with no special case, because there is nothing special about it.

### 3. What the cards say
Two lines, in the shared phrasebook with every other card lead so
`test:coach-voice` and the coach exam can grade them:

- on the dinner: cook both portions together, tomorrow's lunch is this one;
- on the lunch: this is last night's dinner.

The second is not decoration. Without it a repeated dish is indistinguishable
from the defect fixed this morning, and the app would look broken to the one
person most likely to notice.

## Verification

1. A gate for: placement, the protein-floor fallback, the setting being
   honoured both ways, and the no-double-count property (a day's totals and a
   week's ingredient sums are unchanged in kind by leftovers being on).
2. Every new check mutation-tested, counts reported.
3. The real Nutrition screen at phone size: the lunch says where it came from,
   the dinner says to cook extra, and the day's numbers still add up.
4. `measure:meal-variety` re-run with the setting on, so the 4.58 → 4.45 cost
   is a number in the repo rather than in a chat message.
5. Re-run the meal gates; full sweep before any merge.
6. BACKLOG, and the SECOND migration named in the handover — it must land
   before this frontend reaches the app, same as the first.
