# Plan — offer to rebuild when a Profile change invalidates the plan

Audit §2.1, item 11 on its own ordered list. Injury filtering, so this gets a
plan before a build.

## What is wrong

`savePatch` (`ProfileScreen.tsx:479`) writes the field and does nothing else.
So on the Profile screen today:

- **Add a knee injury.** The injury is saved. Every squat, lunge and step-up
  already in the sixteen-week plan stays exactly where it was, and stays there
  permanently — nothing re-runs. The app now knows about the injury and keeps
  prescribing against it.
- **Change your equipment** from full gym to bodyweight. Same: the plan keeps
  prescribing barbells you no longer have.

The engine to fix this already exists and is already trusted — the coach uses
it. `rebuildAgainstProfile` regenerates against a modified profile clone and
splices the result in while preserving week and block identity, so logged
sets, the active session and the week strip all stay attached. The Profile
screen simply has no route to it.

## The shape

**Ask, never silently** — the audit's own words, and the pattern the codebase
already uses for the weight-basis offer. A silent rebuild would change
somebody's next sixteen weeks under them, possibly mid-block, with no notice.

1. `savePatch` learns which fields invalidate a plan.
2. When one changes, ProfileScreen tells App via a new `onPlanInvalidated`
   callback. It does NOT rebuild anything itself — App owns the mesocycle.
3. App shows a dialog naming what changed and what a rebuild would do.
4. On confirm, it rebuilds FROM THE CURRENT WEEK FORWARD, never backwards.
5. On decline, nothing happens and it is not asked again for that same change.

### Which fields, and why only these

| Field | Rebuild? | Why |
|---|---|---|
| `injuries` | **Yes** | Safety. The plan is prescribing movements that conflict with a stated injury. |
| `equipment_access` | **Yes** | The plan prescribes equipment they have said they do not have. |
| everything else | No | Age, weight, name, dietary preferences, reveal speed and the rest either feed macros (which already recompute) or do not touch exercise selection at all. Offering a plan rebuild for a name change would train people to dismiss the dialog. |

### Weeks that are rebuilt, and weeks that are not

**Only the current week and later.** Past weeks hold logged sets — real work
somebody actually did — and rewriting them would make their own history
disagree with what they remember doing. The same rule the coach's injury
rebuild already follows.

## What could go wrong

| Failure | What stops it |
|---|---|
| A silent rebuild changes someone's block mid-week | It is a dialog. Declining does nothing. |
| Logged history rewritten | Rebuild starts at the current week; earlier weeks are untouched, asserted in the gate. |
| Asked repeatedly for the same change | The offer is per-change and cleared on decline. |
| A rebuild that drops the injury filter | The rebuild runs the normal generation pipeline against the updated profile — the same path onboarding uses, which is already gated for injury filtering. |
| Week identity lost, orphaning logged sets | `rebuildAgainstProfile` preserves `week_number`/`block_number` — its own doc comment says this is the part that must not be re-derived per caller. |

## What I will NOT do

- Rebuild silently, for any field.
- Rebuild past weeks.
- Offer a rebuild for fields that do not change exercise selection.
- Touch `rebuildAgainstProfile` itself. It is working and the coach depends on
  it; this adds a caller, not a change.

## Verification

- A new gate: an injury added to the profile changes the plan from the current
  week on, and leaves earlier weeks byte-identical.
- The offer fires for injuries and equipment, and for nothing else — asserted
  over the real field list, not a hand-written one.
- Declining leaves the mesocycle untouched.
- `test:injury-rebuild`, `test:injury-separation`, `test:injury-coverage`,
  `test:audit` stay green.

## Deploy

Client-side only. No migration, no edge function.
