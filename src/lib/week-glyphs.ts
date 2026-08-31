// ---------------------------------------------------------------------------
// The week strip's shared vocabulary.
//
// The strip now exists on TWO tabs as two different things: Home's is a
// RECORD (26px cells, read-only) and Exercise's is a NAVIGATOR (38px, tap a
// day to peek). Only affordance and scale differ — the marks must be
// identical, because a glyph that meant one thing on Home and another on
// Exercise would be worse than having no strip on Home at all.
//
// Extracted here rather than exported from WeekStrip.tsx so neither tab owns
// the other's meaning, and so a new mark cannot be added to one strip alone.
// ---------------------------------------------------------------------------
import type { TrainingWeekDay } from '@/hooks/useTrainingWeek'

export const GLYPH: Record<TrainingWeekDay['state'], string> = {
  done: '✓',
  partial: '◐',
  due: '●',
  missed: '○',
  rest: '–',
  recovery: '~',
  // A training day that fell before this plan existed. Deliberately the
  // faintest mark in the set: it is not a rest day (the plan didn't choose
  // it) and emphatically not a missed one (nothing was ever owed).
  before_plan: '·',
  // Lifting deliberately swapped for something else, announced at the time.
  // Distinct from every mark above because it is the only one that says work
  // HAPPENED but not this work — an arrow, not an absence.
  swapped: '⇄',
  // A prescribed day rested on purpose. Shares the dash with 'rest' because
  // to a glance both mean "no work here, and that's fine" — the difference
  // between them is history, not status, and it is carried in the label the
  // screen reader gets rather than in a mark nobody could tell apart.
  rest_chosen: '–',
}

/**
 * Spoken form of each state. The aria-label used to interpolate the raw
 * state name, so a screen reader announced "partial" and would now announce
 * "before_plan" — identifiers, not English.
 */
export const STATE_LABEL: Record<TrainingWeekDay['state'], string> = {
  done: 'done',
  partial: 'partly done',
  due: 'due',
  missed: 'missed',
  rest: 'rest day',
  recovery: 'active recovery',
  before_plan: 'before your plan started',
  swapped: 'swapped for another activity',
  rest_chosen: 'rest day you chose',
}

export const SHORT_DAY: Record<string, string> = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu',
  Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun',
}
