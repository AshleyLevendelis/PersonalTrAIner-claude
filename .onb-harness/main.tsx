// Walks the WHOLE onboarding at phone width: every question, in the real
// order, with the real components. No model — this is the layout pass.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SlotChipsCard } from '@/components/onboarding/SlotChipsCard'
import { SlotNumericCard } from '@/components/onboarding/SlotNumericCard'
import { ONBOARDING_SLOTS } from '@/lib/onboarding-slots'
import { buildOnboardingIntro } from '@/lib/first-run-intro'
import '@/index.css'

function Bubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[80%] rounded-2xl bg-[color:var(--surface-raised)] px-3.5 py-2.5 text-[13.5px] leading-[1.5] text-foreground">
      {children}
    </div>
  )
}

function Harness() {
  const [values, setValues] = useState<any>({ knowsWorkingLifts: true })
  const intro = buildOnboardingIntro()
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="space-y-2 p-4">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">the opener</p>
        {intro.map((m, i) => <Bubble key={i}>{m.content}</Bubble>)}
      </div>
      {ONBOARDING_SLOTS.map((def: any, i: number) => (
        <div
          key={def.key}
          data-q={def.key}
          data-control={def.control}
          data-hint={def.inputHint ?? ''}
          className="space-y-2 border-t border-[color:var(--hairline)] p-4"
        >
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {i + 1} · {def.key} · {def.required ? 'required' : def.requiredIf ? 'conditional' : 'optional'}
          </p>
          <Bubble>{def.question}</Bubble>
          {(def.control === 'single' || def.control === 'multi') && (
            <SlotChipsCard
              slotKey={def.key}
              values={values}
              resolved={false}
              busy={false}
              onToggleMulti={(k: any, v: any) => setValues((p: any) => ({ ...p, [k]: [...(p[k] ?? []), v] }))}
              onResolveSingle={() => {}}
              onResolveMulti={() => {}}
              onDecline={() => {}}
            />
          )}
          {def.control === 'numeric' && (
            <SlotNumericCard
              slotKey={def.key}
              values={values}
              confirmed={new Set()}
              resolved={false}
              busy={false}
              onChange={(k: any, v: any) => setValues((p: any) => ({ ...p, [k]: v }))}
              onResolve={() => {}}
              onDecline={() => {}}
            />
          )}
          {def.control === 'text' && (
            <p className="text-[11px] italic text-muted-foreground">
              free text — composer placeholder: “{def.inputHint ?? '(none)'}”
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>)
