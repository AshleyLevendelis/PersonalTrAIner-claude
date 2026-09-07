import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useState, useMemo } from 'react'
import { plateCombinations, MAX_BARBELL_TARGET_KG } from '@/lib/plate-math'

export { MAX_BARBELL_TARGET_KG }

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

/** "25, 25, 10" -> [{plate: 25, count: 2}, {plate: 10, count: 1}], in the order they go on. */
function groupPlates(plates: number[]): { plate: number; count: number }[] {
  const out: { plate: number; count: number }[] = []
  for (const p of plates) {
    const last = out[out.length - 1]
    if (last && last.plate === p) last.count++
    else out.push({ plate: p, count: 1 })
  }
  return out
}

function describe(plates: number[]): string {
  return groupPlates(plates).map(({ plate, count }) => `${count}x ${plate}kg`).join(', ')
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

  const options = useMemo(
    () => (outOfRange ? [] : plateCombinations(target, bar)),
    [target, bar, outOfRange],
  )

  // WHICH loading the bar picture is showing. Reset whenever the question
  // changes, or option 3 of the old answer silently becomes option 3 of a
  // different one.
  const [chosen, setChosen] = useState(0)
  const [lastQuestion, setLastQuestion] = useState('')
  const question = `${target}:${bar}`
  if (question !== lastQuestion) {
    setLastQuestion(question)
    setChosen(0)
  }
  const showing = options[chosen] ?? options[0] ?? null
  const plates = showing?.plates ?? []

  const perSideWeight = showing?.perSideKg ?? Math.max(0, (target - bar) / 2)
  // Every option spells the same per-side number, so the closest loadable
  // weight does not depend on which one is selected.
  const achievableWeight = bar + (showing?.perSideKg ?? 0) * 2
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
          ) : !showing ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              {target <= 0 ? 'Enter a target weight above' : 'No plates needed — bar only'}
            </div>
          ) : (
            <>
              {/* Barbell sleeve visual — the option currently chosen below. */}
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

                {/* EVERY WAY TO LOAD IT, not just the first one a greedy loop
                    found. The old screen showed 1x 20kg and never mentioned
                    2x 10kg, which is the same weight and the only one you can
                    build if the 20s are already on someone else's bar. Tapping
                    a row redraws the bar above, so the picture always matches
                    the row that is selected. */}
                <div role="group" aria-label="Ways to load each side" className="space-y-1.5">
                  {options.map((option, idx) => {
                    const isChosen = idx === (options[chosen] ? chosen : 0)
                    return (
                      <button
                        key={option.plates.join('-')}
                        type="button"
                        onClick={() => setChosen(idx)}
                        aria-pressed={isChosen}
                        aria-label={`Load each side as ${describe(option.plates)}`}
                        className={`hit-slop-44 flex w-full flex-wrap items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
                          isChosen ? 'bg-muted ring-1 ring-primary/40' : 'hover:bg-muted/50'
                        }`}
                      >
                        {groupPlates(option.plates).map(({ plate, count }, i) => {
                          const style = PLATE_COLORS[plate]
                          return (
                            <span
                              key={`${plate}-${i}`}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}
                            >
                              {count}x {style.label}kg
                            </span>
                          )
                        })}
                      </button>
                    )
                  })}
                </div>

                {options.length > 1 && (
                  <p className="text-xs text-muted-foreground">
                    All the same weight — pick whichever plates you can actually get to.
                  </p>
                )}

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
