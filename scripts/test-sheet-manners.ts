/**
 * Gate: SHEET MANNERS on the Exercise tab and the coach's cards
 * (M10, M27, M29, M8, M26, L22, L33 — 9 Oct 2026).
 *
 * Each of these is something a person SEES, so the proof that it happens is
 * verify:moved-edit (sections 5f-5v and 11), which taps the real sheets. This
 * file holds the two things a driver is bad at: the arithmetic and wording of
 * the ban confirm (pure, called here), and the wiring that must not quietly
 * come apart (read from source, comments stripped). A source check cannot
 * prove a branch RUNS — where one stands alone here, it says so.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { banBlastRadius, banConfirmLines } from '../src/lib/screen-ban'
import { routeFor } from '../src/lib/edit-reason'
import type { MesocycleWeek } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const code = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '')

let failures = 0
let ran = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}
const count = (src: string, re: RegExp) => (src.match(re) ?? []).length

// ---------------------------------------------------------------------------
console.log('\n1. What a ban will do, said before the tap (M10)')
// ---------------------------------------------------------------------------
{
  const day = (d: string, ...names: string[]) => ({ day: d, focus: 'x', exercises: names.map(name => ({ name })) })
  const meso = [
    { week_number: 1, days: [day('Monday', 'Landmine Row', 'Pull-Ups'), day('Thursday', 'landmine row')] },
    { week_number: 2, days: [day('Monday', 'Landmine Row'), day('Thursday', 'Chin-Ups')] },
    { week_number: 3, days: [day('Monday', 'Pull-Ups')] },
  ] as unknown as MesocycleWeek[]
  const r = banBlastRadius(meso, 'Landmine Row')
  check('counts every session in the WHOLE plan that holds it, whatever the capitals', r.sessions === 3 && r.weeks === 2 && r.totalWeeks === 3, r)
  const many = banConfirmLines(r)
  check('the confirm says it is every week, with the number', many.warn === 'This is every week of your plan, not just today — 3 sessions get rebuilt. Each one gets the closest alternative your kit and injuries allow.', many.warn)
  check('...and that a slot with no good alternative comes out', /that slot comes out rather than being filled with something worse/.test(many.info) && /never be chosen for you again/.test(many.info))
  const one = banConfirmLines(banBlastRadius(meso, 'Chin-Ups'))
  check('one session is singular: "1 session gets rebuilt"', /— 1 session gets rebuilt\./.test(one.warn ?? ''), one.warn)
  const none = banConfirmLines(banBlastRadius(meso, 'Burpees'))
  check('an exercise that is nowhere on the plan warns of nothing and still says it is for good', none.warn === null && /isn't on this plan anywhere/.test(none.info) && /never be chosen for you again/.test(none.info), none)
  check('no sentence leaks a placeholder', [many.warn, many.info, one.warn, none.info].every(t => !/undefined|null|NaN/.test(t ?? '')))
}

// ---------------------------------------------------------------------------
console.log('\n2. Every ban on the Exercise tab goes through the question (M10)')
// ---------------------------------------------------------------------------
{
  const tab = code('src/components/exercise/ExerciseTab.tsx')
  const ban = code('src/lib/screen-ban.ts')
  const app = code('src/App.tsx')
  const sheet = code('src/components/exercise/BanExerciseSheet.tsx')
  check('no view is handed the WRITE: every child gets requestBan', count(tab, /onBanExercise=\{onBanExercise\}/g) === 0 && count(tab, /onBanExercise=\{requestBan\}/g) === 2, { direct: count(tab, /onBanExercise=\{onBanExercise\}/g), asked: count(tab, /onBanExercise=\{requestBan\}/g) })
  check('...and the write is reachable from the confirm sheet alone', count(tab, /onConfirm=\{onBanExercise\}/g) === 1 && count(tab, /\bonBanExercise\(/g) === 0)
  check('requestBan only opens the sheet — it writes nothing', /const requestBan = \(exerciseName: string\) => \{ setBanTarget\(exerciseName\) \}/.test(tab))
  check('the sheet is rendered in BOTH of the tab\'s views', count(tab, /\{banSheet\}/g) === 2)
  check('the sheet calls the write only from its confirm button', count(sheet, /onConfirm\(/g) === 1 && /onClick=\{confirm\}/.test(sheet) && /onClick=\{onClose\}[^>]*data-testid="ban-confirm-no"/.test(sheet))
  check('App\'s handler is the shared function, and hands its outcome back', /const handleBanExercise = async \(exerciseName: string\): Promise<BanOutcome> =>/.test(app) && /return banOnScreen\(\{/.test(app))
  check('the Undo reverses BOTH writes: the preference AND the plan', /deleteFactPermanently\(factId\)/.test(ban) && /saveMesocycle\(profileId, mesocycle,/.test(ban))
  check('...and where the plan was never rewritten, it does not pretend to restore one', /undo: undoWith\(false\)/.test(ban) && /undo: undoWith\(true\)/.test(ban) && /if \(!planWasRewritten\) return null/.test(ban))
  check('a failed preference write offers no Undo at all — never a dead button', /banned: false, undo: null \}/.test(ban))
  check('the receipt draws Undo only when there is one', /\{outcome\.undo && \(/.test(sheet))
}

// ---------------------------------------------------------------------------
console.log('\n3. "I don\'t like it" keeps it out for good (M27)')
// ---------------------------------------------------------------------------
{
  check('(the design) a dislike routes to a ban', routeFor('dislike') === 'ban', routeFor('dislike'))
  const swap = code('src/components/exercise/SwapDialog.tsx')
  const remove = code('src/components/exercise/RemoveExerciseSheet.tsx')
  const tab = code('src/components/exercise/ExerciseTab.tsx')
  const today = code('src/components/exercise/TodayPanel.tsx')
  check('the swap dialog hands a dislike to the ban confirm BEFORE treating it as a swap',
    swap.indexOf("a.reason === 'dislike' && onDislike") !== -1 && swap.indexOf("a.reason === 'dislike' && onDislike") < swap.indexOf("if (a.type === 'reason') { setAsked(true); return }"))
  check('...and the take-out sheet does too, before its scope step', /a\.reason === 'dislike' && onDislike\) \{ close\(\); onDislike\(\); return \}/.test(remove))
  check('a dislike no longer jumps straight to "Today only / Rest of block"', !/a\.reason === 'dislike'\) \{[^}]*setChoosing\(true\)/.test(remove))
  check('both sheets are actually wired to it (a prop nobody passes is the bug this fixes)', count(tab, /onDislike=\{requestBan\}/g) === 2 && /onDislike=\{\(\) => removeTarget && void onBanExercise\(removeTarget\.exerciseName\)\}/.test(today))
}

// ---------------------------------------------------------------------------
console.log('\n4. An error belongs to the step that produced it; the question matches its buttons (M8, M26)')
// ---------------------------------------------------------------------------
{
  const remove = code('src/components/exercise/RemoveExerciseSheet.tsx')
  const swap = code('src/components/exercise/SwapDialog.tsx')
  const step = code('src/components/exercise/EditReasonStep.tsx')
  const today = code('src/components/exercise/TodayPanel.tsx')
  check('the take-out sheet: no step change leaves the error standing', !/onClick=\{\(\) => setChoosing\((true|false)\)\}/.test(remove) && !/onSkip=\{\(\) => setAsked\(true\)\}/.test(remove), remove.match(/onClick=\{\(\) => setChoosing\((true|false)\)\}|onSkip=\{\(\) => setAsked\(true\)\}/)?.[0])
  check('...and it hears about the reason step\'s own Back', /onStepChange=\{\(\) => setError\(null\)\}/.test(remove))
  check('the swap dialog: the same two', !/onSkip=\{\(\) => setAsked\(true\)\}/.test(swap) && /onStepChange=\{\(\) => setReasonError\(null\)\}/.test(swap))
  for (const raw of ['setHurtingRaw', 'setKittingRaw', 'setHurtRaw', 'setRedFlagRaw']) {
    check(`the reason step: ${raw} is called only by its announcing wrapper`, count(step, new RegExp(`\\b${raw}\\b`, 'g')) === 2, count(step, new RegExp(`\\b${raw}\\b`, 'g')))
  }
  check('...and every wrapper announces the change', count(step, /=> \{ onStepChange\?\.\(\); set\w+Raw\(v\) \}/g) === 4)
  check('the scope question uses the buttons\' words', />Just today, or the rest of the block\?</.test(remove) && !/Just this week/.test(remove))
  check('...over buttons that read "Today only" and "Rest of block"', />Today only</.test(remove) && />Rest of block</.test(remove))
  const lighter = today.slice(today.indexOf('const lighterToday'), today.indexOf('const [moveError'))
  check('"I\'m wiped" on an empty day says there is no session, before anything is adjusted', lighter.indexOf("There's no session here to make lighter.") !== -1 && lighter.indexOf("There's no session here to make lighter.") < lighter.indexOf('adjustDayVolume('))
  check('...and at the floor it says what the minimum is and what is still possible', /already as light as it goes: \$\{sets\} sets across \$\{day\.exercises\.length\} exercises/.test(lighter) && /You can still swap an exercise for an easier one, shorten the session, or move it to another day/.test(lighter))
  check('...never the bare dead end', !/'Every exercise is already at its minimum\.'/.test(today))
}

// ---------------------------------------------------------------------------
console.log('\n5. A failed write is said where it can be seen, and does not follow you (M29)')
// ---------------------------------------------------------------------------
{
  // SOURCE ONLY, and that is a limit: no harness page boots App.tsx, so no
  // driver can look at this banner. What a driver CAN see — the swap and the
  // ban reporting in their own sheets — is in verify:moved-edit.
  const app = code('src/App.tsx')
  const at = app.indexOf('data-testid="write-error"')
  const banner = app.slice(app.lastIndexOf('{writeError && (', at), at + 400)
  check('the banner exists and is announced', at !== -1 && /role="alert"/.test(banner))
  check('...pinned to the viewport, not laid out above the tabs', /className="fixed [^"]*z-40/.test(banner) && /top: 'calc\(/.test(banner), banner.slice(0, 300))
  check('...on an opaque surface, so it reads over the set grid', /bg-background/.test(banner))
  check('leaving the tab puts it away', /useEffect\(\(\) => \{ setWriteError\(null\) \}, \[activeTab\]\)/.test(app))
}

// ---------------------------------------------------------------------------
console.log('\n6. The chat input slides rather than jumps; a timed-out card looks it (L22, L33)')
// ---------------------------------------------------------------------------
{
  const chat = code('src/components/ChatAssistant.tsx')
  const card = code('src/components/chat/ProposalCard.tsx')
  check('the chat page\'s bottom edge is eased — while the keyboard is shut only',
    /\$\{composerKeyboardOpen \? '' : 'transition-\[bottom\] duration-200 ease-out motion-reduce:transition-none'\}/.test(chat))
  check('the card decides "timed out" from its own expiry, on the real clock', /pendingWindowPassed\(pendingAction\.expiresAt\)/.test(card) && /Date\.parse\(pendingAction\.expiresAt\) - Date\.now\(\)/.test(card))
  check('...the moment it is drawn AND when the time comes', /useState\(\(\) => pendingAction\.status === 'pending' && pendingWindowPassed/.test(card) && /setTimeout\(\(\) => setTimedOut\(true\)/.test(card))
  check('...and everything the card draws reads that, not the stored status', /const status: ChatPendingActionView\['status'\] = timedOut && pendingAction\.status === 'pending' \? 'expired' : pendingAction\.status/.test(card) && !/const \{ diff, status \} = pendingAction/.test(card))
  check('a timed-out card is greyed', /status === 'expired' \? 'opacity-60' : ''/.test(card))
  // Strings only: what the card can PRINT. The limit is not stated on a live card.
  const printed = [...card.matchAll(/(['"`])((?:(?!\1).)*)\1/g)].map(m => m[2]).filter(t => /\s/.test(t))
  check('no sentence the card can print states the time limit', printed.every(t => !/\b(ten|10)\s*min|\bminutes?\b|expires? in/i.test(t)), printed.filter(t => /\b(ten|10)\s*min|\bminutes?\b|expires? in/i.test(t)))
}

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.error(`\n${failures} sheet-manners check(s) FAILED.`); process.exit(1) }
console.log('All sheet-manners checks pass.')
