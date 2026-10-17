# One-page Home, Nutrition and Exercise (design 5c·5, 5c·6, 5c·4), 17 Oct 2026

Ashley uploaded the "one page, no tabs" handoff and said **"Build this one"**. Layout only: every control
the three screens have today is kept, moved or one tap deeper. Nothing is deleted.

## Her rulings on the three clashes (17 Oct 2026, each from options)
1. **Nutrition's day strip: "Keep it on top."** The handoff has no day strip; the 27 Sep strip (see,
   swap and shop upcoming days) stays as a slim row under the Nutrition header.
2. **The streak pill: "12 in a row"**, not the handoff's "12 days". The streak counts sessions, not days
   (`test:history-streak`), so "days" would be a false claim.
3. **Logging steps: "Tap the steps ring."** Home's water and steps pills go. Tapping Steps in the key opens
   the existing steps entry in place; tapping any other ring or key row opens Nutrition; water is logged
   from the Nutrition water cell, which opens the existing quick-add (+250 / +500 / undo).

## Decided here (layout calls, recorded in BACKLOG)
- **"Week N of M" is the plan's week** ("Week 2 of 16"), the number Home and every rebuild card already use
  (her 15 Oct ruling keeps the plan's position on the start day). The handoff's "Week 3 of 5" is a block
  week; showing both numbers on two screens would make one of them wrong.
- **The phase bar is the plan's real blocks**, one segment per block, labelled with the block's own phase
  name, never Base/Build/Peak/Deload (the plan has no such phases). The Program row says
  "B1 Anatomical adaptation · deload in 2 wks" from the mesocycle's own `is_deload` weeks.
- **The resize and top-up offers keep their rulings** (17 Sep "tell her and offer", 28/30 Sep "offered,
  never unasked"). They appear only when the drift or shortfall is real, so they are not the handoff's
  "always-visible resize offer". When one is showing it takes the coach-note slot and the macro line steps
  aside, so the screen still has one coach voice.
- **Nutrition keeps "Later" and the planned-day line.** The handoff lists Next and Eaten only; a meal not yet
  eaten and not next would have no row at all, which is a removal. The planned-vs-target line is her
  M33/H24 "the header adds up what is shown" ruling.
- **The coach note stays TrainerNudge** with its tag, Ask and Home's rotation (her 10 Oct "rotates, and
  stops"), restyled nowhere: the handoff says to use the existing component.
- **Exercise's ⋯ menu** (What happened?, Session history) stays beside the week number.

## Build order
1. Shared blocks (`src/components/one-page.tsx`): ring meter, ring key, section label, row, primary CTA style.
2. Home: header + pill, hero (mean % of four capped rings, rings, key), coach note, Up next (session with
   week dots, next meal, tomorrow), Progress (weight block with the weigh-in behind it, PR row, volume row),
   docked CTA (Start {focus} / Continue session; hidden on rest, moved, unknown and done). The done day keeps
   its summary and PR as the session row.
3. Nutrition: header + basket, strip, kcal left + bar, 2×2 macro grid (water cell opens the quick-add),
   coach note, MealPlan's Up next / Later / Eaten (Eaten total in kcal, "Log something else"), Targets row.
4. Exercise: header, hero split (title + two-ring week meter: sessions, sets), key, strip, coach note,
   Today's lifts (sets count on the label), Program row with phase bar, docked "Start session".

## Checks
Every gate that reads the six files (derived by grep) and every driver that names a Home, Nutrition or
Exercise testid is re-run; pins on the old layout are re-anchored to the property. A new `test:one-page`
asks the derived numbers (the hero %, the ring shares, the phase bar, the week meter) and a new
`verify:one-page` drives the three screens at 390px, both mutation-tested.
