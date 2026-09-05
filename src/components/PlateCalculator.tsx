import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useState, useMemo } from 'react'

const STANDARD_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25] as const

const PLATE_COLORS: Record<number, { bg: string; text: string; label: string }> = {
  25: { bg: 'bg-red-500', text: 'text-white', label: '25' },
  20: { bg: 'bg-blue-500', text: 'text-white', label: '20' },
  15: { bg: 'bg-yellow-400', text: 'text-gray-900', label: '15' },
  10: { bg: 'bg-green-500', text: 'text-white', label: '10' },
  5: { bg: 'bg-white border border-gray-300', text: 'text-gray-900', label: '5' },
  2.5: { bg: 'bg-gray-400', text: 'text-white', label: '2.5' },
  1.25: { bg: 'bg-gray-300', text: 'text-gray-700', label: '1.25' },
}

const PLATE_WIDTHS: Record<number, string> = {
  25: 'w-12 h-24',
  20: 'w-11 h-22',
  15: 'w-10 h-20',
  10: 'w-9 h-[4.5rem]',
  5: 'w-8 h-14',
  2.5: 'w-7 h-12',
  1.25: 'w-6 h-10',
}

/**
 * The heaviest target this will lay out, in kg.
 *
 * A number, because the loop below is unbounded and the input above it is a
 * bare `type="number"`. Type 9000000 into it — a slip of the finger away from
 * 90 — and calculatePlates pushes 25kg plates one at a time until it has built
 * an array of 180,000 of them, then React tries to render every one as a
 * coloured div. The tab locks up; on a phone it is killed. Nothing about that
 * is the user's mistake to pay for.
 *
 * 500 kg is deliberately past any real barbell: the heaviest raw squat ever
 * performed is around that, so this rejects typos without arguing with anyone
 * loading a real bar. Same reasoning, and the same shape, as
 * MAX_PLAUSIBLE_DAILY_STEPS.
 */
export const MAX_BARBELL_TARGET_KG = 500

/** Per side, at 1.25kg increments, 500kg of target cannot need more than this. Structural belt to the ceiling's braces. */
const MAX_PLATES_PER_SIDE = 64

function calculatePlates(targetWeight: number, barWeight: number): number[] {
  const remainder = targetWeight - barWeight
  if (remainder <= 0) return []
  let perSide = remainder / 2
  const plates: number[] = []
  for (const plate of STANDARD_PLATES) {
    while (perSide >= plate && plates.length < MAX_PLATES_PER_SIDE) {
      plates.push(plate)
      perSide -= plate
      perSide = Math.round(perSide * 100) / 100
    }
  }
  return plates
}

interface PlateCalculatorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialWeight?: number
}

export function PlateCalculator({ open, onOpenChange, initialWeight = 0 }: PlateCalculatorProps) {
  const [targetWeight, setTargetWeight] = useState(String(initialWeight || ''))
  const [barWeight, setBarWeight] = useState('20')

  const target = parseFloat(targetWeight) || 0
  const bar = parseFloat(barWeight) || 20
  // Both ends, because the bar is an input too and a 9000kg bar makes the
  // remainder negative rather than huge — wrong answer, not a hang, but still
  // an answer to a question nobody asked.
  const outOfRange = target > MAX_BARBELL_TARGET_KG || bar > MAX_BARBELL_TARGET_KG

  const plates = useMemo(() => (outOfRange ? [] : calculatePlates(target, bar)), [target, bar, outOfRange])
  const perSideWeight = Math.max(0, (target - bar) / 2)
  const achievableWeight = bar + plates.reduce((sum, p) => sum + p, 0) * 2
  const hasRemainder = target > bar && achievableWeight < target

  // Reset target when modal opens with new initial weight
  const [lastInitial, setLastInitial] = useState(initialWeight)
  if (initialWeight !== lastInitial) {
    setLastInitial(initialWeight)
    setTargetWeight(String(initialWeight || ''))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-lg">Plate Calculator</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Target Weight (kg)</Label>
              <Input
                type="number"
                min="0"
                max={MAX_BARBELL_TARGET_KG}
                step="0.5"
                value={targetWeight}
                onChange={e => setTargetWeight(e.target.value)}
                className="h-9"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Bar Weight (kg)</Label>
              <Input
                type="number"
                min="0"
                max={MAX_BARBELL_TARGET_KG}
                step="0.5"
                value={barWeight}
                onChange={e => setBarWeight(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          {outOfRange ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              That&apos;s over {MAX_BARBELL_TARGET_KG}kg — check the number.
            </div>
          ) : target <= bar ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              {target <= 0 ? 'Enter a target weight above' : 'No plates needed — bar only'}
            </div>
          ) : (
            <>
              {/* Barbell sleeve visual */}
              <div className="relative flex items-center justify-start py-4 overflow-x-auto">
                {/* Bar collar */}
                <div className="w-4 h-8 bg-gray-600 rounded-l-sm shrink-0" />
                <div className="w-2 h-10 bg-gray-500 shrink-0" />

                {/* Plates */}
                {plates.map((plate, idx) => {
                  const style = PLATE_COLORS[plate]
                  const size = PLATE_WIDTHS[plate]
                  return (
                    <div
                      key={idx}
                      className={`${style.bg} ${size} ${style.text} shrink-0 flex items-center justify-center rounded-sm text-xs font-bold border-r border-black/10`}
                    >
                      {style.label}
                    </div>
                  )
                })}

                {/* Sleeve end */}
                <div className="flex-1 min-w-4 h-3 bg-gray-400 rounded-r-full" />
              </div>

              {/* Summary */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Per side:</span>
                  <span className="font-semibold">{perSideWeight.toFixed(2)}kg</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(() => {
                    const counts: Record<number, number> = {}
                    plates.forEach(p => { counts[p] = (counts[p] || 0) + 1 })
                    return Object.entries(counts).map(([plate, count]) => {
                      const p = Number(plate)
                      const style = PLATE_COLORS[p]
                      return (
                        <span
                          key={plate}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}
                        >
                          {count}x {style.label}kg
                        </span>
                      )
                    })
                  })()}
                </div>
                {hasRemainder && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Closest loadable weight: {achievableWeight}kg (off by {(target - achievableWeight).toFixed(2)}kg)
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
