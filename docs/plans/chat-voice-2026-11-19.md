# How the coach talks: tone, questions, what it says, and what keeps people talking to it

His request, 19 Nov 2026: *"improve the chat to give the user the best ux the way the chat speaks the tone it uses,
the questions it asks, the information it gives the way it keeps the conversation going. If you're unsure about
something go with your recommendations. Keep in mind what is best for the user and what will keep a user engaged and
keep coming back to the app and chat."*

Decided by the session on that delegation. Every choice below is mine unless marked his, and each can be reversed.

## The evidence

The coach exam he ran on 18 Nov 2026: 59 conversations against the live coach, marked by Fable 5.2. Overall 2.33 of 3.
`asks` was the lowest mark (1.71), then `voice` (2.13) and `warm` (2.15).

Read reply by reply (64 replies with words):

| What was wrong | How often | Example |
|---|---|---|
| A closing question whose answer changes nothing | 11 of 19 closing questions | "How does that sound?", "How are you feeling overall otherwise?" |
| Advice or a fix before asking what is going on | 6 conversations | "Let's just do the main squat work…" to "I can't face training today" |
| A change announced with nothing on screen | 2 | "I'm going to drop the set volume across your workouts" |
| An emoji hung on advice | about 12 | a phone after "stick to the plan" |
| A stock opener | 7 or more | "I hear you, Ashley" three replies running |
| An internal name or tag shown to him | 2 | "we can use propose_schedule_change", "[START_TIMER: type=…]" |
| A reply that blamed him and ended the conversation | 1 | "I didn't quite follow that one — say it again in your own words" |
| A personal best logged with no words | 1 | "squats done, got 50kg for all three sets" got a card and nothing else |

Three of the exam's five "breaches" were not the coach's: on those turns the app itself asks a question in place of
the coach's offer (a bare dislike, a usual meal with no amounts, a race with no date), exactly as he ruled, and the
exam could not see that.

The coach's instructions already forbade almost all of this. They also **contradicted themselves** in five places,
and the model followed whichever line was more specific:

1. "If the user feels lazy, sore, or tired, give human coach advice first" against "ask the deciding question FIRST
   and ALONE". This is where "advice, then How does that sound?" came from.
2. "REAL FOLLOW-UP QUESTIONS (this is what makes you a coach rather than a search box)" against "a question only when
   the answer matters".
3. Examples that end "Want the rest of it?", "Want the full set and rep breakdown?" against "end on the answer".
4. A quick fact must "ALWAYS close with a one-line pivot back to training" against "never a check-in on something
   they never raised". The exam's "Speaking of fluids — how are you doing on your water target today?" is that rule
   obeyed.
5. No section at all for pausing a plan, and the travel section sent every "I'm away" to a change of kit.

## What I decided

**What keeps someone talking to a coach is not more questions.** It is being answered specifically, being easy to
answer back, and being remembered. So:

1. **Every reply ends in the first of four ways that is true** (new section 1b-ii of the coach's instructions):
   the one question it needs, first and alone; an OFFER of a change, as one short question with buttons; an obvious
   next step on one or two buttons, written as what he would say; or it simply stops on the answer.
2. **A next step goes on a button, not in a question.** "Want me to go deeper?" becomes a "Go deeper" button under
   the answer. He taps or he does not; nothing is asked of him. This is the one new behaviour.
3. **"Tell me how it goes" only when the coach will use the answer**, about something real today or tomorrow, at
   most once in a conversation. And when he comes back, the first thing the coach says is about that.
4. **Struggling is asked about before it is fixed.** "I can't face it" gets one kind clause and "is it just today, or
   has it been building?" A rough few weeks gets kindness, one open question, and no change in that turn.
5. **A change is offered, never announced**, and a pause is a pause: "hold everything until I'm home" is not a
   fortnight of bodyweight sessions.
6. **No tacked-on pivot** after a quick fact. A bare, correct, friendly answer is a good reply.

His rulings kept as they are: a question only when the answer matters (24 Sep), short steps (24 Sep), no new cards
for suggestions (24 Sep; buttons are not cards), a why on every answer and the warm coach (6 Nov), the second pass
(6 Nov), safety wording never edited (6-7 Nov), one name "Trainer" (1 Nov).

## What is held in code, and what is not

The same split as his cardio ruling: code holds what a rule can SEE; the exam marks what only judgement can.

**Held in code, on the coach's server, proven here** (`stock-phrases.ts`, `plan-promise.ts`, `test:coach-tics`,
106 checks, 47 deliberate breaks all caught):

- an internal name becomes plain words ("propose_schedule_change" becomes "a schedule change"); links are untouched;
- a tag the app does not read is removed;
- one emoji at most, and none on a reply longer than 160 characters;
- a closed list of stock openers and closers is removed. Closed and literal: a question about HIM ("how did the knee
  settle?") is never touched, however idle. Being glad at good news ("That's what we love to hear") stays: measured on
  the real replies, removing it left a reply that never answered "yesterday's session was great";
- his name as a form of address: once in a reply, and not at all if the coach used it in its last three messages;
- safety and medical wording keeps every sentence (the second pass's own test decides);
- a promise of a change on a turn that called no tool is sent back once to be said as an offer; promised twice, the
  app's own sentence is used;
- a turn where the model reached for a tool that does not exist gets a second chance in words;
- the kit offer is refused when his words ask for his training to be held or paused, and the app's own pause offer
  reads the same words through the same function (`test:offer-rules`, 75 checks, 8 breaks caught).

**Held in code, on the phone, proven here:**

- a workout logged by chat gets a line of its own above its card; a set that beat his record is named, with its unit;
  Undo takes the line back (`test:chat-log-words` 23 checks and 16 breaks; `verify:chat-log-words` 16 checks in a real
  browser, 5 of 6 applied browser breaks caught, the sixth changing nothing on screen). The driver found two defects no source check saw: the Undo line was written to a field the screen does not
  draw, and the put-back card read "Logged · Wednesday was taken back";
- the app's own question about a usual meal no longer opens "Love that.";
- the three "ask first" decisions are one function the chat and the exam marker both call (`app-asks-first.ts`).

**Model behaviour, unproven until the exam runs after the `chat-gemini` deploy:** whether the coach asks first when
it should, ends well, offers rather than announces, uses the buttons sensibly, picks up a thread. Four new exam
questions mark these (`talk-offer-then-yes`, `talk-complete-answer-just-ends`, `talk-picks-up-the-thread`,
`talk-away-train-or-pause`); `offtopic-quick-fact` no longer expects the pivot. The marking guide is unchanged, so
the 55 questions that did not change can be compared with 18 Nov.

## The exam marker

Re-marking the 18 Nov conversations with the corrected marker: 2 breaches (the real ones: the pause, and a standing
"cooked for me" arrangement) and 3 counted under "the app caught". The judge is now shown the app's own question on
those turns.

## Not done

- The standing "meals cooked for me" arrangement has no coach action (it is on Profile). The exam question and the
  judge disagree about the right reply; left for him.
- The buttons-as-next-step rule could produce a button on every reply. If the exam shows that, the fix is a cap in
  code, not more words in the instructions.
- Whether a readiness check before a session ("how are you feeling heading in?") is welcome or padding. The exam's
  judge marked it padding; I left it to the model and the exam, and did not put it on the removal list.
