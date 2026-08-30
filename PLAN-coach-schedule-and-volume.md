# Plan — letting the coach change your schedule and your volume (audit §2.4)

Volume is prescription, so this gets a plan before a build.

## What is wrong

The coach has both tools and both are switched off at the server. From
`chat-gemini`'s own tool description:

> "Adjust the total training volume (sets/reps) for a specific day's session.
> **NOT SAFELY WIRED UP YET** — calling this will decline with a message
> pointing the user at the in-app controls."

and from the prompt:

> "PLAN CHANGES NOT YET SAFE TO EXECUTE: `update_workout_schedule` … and
> `adjust_volume` … are not safely wired up yet — calling either will always
> decline."

So the coach can discuss cutting volume or moving Thursday, and can do
neither. The client-side handlers were deleted as dead weight, and the
`PlanAction` union still carries both shapes.

**And the decline points somewhere that does not exist.** It sends the user to
"the set-count controls on the exercise", but `setExtraSets` is
`useActiveSession` state — an extra set inside TODAY'S live session, gone
tomorrow. There is no in-app way to change the plan's volume either. The
honest current answer to "can I train 3 days instead of 4" is: rebuild the
whole plan from the Profile screen, or live with it.

## Why they were unsafe, and what changed

Both tools were written to EXECUTE. `adjust_volume` multiplied a day's sets by
a factor; `update_workout_schedule` applied a patch. Neither respected the set
hierarchy, the 2-set floor, the recovery multiplier or the session time
budget, and neither could be undone.

Since then the app grew the thing that makes this safe: the **pending-action
rail**. Every `propose_*` tool goes propose → confirm → execute → receipt →
undo, with an atomic claim so a double-tap cannot apply twice, and a
`pre_image` so it can be reversed. Exercise swaps, injury adaptations and
equipment changes all ride it. These two never moved onto it.

They also now have somewhere to land: `rebuildFromCurrentWeek`, built this
week for the Profile screen's rebuild offer, regenerates from the live week
forward against a modified profile while preserving week identity.

## The shape

### Schedule — reuse, do not reinvent

`propose_schedule_change` carries the new set of training days. On confirm:

1. Write `training_days` to the profile.
2. Call `rebuildFromCurrentWeek` with the updated profile.

That is the SAME path the Profile screen's rebuild offer takes, which is
already gated and already trusted. Nothing new about how a plan is generated;
only a new way to ask for it.

**Forward only.** Past weeks hold logged sets. The rebuild starts at the live
week, exactly as the Profile offer does.

### Volume — bounded, and bounded by the engine's own limits

`propose_volume_change` carries a day and a direction, not a raw number. On
confirm, sets move within limits the engine already owns:

| Bound | Where it comes from | Why |
|---|---|---|
| Never below 2 sets | `baseSets`' existing floor | Below this an exercise stops being training. |
| Never above the role ceiling | `enforceSetHierarchy` | An accessory must not outgrow the main lift it supports. |
| Never past the session budget | `estimateDaySeconds` vs the requested length | Adding sets that push a 45-minute session to 70 is not a favour. |
| Deload weeks untouched | `is_deload` | A recovery week is already reduced on purpose. |

A change that would breach any bound is CLAMPED and the receipt says so —
"took Tuesday from 16 sets to 12; two exercises were already at the floor" —
rather than silently doing less than it claimed.

**Direction only, no free-form multiplier.** The model proposes "lighter" or
"heavier"; the app decides by how much. A model-chosen 0.4× is a load
prescription made by something with no view of the floors.

## What could go wrong

| Failure | What stops it |
|---|---|
| A silent plan change | The rail: propose → confirm. Nothing applies without a tap. |
| Applied twice on a double-tap | `claimPendingAction`'s atomic claim, already proven. |
| Cannot be undone | `pre_image` captured before the write, same as swaps. |
| Volume driven below usable | The 2-set floor, asserted in the gate. |
| Volume inflated past the time asked for | The session budget bound. |
| Logged history rewritten | Both changes start at the live week. |
| The model picking the magnitude | It cannot — direction only. |

## What I will NOT do

- Let either tool execute without a confirm.
- Let the model choose a multiplier.
- Touch `computeRoundState`, `enforceSetHierarchy` or the generation pipeline.
- Rewrite past weeks.
- Ship the tools enabled server-side without the client able to execute them —
  the failure this whole section is about.

## Verification

- A new gate: direction-only proposals, every bound holds, deloads untouched,
  past weeks byte-identical, and a clamped change reports what it actually did.
- Mutations that must each turn it red: remove the floor, remove the ceiling,
  remove the budget check, let the model pass a multiplier, execute without a
  confirm, rebuild from week 1.
- `test:audit` stays 13,967/0; `test:rebuild-offer`, `test:pending-actions`,
  `test:chat-actions`, `test:coach-rules-sync` stay green.

## Deploy

**Needs a `chat-gemini` deploy** — the tool descriptions and the prompt change.
Client and function must ship together: a server that proposes a change the
client cannot execute is exactly the state this fixes.
