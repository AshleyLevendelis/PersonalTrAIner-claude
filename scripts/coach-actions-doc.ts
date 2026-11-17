// Renders docs/coach-actions.md from the master list (stage 4, 17 Nov 2026). `npm run gen:coach-actions` writes it;
// test:coach-actions fails when the file on disk is not what this renders, so the document cannot drift from the list.
import { writeFileSync } from 'node:fs'
import { COACH_ACTIONS, type ActionFamily } from '../src/lib/offer-rules'

const FAMILY_TITLE: Record<ActionFamily, string> = {
  meals: 'Meals', exercise: 'One exercise', day: 'One day\'s session', plan: 'The whole plan',
  logging: 'Logging what was done', memory: 'What the coach remembers', shopping: 'The shopping list',
}
const RULE_WORDS: Record<string, string> = {
  standing: 'never off one occasion', today: 'never when asked "from now on"', definite: 'never off a maybe',
}

export function renderCoachActionsDoc(): string {
  const out: string[] = [
    '# Everything the coach can do',
    '',
    'GENERATED from the master list in `src/lib/offer-rules.ts` (`COACH_ACTIONS`) by `npm run gen:coach-actions`.',
    'Do not edit by hand: `test:coach-actions` fails when this file and the list differ. The reasons behind each',
    'screen counterpart are in `docs/coach-screen-parity.md`.',
    '',
  ]
  const order: ActionFamily[] = ['meals', 'exercise', 'day', 'plan', 'logging', 'memory', 'shopping']
  for (const fam of order) {
    const rows = Object.entries(COACH_ACTIONS).filter(([, a]) => a.family === fam).sort(([a], [b]) => a.localeCompare(b))
    if (rows.length === 0) continue
    out.push(`## ${FAMILY_TITLE[fam]} (${rows.length})`, '', '| Action | On the screen too | Arrives as | His words must... |', '|---|---|---|---|')
    for (const [tool, a] of rows) {
      const words = 'words' in a.rule ? a.rule.words.map(w => RULE_WORDS[w]).join('; ') : `(no words rule: ${a.rule.none})`
      out.push(`| \`${tool}\` | ${a.screen === 'screen' ? 'yes' : 'coach only'} | ${a.card ? `a card (\`${a.card}\`)` : 'an instant save'} | ${words} |`)
    }
    out.push('')
  }
  return out.join('\n')
}

if (process.argv.includes('--write')) {
  writeFileSync('docs/coach-actions.md', renderCoachActionsDoc())
  console.log('wrote docs/coach-actions.md')
}
