# Knee flag: which loaded leg work stays (Marcus, 15 Nov 2026) — ITEMS 1 AND 2 BUILT

Marcus (52, right-knee surgery) got a leg day of rehab drills: no leg press, no hack squat, a Step-Down labelled
main lift, a Step-Up offered as its replacement, and the calf exercise cut when time ran short.

## What the code does today (traced 15 Nov 2026)
- The injury filter removes any lift "contraindicated" for a flagged joint (`isContraindicatedFor`,
  `exercise-db.ts`). A lift whose entry has NO explicit `contraindicated_joints` list falls back to
  `loads_joints`: anything that loads the knee is removed. Leg Press, Hack Squat and Seated Leg Curl declare no list,
  so a knee flag removes them. Lying Leg Curl declares `[]`, so it stays.
- What survives is the knee-REHAB work (entries "indicated" for the knee: Step-Down, Low Box Step-Up, terminal knee
  extension, short-arc quad set, the curls). Fixed today: a rehab drill can no longer be the day's main lift.
- The replacement ranker reads the knee only as a filter, so one step drill replaced another.
- A "& Calves" day's calf slot is accessory work and the first thing cut for time.

## Proposed (CSCS, but it is the injury filter, so his word first)
1. **Machine leg work stays for a knee flag, lighter.** Leg press, hack squat and a seated leg curl are closed-chain
   or supported, the load is set by the person, and they are the standard way back to loaded leg work after knee
   surgery once a physio has discharged someone. Mark them "not contraindicated for the knee" in the catalogue and
   price them one step lighter for a flagged knee. Free-weight squats, lunges, jumps and deep knee flexion stay out.
2. **A "& Calves" day keeps one calf exercise** when time is cut (calf work does not load the knee).
3. **No step drill replaces another step drill** when the knee is flagged: a swap away from a step-down offers a
   different kind of work (a curl, a bridge, a machine), not the same movement up instead of down. TRIED 15 Nov 2026
   as a filter on the swap list and reverted: with a knee flag the step-up is the ONLY candidate the ranker offers (it
   keeps to the same pattern), so filtering it left an empty list, a dead end. It needs the ranker to offer other
   leg work when the pattern is all rehab, which is the same change as item 1.
4. Unchanged and stays: sharp, one-sided or worsening pain names a professional and changes nothing; the app never
   decides someone is ready after surgery.

## The question for him
"After knee surgery the app now gives only rehab drills on leg days. Should a knee on the injuries list still allow
machine leg work (leg press, hack squat, leg curl) at a lighter weight, or keep removing it?"
- **Allow it, lighter (recommended):** a real leg session, the usual way back after physio discharge. Risk: someone
  not yet discharged gets a leg press; the injuries tap says "lasting", not "recovering from surgery".
- **Keep removing it:** safest reading, but leg days stay drills for as long as the knee is on the list.
- **Ask once:** when the knee is ticked, ask "cleared for leg machines by your physio?" and allow them only on yes.

Items 2 and 3 do not touch the filter and can be built without waiting. Measured before and after on the 9,216-plan
grid with a knee flag, by `measure:` before anything ships.

## Built, 15 Nov 2026 (his answer: "Allow it, lighter")
- Item 1: Leg Press, Hack Squat and Seated Leg Curl carry `contraindicated_joints: []`; `flaggedJointLoadFactor` prices a
  lift that loads a flagged KNEE (and is not knee rehab) at x0.8 of the estimate. Knee only: the same rule for every
  joint would reach 24 more lifts (shoulder 6, including the floor press; wrist 5; hip 9; elbow 4). Next step, mine to
  decide as a CSCS change, recorded rather than slipped in with this ruling.
- Item 2: built earlier the same day (the calf day keeps one calf exercise).
- Item 3: still open (needs the ranker to offer other leg work when the pattern is all rehab).
- Measured: full-gym knee leg days with loaded machine work 0 -> 234 of 576; lowest score 10.80 both ways.
  `test:knee-machine-work`.
