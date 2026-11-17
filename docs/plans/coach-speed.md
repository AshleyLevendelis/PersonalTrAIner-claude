# The coach, faster: what is built, what waits for the exam

His request, 17 Nov 2026 ("Build it all", from the chat review): make the chat fast. Measure where the wait goes; load
the coach's information at once; keep the fixed instructions ready; send only the tools a message needs; show the reply
as soon as it arrives ("All at once", his ruling the same day); stream replies last.

## Measured (read from the code, 17 Nov 2026)

- One message is one blocking model call. Its instructions are about 155,000 characters of source (129 places where
  this person's details are written in, the first at character ~10,400) plus about 55 tool descriptions, all sent on
  every call. Nothing is cached between calls.
- An advice reply over 220 characters waits for a second call (the voice pass, his 6 Nov "Second pass + checks"); a
  question that becomes an offer waits for a second call (his 16 Nov "Answer, then offer").
- Before the call, the app made four database reads one after another and saved the reply placeholder first.
- After the reply arrived, the screen typed it out at ~50 ms a word: about 3 s for a normal answer.
- No timing was logged anywhere.

## Built (part 1, c522efb9)

- Replies appear all at once (his ruling). Slow / Normal / Fast stay on Profile.
- The turn's reads run together and start before the placeholder is saved.
- The server logs `timing model-call ms=… tools=… prompt_chars=… turns=…` per call and `timing turn ms=…` per turn
  (times and sizes only). The daily spending cap stays BEFORE the call: it is a cost ceiling, one quick read.

## Waiting for the exam (each changes what the coach reads, so CLAUDE.md rule 5 applies)

1. **Keep the fixed instructions ready (caching).** Gemini reuses the start of a request when it is identical from
   call to call. Today the person's details are woven through the instructions from near the top, so no two people
   (or two turns) share a start. The change: move every `${…}` that holds this person's data into ONE block at the end
   (or into the first user turn), leaving ~140k characters identical for everyone. Expected: most of the instruction
   cost reused; seconds off each call. Risk: the order the model reads rules in changes.
2. **Send only the tools a message needs.** COACH_ACTIONS (stage 4) already sorts every tool into seven families. The
   app (not the model) picks the families from his words (a meal word, an exercise word, a day word…), always adds a
   small core (memory, logging), and sends all tools when unsure. Fewer tools is faster AND cuts wrong cards (THE APP
   CAUGHT counts them). Risk: a tool left out when it was needed; the exam's tool cases show it.
3. **Stream replies.** Show the first words while the rest is written. Last, because the checks that guard every
   reply (claims, past lifts, photos, the voice pass) need the whole reply first; streaming means showing a draft that
   a check may still change, which needs its own ruling.

How each is proven: run the exam on the current coach, switch one change on, run it again; keep the change only when
no hard rule breaks and no judged mark drops by more than the judge's own spread (0.1), and say the timing lines'
before/after from the production logs.
