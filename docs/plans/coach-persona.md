# The coach sounds like a person who teaches (6 Nov 2026)

## What she asked
Ashley, 6 Nov 2026: *"I want it to be warmer, friendlier, more encouraging, but also more human-like. I want it to
proactively reach out. I want it to give good guidance ... educate the user so that they can learn and progress ...
the reasons behind why we eat certain foods or do certain exercises. I want it to be really informative, but not
long-winded ... I don't want it to write in paragraphs ... Previous attempts at this haven't been successful."*

## Her rulings, 6 Nov 2026, each from three options
1. **"Warm coach"**, over a friendly professional (today's coach, a little warmer) and a big cheerleader: praise that
   is earned and tied to a fact, it notices her week, one short why, an emoji now and then.
2. **"A why on every answer"**, over a why only at big moments and only when asked: every piece of advice carries one
   short reason tied to her plan; plus lessons that build over time, each taught when her own week makes it relevant,
   and never repeated.
3. **"Coach writes, app checks"** for proactive messages (reminders, the chat opener, check-ins), over warmer fixed
   sentences and over leaving them: the AI writes each one fresh from her real day; the app checks it says nothing
   untrue and sends a warm fixed sentence when it does not pass.
4. **"Add two new marks"** to the coach exam, over rewriting the voice mark and over leaving the test: `warm` and
   `teaches` join the six; the six are unchanged so the before-and-after is comparable.

## Why earlier attempts failed (measured from the instructions, 6 Nov 2026)
1. **Warmth was defined away.** `chat-gemini` §1 said "warmth is attention, not praise" and banned encouragement in
   five places, so with no fact to notice the rules asked for nothing warm at all.
2. **Teaching was optional and fenced**: "only if you're confident", "one thing", "one or two sentences", "silence
   beats filler", "do not volunteer the phase". Under "keep it short" the why went first.
3. **The examples taught the opposite**: fourteen worked replies, nearly all one line ("Go get it.", "Noted."), none
   pairing warmth with a why. Models copy examples more than they obey rules.
4. **Half of what she reads as "the coach" never touched the AI**: the opener, nudges, reminders and card words are
   fixed sentences.
5. **Every action turn ended on a last-second "one to three short sentences" instruction**, the most-obeyed position.
6. **The exam never rewarded warmth or teaching**, so every earlier fix (24, 25, 26 Sep) only cut, and "cold but
   clean" scored well. Voice was 1.75 of 3 on 26 Sep, the lowest mark, and has not been measured since.

## The build, in order
1. **The exam** — two new dimensions in `docs/coach-exam-rubric.md` (the grader derives its dimensions from the
   rubric), and new cases: a bad day, a personal best, a why question, a plain thanks. Written in words the coach's
   prompt never uses (an exam question in the prompt is an answer key, `coach-promises`).
2. **The coach's instructions** — §1 rewritten as a character, not a list of bans: who the coach is, what warmth
   sounds like, what earned praise sounds like; empty praise ("great question") stays banned. The why becomes the
   default on every piece of advice, in short lines, split into texts where it helps. New worked examples showing
   warmth plus a why. The after-action instruction allows one teaching clause. Kept unchanged: allergens, pain triage,
   the medical hand-off, the no-lists rule and its two allowed shapes, one question at most.
3. **Lessons that build** — a checked list of things every trainee should understand, each with the moment from her
   own data that makes it relevant, offered to the coach one at a time, and remembered once taught so it is never
   repeated and later answers can build on it.
4. **Proactive messages written by the coach** — reminders (server) and the chat opener: the coach writes each from
   the app's facts; the app checks it (no number the facts do not hold, no claim about today the facts do not
   support, short) and falls back to a warm fixed sentence.

## CSCS basis for the lesson content
Population-level education the app already works at, no clinical advice: protein and muscle repair (~1.6 g/kg/day
evidence base, distributed across meals), carbohydrate and glycogen around training, progressive overload, why
compound lifts come first (fatigue and technical demand), deloads (dissipating fatigue to express fitness), sleep and
recovery, daily steps (NEAT) in a deficit, what a plateau means. Every lesson is phrased in plain words with no
number the app does not already show her.

## Built
All four steps, 6 Nov 2026; the record is BACKLOG's entry of the same name.

## Not measured, and why
Whether the coach OBEYS needs the coach exam run against the real model, which needs keys only her machine has. The
26 Sep run is the last measurement; the run before and the run after this change are both hers.
