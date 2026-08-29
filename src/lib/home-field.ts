import type { FieldArc } from '@/components/field/FieldRing'
import type { DashboardData } from '@/lib/dashboard-data'

// ---------------------------------------------------------------------------
// HOME'S FIELD: "what's left today" (design handoff v2 §2).
//
// "Home answers what's left today — the question no other tab can answer."
//
// Two rules from the handoff drive everything here, and both are the kind that
// rot the moment they live in JSX:
//
//   1. "Only list items that have no readout further down the page." Water is
//      a tile below, so it is not a row — it appears in the ring only. Same
//      for calories, steps and the weigh-in, which all have their own rows on
//      the canvas.
//   2. "The count is derived from the list, never hardcoded." Which is why
//      this returns rows and a count computed from them, and why nothing can
//      pass a count in.
//
// This also replaces the old `whatsLeftLine` in the coach bubble. The handoff's
// reason is a contrast one: "Never put --role-warn text on a field. Amber on
// mint is unreadable, and status colour doesn't bend for a background."
// ---------------------------------------------------------------------------

export interface HomeFieldRow {
  key: 'session' | 'protein'
  label: string
  figure: string
  /** A token. Omitted means solid ink — the fact has no colour of its own. */
  swatch?: string
}

export interface HomeFieldModel {
  rows: HomeFieldRow[]
  /** rows.length. Never passed in, never stored. */
  count: number
  arcs: FieldArc[]
  /**
   * True when there is genuinely nothing outstanding — a rest day with
   * everything logged. §8 step 3: this must read as an empty state, never as
   * "0 things left".
   */
  empty: boolean
  ctaLabel: string | null
}

export function buildHomeField(data: Pick<DashboardData,
  'session' | 'proteinEaten' | 'proteinTarget' | 'hasNutritionTargets' | 'waterMl' | 'waterTargetMl'
>): HomeFieldModel {
  const rows: HomeFieldRow[] = []
  const { session } = data

  // --- the session -------------------------------------------------------
  const setsLeft = Math.max(0, session.setsPlanned - session.setsLogged)
  const sessionOutstanding = session.status !== 'rest' && session.status !== 'done' && setsLeft > 0
  if (sessionOutstanding) {
    // The session name appears on Home EXACTLY ONCE, and this is it — §2's
    // "Home and Exercise must not read as the same screen".
    rows.push({
      key: 'session',
      label: session.focus ? `Finish ${session.focus}` : 'Finish today\'s session',
      figure: `${setsLeft} sets`,
    })
  }

  // --- protein -----------------------------------------------------------
  // Gated on hasNutritionTargets, not on the number: the targets are zeroes
  // for anyone who declined a body metric, and "of 0 g" must never reach a
  // screen (the absence doctrine MissingBodyMetricsNotice states).
  const proteinLeft = data.hasNutritionTargets
    ? Math.max(0, Math.round(data.proteinTarget - data.proteinEaten))
    : 0
  if (data.hasNutritionTargets && proteinLeft > 0) {
    rows.push({ key: 'protein', label: 'Protein', figure: `${proteinLeft} g`, swatch: 'var(--chart-2)' })
  }

  // --- the ring ----------------------------------------------------------
  // Radii and widths are the handoff's. Water is here and NOT in the rows,
  // which is the whole point of rule 1 above.
  const arcs: FieldArc[] = [
    {
      label: 'sets',
      value: session.setsPlanned > 0 ? session.setsLogged / session.setsPlanned : 0,
      radius: 92, width: 9,
    },
  ]
  if (data.hasNutritionTargets && data.proteinTarget > 0) {
    arcs.push({
      label: 'protein', value: data.proteinEaten / data.proteinTarget,
      radius: 78, width: 6, color: 'var(--chart-2)',
    })
  }
  if (data.waterTargetMl > 0) {
    arcs.push({
      label: 'water', value: data.waterMl / data.waterTargetMl,
      radius: 66, width: 6, color: 'var(--chart-3)',
    })
  }

  return {
    rows,
    count: rows.length,
    arcs,
    empty: rows.length === 0,
    ctaLabel: sessionOutstanding
      ? (session.status === 'in_progress' ? 'Continue session' : 'Start session')
      : null,
  }
}
