// ---------------------------------------------------------------------------
// THE EQUIPMENT DROPDOWN, IN A REAL BROWSER.
//
// Roadmap item 11 made the Profile equipment picker show each tier's
// description, which it had never done — you could CHANGE your equipment on
// the one screen that told you least about what each option meant.
//
// The risk that change introduced is specific and invisible to a source check:
// Radix mirrors an item's ItemText into the CLOSED trigger, so a description
// placed inside ItemText would print the whole sentence on a 28px-tall inline
// control. `hint` renders outside ItemText for exactly that reason, and this
// harness is what proves it — closed shows the label alone, open shows both.
//
// It mounts the shared Select primitives with the real EQUIPMENT_OPTIONS, the
// same map ProfileScreen's EditableSelectField applies. The one link it does
// NOT cover is that ProfileScreen passes `hint={o.description}` at all, which
// `test:equipment-labels` §7 pins statically.
// ---------------------------------------------------------------------------
import React from 'react'
import { createRoot } from 'react-dom/client'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EQUIPMENT_OPTIONS } from '@/lib/onboarding-slots'
import '../src/index.css'

function Harness() {
  const [value, setValue] = React.useState<string>('minimalist')
  return (
    <div className="min-h-dvh bg-background p-6 text-foreground">
      <div data-testid="row" className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">Equipment</span>
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger className="h-7 w-auto text-xs" data-testid="trigger">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EQUIPMENT_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value} hint={o.description}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Harness />)
