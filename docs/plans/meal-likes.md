# Food likes that shape the meals (27 Sep 2026)

Ashley, 27 Sep 2026: *"there's no way to let the app know what kind of meals a
user likes so meals are tailored to what users actually eat."* Her ruling that
day, from three options: **likes list + hearts** — "A 'Foods and meals I like'
list on Profile, next to 'Foods to avoid', and the coach can add to it.
Hearting a meal counts as a like too. New meals are made with your likes in
mind and favoured when picking each day. Nothing is learnt behind your back."
She rejected a list with hearts left as they are, and learning from what is
logged or swapped.

## What exists (traced)

- A like can only be recorded by the coach (`record_fact`, polarity like,
  soft). Profile LISTS it with edit and delete, and cannot add one.
- `compileSoftFoodPreferences` feeds day assembly as a 0.01 penalty on a day
  containing nothing liked: it can only win an almost exact tie, which is
  the shape CLAUDE.md warns can never decide anything.
- The meal generator is never told a like. It is told cuisines, cooking time,
  breakfast style and dislikes.
- A heart protects one exact dish from a regenerate and does nothing else.

## The build

1. **Profile, "Foods and meals I like"**, beside "Foods to avoid": the same
   control, writing the same `user_facts` rows a "I love salmon" chat turn
   writes. Under it, the meals she has hearted, each removable, because they
   count as likes too and nothing that counts should be hidden.
2. **One likes list** in App: typed likes plus hearted meal names. Hearts get
   a change notification so a tap on Nutrition reaches the list without a
   reload.
3. **Favoured when picking each day**: a like becomes a sort KEY, ranked after
   variety and before the resize: among correct days that repeat equally, one
   with something she likes wins. It can never buy an off-target day (tier
   first) or the same day twice (variety first). Off target, it ranks after
   repeats inside the fit margin.
4. **New meals made with them in mind**: the generator is told her likes and
   her hearted dishes, as steering in the prompt. Verification is unchanged, so
   restrictions, allergens and dislikes still decide what is accepted. A like
   that is a known food clashing with a restriction or a dislike is left out
   of the prompt, not sent and then refused.
5. **The coach**: it already records likes. Its prompt says what a like now
   does, and never claims more than that.

## Safety

The allergen path is untouched: every proposal still passes `verifyProposal`
and the display-time re-check. Likes steer what is proposed and which correct
day is picked. They never add a food to a meal and never outrank a
restriction or a dislike.

## Checks
- Ranking: a liked correct day beats a closer-fitting unliked one; variety
  beats a like; a like never buys an off-target day.
- Generator request carries likes and hearted dishes, with clashing likes
  removed.
- Profile adds and removes likes as `user_facts`, and shows and removes
  hearted meals; driven on the real Profile screen.
- App's likes list includes hearts and reaches assembly, the strip, the list
  and every generation call.

## After review (same day)

A regression review of the build found five real defects, each re-read in the
code before fixing: the coach hearted every meal it swapped in (a heart is a
like now); a like could favour a kept meal breaking a later restriction; hard
likes were listed and ignored; likes matched as raw text; a failed heart read
looked like no hearts. Fixed as recorded in BACKLOG, with the kept-meal
restriction question itself left as it was and named: it is older than likes
and in the allergen path.
