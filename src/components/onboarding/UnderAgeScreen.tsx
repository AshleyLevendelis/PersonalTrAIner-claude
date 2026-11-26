import { Button } from '@/components/ui/button'
import { UNDER_AGE_FIX, UNDER_AGE_LINES, UNDER_AGE_TITLE } from '@/lib/minimum-age'

/** Setup's stop for an age under 16 (minimum-age.ts). Replaces the conversation; one way back, for a wrong birthday. */
export function UnderAgeScreen({ onFix }: { onFix: () => void }) {
  return (
    <div className="h-[100dvh] overflow-y-auto flex flex-col ob-canvas" data-under-age>
      <div className="max-w-md w-full mx-auto px-[22px] pt-16 pb-10 flex flex-col gap-4">
        <h1 className="m-0 text-[1.5rem] font-semibold leading-tight text-foreground" style={{ textWrap: 'balance' }}>
          {UNDER_AGE_TITLE}
        </h1>
        {UNDER_AGE_LINES.map(line => (
          <p key={line} className="m-0 text-[0.9375rem] leading-relaxed text-muted-foreground">{line}</p>
        ))}
        <Button variant="outline" className="mt-4 min-h-[44px] self-start" onClick={onFix} data-under-age-fix>
          {UNDER_AGE_FIX}
        </Button>
      </div>
    </div>
  )
}
