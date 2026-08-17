import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { UserProfile } from '@/lib/types'
import { missingBodyMetrics } from '@/lib/macro-calculator'

// ---------------------------------------------------------------------------
// What the nutrition surfaces show INSTEAD of calorie and protein numbers
// when we don't have the body values those numbers need.
//
// This is the visible half of the refusal fix. The app used to substitute a
// weight of zero and print a confident 1502 kcal target next to 0g of
// protein — a number that looked deliberate and was meaningless. Declining
// to answer is a legitimate choice, so the honest response is to say what's
// missing and how to fix it, not to guess and not to nag.
//
// Deliberately NOT here: a placeholder figure, a dash standing in for a real
// number, a population average, or a greyed-out "example" target. Any of
// those re-creates the same failure in a quieter font. The rule is an
// absence, stated plainly, with a way to resolve it.
// ---------------------------------------------------------------------------

/** Joins the missing values the way a person would say them: "weight", "weight and age", "weight, age and height". */
function listPhrase(items: string[]): string {
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

export function MissingBodyMetricsNotice({
  profile,
  onAdd,
  className,
}: {
  profile: UserProfile
  /** Opens wherever these values are edited. Omit and the notice explains where to go instead of offering a button that leads nowhere. */
  onAdd?: () => void
  className?: string
}) {
  const missing = missingBodyMetrics(profile)
  if (missing.length === 0) return null

  return (
    <Card className={className}>
      <CardContent className="p-4">
        <p className="text-sm font-medium">Food targets need your {listPhrase(missing)}</p>
        <p className="mt-1 text-[13px] leading-normal text-muted-foreground">
          {/* Says what still works, because most of the app does. The training
              plan is unaffected by this gap and people should not think they
              have half an app. */}
          Your training plan is unaffected — this only changes calorie and
          protein targets. Add {missing.length === 1 ? 'it' : 'them'} whenever
          you like and your targets will appear.
        </p>
        {onAdd ? (
          <Button variant="outline" size="sm" className="mt-3 h-9" onClick={onAdd}>
            Add {listPhrase(missing)}
          </Button>
        ) : (
          <p className="mt-2 text-[13px] text-muted-foreground">
            You can add {missing.length === 1 ? 'it' : 'them'} in Profile.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * The one-line version, for places too small for the card (a meal header, a
 * dashboard row). Same rule: names the gap, never fills it.
 */
export function MissingBodyMetricsLine({ profile }: { profile: UserProfile }) {
  const missing = missingBodyMetrics(profile)
  if (missing.length === 0) return null
  return (
    <p className="text-[13px] text-muted-foreground">
      Targets need your {listPhrase(missing)} — add {missing.length === 1 ? 'it' : 'them'} in Profile.
    </p>
  )
}
