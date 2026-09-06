# Count the classes as training load

**Status: BUILT, 6 Sep 2026 — option 1 plus the card toggle, on Ashley's
ruling.** The plan below is kept as written; the ruling and what was built
follow it at the end. Volume prescription, so this was the plan Ashley read
before the build, per CLAUDE.md. It is option **(b)** from
[i-also-do-muay-thai.md](i-also-do-muay-thai.md), which her 6 Sep ruling
deliberately left for a separate, measured piece. She asked for it on 6 Sep
2026: "fix all 1 at a time. calf raise, muay thai and deload."

## What (a) left undone

After (a), someone who tells the coach "I also do Muay Thai on Tuesday and
Thursday evenings" gets the lighter gym sessions on those days and no
prescribed cardio on those nights — and **exactly as many working sets as
the same person without Muay Thai.** Two hard evenings of striking and
conditioning are real training load; the plan currently treats them as
scheduling information. If the classes are wrecking someone, the app has no
lever: the coach can offer `propose_volume_change` one session at a time,
but nothing standing.

## The lever already exists, and it is already gated

`recovery_capacity` (low / moderate / high, one onboarding answer) is the
app's only "how much can this body absorb" input. It reaches the plan through
**six readers**, all traced:

| reader | where | what it does |
|---|---|---|
| set multiplier | `exercise-plan.ts:5468` `RECOVERY_SET_MULTIPLIER` low .75 / moderate .9 / high 1.0 | every exercise's sets, before phase and deload multipliers |
| top-up exemption | `exercise-plan.ts:5041` | low recovery gets **zero** duration top-up, so the cut is not refilled by spare session time |
| fifth-day trim | `exercise-plan.ts:4353` | low recovery with 5+ gym days loses the last one |
| rest-day cardio cap | `exercise-plan.ts:4133` | moderate/low keep one true rest day free of cardio |
| conditioning mode | `exercise-plan.ts:5342` | low/moderate get mobility-only session fillers |
| scorer exemption | `quality-score.ts:177` | a low-recovery under-budget day is not scored as under-filled — **load-bearing coupling** with the top-up exemption, by the scorer's own comment |

Plus two checks that pin the direction: `dev-constraint-audit.ts` CHECK (e)
(low < high weekly sets) and `quality-score.ts:1185` (low ≥15% below an
otherwise-identical high profile), and `TodayPanel.tsx:280`, which words the
session-length chip differently for low recovery.

**Measured, what one notch does** (scratch sweep, 6 Sep 2026, before any
change): on her profile (Mon/Tue/Thu/Fri, hybrid, intermediate, 45-60 min),
moderate → low takes week 2 from **77 working sets to 64 (−17%)**; across a
stride-11 sample of the quality grid (838 plans) the ratio is **median 0.73,
p10 0.65, p90 0.83**, no plan unchanged, and estimated session length barely
moves (median +1 min) because the low tier gives up its top-up rather than
its exercises.

## The build

**One derived value, read everywhere the raw answer was read.**

1. `effectiveRecoveryCapacity(profile): RecoveryCapacity` in
   `src/lib/concurrent-activity.ts`: the stored answer, one notch down
   (high → moderate, moderate → low, low stays low) when
   `countsAsTrainingLoad(profile.concurrent_activities)` is true. Byte-identical
   for everyone without a qualifying activity, by construction.
2. `countsAsTrainingLoad(activities)` — the threshold, which is the question
   for Ashley below.
3. Every reader in the table above switches from `profile.recovery_capacity`
   to the helper — generator (five sites), scorer (both), `TodayPanel`. The
   audit's CHECK (e) and the scorer's low-vs-high comparison keep reading the
   raw field on purpose: they vary it as an input.
4. **A class gate**, the same shape as `test:context-is-read`: no file under
   `src/` may read `profile.recovery_capacity` directly except the helper, the
   two comparisons that vary it, and the onboarding writer. A future reader
   cannot bypass the second sport.
5. **The card tells the truth about volume.** `buildConcurrentActivityProposal`
   currently says "Same amount of lifting — only which day carries which
   session changes." When the activity qualifies, that sentence becomes a
   measured one: the builder generates the week before and after (the
   generator runs in well under a second; the schedule-change card already
   pays a rebuild on confirm) and shows **"Weekly working sets: 77 → 64 while
   the classes are on."** When the person is already at low recovery, the
   card says the plan is already at its floor and nothing further comes off.
6. **The coach's prompt block** for other training gains one clause: the plan
   already accounts for the classes' load, so do not also offer
   `propose_volume_change` "because of Muay Thai".
7. **Removing the activity** on the Profile already offers a rebuild
   (`plan-invalidation.ts`); the notch comes back off with it, no new path.
8. **Undo** already restores `concurrent_activities`; nothing new.

Not touched: `RECOVERY_SET_MULTIPLIER`'s values, the top-up rules, the
onboarding question, `intensity`'s meaning on the type (it stays "the coach's
rough 0-1 estimate").

## Gates

- `test:concurrent-activity` §5: a qualifying activity takes the probe
  profile from moderate to effective low — weekly sets down within the
  measured band (≥15% fewer, the same threshold the scorer already uses for
  low vs high); a NON-qualifying activity leaves sets byte-identical; low
  stays low (no double notch); every `RecoveryCapacity` × qualifying/not
  produces the same plan as the corresponding raw tier would.
- The reader gate (item 4), mutation-tested by adding a raw read.
- `test:coach-promises` / card copy: the card never says "same amount of
  lifting" when the notch applies, and never shows a set count it did not
  compute.
- `test:audit` 17,423 / 0 and `test:quality` unchanged: no grid profile has an
  activity, so both must be byte-identical — asserted, not assumed, by the
  fingerprint script on a stride.

## The question for Ashley, and three ways to answer it

**When someone tells the coach about a second sport, when should the plan
also do less lifting?**

**(1) When the sport is two or more sessions a week, or the coach rates a
single session as hard (intensity ≥ 0.7).** *(recommended)* Two Muay Thai
nights, a weekly sparring session, a club run — one recovery notch, about a
quarter fewer working sets, said plainly on the card. A gentle weekly yoga
class changes the schedule and nothing else. Reason: it matches what the
recovery answer already means — "how much can this body absorb this week" —
and it is the smallest rule that gets her sentence right without touching
someone whose extra activity is light.

**(2) Any recorded sport, however light, takes the notch.** Simplest rule,
no judgement about intensity. Cost: a Tuesday stretch class costs someone a
quarter of their lifting.

**(3) Never automatically — the coach offers it as a separate card the
person can decline.** Most cautious. Cost: two cards for one sentence, and
the default plan for "I also do Muay Thai twice a week" is still built as if
they did not.

Under any answer: low stays low; the card names the set count; removing the
sport restores it; nobody without a qualifying sport moves.

## Ashley's ruling, 6 Sep 2026: **option 1, plus a toggle on the workout card**

Asked in the conversation, one question, three options with a recommendation.
Her answer, in her words:

> Go with Option 1 (Two+ sessions or one hard/combat session), but with a
> direct toggle on the workout card:
> 1. Logic: Automatically reduce volume by one recovery notch when 2+ sessions
>    or 1 hard/combat session (e.g., Muay Thai, sparring, heavy running) are
>    added. Light mobility/yoga only affects scheduling, not volume.
> 2. UI/UX: Display a clear notice on the workout card stating: "Volume
>    reduced ~20% for Muay Thai recovery" with a simple inline button to
>    "[Revert to Full Volume]" if the user wants to keep original lifting sets.

## BUILT

- **The rule** (`activityCountsAsLoad`, `src/lib/concurrent-activity.ts`):
  two or more sessions a week, or one session that is combat (`striking` /
  `grappling` in its demands) or rated hard (`intensity ≥ 0.7`,
  `HARD_ACTIVITY_INTENSITY`). Per activity, on purpose — two different gentle
  classes do not add up to a notch. An activity with no recognisable day
  never counts.
- **The revert** lives on the activity as `keep_full_volume` (jsonb column,
  so no migration; removing the sport removes the choice). The sport still
  bends the schedule; the plan just does not shorten its week for it.
- **`effectiveRecoveryCapacity(profile)`** — the ONE place the plan reads
  recovery: stated answer, one notch down (high → moderate, moderate → low,
  low stays low) when a load-bearing sport exists. All six readers now go
  through it: the set multiplier, the top-up exemption, the fifth-day trim,
  the rest-day cardio cap, the conditioning mode, and the scorer's
  under-budget exemption (whose expected low-vs-high gap now also uses the
  effective tiers of both profiles). `TodayPanel`'s shortfall wording too.
- **Proven exact:** Muay Thai at moderate is byte-identical to a reverted
  Muay Thai at low — the notch is precisely one tier and nothing else; low
  with Muay Thai equals low without the notch (no double notch); a gentle
  weekly yoga class produces a byte-identical plan to its reverted twin.
- **The chat card's volume sentence is measured**: two generations from the
  same seed differing only in `keep_full_volume`, so the gap is the notch —
  "about 77 → 64 working sets a week … Revert to full volume any time from
  the workout card." Three honest variants: already at low recovery (nothing
  further comes off), another sport already carrying the notch (this one
  does not take it further), and the original "same amount of lifting" for a
  sport that does not qualify.
- **The workout card** (`TodayPanel`): an `InsightBanner` above the session —
  "Volume reduced ~17% for Muay Thai recovery — 64 of 77 working sets this
  week" with **Revert to full volume**; after a revert, "Full lifting volume
  kept despite Muay Thai" with **Reduce again**; at the floor, the honest
  sentence and no button. The percentage is measured the same way as the
  card's, once per plan, and only for someone with a qualifying sport. The
  button runs `executeSecondSportVolume` (rebuild first, write second,
  forward-only, the `executeConcurrentActivity` shape) and carries the result
  into App state through two new optional props threaded App → ExerciseTab →
  TodayPanel.
- **The receipt** for the chat confirm gains a "Lifting volume:" line in the
  same three variants.
- **The coach**: the tool description and §3g no longer say the lifting is
  unchanged unconditionally; the data block shows when the person kept full
  volume; the rules block tells the coach the notch is already there, never
  to offer `propose_volume_change` "because of" the sport, and to name the
  notch (and the revert) when someone says the classes are wrecking them.
  `APP_REALITY` in both copies.

## Gate: `test:concurrent-activity` §5–§7 (extended)

§5 the rule as a table (two sessions; one gentle class; one combat session;
one hard session; the boundary at 0.7 both sides; two gentle classes; no
recognisable day; the revert; the three tier mappings; nothing moves without
a sport; the notice's three states). §6 the plan does less by the scorer's
own ≥15% threshold, the schedule half still holds, and the three
byte-identity proofs above. §7 no raw read of `recovery_capacity` survives in
the generator or the workout card, exactly one in the scorer (the profile
selector for the low-vs-high comparison), and every piece of wiring is
present: executor, receipt lines, card notice with the measured figure and
the revert, the chat card's three sentences, the coach's rule and
non-double-counting instruction, both APP_REALITY copies.

**Nine mutations, nine caught** (see BACKLOG for the list).
`test:session-shortfall` re-pinned to the effective-tier expression.

## Deviation to note

Nothing was built beyond the ruling. One judgement call, recorded: the
notice's percentage is measured from a regenerated week rather than fixed at
"~20%", because the real figure varies by plan (median 27% across the
quality grid, 17% on her profile) and a fixed number would be wrong for most
people.
