import type { FieldArc } from '@/components/field/FieldRing'

// ---------------------------------------------------------------------------
// NUTRITION'S FIELD: the five-ring meter (design handoff v2 §3).
//
// The ring here is INLINE at 130px, not ambient, "because it's an instrument
// you read" — on Home and Exercise it is atmosphere that happens to be true;
// here it is the point of the field.
//
// THE LETTERS ARE LOAD-BEARING, and the handoff says why it landed there:
// "Colour alone failed (three of five hues were unreadable when darkened), and
// ink alone failed (five arcs in one hue are not a key). Colour + letter
// works." So every macro carries P/C/F/W beside its swatch, and the letter is
// what survives when the colour does not.
//
// Radii, widths and colours are read off the prototype rather than inferred:
//   r50/w4  water    --chart-3
//   r40/w9  kcal     solid ink, and the ONLY arc with no keyline (it is the
//                    headline, so it is already ink)
//   r30/w6  protein  --chart-2
//   r22/w6  carbs    --chart-4
//   r14/w6  fat      --text-tertiary
//
// Fat is the one oddity, and it is the prototype's own choice: --chart-5 is
// declared identical to --chart-3 in index.css, so using it would have drawn
// fat and water in the same hue and broken the key the letters exist to
// support. Recorded rather than silently "fixed", because the duplicate in the
// chart palette is a real latent bug for any future five-series chart.
// ---------------------------------------------------------------------------

export interface MacroCell {
  key: 'protein' | 'carbs' | 'fat' | 'water'
  letter: 'P' | 'C' | 'F' | 'W'
  swatch: string
  eaten: number
  target: number
}

export interface NutritionFieldModel {
  /** Null when a body metric is missing — the field then shows no figures at all. */
  kcal: { eaten: number; target: number } | null
  cells: MacroCell[]
  arcs: FieldArc[]
}

export interface NutritionFieldInput {
  caloriesEaten: number
  caloriesTarget: number
  proteinEaten: number
  proteinTarget: number
  carbsEaten: number
  carbsTarget: number
  fatEaten: number
  fatTarget: number
  waterMl: number
  waterTargetMl: number
  /** False when the trainee declined a body metric. No target may be rendered. */
  hasTargets: boolean
}

const SWATCH = {
  protein: 'var(--chart-2)',
  carbs: 'var(--chart-4)',
  fat: 'var(--text-tertiary)',
  water: 'var(--chart-3)',
} as const

export function buildNutritionField(input: NutritionFieldInput): NutritionFieldModel {
  const arcs: FieldArc[] = []
  const cells: MacroCell[] = []

  // Water is independent of body metrics — it is a target you set, not one
  // derived from a weight — so it survives a decline.
  if (input.waterTargetMl > 0) {
    arcs.push({ label: 'water', value: input.waterMl / input.waterTargetMl, radius: 50, width: 4, color: SWATCH.water })
  }

  if (input.hasTargets) {
    arcs.push({ label: 'kcal', value: input.caloriesEaten / (input.caloriesTarget || 1), radius: 40, width: 9 })
    arcs.push({ label: 'protein', value: input.proteinEaten / (input.proteinTarget || 1), radius: 30, width: 6, color: SWATCH.protein })
    arcs.push({ label: 'carbs', value: input.carbsEaten / (input.carbsTarget || 1), radius: 22, width: 6, color: SWATCH.carbs })
    arcs.push({ label: 'fat', value: input.fatEaten / (input.fatTarget || 1), radius: 14, width: 6, color: SWATCH.fat })

    cells.push(
      { key: 'protein', letter: 'P', swatch: SWATCH.protein, eaten: Math.round(input.proteinEaten), target: Math.round(input.proteinTarget) },
      { key: 'carbs', letter: 'C', swatch: SWATCH.carbs, eaten: Math.round(input.carbsEaten), target: Math.round(input.carbsTarget) },
      { key: 'fat', letter: 'F', swatch: SWATCH.fat, eaten: Math.round(input.fatEaten), target: Math.round(input.fatTarget) },
    )
  }

  if (input.waterTargetMl > 0) {
    cells.push({ key: 'water', letter: 'W', swatch: SWATCH.water, eaten: input.waterMl, target: input.waterTargetMl })
  }

  return {
    kcal: input.hasTargets ? { eaten: Math.round(input.caloriesEaten), target: Math.round(input.caloriesTarget) } : null,
    cells,
    arcs,
  }
}
