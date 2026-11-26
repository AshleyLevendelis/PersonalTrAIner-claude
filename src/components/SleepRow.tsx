import { useEffect, useState } from 'react'
import { Moon } from 'lucide-react'
import { getAppNow } from '@/lib/dev-clock'
import { readSleepPicture } from '@/lib/health-sleep'
import { hoursMinutes, type SleepPicture } from '@/lib/sleep-nights'

// ---------------------------------------------------------------------------
// HOME, "Sleep" (his pick "A", 26 Nov 2026; sleep-nights.ts): last night against his usual, and the week as seven
// bars with his usual drawn across them. One measure, so one colour (the rest day's violet: sleep is recovery); last
// night is the solid bar, a night the watch did not measure is a gap, and the words carry everything the bars do. No
// score and no judgement: a short night reads as "under your usual" and the offer of a lighter session is the coach's.
// Loaded only in the phone app with the switch on; draws nothing until the watch holds a night.
// ---------------------------------------------------------------------------

const VIOLET = 'var(--role-ai)'
const DAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function WeekBars({ p }: { p: SleepPicture }) {
  const W = 140, H = 56, top = 14, slot = W / 7, barW = 11
  const most = Math.max(p.usual ?? 0, ...p.week.map(n => n.minutes ?? 0), 1) * 1.08
  const h = (minutes: number) => (minutes / most) * (H - top)
  const measured = p.week.filter(n => n.minutes != null).length
  return (
    <div className="shrink-0" data-sleep-week={measured}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" className="block"
        aria-label={`Sleep over the last seven nights${p.usual != null ? `, usual ${hoursMinutes(p.usual)}` : ''}: ${p.week.map(n => (n.minutes == null ? 'not measured' : hoursMinutes(n.minutes))).join(', ')}`}>
        {p.week.map((n, i) => {
          const x = i * slot + (slot - barW) / 2
          if (n.minutes == null) return <rect key={n.date} x={x} y={H - 2} width={barW} height={2} rx={1} fill="var(--text-tertiary)" opacity=".5" data-sleep-bar="none" />
          const bh = Math.max(4, h(n.minutes))
          return <rect key={n.date} x={x} y={H - bh} width={barW} height={bh} rx={4} fill={VIOLET} opacity={i === 6 ? 1 : 0.42} data-sleep-bar={n.minutes}><title>{`${n.date}: ${hoursMinutes(n.minutes)}`}</title></rect>
        })}
        {p.usual != null && (
          <>
            <line x1="0" x2={W} y1={H - h(p.usual)} y2={H - h(p.usual)} stroke="var(--text-tertiary)" strokeWidth="1" strokeDasharray="3 4" data-sleep-usual-line />
            <text x={W} y={H - h(p.usual) - 4} textAnchor="end" fontSize="9.5" fill="var(--text-tertiary)" data-sleep-usual-label>usual {hoursMinutes(p.usual)}</text>
          </>
        )}
      </svg>
      <div className="mt-1 flex text-[0.625rem] text-text-tertiary" aria-hidden>
        {p.week.map((n, i) => <span key={n.date} className={`text-center ${i === 6 ? 'font-semibold text-foreground' : ''}`} style={{ width: slot }}>{DAY[new Date(`${n.date}T12:00:00`).getDay()]}</span>)}
      </div>
    </div>
  )
}

const Big = ({ children }: { children: React.ReactNode }) => <span className="tabular-mono text-[1.375rem] font-bold leading-none tracking-[-.02em] text-foreground">{children}</span>
const Small = ({ children }: { children: React.ReactNode }) => <span className="mr-1 text-[0.75rem] font-medium text-text-tertiary">{children}</span>

export function SleepRow({ profileId, today }: { profileId: string; today: string }) {
  const [p, setP] = useState<SleepPicture | null>(null)
  useEffect(() => {
    let live = true
    const pull = () => { void readSleepPicture(today, getAppNow(profileId)).then(v => { if (live) setP(v) }) }
    pull()
    // The watch usually syncs the night while the app is closed: read again when it comes back to the front.
    const onVisible = () => { if (document.visibilityState === 'visible') pull() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { live = false; document.removeEventListener('visibilitychange', onVisible) }
  }, [profileId, today])
  if (!p || (p.lastNight == null && p.week.every(n => n.minutes == null))) return null
  const against = p.against
  return (
    <div className="flex items-end justify-between gap-4 border-t border-[color:var(--hairline)] px-4 py-3.5" data-home-sleep={p.short ? 'short' : 'ok'}>
      <div className="min-w-0">
        <span className="flex items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-[.12em] text-[color:var(--role-ai-text)]">
          <Moon className="size-3.5" aria-hidden /> Sleep
        </span>
        {p.lastNight != null ? (
          <p className="mt-2 flex items-baseline gap-1" data-home-sleep-last aria-label={`${hoursMinutes(p.lastNight)} last night`}>
            <Big>{Math.floor(p.lastNight / 60)}</Big><Small>h</Small>
            <Big>{String(p.lastNight % 60).padStart(2, '0')}</Big><Small>min</Small>
            <span className="ml-1 text-[0.75rem] text-text-tertiary">last night</span>
          </p>
        ) : (
          <p className="mt-1.5 text-[0.8125rem] text-muted-foreground" data-home-sleep-last>Nothing from your watch for last night yet.</p>
        )}
        <p className="mt-1 text-[0.75rem] leading-[1.4] text-muted-foreground" data-home-sleep-against>
          {p.usual == null ? 'Your usual shows after five nights.'
            : against == null ? `Your usual is ${hoursMinutes(p.usual)}.`
            : Math.abs(against) < 20 ? 'About your usual.'
            : `${hoursMinutes(Math.abs(against))} ${against < 0 ? 'under' : 'over'} your usual.`}
        </p>
      </div>
      <WeekBars p={p} />
    </div>
  )
}
