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
    copy: "Home answers one question — what's next. Today's session sits up top; Start session walks you through every set.",
  },
  {
    key: 'tiles', tab: 'dashboard', target: 'tiles',
    // THREE tiles now, not two — steps joined them when steps moved to
    // Nutrition. The old copy named two of the three, which reads as a
    // mistake to anyone looking at the row while it is spotlighted.
    copy: 'Calories, water and steps at a glance. Nothing logs from here — a tap hands you to Nutrition, which owns all three.',
  },
  {
    key: 'nutrition', tab: 'nutrition', target: 'rings',
    nav: 'navNutrition', tapHint: 'Tap Nutrition', teaser: 'Next stop — where your food lives.',
    // Steps MOVED here, and this is the one place the tour can say so. Their
    // target comes from the same activity level as the calorie target, which
    // is exactly why they share a tab — worth one clause, since anyone who
    // used the old Home logger will otherwise go looking for it.
    copy: 'Everything you eat and drink lives here — plus your steps, which share a target with your calories. The rings are your day, and +250 / +500 log water in one tap.',
  },
  {
    key: 'meals', tab: 'nutrition', target: 'meals',
    copy: 'Your meals for the day. Open one to log it, swap it, or regenerate it — every kcal here feeds the rings above.',
  },
  {
    key: 'exercise', tab: 'exercise', target: 'extoday',
    nav: 'navExercise', tapHint: 'Tap Exercise', teaser: 'Now the training side.',
    copy: 'Your program lives here — the week at a glance, the phase you’re in, my notes on it. Today’s session sits right below.',
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
    copy: "And this is where we talk. Anything you'd tell a coach — a heavy day, a food you hate, a sore shoulder — just say it. I'll take it from here.",
  },
]


export const SET_STEP_KEY = 'set'
