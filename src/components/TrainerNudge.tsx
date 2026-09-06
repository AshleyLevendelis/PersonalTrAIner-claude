import type * as React from 'react'
import { ChevronRight, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { tabHash } from '@/lib/app-route'

// ---------------------------------------------------------------------------
// The Personal TrAIner's one line outside chat — design_handoff_app_polish
// (direction 1a). One of these sits at the top of Home, Nutrition and
// Exercise, and a compact one in the active-session rail. It never invents a
// sentence: the caller hands it a line from the existing adaptation-message /
// coach-tip / progression-payoff chain, and when there is nothing to say the
// caller renders nothing. Every colour is a token; the two tints are
// color-mix over --role-ai so the other themes and accent overrides keep it.
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
}

const AVATAR_GRADIENT = 'linear-gradient(180deg, color-mix(in oklab, var(--primary) 84%, white), var(--primary-2))'

export function TrainerNudge({ text, actions, openChat, onOpen, compact, clamp, className, ...rest }: TrainerNudgeProps) {
  const avatar = compact ? 20 : 22
  return (
    <div
      role="note"
      aria-label="Personal TrAIner says"
      data-testid={rest['data-testid'] ?? 'trainer-nudge'}
      className={cn('glow-bloom-once flex items-start', compact ? 'gap-2 rounded-xl' : 'gap-2.5 rounded-[14px]', className)}
      style={{
        padding: compact ? '10px 12px' : '12px 14px',
        background: 'color-mix(in oklab, var(--role-ai) 10%, transparent)',
        border: compact ? 'none' : '1px solid color-mix(in oklab, var(--role-ai) 25%, transparent)',
      }}
    >
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center rounded-full"
        style={{ width: avatar, height: avatar, background: AVATAR_GRADIENT, color: 'var(--primary-foreground)', marginTop: compact ? 1 : 2 }}
      >
        <MessageCircle size={12} strokeWidth={2.6} />
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn('m-0', clamp && 'line-clamp-3')} style={{ fontSize: compact ? '0.78125rem' : '0.8125rem', lineHeight: 1.5, color: 'var(--role-ai-text)' }}>
          {text}
        </div>
        {actions && actions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
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
      {(openChat || onOpen) && (
        <button
          type="button"
          aria-label={openChat ? 'Open the Personal TrAIner chat' : 'Read the rest of this'}
          onClick={openChat ? () => { window.location.hash = tabHash('chat') } : onOpen}
          className="hit-slop-44 -mr-1 flex shrink-0 items-center justify-center bg-transparent p-0"
          style={{ color: 'var(--muted-foreground)', width: 20, height: 20, marginTop: compact ? 0 : 1 }}
        >
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  )
}
