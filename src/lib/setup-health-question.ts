// ---------------------------------------------------------------------------
// A SAFETY QUESTION ABOUT A HEALTH CONDITION IS NEVER PARKED IN SETUP (Sal and Margaret, 14 Nov 2026; his ruling "A").
// Margaret asked whether exercise was safe with her blood pressure and was told it would be answered once she was set
// up. His ruling: a question about exercising or eating safely with a condition, medication or pregnancy gets a brief
// safe answer and "check with your GP" at once, the condition is noted, and setup carries on. The coach is told so in
// its prompt; this is the app's half, for the turn where the coach parks one anyway.
// ---------------------------------------------------------------------------

const CONDITIONS: Array<[RegExp, string]> = [
  [/\b(high |low )?blood pressure\b|\bhypertension\b|\bbp\b/i, 'blood pressure'],
  [/\bheart\b|\bcardiac\b|\bangina\b|\barrhythmi/i, 'a heart condition'],
  [/\bdiabet|\bpre-?diabet|\binsulin\b|\bblood sugar/i, 'diabetes'],
  [/\bblood thinner|\bwarfarin\b|\banticoagula|\bapixaban\b|\brivaroxaban\b/i, 'blood thinners'],
  [/\bpregnan|\bexpecting a baby\b|\btrimester\b|\bpostpartum\b|\bpost-?natal\b/i, 'pregnancy'],
  [/\basthma\b|\bcopd\b/i, 'asthma'],
  [/\bepilep|\bseizure/i, 'epilepsy'],
  [/\bmedication\b|\bmeds\b|\btablets?\b|\bpills?\b/i, 'your medication'],
]

/** A question about training or eating safely with something on that list: the thing it is about, else undefined. */
export function healthSafetyQuestion(text: string): string | undefined {
  const t = text.trim()
  if (!t) return undefined
  // A question, not a statement: a question mark, or the way people ask without one.
  const asks = t.includes('?') || /\b(is it (ok|okay|safe)|can i|should i|safe to|okay to|ok to|will it|does it|am i able)\b/i.test(t)
  if (!asks) return undefined
  return CONDITIONS.find(([re]) => re.test(t))?.[1]
}
