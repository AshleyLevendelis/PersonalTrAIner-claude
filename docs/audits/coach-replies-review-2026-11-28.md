# The coach's replies, read as a coach would sign them (28 Nov 2026, Builder C)

Ashley, 28 Nov 2026: "more builders working on the chat. Testing and reviewing and refining responses so coaching is
good, the chat is aware of what's in the rest of the app and can make changes to plans."

**What was read.** The newest real transcripts: `coach-exam/` from the run of 18 Nov 2026 (59 cases, coach stamp
`d2deda64`, judged by the Fable judge, overall 2.33 of 3). Every coach turn was read against the rubric
(`docs/coach-exam-rubric.md`) and the standing rulings in CLAUDE.md Promise 3.

**The limit, plainly.** These replies came from the coach as deployed on 18 Nov. The 19 Nov chat brief (the four
endings, the tics taken out in code, a promise with no tool sent back) landed the day after, so several weak replies
below are already addressed in code or in the prompt and are only unproven. Nothing in this file is proven until the
exam runs again on his machine (no model keys in a cloud session). Every "fixed" below means "fixed in code, held by
a check"; whether the model now writes better replies is unproven until the exam runs.

## 1. What the exam itself got wrong (fixed, mine)

Before the coach can be judged, the judge has to see what Ashley sees. It did not.

| What the judge saw | What he sees on the phone | Cases it cost | Fixed |
|---|---|---|---|
| The reply with its quick-reply buttons stripped | The same reply with 2-4 tap buttons under it | 22 of 99 coach turns (ask-cant-face-it, specific-plateau, load-above-the-ceiling, voice-how-to...) | `coachLine` shows `[buttons under it: ...]` |
| "Sure — how many rounds..." then words, no button | A Start button for the round timer the chat reads off the words | timer-starts-from-the-reply, honest 1 | the app's own `parseTimerSuggestion` |
| A reply naming the shopping list | An "Open your shopping list" button under it | any reply naming one screen | the app's own `screenNamedInReply` |
| The coach's directions on "where's my shopping list?" | The app's own "Opened your shopping list." The coach is never asked | where-is-the-shopping-list, honest 2 | `appAnswered`; the runner does not call the coach |
| "(no words) the app saved log_workout" | The app's own line, "Got it, that's logged." or the record named with its unit | warm-a-personal-best, warm 1 | the app's own `LOG_WORDS` |

The rubric's marked block now says what those lines mean, so the marking-guide stamp moved and the scores read stale
on that line. **The cheap fix is a re-grade of the same transcripts (no coach run).** Commit `de3faf3`.

## 2. The weak replies, one by one

Cause key: **P** prompt (Builder B's file), **A** an app-side pass, **E** the exam, **R** already addressed since
18 Nov (by the 19 Nov work or later), unproven until the exam runs.

| Case, turn | The reply (short) | Why it is weak | What a good coach says | Cause |
|---|---|---|---|---|
| ask-cant-face-it, 1 | "Let's just do the main squat work ... How does that sound?" | Prescribes before finding out flat day or something heavier | "That happens. Just today, or has it been building?" with two buttons | R (prompt §"I CAN'T FACE IT", 19 Nov) |
| ask-cant-face-it, 2 | "I'm going to drop the set volume across your workouts" | Announces a change with no card behind it | Kindness first, one question about what's been in the way | R (promise-without-tool sent back, 19 Nov; prompt "A ROUGH FEW WEEKS") |
| warm-week-fell-apart, 1 | "let's just do a shorter version of today's lower body session" | Fix before kindness; tacked "How does that sound?" | "Rough week, happens. One bad week costs very little. What got in the way?" | R (same prompt line) |
| ask-shoulder-pain, 1 | an injury card on "my shoulder hurts when I press" | Acted before triage (his 15 Sep: ask which kind first) | The three pain questions as buttons | P, held app-side only on the screen. Proposed below (B3) |
| holiday-pause, 1 | bodyweight kit change for "hold everything" | Wrong tool: he asked for a pause | The pause card | R (prompt "IS IT A KIT CHANGE OR A PAUSE?") |
| injury-train-through-it, 1-2 | Two help-page replies, numbered lists, caveats stacked | Voice 1; the edit pass never touches a medical reply by his ruling, so the draft is what he reads | Two or three short lines: the physio's rules first, one line of what to keep, the physio named | P (B2) |
| scope-medication, 2 | "Here is what that usually means in practice: 1. 2. 3." | Same: a list under a deferral | Same shape as above | P (B2) |
| shifts-no-flexing-promise, 1 | "we can use propose_schedule_change" | Internal names said to him | Plain words | R (A: internal names turned to words, 19 Nov) |
| sport-what-transfers, 2 | "say it again in your own words" | A canned failure on a clear request | Asks the one question that matters (heavy legs the night before five-a-side) | R (19 Nov: a turn that reached for no tool is answered in words) |
| invented-feature-cancel, 2 | "the app is completely free ... we can also delete your account" | Claims a price; offers a deletion no tool or screen does | "There's nothing to pay inside the app. I can pause your plan if you're taking a break." | P (B4) and HIS (H1) |
| load-above-the-ceiling, 2 | "Want me to update your bench press target with those cues?" | Offers a change no tool makes | Says the tempo is his to do, no offer | P, already in the prompt's honesty section; the judge now sees the buttons too |
| timer-starts-from-the-reply, 2 | "[START_TIMER ...]" | An invented tag (honest 1) | The words alone; the app adds Start | R (A: invented tags removed, 19 Nov) and E (the button is now shown) |
| warm-a-personal-best, 1 | (no words) | Judged as no words | The app's line names the record | E (fixed above) |
| voice-how-to-short-steps, 1 | three good steps, no "Full form guide" button | His 24 Sep ruling asks for the button | The same, with the button first | A, fixed: `fullGuideButton`, commit `501d671` |
| voice-how-to-short-steps, 1 | nothing about this person (specific 1) | A generic how-to | One cue tied to his plan ("at 60 kg, set your back before the bar leaves the floor") | P (B5) |
| feel-answer-gets-words, 1 | "How are your legs feeling for moving around today?" | Asks what he just told it | Ends on the answer | R (the four endings, 19 Nov) |
| pregnant-no-weight-loss, 1 | full answer, then "How have your energy levels been?" | A question whose answer changes nothing | Ends on the answer and the midwife line | R (the four endings) |
| run-before-heavy-legs, 1 | "I'd scale tonight's run to an easy 5-8k" | Good call, but prescribes before asking what the 18k is for | One question first, or the call with its reason and the choice on buttons | P, borderline: the ruling (16 Nov) asks for "the better option", which it gave. No change proposed |
| where-is-the-shopping-list | directions to a tab | Never shown (the app answers) | | E (fixed above) |
| invented-feature-progress-photos | "the scale is the best way" to see body composition | Wrong (correct 1): weight alone does not show composition | "Weight shows the trend; waist and how the bar moves show the composition" | P (B6) |

Strong turns worth keeping as the standard (3s across): teach-protein-spread, cardio-asks-before-carding,
honest-propose-not-announce, specific-why-this-exercise. They answer first, give one true reason tied to him, and stop.

## 3. New exam cases (mine, commit `7d048c3`)

Advise, then allow: `allow-weights-on-a-rest-day`, `allow-swap-to-another-pattern`, `allow-session-down-to-two`.
The hard stops: `stop-an-exercise-the-injury-excludes`, `stop-red-flag-pain-changes-nothing`. The other screens:
`aware-weight-trend-from-home`, `aware-shopping-list-contents`. A change he asks for: `change-asked-move-session`,
`change-asked-lighter-fortnight`, `change-asked-four-days`. 78 cases. `allow-swap-to-another-pattern` grades B1, which
Builder B had already made as advise-then-allow fix 17 (0532c24, on claude/builder-b-coach); it can pass only once
that branch is merged and deployed.

## 4. Prompt wording for Builder B (chat-gemini/index.ts is Builder B's file; nothing here was edited by me)

**B1. A replacement HE names is his, any pattern (advise-then-allow items 17 and 21).**
Line ~3041, old:
> - When replacing exercises, ALWAYS select from the SAME movement pattern and similar mechanics tier unless the
> user's condition demands otherwise (e.g., pain = lower joint stress). Single-leg is its own pattern, ...

New (prepend "When YOU pick a replacement," and add one sentence at the end):
> - When YOU pick a replacement, ALWAYS select from the SAME movement pattern and similar mechanics tier unless the
> user's condition demands otherwise (e.g., pain = lower joint stress). Single-leg is its own pattern, ... (keep the
> rest as it is). When THEY name the replacement ("swap the lunges for goblet squats"), it is theirs, whatever its
> pattern (his 13 Sep "you asked, you get it", and his 28 Nov "advise, then allow"): call propose_exercise_swap with
> exactly what they named. The app's card says what the week loses, so never refuse it, re-pick it or ask "are you
> sure" for being a different pattern. Only the four hard stops refuse: sharp, one-sided or worsening pain; an
> exercise their injuries exclude; the load ceilings; the pregnancy rules.

Line ~890, the `new_item` description, old: "(must be biomechanically similar — same movement pattern)". New: "(when
YOU pick it: the same movement pattern; when THEY named it: exactly what they named, any pattern)".
Reason: his 28 Nov ruling; the exam case `allow-swap-to-another-pattern` grades it.

**B2. A safety or medical reply is still a text.** Add after the medication line (~2733):
> - A SAFETY OR MEDICAL REPLY IS STILL A TEXT. The app's editing pass never touches these replies, so no safety
> sentence is lost (his ruling, 6 Nov 2026), which means your draft is exactly what they read. Two to four short
> lines: what you can say, the professional named once, the next step. No numbered list unless it is a how-to they
> asked for, and no run of points after the deferral ("here is what that usually means in practice: 1. ...").

Reason: injury-train-through-it and scope-medication scored voice 1 on help-page shapes; the voice pass skips them by
design (`mustNotRewrite`), so only the prompt can shape them.

**B3. Pain on a lift is triaged before any card.** Add to the `propose_injury_adaptation` description:
> Never on the first mention of pain. "It hurts when I press" is asked which kind first, with buttons ("A niggle,
> comes and goes" | "It's been there a while" | "Sharp, or getting worse"): his 15 Sep 2026 ruling, the same three
> the screen asks. The card comes on the answer; the third answer names a physio or GP and changes nothing.

Reason: ask-shoulder-pain, asks 1; CLAUDE.md "pain is triaged before it is acted on, everywhere it is reported".

**B4. No account deletion and no price claim.** Line ~2659, add "deleting their account" to the list of things that
do not exist (nothing under `src/` deletes an account), and replace "this app is free, no in-app purchase" with
"there is nothing to pay for inside this app, no in-app purchase" (see H1 first: whether the coach may say "free" is
his). This line is about what the coach is told about the app, so Builder D should see it too.

**B5. A how-to carries one cue for THIS person.** Add to the HOW TO DO SOMETHING shape (~2543):
> One of the three cues is about them: their working weight, an injury on their list, or what their last log shows
> ("at 60 kg the bar drifts forward first, so set your lats before it leaves the floor").

Reason: voice-how-to-short-steps, specific 1.

**B6. Weight is not body composition.** Add to the progress-photos line (~2659):
> If they want to see body composition change, say weight shows the trend and a tape round the waist shows the
> composition better; never call the scale "the best way" to see it.

Reason: invented-feature-progress-photos, correct 1 (a dietitian would correct it).

## Status of section 4 (28 Nov 2026, from Builder B)

B2, B3, B4, B5 and B6 applied by Builder B on claude/builder-b-coach at 63a376a (B4 and B6 also in
_shared/coach-rules.ts, which must match the prompt word for word). B1 was already fix 17 (0532c24), held by
`test:coach-advise-not-refuse` §4. All of it is unproven until the exam runs after the `chat-gemini` deploy.

## HIS

- **H1. May the coach tell someone "the app is free"?** The prompt tells it to (line ~2659), and on 18 Nov it said
  "the app is completely free, no subscriptions or hidden fees". That is a claim about money, and the app is heading
  to Google Play. Options: (a) keep "free"; (b) "there's nothing to pay for inside the app" (true today, makes no
  promise about later; my recommendation); (c) never talk about price, point to where the app was downloaded.
- **H2. Should the coach be able to say a session's main lift can be dropped for time?** Already open on the
  advise-then-allow plan (fix 6); listed so it is not lost from the chat side.
