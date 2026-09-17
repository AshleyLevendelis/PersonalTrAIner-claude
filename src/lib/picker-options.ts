// ---------------------------------------------------------------------------
// TWO LISTS OF BUTTONS — the eight body areas and the four equipment tiers.
//
// SPLIT OUT OF onboarding-slots.ts ON 15 SEP 2026, and the reason is measured
// rather than tidy. The exercise row's "why are you dropping this?" step needs
// both lists, and importing them from onboarding-slots dragged that whole
// 1,200-line module — every setup question, its wording, and assembleProfile —
// into the main chunk. 915 -> 925 kB, and test:bundle caught it.
//
// Exactly the shape that caught the nutrition sheet a day earlier: the size is
// the symptom, the dependency is the defect. A row on the Exercise tab has no
// business depending on the onboarding questionnaire to render eight buttons.
//
// onboarding-slots re-exports both, so every existing import still works and
// there is still one definition of each list.
// ---------------------------------------------------------------------------

import type { EquipmentAccess } from './types'

export const EQUIPMENT_OPTIONS: { value: EquipmentAccess; icon: string; label: string; description: string }[] = [
  { value: 'full_gym', icon: '🏢', label: 'Full gym', description: 'Everything a commercial gym has' },
  { value: 'home_gym', icon: '🏠', label: 'Home gym', description: 'Barbell, rack, bench, dumbbells, kettlebells, bands, pull-up bar, weighted bag' },
  { value: 'minimalist', icon: '🎒', label: 'Minimalist', description: 'Dumbbells, kettlebells, bands, pull-up bar, weighted bag — no barbell or bench' },
  { value: 'bodyweight', icon: '🤸', label: 'Bodyweight only', description: 'Bodyweight, a pull-up bar and a weighted bag' },
]

export const INJURY_OPTIONS: { value: string; icon: string; label: string }[] = [
  { value: 'lower_back', icon: '🧍', label: 'Lower back' },
  { value: 'knees', icon: '🦵', label: 'Knees' },
  { value: 'shoulders', icon: '💪', label: 'Shoulders' },
  { value: 'neck', icon: '🧣', label: 'Neck' },
  { value: 'wrists', icon: '✋', label: 'Wrists' },
  { value: 'hips', icon: '🦴', label: 'Hips' },
  { value: 'ankles', icon: '🦶', label: 'Ankles' },
  { value: 'elbows', icon: '🤜', label: 'Elbows' },
]
