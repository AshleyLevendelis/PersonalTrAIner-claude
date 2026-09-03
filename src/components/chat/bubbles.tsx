import { MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getLocalDateString } from '@/lib/dev-clock'
import type { ChatMessage } from '@/lib/types'

// ---------------------------------------------------------------------------
// GROUPED BUBBLES — the shared vocabulary of the chat tab's revamp (design
// handoff "grouped bubbles, full-height layout", 3 Sep 2026).
//
// Two problems this exists to fix, both visible on Ashley's phone:
//   1. The model splits a reply into consecutive messages with [BREAK], and
//      the old renderer collapsed that to a paragraph gap inside ONE block —
//      so nobody could tell where one message ended and the next began.
//   2. Consecutive TrAIner messages (the four first-run intro messages most
//      of all) rendered as separate avatar-plus-paragraph rows with no
//      container at all.
//
// The fix is a RUN: consecutive assistant messages share one avatar, and
// every message — and every [BREAK]-separated part of a message, and every
// proposal/receipt/clarification attached to one — is its own soft bubble,
// 4px apart, with the tail on the last. Nothing here touches stored content:
// the split happens at render time, from the text as persisted.
//
// This file owns the pure pieces (grouping, splitting, radii, labels) and
// the presentational bits several renderers share (the avatar, the typing
// bubble, the chip rail). ChatAssistant.tsx owns the composition and every
// bit of state; scripts/render-screens.tsx renders the same pieces at phone
// width so the first-run screen cannot drift from the real one.
// ---------------------------------------------------------------------------

export type BubblePos = 'only' | 'first' | 'middle' | 'last'

/** Where a bubble sits in its run — drives which corner carries the tail. */
export function bubblePos(index: number, count: number): BubblePos {
  if (count <= 1) return 'only'
  if (index === 0) return 'first'
  if (index === count - 1) return 'last'
  return 'middle'
}

// Radii by position (TL TR BR BL): the 6px corners are the joins between
// bubbles of one run, the 18px bottom-left on the last is the tail.
const ASSISTANT_RADIUS: Record<BubblePos, string> = {
  only: 'rounded-[18px]',
  first: 'rounded-[18px_18px_18px_6px]',
  middle: 'rounded-[6px_18px_18px_6px]',
  last: 'rounded-[6px_18px_18px_18px]',
}

export function bubbleRadiusClass(pos: BubblePos): string {
  return ASSISTANT_RADIUS[pos]
}

/** The user's own bubble: same fill as before, tail on the bottom-right. */
export const USER_BUBBLE_CLASS = 'rounded-[18px_18px_6px_18px] bg-[rgba(var(--glow-rgb),.14)] px-3.5 py-2.5 text-sm leading-[1.5] whitespace-pre-wrap text-foreground'

/** The TrAIner's bubble: --card fill, the radius supplied per position. */
export const ASSISTANT_BUBBLE_CLASS = 'bg-card px-3.5 py-2.5 text-sm leading-[1.5] text-foreground'

/**
 * Split one stored reply into the messages the model meant it as. Matches a
 * [BREAK] on its own line or inline, swallowing the whitespace around it so
 * no part starts with a blank line. A reply with no tag is one part.
 */
const BREAK_SPLIT_RE = /\s*\[BREAK\]\s*/gi

export function splitMessageParts(text: string): string[] {
  return text.split(BREAK_SPLIT_RE).map(p => p.trim()).filter(Boolean)
}

export interface MessageRun {
  role: 'user' | 'assistant'
  /** Index of the run's first message in the full list — handlers are keyed by message index. */
  start: number
  messages: ChatMessage[]
}

/**
 * Consecutive assistant messages (no user message between) become one run.
 * A user message is always a run of one — the user has no "runs", only
 * bubbles, and two user messages in a row still read as two.
 */
export function groupRuns(messages: ChatMessage[]): MessageRun[] {
  const runs: MessageRun[] = []
  messages.forEach((msg, i) => {
    const prev = runs[runs.length - 1]
    if (prev && prev.role === 'assistant' && msg.role === 'assistant') prev.messages.push(msg)
    else runs.push({ role: msg.role, start: i, messages: [msg] })
  })
  return runs
}

/** Local calendar day of a stored timestamp, or null when the message carries none (a fresh opener, a cached intro). */
export function messageDayKey(msg: ChatMessage): string | null {
  if (!msg.created_at) return null
  const d = new Date(msg.created_at)
  return Number.isNaN(d.getTime()) ? null : getLocalDateString(d)
}

/** "Today" / "Yesterday" / "Mon 1 Sep" — the day divider between runs when history spans days. */
export function dayDividerLabel(dayKey: string, todayKey: string): string {
  if (dayKey === todayKey) return 'Today'
  const y = new Date(`${todayKey}T12:00:00`)
  y.setDate(y.getDate() - 1)
  if (dayKey === getLocalDateString(y)) return 'Yesterday'
  return new Date(`${dayKey}T12:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
}

/** "9:41" — the optional timestamp under a run. Null when the message has no stored time. */
export function timeLabel(msg: ChatMessage | undefined): string | null {
  if (!msg?.created_at) return null
  const d = new Date(msg.created_at)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** The TrAIner's mark — 26px beside a run, 32px in the header. */
export function CoachAvatar({ size = 26, className }: { size?: 26 | 32; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('flex shrink-0 items-center justify-center rounded-full text-[color:var(--primary-foreground)]', className)}
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(180deg, color-mix(in oklab, var(--primary) 84%, white), var(--primary-2))',
        boxShadow: '0 0 18px rgba(var(--glow-rgb),.45)',
      }}
    >
      <MessageCircle style={{ width: size === 32 ? 16 : 14, height: size === 32 ? 16 : 14 }} strokeWidth={2.4} />
    </span>
  )
}

/**
 * The typing indicator is its own bubble at the end of the run, so the next
 * message visibly ARRIVES rather than appearing mid-paragraph. `label` is the
 * one case that still needs words ("Recalibrating your schedule…").
 */
export function TypingBubble({ pos, label }: { pos: BubblePos; label?: string }) {
  return (
    <div
      role="status"
      aria-label={label ?? 'Personal TrAIner is typing'}
      className={cn('chat-bubble-in flex items-center gap-2 bg-card px-4 py-[13px]', bubbleRadiusClass(pos))}
    >
      <span className="flex h-3.5 items-center gap-1">
        {[0, 1, 2].map(i => (
          <span key={i} className="chat-typing-dot" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </span>
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </div>
  )
}

/** One chip — the model's quick replies, the first-run starter chips, and a clarification's options all wear this. */
export const CHIP_CLASS = 'h-10 shrink-0 rounded-full border border-[rgba(var(--glow-rgb),.35)] bg-transparent px-3.5 text-xs font-medium text-primary transition-colors hover:bg-[rgba(var(--glow-rgb),.08)] active:bg-[rgba(var(--glow-rgb),.14)] disabled:opacity-60'

/**
 * The rail above the composer: one horizontal row of chips, scrolling
 * sideways rather than wrapping, so it costs the thread one fixed line no
 * matter how many chips the model sent. Unmounted by the caller when empty.
 */
export function QuickReplyRail({ options, onPick, disabled }: { options: string[]; onPick: (text: string) => void; disabled?: boolean }) {
  return (
    <div
      data-chat-quick-replies
      role="group"
      aria-label="Suggested replies"
      className="flex gap-2 overflow-x-auto px-4 pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {options.map(option => (
        <button key={option} type="button" disabled={disabled} onClick={() => onPick(option)} className={CHIP_CLASS}>
          {option}
        </button>
      ))}
    </div>
  )
}
