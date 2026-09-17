# How the app should talk about a change

Written 14 Sep 2026 on Ashley's brief: *"I want to ensure that the changes we
are allowing users to make to their meal and exercise plans still produce
great results for the users because we are their coach and nutritionist. If we
just allow users to make any change they want without advising them, they will
end up with a plan that doesn't help them meet their goal. Think about what
currently happens when a user makes a change and how we could better manage
these and speak to the user about the trade-offs."*

**Proposal only. Nothing built. Not yet approved.** Companion to
`what-an-edit-does-to-the-plan.md`, which traced where each edit ripples; this
one is about the *conversation* at the moment of the change.

---

## 1. What actually happens today when someone changes something

Measured from the code, 14 Sep 2026.

**Every change is proposed, then confirmed.** Nothing is written until the
tap. That is the right foundation and it holds on both surfaces.

**What the card says.** What changes and what does not; the mechanical
consequence ("the session gets longer", "weights are re-checked"); what the
balancing pass will move on *other* days; and what it could not fix — the week
left push-heavy or chest-heavy, with the set counts. A removal asks drop-or-
replace. A food removal says what leaves with it ("−31g protein, −210 kcal")
and offers two or three verified swaps. A meal move states both new sizes.

**What the card never says: what it costs your goal.** The app has no goal
vocabulary at the point of change. "That leaves your week push-heavy" is a
structural fact. "That's the meal that keeps you full until dinner and keeps
muscle on while you cut" is coaching. The first is always said; the second
never is.

**What the app never asks: why.** The coach asks first for pain, medication, a
very low calorie number and "I can't face it" — house style, and right. For a
swap, a removal, an addition or a volume cut it does what it is asked. Yet the
reason is the whole decision: "busy machine" and "my shoulder" and "I hate it"
are three different problems that happen to arrive as the same sentence.

**What the app knows and never uses.** The plan has a quality score — six
dimensions: time fit, structure, progression, exercise selection, goal
alignment, warm-up fit — and a floor every generated plan must clear. Every
edit path is *proven by test* to keep four sample profiles above that floor.
But the score is never run on a real person's real edit: measured today, it
has zero call sites in the app itself. It takes about 11 milliseconds. The one
instrument that could say "this edit hurts your goal alignment" sits unused at
exactly the moment it would matter.

**What is refused today.** Safety and structure only: a session under three
exercises, a portion resize past 2.5× or under 0.4×, anything touching an
allergen or a stated dislike, a day that already has a session. Everything
else is allowed and told. That follows Ashley's own rulings — *add it and say
the session is longer*; *state what leaves with the food and offer to replace
it*; *never quietly grow the other meals* — and it is the right posture.

**One structural oddity.** The coach's sentence is written *before* the phone
computes the card's cost. So the coach says "I can swap X for Y" and the card,
a moment later, says what it costs. A coach says the cost in the same breath.

### Side by side

| Change | What is said now | What a coach would add |
|---|---|---|
| Swap, today | Load recomputed on confirm; balance cost if any | Nothing — unless the reason says it isn't a one-day problem |
| Swap, rest of block | Same | "For a strength block, the machine won't carry over to your barbell bench the way we want. Is the bench busy today, or do you want it gone?" |
| Remove | Shorter session; balance cost; drop or replace | "That takes your quads to 8 sets this week, under the 10 that keeps them growing. Hack squats instead?" |
| Add | New length; balance cost | "That's the fourth arm exercise this week — past where more does more. Add one and I'll rotate them?" |
| Reorder | Order only | "You'll squat tired — fine for a change, don't chase your numbers." |
| Ban | How many sessions it reaches | "That's your main hinge for the whole programme — pick what replaces it: trap bar, RDL, or hip thrust." |
| Shorten today | Main lift stays; accessories go | Third time: "Tuesdays keep needing to be 25 — set them to 30 for good?" |
| Lighter, ongoing | Sets before and after | "Ongoing means the two heaviest weeks of this block too. Today only? If it's every week, let's look at sleep first." |
| Move a session | Lands on the next free day | "That's legs two days running — Wednesday will feel heavier. Thursday's free." |
| Remove a food | −protein, −kcal; swaps offered | For fat loss: "Lunch drops to 12g protein — the meal that keeps you full. Tuna, tofu or yoghurt in its place?" |
| Add a food | Over/under the slot's share; day re-fits | For fat loss: "That's 350 over today — about a third of the week's deficit. One-off is fine. Lighten dinner to make room?" |
| Move a meal | Both new sizes | "Halving that dinner takes it to 18g protein — low for a meal. Or keep it as dinner and just eat it earlier?" |

The right-hand column is not longer. It is *aimed*.

---

## 2. The principle: allowed, priced, and offered a better way

> You can change anything that isn't unsafe. Before you do, the app tells you
> what it costs your goal — in your goal's own terms — and offers the version
> that gets you what you wanted for less. Then it is your call, and it
> remembers what you chose.

This keeps every ruling already made and adds one thing: the cost is priced
against the *goal*, not only against the structure.

**Why not refuse more.** Three reasons, all Ashley's own logic. You asked, so
you get it — the app never quietly removes work to pay for work you requested.
A refusal teaches people to stop asking, and the person who stops asking
stops using the app. And the person knows things the app cannot: the machine
is broken, the shoulder is sore, the kids are ill. Coaching is telling, not
blocking. Refusal stays where it is — safety.

### Four tiers, by consequence

| Tier | When | What the app does |
|---|---|---|
| **0 — Free** | No cost to the goal | Does it. Says nothing extra. |
| **1 — Costs something** | Most edits | One sentence on the card: the cost in goal terms, and the cheaper route. Confirm as now. |
| **2 — Works against the goal** | The change undoes what the block is for | The coach **asks before a card appears** — why, and what a coach would do instead. The change is one tap further away, never blocked. |
| **3 — Unsafe** | Allergen, injury conflict, structural floor | Refused, with the reason and the nearest safe thing. Exists today; do not widen it. |

Tier 2 examples: an ongoing volume cut in the block whose point is volume;
removing the only work for a pattern the goal depends on; a fat-loss client
taking protein out of a meal for the third time this week; loading up a
deload; the third same-day shortening; moving the main lift to last in a
strength block; swapping a barbell main lift for a machine for the rest of a
strength block.

Tier 0 examples: reordering accessories; a like-for-like swap; a meal swap
inside its budget; a one-day swap because the machine is busy; anything on the
starting-out plan short of stopping.

---

## 3. The reason is the hinge

The single highest-value change: **when a swap or removal arrives without a
reason, ask — with chips, not a question.**

**BUILT 15 Sep 2026, both surfaces.** The table below is what shipped.

| Chip | Verb it appears on | Where it goes |
|---|---|---|
| It's busy or broken | swap | The ordinary swap, today. Nothing extra — Tier 0 |
| I don't like it | both | Drop or replace it, and keep it out from now on |
| It hurts | both | The triage below — never a plain swap |
| I haven't got the kit | swap | Asks which kit, then rebuilds the week around it |
| I'm short on time | remove | `shortenDayTo` — the main lift stays, accessories go |
| I'm wiped today | remove | One step lighter, today only |

**FOUR PER VERB, NOT SIX ON EACH.** Two of the six were already verb-specific
here; the rest split the same way, on the test "would this make someone reach
for THIS verb?" Nobody swaps because they are short on time — a swap takes
just as long. Nobody removes because a machine is taken — they would put
something else there. Four is also what the chip row can render: the coach's
prompt caps a row at four and `askText` slices to four, so a six-chip set
would have been silently truncated by machinery neither surface controls.

**THE QUESTION WAS ALREADY BEING ASKED.** Removing a main lift in a strength
block had said *"What's going on with it — is it the exercise itself, or
something else?"* since 14 Sep, under three chips that did not answer it. So
the reason chips are that question's missing answer set, not a second question
beside it — which is why a reason ask and a goal ask never stack.

**AND ONE THING THE ESCAPE CHIP TAUGHT US.** `askText` appended "Do it anyway"
and *then* sliced to four, so the first verdict with four alternatives would
have lost it and turned the ask into a block. Fixed the day the reason chips
arrived, before it could fire.

### The hurts triage — Ashley's ruling, 15 Sep 2026

From three options: **ask, then act.** One question, three answers.

| Answer | What happens |
|---|---|
| Just a niggle today | That area eases off for seven days, then comes back on its own |
| It's been there a while | Goes into her injuries, so every future plan avoids it |
| Sharp, one-sided or getting worse | Names a physio. **The plan is not touched and nothing is recorded** |

Rejected: acting today-only and recording nothing (the app never learns, and
she says it again next session), and treating every ache as an injury (one sore
session rewrites the rest of the block).

**And from three more, on where it happens: on the screen, fully** — "you reach
for this mid-session on a gym floor, and dropping someone into a chat to type
is the wrong thing to hand them."

Two calls inside that were the session's, and are flagged rather than buried:
**one question with three answers rather than a safety screen first**, because
opening with "is it sharp?" is an alarming answer to "it hurts" and costs the
common case a tap to serve the rare one; and **seven days** for both the niggle
and the kit change, because a row of buttons cannot ask "how long" without
becoming a second question, and a permanent answer to a temporary problem is
how somebody comes home to a bodyweight plan.

The red-flag branch is the one the browser driver exists for: `verify:hurts`
checks the advice names a professional AND that the session is byte-for-byte
unchanged, because a build that printed the sentence and rebuilt the week
anyway would pass on either half alone.

---

## 4. "In your goal's terms" — the vocabulary

The cost of the same edit is different for different people. Removing the leg
press is a rounding error for a conditioning client and a real loss for a
hypertrophy client. The app knows the goal; the card should speak it.

**Building muscle.** Weekly sets per muscle inside its band (the app's own
role floors and ceilings, summed across the week); push:pull and chest:back
balance; a lift's progression thread unbroken. *"That takes your back to 9
sets this week — under the 10 that keeps it growing."*

**Getting stronger.** Main lifts first and fresh; frequency on the big three;
specificity — a machine does not carry over to a barbell; the progression
thread. *"Machine press builds the muscle but not the bench. For this block,
or just today?"*

**Losing fat.** The *weekly* deficit, never the daily; protein per meal and
per day; keeping training volume, because muscle is what the deficit is
protecting; steps. *"That's 350 over today — a third of the week's deficit.
Fine once. Lighten dinner to make room?"*

**Conditioning.** Cardio share of the week; density; not stacking two hard
days. *"That moves both hard sessions into the same two days."*

**Starting out.** Consistency above everything. The cost of any edit is small
next to not turning up, so the app says *less* here, not more, and never
attaches a cost to showing up in a different shape. *"Good — a shorter one
still counts."*

---

## 5. The sentence shape

Every trade-off line is built the same way, and the whole thing fits in two
sentences:

1. **What changes** — in the person's terms, not the plan's.
2. **What it costs** — one number they can picture, in their goal's terms.
3. **The cheaper way to get what you wanted** — one offer, from things the
   app can actually do.
4. **Your call** — implicit; the buttons are the sentence's ending.

Rules that follow: never a score, never "are you sure?", never a warning on a
change that costs nothing, never the same warning twice in a block, never a
comment on the person. Amber for a real cost, plain for information, exactly
as the cards already do.

### Worked cards

*Remove the leg press, hypertrophy goal, rest of block:*
> That takes your quads to 8 sets a week for the rest of the block — under the
> 10 that keeps them growing. **Hack squat instead** · **Drop it and add a set
> to squats** · **Just drop it**

*Volume lighter, ongoing, week 2 of a hypertrophy block:*
> Ongoing reaches the two heaviest weeks of this block, which is where the
> growth is. **Today only** · **Every week** · *If you're this tired most
> weeks, tell me about sleep and I'll look at recovery properly.*

*Swap barbell bench for machine press, strength block, permanent:*
> Machine press builds the chest but won't carry over to your barbell bench,
> and this block is built around it. **Just today** · **Rest of the block** ·
> **Dumbbell bench instead** (carries over better)

*Move Monday's legs to Tuesday; Wednesday is legs:*
> That puts two leg days back to back — Wednesday will feel heavier and you
> may lose a rep or two. **Tuesday anyway** · **Thursday instead** (free)

*Add a third arm exercise to Thursday:*
> That's 22 sets of biceps this week — past the point where more does more.
> **Add it anyway** · **Add it, rotate the three across the block**

*Remove chicken from lunch, fat-loss goal:*
> Without the chicken, lunch is 12g protein — the meal that keeps you full
> till dinner and keeps muscle while you cut. **Tuna** · **Tofu** · **Greek
> yoghurt** · **Leave it lighter**

*Add a 480-kcal food, fat-loss goal:*
> That lands today about 350 over — a third of this week's deficit. Fine as a
> one-off. **Add it** · **Add it and lighten dinner**

*Move dinner into the snack slot:*
> Halving that dinner takes it to 18g protein — low for a meal. **Swap them
> anyway** · **Keep it as dinner, eat it earlier** *(no change to the plan)*

*Any edit, starting-out plan:*
> Done — a shorter walk still counts. *(No cost line. Ever.)*

---

## 6. Where the words come from — nothing new to invent

Almost every number above already exists in the code. The work is deciding to
say it.

| Cost | Source, today |
|---|---|
| Push:pull, chest:back | The balance pass — already on every card |
| Session length | Already on the add card |
| −protein, −kcal from a meal | Already on the removal card |
| Protein per meal floor | In the meal verifier |
| Sets per muscle per week | The generator's volume roles, summed across the week — a new read, not a new rule |
| Goal alignment, progression continuity | The quality score's own dimensions, run on the trial (11 ms) and *translated*: name the dimension that dropped, never the number — her ruling |
| Weekly deficit | Targets and the ledger — the weekly line from the first report |
| Recovery spacing | The movement pattern already on every session |
| The reason | The chips |
| Carry-over (machine vs barbell) | The catalogue's equipment and pattern tags |

**One phrasebook, both surfaces.** The sentences are authored by the app from
the trial — not by the model — and the screen's sheets and the coach's cards
draw from the same file. That is what makes them identical on both doors, and
it is what lets the coach exam grade them.

**The order problem, fixed cheaply.** Rather than round-tripping the trial to
the model so it can phrase the cost (slow, and a second voice), the coach's
own line stays short — *"Here's what that does:"* — and the card carries the
app's sentence. One voice, deterministic, testable.

---

## 7. Edits pile up: the block-end review

A plan edited eight times in a block is a different plan. Nothing looks at
the pile. At the block boundary — the moment the app already reads backward —
one card:

> Last block you made six changes. Three helped: the swap to trap bar, the
> shorter Tuesdays, moving legs off Wednesday. Two cost you: the ongoing cut on
> Thursday and the dropped rows — your back did 30% less than the block was
> built for. **Keep them all** · **Reset to the plan** · **Pick**

This is the same card the first report asked for (its gap #2) with the goal
cost added, and it is the one place the app can be honest about drift without
nagging during the block.

---

## 8. When the app should be quiet

Restraint is half of coaching. Say nothing when: the change is free; the
person has already given a reason; it is the starting-out plan; the same cost
was stated earlier this block (say it once, then trust them); the edit makes a
deload week *lighter*; the person is mid-session on the gym floor and the
change is "today".

---

## 9. What this does to the three promises

- **Best-in-class, kept when changed.** The cost of an edit is priced against
  the goal, not only against structure — and priced for *this* person, using
  the score the app already trusts for generated plans.
- **Everything by hand or by asking.** The chips and the phrasebook are shared,
  so both doors say the same thing.
- **The coach is a professional.** It asks, it advises, it offers the cheaper
  route, and it does not block. The exam can grade the sentences because they
  are the app's, not the model's.

---

## 10. The decision — ask first, then allow

**Decided 14 Sep 2026 by the session, on Ashley's explicit delegation** —
*"You decide what you think is best and then tell me what you decided and
why."* Four options were put to her: tell-then-allow, ask-first-then-allow,
reason required, refuse. **Chosen: ask first, then allow.**

**Why this one.**

- It is the house style the app already has. For pain, for a very low calorie
  number, for "I can't face training today", the coach asks one question
  before it prescribes. A change that works against the goal is the same
  situation wearing different clothes.
- A refusal contradicts "you asked, you get it", and it teaches people to stop
  asking — the person who stops asking the coach stops using the app. The
  person also often knows something the app cannot: the machine is broken,
  the shoulder is sore.
- "Tell, then allow" is what the cards already do in spirit, and a line on a
  card is tapped past. The prompt's own deload advice is the evidence — people
  push through a recovery week with the reason written in front of them.
- "Reason required" puts a tap on every change including the free ones. The
  gym floor is the wrong place for that friction.

**Why the other three were not chosen** is above. What follows is the shape
that stops "ask first" from becoming nagging — and the shape is part of the
decision, not an afterthought.

**The guardrails.**

1. **The ask is a question with chips, never a card.** It names the cost in
   the goal's terms and offers the better route — and one chip is always *"do
   it anyway"*, which produces the card immediately. So the change is exactly
   one tap further away, never two, never blocked.
2. **Once per block, per thing.** The first time a Tier 2 change is asked for
   on a given day, exercise or meal in a block, the app asks. The second time
   it goes straight to a Tier 1 card. Say it once, then trust them.
3. **Never mid-session for "today".** A today-scoped change made during a live
   session is Tier 1 at most. Nobody is asked a coaching question between
   sets.
4. **Never on the starting-out plan.** Consistency beats everything there.
5. **Safety stays refused.** Tier 3 is unchanged.

**What counts as "against the goal" — pinned, not left to judgement.** Either
the trial would take the plan below the same quality floor every generated
plan must clear — the dimension that dropped is named, never the number, per
her ruling — **or** it is on this short list, which catches what the score does
not yet measure:

- an ongoing volume cut during an accumulation phase;
- removing or banning a main lift in a strength block;
- swapping a barbell main lift for a machine for the rest of a strength block;
- adding sets or weight to a deload week;
- the third same-weekday shortening in a block;
- a fat-loss client's third protein removal in a week;
- moving the main lift to last in a strength block.

Anything not on the list and not below the floor is Tier 1 or Tier 0.

**And the rest stands as proposed:** Tier 1 is tell-then-allow in the goal's
own terms with the cheaper route beside the button; Tier 0 is silent; the
reason chips run on swap and remove on both surfaces; the sentences are the
app's, from one phrasebook, so the exam can grade them; the block-end review
is the release valve that makes "ask once per block" safe.

**BUILT 14 Sep 2026** on Ashley's "Build it". What shipped, and the three
places the build corrected this document:

1. **The floor became a delta.** §2 said tier 2 includes "the trial would take
   the plan below the same quality floor". Measured: `scorePlan` is 12 ms for
   most profiles but **475 ms** for fat-loss-with-low-recovery, because two
   checks inside goal alignment regenerate a whole comparison plan for a
   *different* profile. Scoring before and after would cost ~950 ms on a dev
   box — two to three seconds on a phone — per card. So the scorer gained one
   option that drops exactly those two checks (470 ms → 13 ms, measured), and
   tier 2 is now the seven pinned cases **or a dimension losing one whole rule**
   (the scorer's own 0.4 penalty). A delta is also better coaching than a
   floor: "this drops you below 7.2" means nothing to a person.
2. **The muscle numbers came from the person's own plan, not a textbook.** §4
   said "under the 10 sets that keeps them growing". Dropped: the app has no
   such constant anywhere else, and a set counts once per primary muscle, so an
   absolute would fire wrongly. The comparison is now what *their* plan was
   built to deliver — a lasting 40% drop asks, 25% tells.
3. **There is no "strength" goal to key off.** §4's strength vocabulary was
   written as though there were; the four goals are fat loss, hypertrophy,
   functional and conditioning. The strength cases key off the **phase** the
   person is actually in, which is better: it is about where they are now.

Live behaviour, read off a real phone-sized screen: *"That would take your
chest from 3 sets a week down to 0 for the rest of the block. Just today, or is
there something about it you want gone for good?"* — with **Just today**, **Put
something else there**, **Do it anyway**, and no card until one is tapped.

Still to build: the per-goal phrasebook as one graded file, sets-per-muscle on
the add and remove cards, and the block-end review (§7). The reason chips and
the screen-side sheets shipped 15 Sep 2026 — see §3.

## 11. If approved, the order

1. ~~The reason chips, both surfaces.~~ **Done, 15 Sep 2026** — see §3.
2. Run the score on every trial and translate the dimension that moved.
3. The per-goal phrasebook — one file, both surfaces, exam-gradable.
4. Sets per muscle per week, on the add and remove cards.
5. The block-end review.

Anything that changes a prescribed weight or touches the diet path gets a
written plan first, per the standing rule.
