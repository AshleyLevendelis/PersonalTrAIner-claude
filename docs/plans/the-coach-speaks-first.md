# The coach speaks first

**Ashley, 7 Sep 2026:** *"i want the chat to start conversation unprompted based
off events such as a completed workout or upcoming workout, etc."*

---

## What the app does today, verified at source

**The coach only ever speaks first into an empty chat.** The opening bubble is
composed client-side and the effect that builds it refuses to run unless the
conversation is exactly one untouched greeting
(`ChatAssistant.tsx:711` — `messages.length !== 1`). `loadChatHistory` restores
the last 20 messages with no date filter (`:793-825`), so from the second
conversation onward the chat opens on the old thread and **the coach adds
nothing new, ever, until the chat is cleared.**

That is the gap. Everything else needed is already built:

- **The chat button already lights** for three things — a finished session with
  no "how did it feel" answer, a missed day, and an unread coach reply
  (`chat-unread.ts`). The signal exists; there is just no message behind it on
  an ongoing thread.
- **The chat component is always mounted.** It is the one tab with
  `forceMount` (`App.tsx:2513`), so it can compose and post while she is on
  Home, and the button will glow from wherever she is.
- **The events are already computed.** Awaiting-feel (`session-feel.ts`),
  missed-yesterday (`coach-opener.ts`, `missedYesterdayFrom`), recent PRs and
  the streak (`dashboard-data.ts`).

**There is no phone-notification capability anywhere in the app.** The only
service worker is the offline cache (`src/main.tsx:45`); no `Notification`, no
`pushManager`, no subscription store. Ashley was told this before choosing.

## Ashley's two rulings, 7 Sep 2026

1. **Where:** *in the app.* The coach writes into the chat and the button
   glows; she sees it next time she opens it. Lock-screen notifications were
   offered with their real cost (a server that decides and sends, plus the app
   having to be installed to her home screen) and deliberately not chosen.
2. **How chatty:** *training + wins.* Workout finished, session due today, a
   day missed, **plus** a new personal best and a streak milestone. Roughly
   3-6 messages a week. The "everything it tracks" option — evening protein
   and water shortfalls, stale weigh-ins — was declined for the reason
   `BottomTabBar.tsx` already records in its own words: a button that is always
   glowing stops meaning anything.

## What gets built

`src/lib/coach-nudge.ts` — pure, no I/O, same shape as `coach-opener.ts` and
`accountability.ts`, and for the same reason: the model is never asked whether
there is something to raise.

`pickNudge(input)` returns **at most one** message, or null, ranked by how
actionable it is right now:

| # | event | key | chips |
|---|---|---|---|
| 1 | a finished session nobody has asked about | `feel:<date>` | none — Ashley's ruling, the answer should be a sentence |
| 2 | yesterday was scheduled and nothing happened | `missed:<date>` | run it today / call it a rest day |
| 3 | a new personal best | `pr:<lift>:<date>:<kg>` | what's next on that lift |
| 4 | a streak milestone (7, 14, 30, 60, 100 days) | `streak:<n>` | how am I doing |
| 5 | today's session, still ahead, nothing logged | `due:<date>` | trim the session |

**The key is the identity of the EVENT, not its kind**, and a key is burnt the
moment it is spoken. So a PR is congratulated once, not every time the app
opens; a second PR on a different lift is a different key and is its own
message.

**A PR from the session being asked about folds into #1** rather than queuing
behind it — `Nice PR on Bench Press at 80kg. How did that session actually
feel?` — and burns both keys. This is the shape the opener already uses
(`ChatAssistant.tsx:718-722`). It only folds when the PR is dated to that same
session; a PR from three days ago is not tacked onto today's question.

### The four rules that keep it a nudge rather than nagging

1. **Never speak twice unanswered.** The nudge is written to `chat_messages`,
   so it has a real id — which means `chat-unread.ts` counts it as unread and
   the button glows, *and* the next nudge is blocked until she has seen it. One
   mechanism, both jobs. `hasUnreadCoachMessage` is the new predicate.
2. **Thirty minutes between nudges**, persisted, so a reload cannot unlock a
   second one. Two things worth saying at once are still two interruptions; the
   lower-ranked one waits and nothing is lost, because a key stays unburnt
   until it is actually said.
3. **Never on top of the opener.** A conversation that is exactly the
   client-composed opening bubble (one message, no database id) already had its
   one thing said. The opener also **burns the keys it covered**, so the two
   can never say the same thing twice.
4. **Never mid-load, never mid-reply, never on a brand-new account.** Unlike
   the opener there is nothing on screen waiting, so this one is allowed to
   simply wait for the data rather than run on a 2.5s timeout.

### Deliberately not in scope

- **Phone notifications.** Declined above, with the reason.
- **A nudge that changes anything.** Same posture as `session-feel.ts` and
  `beat-target-offer.ts`: the coach observes and asks. Nothing here touches a
  plan.
- **Chips surviving a reload.** `quickReplies` are not a `chat_messages`
  column, so after a reload the message keeps its words and loses its buttons —
  the same property the opener has today. Stated rather than silently accepted:
  every nudge's text is a complete question she can answer by typing.
