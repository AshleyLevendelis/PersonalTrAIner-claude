// ---------------------------------------------------------------------------
// "OTHER (DESCRIBE)" ON THE INJURIES LIST (his ruling 15 Nov 2026, "Hips & pelvis + Other"; docs/plans/
// browser-test-nov15-plan.md). Somebody whose pain is not one of the eight areas types what hurts and answers the
// same three questions as any pain (edit-reason.ts HURT_KINDS). What each answer does, worked out once here so the
// screen only draws it:
//   - a word naming one of the eight areas ticks that area instead (the plan can only work around those);
//   - sharp, one-sided or worsening: the professional advice, and NOTHING is saved (his 15 Sep ruling);
//   - a niggle: nothing changes, said plainly (the app cannot ease off an area it cannot pick out);
//   - there a while: kept on the list in his words, said to change no exercise, and the coach is told.
// Pelvic pain while pregnant always names a physio or midwife (the same ruling).
// ---------------------------------------------------------------------------

import { RED_FLAG_ADVICE, type HurtKind } from './edit-reason'
import { normaliseInjuryCode } from './onboarding-slots'

export type OtherInjuryOutcome =
  | { action: 'tick'; code: string; message: string }
  | { action: 'save'; text: string; message: string }
  | { action: 'none'; message: string }

export const PELVIC_PREGNANCY_LINE =
  'Pain in the pelvis while pregnant is worth a word with a physio or your midwife.'

const PELVIC = /\b(pelvi[cs]|pelvis|pubic|pubis|spd|sacroiliac|si joint|groin)\b/i

/** True when the words are about the pelvis (the line pregnancy adds). */
export function aboutPelvis(text: string): boolean {
  return PELVIC.test(text)
}

/** The one area a few words name, if any (whole words and plurals; "pelvis"/"pelvic" are the hip option's own label).
 *  Nothing wider is guessed: groin or SI-joint pain is not ticked as an area (normaliseInjuryCode's rule). */
export function areaNamedIn(text: string): string | null {
  const words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean)
  for (const w of words) {
    const code = normaliseInjuryCode(w)
    if (code) return code
  }
  return null
}

export function otherInjuryOutcome(
  text: string,
  kind: HurtKind,
  opts: { pregnant: boolean; areaLabel: (code: string) => string },
): OtherInjuryOutcome {
  const said = text.trim()
  const pelvicLine = opts.pregnant && aboutPelvis(said) ? ` ${PELVIC_PREGNANCY_LINE}` : ''
  if (kind === 'red_flag') return { action: 'none', message: RED_FLAG_ADVICE + pelvicLine }
  const code = areaNamedIn(said)
  if (code && kind === 'lasting') {
    return { action: 'tick', code, message: `That's one the app can work around, so I've ticked ${opts.areaLabel(code)}.${pelvicLine}` }
  }
  if (kind === 'niggle') {
    const where = code ? `${opts.areaLabel(code)} niggle` : 'niggle'
    return {
      action: 'none',
      message: `Nothing on your plan changes for a ${where} on its own. If a move bothers it, open that exercise's menu and choose Swap: it asks what's going on and eases that area off for a few days.${pelvicLine}`,
    }
  }
  if (!said) return { action: 'none', message: 'Say what hurts first.' }
  return {
    action: 'save',
    text: said,
    message: `Saved as "${said}". It doesn't change which exercises you get (the app can only work around the areas above), but your coach will know about it.${pelvicLine}`,
  }
}
