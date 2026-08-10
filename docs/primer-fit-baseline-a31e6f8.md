# primerFit baseline — a31e6f8

Reference baseline for the 12-point quality scale (six dimensions, primerFit included). Everything after this commit compares to these numbers, not to any pre-primerFit `/10` figure quoted earlier in this investigation.

Full 9216-combo exhaustive run (`ALL_EQUIPMENT × injuryCombinations × ALL_DURATIONS × ALL_STYLES × ALL_EXPERIENCE × ALL_GOALS`), deterministic per-combo seeding via `seededRngFromKey`. Two runs performed: the committed `scripts/run-quality-score.ts` (produces `quality-report.txt`, the canonical artifact) and a second instrumented pass capturing every `primerFit` deduction plus its combo fields, for the rule-level breakdown below — same generation code, same seeds, so the two are consistent by construction.

## 1. Aggregate (out of 12)

| | Value |
|---|---|
| Overall average | 10.0072 / 12 |
| Below 7.2 floor | 0 / 9216 |
| Time fit | 0.7076 |
| Structure | 1.9494 |
| Progression | 1.6997 |
| Selection | 1.9302 |
| Goal alignment | 1.8668 |
| **Primer fit** | **1.8535** |

`timeFit`'s per-dimension average (0.71) sits below the harness's 1.2 per-dimension floor, which is why `npm run test:quality` exits 1 — this is pre-existing and unrelated to primers; it was already true against the 129f47d baseline before any primer work started this session.

## 2. primerFit, broken out by rule

### `primer_absent` — 1,696 / 9,216 combos (18.4%), 6,688 week-1-day occurrences

**Not primarily an injury/equipment problem — it's a catalogue tagging gap.** 1,664 of 1,696 affected combos (98.1%) are `training_style: 'bodybuilding'`. Root cause, verified directly: every primer-tier catalogue entry — all 7 original plus all 6 added two commits ago — has `style_tags` limited to some subset of `['functional', 'combat', 'hybrid']`. **None include `'bodybuilding'`.** `stageStyleFilter` (`exercise-plan.ts:522-565`) drops every exercise whose `style_tags` doesn't include the profile's style, with a whole-pool safety net (`MIN_VIABLE_POOL`) that relaxes the filter only when the *entire* remaining pool is too thin — since primers are 13 of ~103 entries, dropping all 13 never trips that net. Every bodybuilding-style profile gets zero primer-tier candidates before injury or equipment are even considered.

By track (bodybuilding-style profiles route here): Legs & Calves (2,240), Back & Biceps (1,472), Chest & Triceps (1,136), Full Body Power (704), Shoulders & Abs (704), Pull & Hinge (208), Push & Press (192), Conditioning & Core (32).

**Residual, non-bodybuilding cases: 32 combos (0.35%).** All `30-45`min duration + `advanced` experience + `combat`/`hybrid` style. Not investigated further this round — small enough to be secondary, pattern (shortest duration + most sets-per-exercise experience tier) suggests a `stageTimeCap` trim interaction rather than a pool-exhaustion one, but that's inference, not traced.

**This is a correction to an earlier claim in this investigation**, per the standing rule: two rounds ago I reported "primer loss = 0 vs the 129f47d baseline" and treated the fallback fix as complete. That comparison was accurate for what it measured — but every profile I used to build the equipment/injury/experience pool-size table, and every smoke-test profile, hardcoded `training_style: 'hybrid'`. I never varied style, so I never read `stageStyleFilter` at all, and never checked what any of the 13 primers' `style_tags` actually contained. A diff against 129f47d showed zero change here because 129f47d had the identical gap — the same 13 primers, the same missing tag, since before any of this session's primer work began. The diff was blind to it by construction, not because it wasn't there.

### `primer_pattern_mismatch` — 1,680 / 9,216 combos (18.2%), 3,584 occurrences — the fallback-fire rate

This is the number that answers "where is the catalogue still too thin": every occurrence is a case where the graceful fallback (added last commit) had to fire because the affinity-preferred pool was empty.

| Injury | Occurrences | Share |
|---|---|---|
| `knees+shoulders+lower_back` | 960 | 26.8% |
| `shoulders` | 360 | 10.0% |
| `shoulders+wrists` | 360 | 10.0% |

Only these three injury shapes trigger it at all — no mismatches on `none`, single non-shoulder injuries, or `lower_back`/`knees`/`neck` alone. **Shoulder involvement is the common thread in all three.**

By track: Pull & Hinge (2,752, 76.8%), Upper Pull & Core (576, 16.1%), Back & Biceps (256, 7.1%). Push & Press, Chest & Triceps, Legs & Calves, Squat & Carry, Conditioning & Core, Full Body Power, Shoulders & Abs: zero.

By equipment tier: bodyweight (560) > minimalist (480) > home_gym (352) > full_gym (288).

By fallback primer actually used: **Bodyweight Squat Marches, 3,316 of 3,584 occurrences (92.5%)**. Kettlebell Swings 134, Box Jumps 86, Broad Jumps 48.

### Ranked gaps

1. **No bodyweight-equipment, non-shoulder-loaded, hip_hinge/pull-affinity primer with no experience floor.** This is the concrete, fixable gap. Every existing pull/hinge-affinity primer either loads the shoulder (Prone Y-T Raises, Medicine Ball Slams, Band Pull-Aparts, Band Face Pulls, Band Dislocates) or requires equipment outside the bodyweight tier (Kettlebell Swings needs a kettlebell, the three band ones need a resistance band) or gates on experience while also being knee-loaded (Broad Jumps: `minExperience: 'intermediate'`, `loads_joints: ['knee']`) — so a beginner/novice with a shoulder injury on bodyweight-only equipment has literally nothing eligible for a hinge/pull-pattern primer, on any track. Traced directly: verified this combination excludes every candidate, leaving `anyPrimerPool` non-empty only because Bodyweight Squat Marches (`loads_joints: []`, no capability gate) is immune to every exclusion — which is exactly why it's the fallback 92.5% of the time. A single new entry (bodyweight, hip-hinge-flavored — e.g. glute bridges or bird-dogs — no shoulder loading, no experience floor) would close most of this.
2. **Kettlebell/medicine-ball/band-equipment hinge-pull primers are shoulder-injury-fragile as a group.** Even where equipment allows them (minimalist/home_gym/full_gym), a shoulder injury still knocks out most of the group, which is why mismatch counts stay meaningfully above zero even on equipment tiers that technically have more primers available.
3. **The `primer_absent` style-tag gap (rank higher by raw count, lower by fix cost).** 1,664 combos vs. mismatch's 1,680 — comparable scale — but the fix is a tagging change to existing entries (add `'bodybuilding'` to `style_tags` on at least the generically-applicable primers, e.g. Bodyweight Squat Marches, Arm Circles), not a new exercise. Flagging as the highest-leverage, lowest-effort item here, not building it — this report is measurement only.

## 3. `full_gym|knees|90+|hybrid|novice|functional|low|love`

Printed the actual week-1 plan (not just the score) to check whether it's a genuinely poor session or a threshold artifact. `primerFit: 2/2` — every day's primer fits its track (Prone Y-T Raises on Push & Press, Arm Circles/Kettlebell Swings on Pull & Hinge, Medicine Ball Slams on Upper Pull & Core — all affinity-matched, no fallback involved). The 7.8/12 score is entirely non-primer:

- **Time fit 0/2**: Friday (Upper Pull & Core) is 38% under its 90-minute budget — a real, substantial gap (~34 minutes short), not a razor's-edge threshold miss.
- **Progression 1.6/2**: `frozen_week` — load/reps hold flat across a block boundary on several exercises (a widely-recurring, already-known pattern across this whole investigation, not new to this combo).
- **Selection 1.2/2**: two distinct issues — `duplicate_movement_family` (Close-Grip Lat Pulldown and Lat Pulldown both on Friday, same "pulldown" family) and `load_incoherent` (bicep load spread 4-20kg across Cable Curls/Barbell Curls/Incline Dumbbell Curls in the same week).
- **Goal alignment 1/2**: `recovery_volume_not_reduced` — a `recovery_capacity: 'low'` profile's weekly sets (87) aren't reduced far enough below the `'high'`-recovery reference (112).

Read: this is a genuinely mixed session, not a threshold artifact — the Friday time-budget gap and the duplicate pulldown are both things a person would notice, independent of anything primer-related.
