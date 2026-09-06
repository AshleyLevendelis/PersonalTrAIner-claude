import type { Tab } from '@/lib/app-route'

/**
 * The ten stops of the post-onboarding app tour, and nothing else.
 *
 * Lives here rather than inside AppTour.tsx for the same reason
 * first-run-intro.ts exists: this is pure CONTENT — no DOM, no state, no
 * effects — and pulling it out is what lets a gate read the real strings and
 * the real target keys instead of a copy of them that drifts. AppTour.tsx
 * owns the behaviour; this owns the words and the order.
 *
 * `target` / `nav` are `data-tour` attribute values. NOTHING IN THE COMPILER
 * CHECKS THEM: rename a wrapper in Dashboard.tsx and the tour quietly loses
 * its spotlight, dims the screen and points at nothing. test:app-tour is what
 * makes that a build failure instead of a bug report.
 */

/** One stop. `nav`/`gate` mark the stops the user has to act on; the rest are Next-only. */
export interface TourStep {
  key: string
  tab: Tab
  /** `data-tour` key of the element the brief points at. Null = a centred card over a full dim. */
  target: string | null
  /** `data-tour` key of the thing to TAP first. Its presence is what makes a stop gated. */
  nav?: string
  /** This stop is gated on an action rather than on arriving at a tab. */
  gate?: boolean
  /** Shown in the tap phase, above the pulsing target. */
  teaser?: string
  /** The `→ …` line in the tap phase. */
  tapHint?: string
  /** Shown in the info phase. */
  copy: string
  /**
   * Stands in for `copy` while the thing this stop points at genuinely is not
   * there yet. Lives HERE rather than as a literal in AppTour.tsx so it goes
   * through the same honesty scan as every other line — copy written inside
   * the component would escape the check entirely, which is the exact failure
   * the header above exists to prevent.
   */
  pendingCopy?: string
  title?: string
  last?: boolean
}

/**
 * Copy and order are FINAL — signed off on the prototype, in the coach's
 * voice, and carried over verbatim. Two constraints they encode, so a later
 * edit does not quietly drop them:
 *
 *  - Every stop says what the screen is FOR, not what it contains. "Home
 *    answers one question — what's next" is the shape; a feature list is not.
 *  - Nothing here claims a capability the coach would then decline. The tour
 *    is the app's first promise to a new user, so the honesty rule that
 *    governs first-run-intro.ts governs this too.
 */


export const TOUR_STEPS: TourStep[] = [
  {
    key: 'welcome', tab: 'dashboard', target: null,
    title: 'Quick tour?',
    // "I'll keep your place" was TRUE and is not any more, which is the kind
    // of thing a behaviour change quietly leaves behind. Skip used to park the
    // tour and leave an undismissable "Resume the tour" pill; it now ends it
    // for good, so the promise had to change with it. The replacement names
    // where the tour actually lives afterwards, because a permanent Skip is
    // only fair if you can see the way back before you take it.
    copy: "Your plan's built and ready. Give me a minute — I'll show you where everything lives. Skip anytime; it's in the settings menu whenever you want it.",
  },
  {
    key: 'hero', tab: 'dashboard', target: 'hero',
    copy: "Home answers one question — what's next. Today's session sits up top, and Start session hands you to Exercise, where every set gets logged. Home shows; it never logs.",
  },
  {
    key: 'tiles', tab: 'dashboard', target: 'tiles',
    // THREE tiles, and they no longer all lead to one place: steps moved to
    // Exercise on 5 Sep 2026, so the copy can't say "all logged in Nutrition"
    // any more without sending someone to the wrong tab. Each tile still
    // takes you to wherever that number is logged — which is now two tabs.
    copy: 'Your day so far. Calories are a read-out — tap through to Nutrition, which owns them. Water, steps and your weigh-in are logged right here.',
  },
  {
    key: 'nutrition', tab: 'nutrition', target: 'rings',
    nav: 'navNutrition', tapHint: 'Tap Nutrition', teaser: 'Next stop — where your food lives.',
    // Steps used to be named here. They moved to Exercise on 5 Sep 2026, so
    // this step is food and drink only — naming them here would point at a
    // row that is no longer on this screen. The water quick-adds went the
    // same way on 6 Sep (to Home, with the rest of the day's logging), so
    // this copy no longer promises a tap it cannot deliver on this tab; what
    // Nutrition owns is the read-out and the targets behind it.
    copy: "Everything you eat and drink lives here. The rings are your day at a glance, and the targets behind them — calories, macros, water — are set from this tab.",
  },
  {
    key: 'meals', tab: 'nutrition', target: 'meals',
    copy: 'Your meals for the day. Open one to log it, swap it, or regenerate it — every kcal here feeds the rings above.',
    // Since 6 Sep 2026 the app hands over before the meals are built, so this
    // stop can be reached while they are still coming. `copy` promises three
    // things you can do to a meal; over an empty slot that is a promise the
    // app cannot keep the moment it is made, which the honesty rule above
    // rules out. Ashley chose to wait here rather than skip the stop or
    // reword it permanently, so this is what the wait says.
    pendingCopy: "Your meals go here — I'm still building them. Give me a moment and they'll appear right below.",
  },
  {
    key: 'exercise', tab: 'exercise', target: 'extoday',
    nav: 'navExercise', tapHint: 'Tap Exercise', teaser: 'Now the training side.',
    // Steps MOVED here from Nutrition, and this is the one place the tour can
    // say so. Anyone who used the old Nutrition logger will otherwise go
    // looking for it on the tab it left.
    copy: 'Your program lives here — the week at a glance, the phase you’re in, and my notes on the week right under the header (tap to read the whole thing). Today’s session sits right below.',
  },
  {
    key: 'set', tab: 'exercise', target: 'setrow', gate: true,
    tapHint: 'Tap the ✓ to log the set', teaser: 'Your turn — log a set.',
    copy: "Logged — that easy. Leave the fields blank and I'll take the prescribed numbers; your rest timer starts on its own.",
  },
  {
    key: 'tools', tab: 'tools', target: 'toolsall',
    nav: 'navTools', tapHint: 'Tap Tools', teaser: 'Two doors left.',
    copy: 'Timers and your grocery list. The list builds itself from your meal plan — nothing to type.',
  },
  {
    key: 'settings', tab: 'tools', target: 'settings',
    // Names the two things the gear gained, and closes the loop the welcome
    // step opens: it now promises the tour is "in the settings menu", so the
    // step that shows the settings menu has to point at it.
    copy: 'Everything I know about you sits behind the gear — profile, preferences, injuries, all of it editable. How the app looks lives there too, and so does this tour if you ever want it again.',
  },
  {
    key: 'chat', tab: 'chat', target: null, last: true,
    nav: 'chatfab', tapHint: 'Tap the chat button', teaser: 'Last stop — the important one.',
    copy: "And this is where we talk. Anything you'd tell a trainer — a heavy day, a food you hate, a sore shoulder — just say it. I'll take it from here.",
  },
]


export const SET_STEP_KEY = 'set'
/** The stop that can outrun its own content — see its pendingCopy above. */
export const MEALS_STEP_KEY = 'meals'
