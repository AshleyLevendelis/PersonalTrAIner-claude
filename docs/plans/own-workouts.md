# Your own workout

His request, 25 Nov 2026, with Saturday's blank optional-cardio day on screen:

> "how would you log a workout that isn't in your plan? ... on a blank day, on an empty day, you should just be able to
> start exercising ... If you did an exercise machine, add it. If you did some cardio, add it. Put in the reps, put in
> the time. After each set, because it's your own workout, you could put in your own rest. Start your own rest timer
> however you want. Finish the rest time when you're done, and go to the next exercise. You should be able to create
> your own workout ... 'Add squat, add bench press, add deadlift, rest, add an exercise' ... Have it all ready, and you
> go to the gym and you just start ... Likewise, you can log it after you've done it ... on a blank day, or even on a
> day that you've trained once."

And the same day: "The I also did button just adds sets to the existing workout though rather than a separate workout."

## Rulings

- **Where a workout built ahead lives: "Both"** (his, 25 Nov 2026, from three options): a saved list you start on any
  day, AND optionally put on a day, where it shows like a planned session with Start on that day.
- **A separate workout** (his words above): its own name, start, finish and list, never sets added to the plan's.

## Decisions mine (CSCS and mechanics), with the basis

- **Its sets are ordinary sets.** History, personal bests and the next weight the plan prescribes for that lift read
  them. A set lifted is evidence of what the lift can do, whichever screen logged it; the progression engine already
  reads by lift, not by plan day.
- **Set numbers run on after every set already on that date for that lift.** The database keys a set by date, lift and
  number, so a second workout's "set 1" would otherwise write over the plan's set 1.
- **Counting:** on a day with no session of the plan's (rest, recovery, a moved-away day), finishing marks the day
  trained. Beside a plan session it does NOT: the plan's session is still to do, and "count it as today's workout" is
  the option, never the default (his 22 Oct extra-cardio ruling).
- **Rest is his:** 90 s to start (a middle rest for most lifts), 30 s to 5 min in steps, kept per exercise, Start and
  Done by hand. No automatic rest: he asked to start and end it himself.
- **Effort on cardio is asked, never chosen for him** (his 24 Sep cardio ruling).

## Steps

1. **Start one today, log one after the fact (BUILT 25 Nov 2026).** Under every day's card: "Start your own workout"
   (rest day), "Start a separate workout" (beside the plan's), "Log a workout you did" (a past day). Full screen: add
   an exercise from the catalogue (or a name it does not know), sets of weight x reps ticked as you go (Undo by tapping
   again), your own rest, cardio with minutes, km and effort, a name, Finish. A past day has no ticks or timers and one
   Save, written at that day's noon. The day lists every workout of his own on it. The name and list are kept on the
   phone in this step (sets and cardio are in the database).
2. **My workouts.** Build ahead (exercises, sets x reps, a weight if he wants, rest), save by name, start from any day;
   put one on a day (strip and card show it, Start on the day). A table for workouts, so they reach every phone and
   step 1's records move up to it. Needs a migration.
3. **The coach.** "Build me a workout: squat, bench, deadlift" makes the same saved workout (and puts it on a day when
   he names one); "start my push workout" opens it. Needs the `chat-gemini` deploy.

## Not in step 1, named

- A workout's name and list are on the phone that made it; another phone sees the sets in history, not the grouping.
- A lift that is BOTH in the plan's session and in his own workout on the same day: his sets show in the plan card's
  set list too (one list per lift per day) and count towards its "N of M sets".
- "Count this as today's workout" beside a plan session.
- A saved past-day set cannot be edited or removed from the workout screen (as "I did it, not in the app").
- Units are kilograms.
