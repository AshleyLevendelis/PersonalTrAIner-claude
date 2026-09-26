// ---------------------------------------------------------------------------
// GROUPED BUBBLES — which messages in the coach chat belong together, and how
// each one is drawn. Ashley, 26 Sep 2026: the messages "blur together", so the
// chat moves to the grouped-bubbles pattern. The direction was agreed before
// this was built, and it is a change of layout only. Nothing here reads or
// changes what a message SAYS.
//
// Pure, so the rules can be checked without a browser (test:chat-groups) and
// the screen only has to draw what this returns (verify:chat-bubbles).
//
// THE RULES, as asked:
//   - consecutive messages from the same sender within five minutes form one
//     group; a gap of more than five minutes, a change of sender or a change
//     of day starts a new one;
//   - a small day pill ("Today", "Yesterday", or a date) goes wherever the
//     day changes, and above the first dated message;
//   - the timestamp is shown once per group, under the last bubble.
//
// A MESSAGE WITH NO TIME is never treated as a gap. Older cached messages
// carry no created_at, and inventing a break for them would split the thread
// at random. They join the group before them when the sender matches, and
// they never move the day.
// ---------------------------------------------------------------------------

export const GROUP_WINDOW_MS = 5 * 60_000

export interface GroupableMessage {
  role: 'user' | 'assistant'
  created_at?: string
}

export type ChatRow<M> =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'group'; key: string; role: 'user' | 'assistant'; items: { message: M; index: number }[] }

function timeOf(m: GroupableMessage): Date | null {
  if (!m.created_at) return null
  const d = new Date(m.created_at)
  return Number.isNaN(d.getTime()) ? null : d
}

/** The trainee's own calendar day, not UTC's. */
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/** "Today", "Yesterday", or a short date — the year only when it is not this one. */
export function dayLabel(d: Date, now: Date): string {
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return d.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  })
}

/** The same clock format the app's own "logged at" times use. */
export function timeLabel(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

/**
 * The thread as rows: day pills and groups, in order. `index` is each
 * message's position in the ORIGINAL array, because every handler on the
 * screen (confirm, undo, retry) addresses a message by that index.
 */
export function groupMessages<M extends GroupableMessage>(messages: M[], now: Date, keyOf: (m: M, i: number) => string): ChatRow<M>[] {
  const rows: ChatRow<M>[] = []
  let lastDay: string | null = null
  let lastTime: Date | null = null
  let current: Extract<ChatRow<M>, { kind: 'group' }> | null = null

  messages.forEach((message, index) => {
    const t = timeOf(message)
    const day = t ? localDayKey(t) : null
    const newDay = day !== null && day !== lastDay
    if (newDay && t) {
      rows.push({ kind: 'day', key: `day-${day}`, label: dayLabel(t, now) })
      lastDay = day
    }
    const gap = t !== null && lastTime !== null && t.getTime() - lastTime.getTime() > GROUP_WINDOW_MS
    if (!current || current.role !== message.role || newDay || gap) {
      current = { kind: 'group', key: `group-${keyOf(message, index)}`, role: message.role, items: [] }
      rows.push(current)
    }
    current.items.push({ message, index })
    if (t) lastTime = t
  })
  return rows
}

export type BubblePosition = 'single' | 'first' | 'middle' | 'last'

/**
 * Where each bubble sits among the BUBBLES of its group. A card or an empty
 * turn draws no bubble, so it is skipped rather than counted: two bubbles
 * either side of a card are still the first and last of their group.
 */
export function bubblePositions(hasBubble: boolean[]): (BubblePosition | null)[] {
  const at = hasBubble.map((b, i) => (b ? i : -1)).filter(i => i >= 0)
  return hasBubble.map((b, i) => {
    if (!b) return null
    const k = at.indexOf(i)
    if (at.length === 1) return 'single'
    if (k === 0) return 'first'
    if (k === at.length - 1) return 'last'
    return 'middle'
  })
}

export const BUBBLE_RADIUS_PX = 18
export const TUCKED_RADIUS_PX = 6

/**
 * The bubble's four corners, as a CSS border-radius (top-left, top-right,
 * bottom-right, bottom-left). The SENDER'S side is the one that tucks: the
 * bottom corner on every bubble — the tail on the last or only one, and the
 * join to the next on the others — and the top corner wherever a bubble sits
 * under another from the same group.
 */
export function bubbleRadius(role: 'user' | 'assistant', position: BubblePosition): string {
  const R = `${BUBBLE_RADIUS_PX}px`, r = `${TUCKED_RADIUS_PX}px`
  const top = position === 'middle' || position === 'last' ? r : R
  const bottom = r
  return role === 'user'
    ? `${R} ${top} ${bottom} ${R}`
    : `${top} ${R} ${R} ${bottom}`
}

/**
 * The time a group shows, under its last bubble. None while the coach is still
 * typing into it, because a time under the dots would be the time of an
 * earlier message wearing the new one's place. It appears when the reply lands.
 */
export function groupTimestamp<M extends GroupableMessage & { status?: string }>(items: { message: M }[]): string | undefined {
  const last = items[items.length - 1]?.message
  if (!last || last.status === 'pending' || last.status === 'streaming') return undefined
  for (let i = items.length - 1; i >= 0; i--) {
    const at = items[i].message.created_at
    if (at) return at
  }
  return undefined
}
