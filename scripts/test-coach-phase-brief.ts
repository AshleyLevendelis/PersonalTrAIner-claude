// ---------------------------------------------------------------------------
// DOES THE COACH KNOW WHERE YOU ARE, AND WHEN TO SAY SO?
//
// Ashley: "It knows which phase of training the user is in ie, adaptation,
// hypertrophy etc but never says anything about it or explains how the
// program will run."
//
// Half of that turned out to be generous. It did NOT know. The prompt carried
// a textbook explaining Anatomical Adaptation / Hypertrophy Accumulation /
// Intensification, and the client sent the week's exercises, the coach note
// and pending suggestions — phase_label, phase_focus, block_number,
// week_in_block, is_deload and isCalibrationWeek all existed on the plan and
// none of them ever reached the chat. So it could explain periodization in
// the abstract and could not place the trainee inside it.
//
// Her ruling on how forward to be: "when a plan is built give a quick high
// level of the weeks to come then when something changes."
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildCoachPhaseBrief } from '../src/lib/chat-plan-context'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const PLAN_START = '2026-08-01T09:00:00.000Z'
const dayAfterStart = (n: number) => new Date(new Date(PLAN_START).getTime() + n * 86400000)
const wk = (o: Record<string, unknown> = {}) => ({
  phase_label: 'Hypertrophy Accumulation', phase_focus: 'Time under tension and volume.',
  block_number: 1, week_in_block: 2, ...o,
})

console.log('\n1. It says where they are, in words a person can use')
{
  const brief = buildCoachPhaseBrief({
    activeWeek: 2, totalWeeks: 16, week: wk(), planCreatedAt: PLAN_START,
    now: dayAfterStart(9), lastChatAt: dayAfterStart(8).toISOString(),
  })
  check('names the week and the length of the plan', /Week 2 of 16/.test(brief), brief)
  check('names the block position', /block 1, week 2 of that block/.test(brief), brief)
  check('names the phase', /Hypertrophy Accumulation/.test(brief), brief)
  check('says what the phase is for', /Time under tension/.test(brief), brief)
}

console.log('\n2. A brand-new plan gets the high-level walkthrough — Ashley\'s first half')
{
  const brief = buildCoachPhaseBrief({
    activeWeek: 1, totalWeeks: 16, week: wk({ phase_label: 'Anatomical Adaptation', week_in_block: 1 }),
    planCreatedAt: PLAN_START, now: dayAfterStart(1), lastChatAt: null,
  })
  check('it is told to speak up', /SPEAK UP/.test(brief), brief)
  check('...asking for the SHAPE of what is coming', /high-level shape|what is coming/.test(brief), brief)
  check('...and explicitly not a week-by-week table', /not a week-by-week table/.test(brief), brief)
}

console.log('\n3. It speaks up when the week turns over — Ashley\'s second half')
{
  // Last spoke in week 2; it is now week 3.
  const brief = buildCoachPhaseBrief({
    activeWeek: 3, totalWeeks: 16, week: wk({ phase_label: 'Intensification', week_in_block: 3 }),
    planCreatedAt: PLAN_START, now: dayAfterStart(15), lastChatAt: dayAfterStart(13).toISOString(),
  })
  check('it is told to speak up', /SPEAK UP/.test(brief), brief)
  check('...naming the phase they have moved into', /Intensification/.test(brief), brief)
  check('...and kept short', /One or two sentences/.test(brief), brief)
}

console.log('\n4. And stays quiet the rest of the time — the half that stops it nagging')
{
  // Same week as the last conversation: nothing has changed.
  const brief = buildCoachPhaseBrief({
    activeWeek: 3, totalWeeks: 16, week: wk(), planCreatedAt: PLAN_START,
    now: dayAfterStart(17), lastChatAt: dayAfterStart(15).toISOString(),
  })
  check('it is told NOT to volunteer the phase', /Do NOT volunteer/.test(brief), brief)
  check('...and there is no SPEAK UP instruction', !/SPEAK UP/.test(brief), brief)
  check('...but the position is still there for when they ask', /Week 3 of 16/.test(brief), brief)
}

console.log('\n5. Deload and calibration are named, because they read as going backwards')
{
  const deload = buildCoachPhaseBrief({
    activeWeek: 4, totalWeeks: 16, week: wk({ is_deload: true }), planCreatedAt: PLAN_START,
    now: dayAfterStart(24), lastChatAt: dayAfterStart(23).toISOString(),
  })
  check('a deload week is flagged', /DELOAD/.test(deload), deload)
  check('...and framed as deliberate, not backsliding', /backsliding|recovery/.test(deload), deload)

  const calib = buildCoachPhaseBrief({
    activeWeek: 1, totalWeeks: 16, week: wk({ isCalibrationWeek: true }), planCreatedAt: PLAN_START,
    now: dayAfterStart(1), lastChatAt: null,
  })
  check('a calibration week is flagged', /CALIBRATION/.test(calib), calib)
}

console.log('\n6. No plan means no guess')
{
  check('no week data yields nothing at all',
    buildCoachPhaseBrief({ activeWeek: 1, totalWeeks: 16, week: undefined, planCreatedAt: PLAN_START, now: dayAfterStart(1), lastChatAt: null }) === '')
  check('no plan date yields nothing at all',
    buildCoachPhaseBrief({ activeWeek: 1, totalWeeks: 16, week: wk(), planCreatedAt: null, now: dayAfterStart(1), lastChatAt: null }) === '')
}

console.log('\n7. It is actually wired up, end to end')
{
  const ui = stripComments(readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8'))
  const fn = stripComments(readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8'))
  check('the client builds the brief', /buildCoachPhaseBrief\(/.test(ui))
  check('...and sends it in the context', /phase_brief:/.test(ui))
  check('the prompt renders it', /\$\{context\.phase_brief\}/.test(fn))
  check('...and tells the coach what SPEAK UP means', /SPEAK UP/.test(fn))
  check('...and forbids inventing a week when it is empty', /never guess a week number/.test(fn))
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll coach phase-brief checks passed.\n')
