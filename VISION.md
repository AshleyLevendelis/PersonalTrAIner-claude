PersonalTrAIner — Product Vision

The problem
Generic fitness apps hand out templated plans that ignore real
constraints — and most of them quietly assume you already train. I'm
building an adaptive AI personal trainer and nutritionist that programmes
like an elite human coach, for everybody: from someone who has never
exercised in their life to someone who has been lifting for a decade.

Three pillars
1. True personalisation without compromise. Respect every individual
constraint — starting point, equipment, injury history, exact time caps,
preferred style of training. Meeting a user where they actually are IS
the personalisation, not a lesser version of it. Never fall back on a
generic plan or algorithm fluff.
2. World-class coaching logic. Bridge rigid software rules and
authentic strength & conditioning principles (CSCS-level programming).
Every plan should feel hand-crafted by an elite human coach.
3. Total accountability and adaptability. An instant, responsive AI
that handles daily meal swaps, tracks real progression, and keeps users
accountable to ambitious physical goals.

What a plan can be
A plan is whatever genuinely serves this person. For many that is
sets-and-reps gym sessions. For others it is activity-shaped — walks,
swims, rides — prescribed by duration and frequency, progressing on their
own terms.

These are different plan formats, not different amounts of care put into
the same one. An activity plan is not a gym plan with the weights taken
out; it is the right shape for that person, built to the same standard.

How generation works
Gym-style programming — the mode described below — is a core capability,
not the definition of the product. Other plan shapes are held to the same
coaching standard, in their own terms.
• Hybrid: a rules-based engine generates; AI handles modification and
conversation. Neither alone is enough.
• Five-stage pipeline: equipment → injury → style → time cap →
progressive overload.
• Mesocycle periodisation: four-week blocks with distinct phases; movement
patterns stay consistent while variations rotate.
• Experience level drives skill gating, volume, rep floors, RPE targets
and progression rate.
• Session structure: warm-up → primer → main lift → accessories, ordered
target muscle → supporting → core.
• Prescriptions read like coaching (3×8-10), not arithmetic (3×7-11).
• A time cap is a promise. Ask for 90 minutes, get roughly 90 — not 56.

Choosing, not just filtering
The engine must rank, not shuffle. Ruling out what doesn't fit and
picking at random from the remainder produces sessions that are defensible
but never sharp. A coach has a reason for every choice.

Selection should score eligible candidates on quality, goal fit,
experience fit, what's already in the session, and variety across the
block — then pick the best, not any valid one. This is the difference
between a generator and a trainer.

Explaining its reasoning
Where a choice is non-obvious, say why: "trap bar rather than conventional
because your recovery is stretched thin this block." This is the clearest
signal that a coach designed the session rather than a filter, and it lets
the user learn rather than just comply.

Learning from what actually happened
The app currently prescribes forward. It should also read backward.

A coach notices that someone always fails the last set, skips every
Friday, or consistently beats the target — and adjusts. Logged sets,
missed sessions, and actual versus prescribed loads should feed the next
block. Progression that ignores what the user did isn't progression.

Fatigue management
Periodisation without fatigue management is a calendar, not a programme.
Deloads, volume pull-back when recovery is poor, and accumulated fatigue
across a block are core S&C, and the app should handle them explicitly.

Three surfaces stay in sync
Coach chat, plan table, workout log. A change in one reflects in the
others.

User control — settings and chat parity
The user must be able to change their plan at three levels, from either
the settings screens or the chat:

1. An exercise. Swap one movement for another — a busy machine, a
dislike, something that aggravates a niggle. Swaps must offer genuine
alternatives, including on different equipment.
2. A day. Reschedule a session, move a workout, or switch today's
session for a different one. Life doesn't follow the plan; the plan
should follow life.
3. The plan. Regenerate a programme when circumstances change — new
equipment, new goal, different training days, a change of style.

Settings and chat are equal paths, not a primary and a fallback.
Anything a user can do in the Profile screens they should be able to ask
the coach for, and vice versa.

The coach acts, it doesn't instruct. If the chat can't perform a
change, it says so plainly and offers what it can. It never sends the user
hunting for a control, and never describes a screen or button that doesn't
exist.

History is permanent
Logged sessions, weigh-ins, goals and training history survive every change —
a new plan, a new goal, a changed profile. Nothing the user has recorded
is ever orphaned by an action they take inside the app.

The coach chat
• Personality: a real person who wants to stay on topic. Warm, never
robotic, never locked down.
• On topic: training, nutrition, sleep, stress, recovery, motivation,
habits, supplements, body image, weight goals. App-support questions are
answered, not redirected.
• Off topic: quick factual questions get a brief answer then a
redirect; open-ended tasks are acknowledged and declined. After that it
never budges, but stays friendly.
• House style — ask before prescribing. "How do I eat 800 calories a
day?" → ask what's driving the number first. "My shoulder hurts on
presses" → ask what kind of pain before adapting. "I can't face training
today" → find out whether it's a flat day or something heavier before
suggesting a session.
• Never claims a capability it doesn't have. Never invents screens,
features or safety guarantees.

Safety is non-negotiable
• Allergens. The app filters ingredients it recognises. It cannot
verify brands, preparation or cross-contamination, and it says so. It
never claims a food "is safe" or "is X-free". Some allergens have real
data; several have none, and for those the app says it can't check
rather than reassuring.
• Injuries. A stated injury persists and governs every future plan. An
injury should produce a plan that actively rehabilitates it, not one
that merely avoids the joint. Three-state tagging: loads this joint /
contraindicated when injured / indicated for this injury.
• Loads. Implement ceilings warn before clamping, never silently. A
ceiling is a safety net, not a fix — if it catches something, something
upstream is broken.

Adaptivity
• Nothing auto-applies. Every profile change, including a new injury,
proposes an update the user confirms. Nothing changes their plan without
an explicit OK.
• When an injury rules out whole movement patterns, rebuild the plan
around it rather than removing slots one by one and leaving a gutted
week.
• Real-world friction matters. A busy machine needs a swap that's
actually available — including on different equipment.
• Progression is real and visible. Load or reps advance week to week,
and the user can see that they are.

Nutrition
• BMR/TDEE via Mifflin-St Jeor, AI-generated meal plans, food logging,
shopping lists, daily meal swaps.
• Targets track a seven-day weight average with a change threshold, not a
single noisy weigh-in.
• The user is told when their targets change, and why.
• A deficit has an endpoint. As someone approaches their goal, ask what's
next rather than cutting indefinitely.

It has to work wherever the user trains
Bad signal, one hand free, mid-set, under time pressure — a gym floor, a
pool deck, a park path, a pavement halfway round a walk. Logging what you
just did, starting a timer, and finding an alternative must all work in
seconds on a phone held in one hand. This is where the app is actually
used, and it is never a desk.

What this is not
• Not a template app with personalisation bolted on.
• Not a lookup table with a chat interface.
• Not a bot with a topic filter.
• Not an app that claims certainty it can't back.
• Not a gym app that tolerates beginners.

Only offer what's built
The app never offers a style, a mode, or an audience it cannot genuinely
serve yet. A picker listing an option the engine can't programme properly
is a promise the product doesn't keep — and worse than not offering it,
because the user only finds out after they've committed.

This document states the destination. What the app actually offers —
every option in every picker, everything the coach says it can do — is
limited to what is built and verified. Removing an option that isn't
ready is not a retreat; it's the same honesty the rest of this document
demands.

The bar for shipping
"Uncompromising" describes the standard, not the schedule. A feature ships
when it is safe, honest about its limits, and better than what a user
would otherwise do — not when it is finished, because coaching quality has
no finish line.

Safety items are the exception: injury filtering, allergen handling and
load prescription ship correct or not at all.
