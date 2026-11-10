# A workout with no signal

Ashley, 10 Nov 2026, from a gym with no Wi-Fi: the whole-app "Something went wrong on this screen" mid-workout, then
"gyms often don't have WiFi and I noticed it's not possible to log a workout without Internet. We should be able to do
as much as possible in the app without network."

## What was wrong (each reproduced before it was fixed)

1. **A part of the app never opened before did not exist offline.** The app is split into files that download on first
   use. The service worker saved a file only when the page fetched it, so a sheet never opened at home was not on the
   phone in the gym. The fetch failed, the app reloaded itself (the cure for an out-of-date page, useless offline), and
   the second miss reached the whole-app error screen.
2. **A session trained offline read as not trained.** The card counted the phone's own sets (18 of 18) while the week
   read only the server: "Done · 0 of 18 sets", "0 of 4 sessions · 0/68 sets".
3. **A session finished offline was never marked finished while the app stayed open.** The close was retried only on
   the next open or return to the app. Measured: sets synced, the day still unfinished 46 seconds after the signal
   came back.
4. **A swap could not be made.** With no signal it was drawn, failed to save, was put back, and the app said to check
   the connection. "The machine is taken" is the edit a gym floor asks for most.
5. Not a defect, a precaution, and recorded as such: the sweep of old coach offers that follows a saved swap now has
   its own catch, so that if it ever THREW the swap would not be put back on screen. Measured: with no signal it does
   not throw (the client resolves with an error), and removing the catch changes nothing the driver sees. An earlier
   draft of this note called it a found bug; that was reasoned, not measured.

## What changed

- **The whole app is saved to the phone in the background.** The build writes the list of its own files
  (`vite-asset-manifest.ts` -> `/asset-manifest.json`); the page asks the worker to save them once it is idle
  (`main.tsx`, `'warm-assets'`); `public/sw.js` fetches what it does not hold and, only once everything listed is held,
  removes files of versions no longer listed. Measured on the real build: 43 of 43 files held, an offline reload drew
  the app, a never-opened part imported with the server gone.
- **A part that still cannot be fetched says so in its own place** (`PartNotLoaded.tsx`, through `lazyWithReload`):
  one sentence, a Try again, an OK for a sheet. No reload with no signal. Chrome keeps a failed file fetch for the life
  of the page, so recovery once online is a reload from the person's own tap, never the app's doing mid-workout.
- **The finish check is part of the screen** (1.3 kB), not a file fetched on the tap.
- **The week counts what the phone holds** (`week-local-work.ts`): the server's rows with the queued sets on top when a
  read works, the phone's last full answer plus the queue when it fails, and a day finished on the phone counts as
  finished (with at least one working set, Finish's own rule).
- **A finish made offline is sent when the signal returns** with the app open: the `online` event plus a 20-second
  knock while a close is owed. The summary stops saying it has not synced. One request at a time for a day's session.
- **Plan changes made on the Exercise screen are kept on the phone and sent later** (`mesocycle-persistence.ts`): swap,
  remove, move, add, and their Undo. Only a network failure is kept; a refusal still throws and the plan goes back. A
  read of the plan lays kept weeks over the server's; a newer successful save of a week drops its kept copy; a whole
  new plan drops them all; `useKeptPlanSender` sends on open, on `online`, and on a knock. The badge reads "Plan change
  waiting to send".

## CSCS review (the offline swap changes how a prescription is saved, not how it is chosen)

1. Training effect: none. The replacement list, the constraint checks and the pricing are the same functions.
2. What it takes away: with no signal the swapped-in lift is priced from the plan, not from his logged history of that
   lift (that read needs the server), and the "last time" hints are absent. The plan's price is the app's own
   unverified-lift price, the conservative one.
3. Fundamentals: untouched; the week-settling passes run on the edit as they do online.
4. No floor or ceiling is redefined.
5. In scope.

## Not done, named

- **Opening the app cold with no signal** is proven on the real build by a one-off measurement and in the whole-app
  harness with the database down, not by a registered check of the real build's shell.
- **Day changes** (rest day, missed, move the session, swapped for an activity), **shorten or rebuild today**, **a
  different kind of session today**, **meal swaps**, **weigh-ins** and **Profile changes** still need a signal; each
  says it did not save.
- **The coach** needs a signal.
- The first open after this update needs a signal for a few seconds to download everything (about 0.9 MB compressed).
- On a phone: never run on a real device with a real service worker. `verify:gym-offline` runs the real worker in
  Chromium with the server taken away.

## Checks

- `verify:gym-offline` (50 checks): a missing part's notice, the worker saving every listed file and serving one with
  the server gone, a whole session logged, counted, finished and sent, a swap kept and sent.
- `test:offline-ready` (73 checks): the worker against a fake cache on every branch, the week overlay, the kept plan
  weeks against a server that can be taken away or told to refuse, the wiring.
- Mutations: see BACKLOG.
