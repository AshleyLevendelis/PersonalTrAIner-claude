// ---------------------------------------------------------------------------
// WHAT MAKES THE CHAT BUTTON LIGHT UP.
//
// Until 6 Sep 2026 the answer was "one of two things the opener raises" —
// an unreviewed session or a missed day (coach-opener.ts, `attention`). A
// reply the coach had actually just written was NOT one of them, so a
// trainee who sent a message, switched to another tab and came back found
// the answer waiting with nothing on screen having said so. Ashley asked
// for the button to light "whenever there is a new unread message from the
// coach, in addition to the existing post-workout feedback and
// missed-training prompts", so this module adds the third reason and takes
// over the bookkeeping for all three.
//
// WHY REASONS RATHER THAN A BOOLEAN. The previous mechanism was one flag
// plus one "seen" flag in App.tsx, cleared when the flag went false. With a
// second independent source that composition is wrong in both directions:
// an unread reply arriving while an already-seen feel question is still
// open would never light the button (the seen flag is still set), and a
// reply going read would re-light it for the feel question (the flag drops
// and re-arms). A SET of reason strings has neither problem — the button
// lights when any reason is not yet in the seen set, and each reason
// arrives and clears on its own.
//
// WHAT COUNTS AS AN UNREAD COACH MESSAGE, and what deliberately does not:
//
//   - The LAST message must be the coach's. If the trainee spoke last there
//     is nothing waiting for them.
//   - It must be `complete`. A streaming placeholder is not yet a message,
//     and a `failed` one shows its own retry in the transcript — lighting
//     the tab for a failure would send them to look at an error.
//   - It must carry a DB id. That is what separates a real reply (which
//     always goes through insertPlaceholder, and comes back from
//     loadChatHistory with the same id) from the client-composed opener and
//     the first-run intro, which have no id and are recomposed on every
//     mount. Counting those would light the button every single day, which
//     is the failure the original "a dot that is always on is a dot nobody
//     sees" note in BottomTabBar warns about.
//
// PERSISTENCE, and its one deliberate asymmetry. Only `unread:` reasons are
// written to localStorage. A message id is durable, so a reply read
// yesterday must not light the button after a reload. `feel:` and `missed:`
// are re-derived from live state on every mount and today re-arm across a
// reload; keeping them out of storage leaves that behaviour exactly as it
// was, rather than quietly changing when a nudge stops nudging.
// ---------------------------------------------------------------------------

import type { ChatMessage } from './types'

const SEEN_PREFIX = 'chat_seen_attention_'
const UNREAD = 'unread:'

function seenKey(profileId: string): string {
  return `${SEEN_PREFIX}${profileId}`
}

/**
 * The id of the coach message currently sitting unanswered at the end of the
 * transcript, or null. See the header for the three conditions and why each
 * one is there.
 */
function newestCoachMessageId(messages: ChatMessage[]): string | null {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'assistant') return null
  if (last.status !== 'complete') return null
  return last.id ?? null
}

/**
 * Everything wanting the trainee's attention right now, as a stable
 * '|'-joined string — a primitive so it can be a React dependency without a
 * memo, and ordered so the same situation always produces the same string.
 *
 * Each reason carries the identity of the THING wanting attention, not just
 * its kind: a second missed day, or a second reply, is a different reason
 * and re-arms the button on its own.
 */
export function attentionReasons(input: {
  /** Date of the finished session with no "how did it feel" answer yet, or null. */
  awaitingFeelDate: string | null
  /** Day name of a scheduled yesterday that nothing was logged against, or null. */
  missedYesterdayDay: string | null
  /** The transcript as rendered, newest last. */
  messages: ChatMessage[]
}): string {
  const coachId = newestCoachMessageId(input.messages)
  return [
    input.awaitingFeelDate ? `feel:${input.awaitingFeelDate}` : '',
    input.missedYesterdayDay ? `missed:${input.missedYesterdayDay}` : '',
    coachId ? `${UNREAD}${coachId}` : '',
  ].filter(Boolean).join('|')
}

/**
 * True when the last thing in the transcript is a coach message the trainee has
 * not seen yet.
 *
 * Added 7 Sep 2026 for coach-nudge.ts, which needs exactly one guarantee before
 * it speaks unprompted: DON'T SPEAK TWICE UNANSWERED. Because a nudge is
 * written to chat_messages it carries a real id, so it becomes the newest coach
 * message by the same rule everything else here uses — and the next nudge is
 * blocked until she has seen it. One mechanism does both jobs.
 *
 * Distinct from hasUnseenAttention, which is true for a missed day or an
 * unreviewed session as well. Those are reasons to LIGHT THE BUTTON; only an
 * unread reply is a reason for the coach to keep quiet.
 */
export function hasUnreadCoachMessage(messages: ChatMessage[], seen: string | null): boolean {
  const id = newestCoachMessageId(messages)
  if (!id || seen === null) return false
  return !split(seen).includes(`${UNREAD}${id}`)
}

function split(reasons: string): string[] {
  return reasons ? reasons.split('|').filter(Boolean) : []
}

/**
 * The seen set after this render.
 *
 * `seen === null` means nothing has ever been stored for this profile — a
 * first run after this shipped, or a fresh browser. The unread reasons are
 * seeded as already-seen: the transcript on screen at that moment is the one
 * the trainee last read (chat-cache.ts writes it in the same tick they saw
 * it), so a conversation finished days ago must not light the button once
 * just because the feature is new. `feel:` and `missed:` are NOT seeded —
 * they re-arm on a fresh mount today and continue to.
 *
 * While the chat is on screen everything showing counts as seen, whether or
 * not they answer — the nudge-not-a-demand rule this inherits. While it is
 * not, reasons that have gone away are dropped so the same reason arriving
 * again later lights the button again.
 */
export function nextSeenAttention(seen: string | null, active: string, chatVisible: boolean): string {
  const activeList = split(active)
  if (seen === null) return activeList.filter(r => r.startsWith(UNREAD)).join('|')
  if (chatVisible) return activeList.join('|')
  return split(seen).filter(r => activeList.includes(r)).join('|')
}

/** True when at least one live reason has not been seen yet. */
export function hasUnseenAttention(active: string, seen: string): boolean {
  const seenList = split(seen)
  return split(active).some(r => !seenList.includes(r))
}

/**
 * Reads back the persisted half of the seen set. Returns null — distinct
 * from '' — when nothing has ever been written for this profile, which is
 * what triggers the seeding in nextSeenAttention.
 */
export function loadSeenAttention(profileId: string): string | null {
  try {
    return localStorage.getItem(seenKey(profileId))
  } catch {
    // Private browsing or a full store: fall back to "never stored", which
    // seeds rather than lights the button. A missed dot is better than a dot
    // that means nothing.
    return null
  }
}

/** Persists only the `unread:` reasons — see the header on why the other two stay out. */
export function saveSeenAttention(profileId: string, seen: string): void {
  try {
    localStorage.setItem(seenKey(profileId), split(seen).filter(r => r.startsWith(UNREAD)).join('|'))
  } catch {
    // ignore — the in-memory set still governs this session.
  }
}
