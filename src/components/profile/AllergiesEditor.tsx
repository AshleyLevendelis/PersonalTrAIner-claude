import { ALLERGENS, allergyLine, labelLines, type Allergen, type AllergyRecord } from '@/lib/allergies'

/**
 * THE ALLERGY CARD on Profile (his ruling 15 Nov 2026, "Allergy card, peanuts split"; docs/plans/allergy-card.md).
 * Pick an allergen, then its two or three taps. The allergen filters the meals; the pen is told to the coach; traces
 * and coeliac change what the app SAYS (check the label), because those are things it cannot see.
 */
const LABEL: Record<Allergen, string> = {
  peanuts: 'Peanuts', 'tree nuts': 'Tree nuts', gluten: 'Gluten', milk: 'Milk', egg: 'Egg', soy: 'Soy', sesame: 'Sesame',
  fish: 'Fish', crustaceans: 'Crustaceans', molluscs: 'Molluscs', celery: 'Celery', mustard: 'Mustard', lupin: 'Lupin',
  sulphites: 'Sulphites',
}

function Choice({ on, onClick, children, testid }: { on: boolean; onClick: () => void; children: React.ReactNode; testid: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      data-testid={testid}
      className="h-11 rounded-full border px-3 text-[0.6875rem]"
      style={{ borderColor: on ? 'var(--primary)' : 'var(--hairline)', color: on ? 'var(--primary)' : 'var(--foreground)' }}
      onClick={onClick}
    >{children}</button>
  )
}

export function AllergiesEditor({ allergies, onChange }: { allergies: AllergyRecord[]; onChange: (next: AllergyRecord[]) => void }) {
  const has = (a: Allergen) => allergies.some(r => r.allergen === a)
  const toggle = (a: Allergen) => onChange(has(a)
    ? allergies.filter(r => r.allergen !== a)
    : [...allergies, a === 'gluten' ? { allergen: a, pen: null, traces: null, coeliac: null, oats: null } : { allergen: a, pen: null, traces: null }])
  const patch = (a: Allergen, p: Partial<AllergyRecord>) => onChange(allergies.map(r => r.allergen === a ? { ...r, ...p } : r))
  const lines = labelLines(allergies)
  return (
    <div className="space-y-3 text-sm" data-testid="allergies-editor">
      <p className="text-xs text-muted-foreground">
        An allergy here keeps that food out of your meals and is told to your Trainer. Ingredients are filtered, not verified. Check labels.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {ALLERGENS.map(a => (
          <Choice key={a} on={has(a)} onClick={() => toggle(a)} testid={`allergen-${a.replace(' ', '-')}`}>{LABEL[a]}</Choice>
        ))}
      </div>
      {allergies.map(r => {
        const id = r.allergen.replace(' ', '-')
        return (
          <div key={r.allergen} className="space-y-2 rounded-xl border p-3" style={{ borderColor: 'var(--hairline)' }} data-testid={`allergy-${id}`}>
            <p className="font-medium" data-testid={`allergy-line-${id}`}>{allergyLine(r)}</p>
            {r.allergen === 'gluten' && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Coeliac disease?</span>
                <div className="flex flex-wrap gap-1.5">
                  <Choice on={r.coeliac === true} onClick={() => patch(r.allergen, { coeliac: r.coeliac === true ? null : true })} testid={`coeliac-yes`}>Yes, coeliac</Choice>
                  <Choice on={r.coeliac === false} onClick={() => patch(r.allergen, { coeliac: r.coeliac === false ? null : false })} testid={`coeliac-no`}>No</Choice>
                </div>
                <span className="text-xs text-muted-foreground">Oats</span>
                <div className="flex flex-wrap gap-1.5">
                  <Choice on={r.oats === 'certified'} onClick={() => patch(r.allergen, { oats: r.oats === 'certified' ? null : 'certified' })} testid={`oats-certified`}>Certified gluten-free oats are fine</Choice>
                  <Choice on={r.oats === 'avoid'} onClick={() => patch(r.allergen, { oats: r.oats === 'avoid' ? null : 'avoid' })} testid={`oats-avoid`}>No oats at all</Choice>
                </div>
              </div>
            )}
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Do you carry an adrenaline pen for it?</span>
              <div className="flex flex-wrap gap-1.5">
                <Choice on={r.pen === true} onClick={() => patch(r.allergen, { pen: r.pen === true ? null : true })} testid={`pen-yes-${id}`}>Yes</Choice>
                <Choice on={r.pen === false} onClick={() => patch(r.allergen, { pen: r.pen === false ? null : false })} testid={`pen-no-${id}`}>No</Choice>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Foods that say "may contain" it</span>
              <div className="flex flex-wrap gap-1.5">
                <Choice on={r.traces === 'avoid'} onClick={() => patch(r.allergen, { traces: r.traces === 'avoid' ? null : 'avoid' })} testid={`traces-avoid-${id}`}>I avoid them</Choice>
                <Choice on={r.traces === 'fine'} onClick={() => patch(r.allergen, { traces: r.traces === 'fine' ? null : 'fine' })} testid={`traces-fine-${id}`}>They're fine</Choice>
              </div>
            </div>
          </div>
        )
      })}
      {lines.length > 0 && (
        <div className="space-y-1 text-xs text-muted-foreground" data-testid="allergy-label-lines">
          <p>The app can't see traces or cross-contamination, so:</p>
          {lines.map(l => <p key={l}>{l}</p>)}
        </div>
      )}
    </div>
  )
}
