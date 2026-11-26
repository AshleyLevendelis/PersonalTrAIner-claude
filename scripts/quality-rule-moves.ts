// WHICH RULES MOVED SINCE THE COMMITTED REPORT (26 Nov 2026).
//
// test:quality only ever failed on the 7.2 floor, and the sweep's habit is to revert quality-report.txt unless the
// change is "about" it. Together those meant nobody read the rule table: between 15 and 25 Nov five rules moved by
// hundreds of plans (one from 0 to 520, one from 684 to 1,613) on a gate that stayed green. A threshold that only
// speaks when crossed is the bundle budget's lesson again, so every run now prints what moved against the report in
// git, and a large RISE fails until it is either fixed or recorded by committing the new report.
export interface RuleMove { rule: string; was: number; now: number }

/** The "RULE FREQUENCY" table of a report, as rule -> plans. Empty when the text holds none. */
export function parseRuleFrequency(report: string): Map<string, number> {
  const out = new Map<string, number>()
  const at = report.indexOf('RULE FREQUENCY')
  if (at < 0) return out
  for (const line of report.slice(at).split('\n').slice(2)) {
    if (/^-{10,}/.test(line)) break
    const m = /^\s+([a-zA-Z]+\/[a-z_0-9]+)\s+(\d+)\s+[\d.]+%/.exec(line)
    if (m) out.set(m[1], Number(m[2]))
  }
  return out
}

/** Every rule whose count differs, biggest change first. A rule absent from one side counts as 0 there. */
export function ruleMoves(was: Map<string, number>, now: Map<string, number>): RuleMove[] {
  const rules = new Set([...was.keys(), ...now.keys()])
  return [...rules].map(rule => ({ rule, was: was.get(rule) ?? 0, now: now.get(rule) ?? 0 }))
    .filter(m => m.was !== m.now)
    .sort((a, b) => Math.abs(b.now - b.was) - Math.abs(a.now - a.was))
}

/** A rise worth stopping for: more than 100 plans AND more than a quarter over the committed count. */
export const RISE_PLANS = 100
export const RISE_SHARE = 0.25
export function isLargeRise(m: RuleMove): boolean {
  return m.now - m.was > RISE_PLANS && m.now > m.was * (1 + RISE_SHARE)
}
