import type * as React from 'react'
import { ArrowUpRight, ChevronRight, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { tabHash } from '@/lib/app-route'
import { setChatPrefill } from '@/lib/chat-prefill-store'

// ---------------------------------------------------------------------------
// The Personal TrAIner's one line outside chat — design_handoff_app_polish
// (direction 1a). One of these sits at the top of Home, Nutrition and
// Exercise, and a compact one in the active-session rail. It never invents a
// sentence: the caller hands it a line from the existing adaptation-message /
// coach-tip / progression-payoff chain, and when there is nothing to say the
// caller renders nothing. Every colour is a token; the two tints are
// read from --role-ai-bg/-border/-text, which every theme defines. They were
// a color-mix over --role-ai plus a --role-ai-text in :root — one pale
// lilac for eight canvases, which measured 1.5:1 on paper.
// ---------------------------------------------------------------------------

export interface TrainerNudgeAction {
  label: string
  onClick: () => void | Promise<void>
  /** Muted styling for the "no" of a yes/no pair. */
  secondary?: boolean
  disabled?: boolean
}

export interface TrainerNudgeProps {
  /**
   * The line, as live data. Copy is never authored here.
   *
   * A node rather than a string because Home's nudge carries two lines when
   * both exist — the tip, then what is still outstanding today in warn
   * colour, which is the line the handoff removed from Home and said the
   * nudge would carry. One block, one voice, two sentences.
   */
  text: React.ReactNode
  /**
   * Inline text buttons under the line — the confirm/decline of an adaptation
   * message. Each hit target is 44px through .hit-slop-44 even though the
   * visible text is small.
   */
  actions?: TrainerNudgeAction[]
  /** Trailing chevron that opens the chat tab. */
  openChat?: boolean
  /**
   * Trailing chevron that calls this instead of going to chat. For a clamped
   * line, where the chevron has to lead to the rest of the sentence.
   * Ignored when `openChat` is set — one chevron, one destination.
   */
  onOpen?: () => void
  /** Active-session rail: tighter padding, smaller avatar and type, no border. */
  compact?: boolean
  /**
   * Cap the line at three rows. For the Exercise tab's week-note fallback,
   * which is a paragraph rather than a sentence and pushed the session
   * itself off the first screen. Only set it where the full text is still
   * reachable in place — here the week row's own chevron expands it.
   */
  clamp?: boolean
  className?: string
  'data-testid'?: string
  /**
   * What the line is about, after "TRAINER ·" in the label — "TRAINING",
   * "NUTRITION". Absent: the label says TRAINER alone. (Design handoff 2a,
   * 10 Oct 2026; the brief's "COACH" became TRAINER on her ruling that the
   * assistant is called Personal TrAIner everywhere on screen.)
   */
  tag?: string
  /** "Ask ↗" opens chat with this already typed for her. Without it, Ask opens chat empty. */
  askPrefill?: string
  /** Home's rotation: one dot per tip, the active one long. Tapping a dot jumps to it. */
  pager?: { count: number; index: number; onSelect: (i: number) => void }
  /** Tapping the line itself (Home: the next tip). */
  onTextTap?: () => void
  /** Fading between two lines (Home's rotation). */
  fading?: boolean
}

/**
 * THE 2a NOTE (design handoff, 10 Oct 2026): a sparkle, "TRAINER · TAG",
 * "Ask ↗" and the dots on one row, the line under it at 13.5px. One
 * component for Home, Nutrition and Exercise, so the three cannot drift.
 */
export function TrainerNudge({ text, actions, openChat, onOpen, compact, clamp, className, tag, askPrefill, pager, onTextTap, fading, ...rest }: TrainerNudgeProps) {
  const ask = () => {
    if (askPrefill) setChatPrefill(askPrefill)
    window.location.hash = tabHash('chat')
  }
  return (
    <div
      role="note"
      aria-label="Personal TrAIner says"
      data-testid={rest['data-testid'] ?? 'trainer-nudge'}
      className={cn('glow-bloom-once flex flex-col', compact ? 'gap-1 rounded-xl' : 'glow-violet-soft gap-1.5 rounded-[14px]', className)}
      style={{
        padding: compact ? '9px 12px' : '10px 14px',
        background: 'var(--role-ai-bg)',
        border: compact ? 'none' : '1px solid var(--role-ai-border)',
      }}
    >
      <div className="flex items-center gap-2">
        <Sparkles aria-hidden className="glow-violet size-[14px] shrink-0" style={{ color: 'var(--role-ai-accent)' }} />
        <span className="min-w-0 flex-1 truncate text-[0.65625rem] font-semibold uppercase tracking-[.16em]" style={{ color: 'var(--role-ai-label)' }} data-nudge-tag>
          {tag ? `Trainer · ${tag}` : 'Trainer'}
        </span>
        {openChat && (
          <button
            type="button"
            onClick={ask}
            aria-label="Ask the Personal TrAIner about this"
            className="hit-slop-44 flex shrink-0 items-center gap-0.5 bg-transparent p-0 text-[0.71875rem] font-semibold"
            style={{ color: 'var(--role-ai-text)' }}
            data-nudge-ask
          >
            Ask <ArrowUpRight className="size-3" aria-hidden />
          </button>
        )}
        {!openChat && onOpen && (
          <button
            type="button"
            aria-label="Read the rest of this"
            onClick={onOpen}
            className="hit-slop-44 -mr-1 flex shrink-0 items-center justify-center bg-transparent p-0"
            style={{ color: 'var(--muted-foreground)', width: 20, height: 20 }}
          >
            <ChevronRight size={14} />
          </button>
        )}
        {pager && pager.count > 1 && (
          <span className="flex shrink-0 items-center gap-1" data-nudge-dots>
            {Array.from({ length: pager.count }, (_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Tip ${i + 1} of ${pager.count}`}
                aria-current={i === pager.index ? 'true' : undefined}
                onClick={() => pager.onSelect(i)}
                className="hit-slop-44 h-[5px] rounded-full p-0 transition-[width] duration-300"
                style={{ width: i === pager.index ? 14 : 5, background: i === pager.index ? 'var(--role-ai-accent)' : 'color-mix(in srgb, var(--role-ai-accent) 30%, transparent)' }}
              />
            ))}
          </span>
        )}
      </div>
      <div
        className={cn('m-0 transition-opacity duration-[250ms]', clamp && 'line-clamp-3', onTextTap && 'cursor-pointer')}
        style={{ fontSize: compact ? '0.78125rem' : '0.84375rem', lineHeight: 1.45, color: 'var(--role-ai-text)', opacity: fading ? 0 : 1 }}
        onClick={onTextTap}
        data-nudge-text
      >
        {text}
      </div>
      {actions && actions.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {actions.map(a => (
            <button
              key={a.label}
              type="button"
              disabled={a.disabled}
              onClick={() => { void a.onClick() }}
              className="hit-slop-44 bg-transparent p-0 text-[0.78125rem] font-semibold disabled:opacity-50"
              style={{ color: a.secondary ? 'var(--muted-foreground)' : 'var(--primary)' }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
