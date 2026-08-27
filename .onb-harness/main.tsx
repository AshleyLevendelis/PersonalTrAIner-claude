// Renders the REAL onboarding chip cards next to chat-style pills, at phone
// width, so the size difference is a measurement rather than an impression.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SlotChipsCard } from '@/components/onboarding/SlotChipsCard'
import { ONBOARDING_SLOTS, offeredOptionsFor } from '@/lib/onboarding-slots'
import '@/index.css'

const SHOW = ['fitnessGoal', 'trainingDays', 'conditioningPreference', 'injuries', 'dietaryPreferences']

function Pills({ slotKey }: { slotKey: string }) {
  const def = ONBOARDING_SLOTS.find(s => s.key === slotKey)!
  const opts = offeredOptionsFor(def as never) ?? []
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {opts.map((o: any) => (
        <button key={String(o.value)} type="button"
          className="rounded-full bg-[color:var(--surface-raised)] px-3 py-2.5 text-xs font-medium text-foreground min-h-[44px]">
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Harness() {
  const [values, setValues] = useState<any>({})
  return (
    <div className="min-h-screen bg-background text-foreground p-4 space-y-8">
      {SHOW.map(key => {
        const def = ONBOARDING_SLOTS.find(s => s.key === key)!
        return (
          <div key={key} className="space-y-3">
            <p className="text-[13px] text-foreground">{def.question}</p>
            <div data-measure={`card-${key}`}>
              <SlotChipsCard
                slotKey={key}
                values={values}
                resolved={false}
                busy={false}
                onToggleMulti={(k: any, v: any) => setValues((p: any) => ({ ...p, [k]: [...(p[k] ?? []), v] }))}
                onResolveSingle={() => {}}
                onResolveMulti={() => {}}
                onDecline={() => {}}
              />
            </div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">same question, chat-style pills</p>
            <div data-measure={`pill-${key}`}><Pills slotKey={key} /></div>
          </div>
        )
      })}
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>)
