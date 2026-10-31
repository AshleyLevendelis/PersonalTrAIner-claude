import { useSyncExternalStore, type MouseEvent } from 'react'
import { Square, Volume2 } from 'lucide-react'
import { deviceSynth, readAloud, spokenTextOf } from '@/lib/read-aloud'

// ---------------------------------------------------------------------------
// "LISTEN" ON A COACH BUBBLE — Ashley's ruling, 31 Oct 2026, "Option 1, add a
// listen button": the phone's own voice reads the message aloud. One per coach
// bubble, sitting just outside its far corner so the bubble's words and size
// are untouched. It reads the bubble's text as the screen shows it, read off
// the bubble itself at the tap (so no markdown, and never a button, chip or
// card label: the button has no words of its own). Drawn only where the
// browser can speak.
// ---------------------------------------------------------------------------

const subscribe = (fn: () => void) => readAloud.subscribe(fn)

export function ListenButton({ messageKey }: { messageKey: string }) {
  const playing = useSyncExternalStore(subscribe, () => readAloud.current() === messageKey, () => false)
  if (!deviceSynth()) return null
  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    const bubble = e.currentTarget.closest('[data-testid="chat-bubble"]') as HTMLElement | null
    readAloud.toggle(messageKey, spokenTextOf(bubble))
  }
  return (
    <button
      type="button"
      data-listen
      onClick={onClick}
      aria-label={playing ? 'Stop reading' : 'Listen to this message'}
      aria-pressed={playing}
      title={playing ? 'Stop' : 'Listen'}
      // Beside the bubble's bottom corner, in the room the 88% cap leaves; a
      // 28px disc with a 44px tap target.
      className="hit-slop-44 absolute bottom-0 -right-9 flex size-7 items-center justify-center rounded-full"
      style={{
        background: playing ? 'color-mix(in oklab, var(--primary) 18%, transparent)' : 'transparent',
        color: playing ? 'var(--primary-text)' : 'var(--muted-foreground)',
      }}
    >
      {playing ? <Square aria-hidden className="size-3" fill="currentColor" /> : <Volume2 aria-hidden className="size-4" />}
    </button>
  )
}
