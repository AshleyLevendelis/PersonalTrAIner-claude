// ---------------------------------------------------------------------------
// Gate: "ANYTHING FEELING TIGHT?" ADDS WARM-UP AND NOTHING ELSE.
//
// Built 15 Sep 2026 from Gemini's suggestion list, and it was the only one of
// that list worth taking as written: the warm-up in this app already has a
// mobility block whose stated job is preparing the joints the session will
// load, so "my hips are stiff this morning" is the one input the plan cannot
// derive and the person always knows.
//
// THE SAFETY PROPERTY IS THE WHOLE POINT OF THIS FILE. Ashley ruled on pain
// the same day, and that ruling is about the APP, not one screen: ask which
// kind, then act — a niggle eases the area off, something lasting goes on the
// injuries list, and sharp, one-sided or worsening names a professional and
// CHANGES NOTHING. A tightness question sitting one tap from that is exactly
// where a second, softer pain path would grow. So this gate holds two lines at
// once: tightness may only ever add mobility drills, and saying it hurts must
// land in the one triage rather than a copy of it.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs'
import {
  TIGHT_AREAS, AREA_JOINTS, tightnessWarmup, uncoveredNote,
  MAX_TIGHTNESS_DRILLS, jointsForAreas,
} from '../src/lib/tightness'
import { drillsPreparing } from '../src/lib/warmup'
import { HURT_KINDS, RED_FLAG_ADVICE } from '../src/lib/edit-reason'
import { INJURY_OPTIONS } from '../src/lib/picker-options'

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.error(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`)
  }
}

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

// ---------------------------------------------------------------------------
console.log('\n1. Every area a person can tap gives them something — EXECUTED')
// ---------------------------------------------------------------------------
{
  // OFFERING AN ANSWER THAT DOES NOTHING is the defect this section exists
  // for. Before the two drills added the same day, neck and elbows had no
  // mobility movement in the catalogue at all: tapping them would have looked
  // exactly like tapping hips and produced nothing.
  check('the picker offers the eight the rest of the app understands',
    TIGHT_AREAS.length === INJURY_OPTIONS.length, TIGHT_AREAS.length)
  for (const a of TIGHT_AREAS) {
    check(`${a.value} maps to a joint the drills know`, (AREA_JOINTS[a.value] ?? []).length > 0)
    const r = tightnessWarmup([a.value])
    check(`...and produces a drill`, r.items.length > 0, r)
    check(`...and says why it is there`, !!r.note && r.note.toLowerCase().includes(a.label.toLowerCase()), r.note)
  }
}

// ---------------------------------------------------------------------------
console.log('\n2. IT ADDS WARM-UP AND NOTHING ELSE — the line that must not move')
// ---------------------------------------------------------------------------
{
  const sheet = strip(read('src/components/exercise/TightnessSheet.tsx'))
  const lib = strip(read('src/lib/tightness.ts'))

  // Neither the sheet nor the module may reach anything that writes a plan, a
  // set, a weight or a day. A tightness answer is not an edit.
  const FORBIDDEN = [
    'setSwappedForActivity', 'setDeliberateRest', 'setMarkedMissed', 'setSessionMove',
    'shortenDayTo', 'adjustDayVolume', 'swapExerciseInMesocycle', 'removeExerciseFromSession',
    'onMesocycleUpdated', 'updateProfileField', 'supabase',
  ]
  for (const f of FORBIDDEN) {
    check(`the sheet never reaches ${f}`, !sheet.includes(f))
    check(`...nor does the module`, !lib.includes(f))
  }
  // It may not even write the ANSWER anywhere but today's session record —
  // which is the caller's job, so neither file should name a plan write.
  check('the module only ever returns drills', /return \{ items/.test(lib))
}

// ---------------------------------------------------------------------------
console.log('\n3. Tight is not hurt, and the hurt path is the one that already exists')
// ---------------------------------------------------------------------------
{
  const sheet = strip(read('src/components/exercise/TightnessSheet.tsx'))

  // THE SAME CONSTANTS, not a second copy. Two versions of a safety question
  // drift, and one of them ends up being the wrong one.
  check('the three kinds come from the shared list', sheet.includes('HURT_KINDS'))
  check('...and the advice for the dangerous one does too', sheet.includes('RED_FLAG_ADVICE'))
  check('...which still names a professional', /physio|doctor|professional/i.test(RED_FLAG_ADVICE), RED_FLAG_ADVICE)
  check('there are exactly three kinds, one of them the red flag',
    HURT_KINDS.length === 3 && HURT_KINDS.some(h => h.kind === 'red_flag'), HURT_KINDS.map(h => h.kind))

  // THE RED FLAG CHANGES NOTHING. In the panel's own handler it must return
  // before anything is stored — including the tightness list itself.
  const panel = strip(read('src/components/exercise/TodayPanel.tsx'))
  const i = panel.indexOf('const handleTightness')
  check('the panel handles the sheet', i > 0)
  const body = panel.slice(i, i + 900)
  const iRed = body.indexOf("a.type === 'red_flag'")
  const iSet = body.indexOf('setTightAreas')
  check('the red flag returns BEFORE anything is written', iRed > 0 && iSet > iRed, { iRed, iSet })
  check('...and writes nothing at all on that branch', /red_flag'\) return\b/.test(body), body.slice(iRed - 20, iRed + 60))
  // AND IT GOES TO THE ONE TRIAGE. onInjury is the handler the exercise row
  // uses; a second implementation here is the thing to prevent.
  check('a real injury is handed to the existing triage', /onInjury\(a\)/.test(body), body.slice(0, 200))

  // THE ESCAPE IS NOT ONE OF THE EIGHT. Pain answered as an area is pain that
  // skipped the triage, so it must be rendered OUTSIDE the loop that draws the
  // areas — not merely somewhere else in the file.
  //
  // RE-ANCHORED after mutation-testing, and the first version is worth keeping
  // as a warning: it sliced from the areas testid to the save button and
  // asserted the escape was not in there. The escape is rendered AFTER the
  // save button, so that slice never contained it and the check passed however
  // the file was arranged — including with the escape moved into the loop,
  // which is the one thing it existed to catch.
  // THE RIGHT LOOP. TIGHT_AREAS is mapped TWICE in this file — once for the
  // eight tightness chips and once for "which area?" inside the hurt branch —
  // and the hurt one comes first. A bare indexOf found that one, so the checks
  // below were reading the injury picker and reporting on the tightness chips.
  // Caught by the baseline failing, not by the mutation.
  const iAreas = sheet.indexOf('data-testid="tight-areas"')
  check('the tightness chips have their own block', iAreas > 0)
  const iMap = sheet.indexOf('{TIGHT_AREAS.map(a => (', iAreas)
  check('the areas are drawn from the shared list', iMap > iAreas)
  const mapEnd = sheet.indexOf('))}', iMap)
  const mapBlock = sheet.slice(iMap, mapEnd)
  // THE PROPERTY IS WHAT A CHIP DOES, NOT WHERE IT SITS. Second re-anchor, and
  // the first one deserves recording too: "the escape is not inside the loop"
  // read well and could not be mutated honestly — moving a button in or out of
  // a map is fiddly, and my own attempt to break it inserted the button AFTER
  // the loop closed, so the check passed correctly and proved nothing. What
  // actually matters is that NO AREA CHIP OPENS THE HURT FLOW: an area that
  // does is pain answered as stiffness, which is the exact thing this file
  // exists to prevent, and it is one line to break on purpose.
  check('no area chip opens the hurt flow', !mapBlock.includes('setHurting'), mapBlock.slice(0, 240))
  check('...the chips do one thing, and it is tagging an area', /toggle\(a\.value\)/.test(mapBlock))
  check('...and the escape exists, on its own', sheet.includes('data-testid="tight-hurts"'))
  check('...and it is the thing that opens the triage', /data-testid="tight-hurts"[\s\S]{0,120}setHurting\(true\)/.test(sheet))
}

// ---------------------------------------------------------------------------
console.log('\n4. It cannot eat the session, and it says what it left out')
// ---------------------------------------------------------------------------
{
  const many = tightnessWarmup(TIGHT_AREAS.map(a => a.value))
  check(`all eight at once is capped at ${MAX_TIGHTNESS_DRILLS}`, many.items.length <= MAX_TIGHTNESS_DRILLS, many.items.length)
  check('...and that is still some warm-up, not none', many.items.length > 0)

  // THE TWO REASONS AN AREA COMES BACK EMPTY ARE DIFFERENT, and the first cut
  // of this conflated them: naming five areas told her "I haven't got a
  // warm-up movement for shoulders yet", which is false — there are three of
  // them and they did not fit. Saying the app cannot do something it can is
  // the same defect class as saying it did something it did not.
  check('an area that lost the cut is reported as waiting, not missing',
    many.notThisTime.length > 0 && many.noDrill.length === 0, { notThisTime: many.notThisTime, noDrill: many.noDrill })
  const note = uncoveredNote(many) ?? ''
  check('...and the sentence says so', /will have to wait/.test(note), note)
  check('...without claiming the movement does not exist', !/haven't got a warm-up movement/.test(note), note)

  // The genuinely-empty case still reports honestly.
  const vetoed = tightnessWarmup(['neck'], ['neck'])
  check('an injury vetoes the drill it would have added', vetoed.items.length === 0, vetoed)
  check('...and that IS reported as nothing available',
    /haven't got a warm-up movement/.test(uncoveredNote(vetoed) ?? ''), uncoveredNote(vetoed))
  check('...with no note claiming it was added', vetoed.note === null)
}

// ---------------------------------------------------------------------------
console.log('\n5. Never a drill she has not got the kit for')
// ---------------------------------------------------------------------------
{
  // An answer that produces a movement she cannot do is an answer that
  // produced nothing, one step later.
  const all = drillsPreparing(jointsForAreas(TIGHT_AREAS.map(a => a.value)))
  check('the selector returns drills', all.length > 0, all.length)
  const warmupSrc = read('src/lib/warmup.ts')
  for (const d of all) {
    const i = warmupSrc.indexOf(`name: '${d.name.replace(/'/g, "\\'")}'`)
    const entry = i > 0 ? warmupSrc.slice(i, i + 400) : ''
    check(`${d.name} needs no equipment`, /needs_equipment: \[\]/.test(entry), entry.slice(0, 120))
  }
}

// ---------------------------------------------------------------------------
console.log('\n6. Today only — it cannot reach tomorrow')
// ---------------------------------------------------------------------------
{
  const store = strip(read('src/lib/active-session-store.ts'))
  check('the answer lives on the date-keyed session record', /tightAreas\?: string\[\]/.test(store))
  const hook = strip(read('src/hooks/useActiveSession.tsx'))
  check('...read back from that record', /tightAreas: \[\]|record\?\.tightAreas/.test(hook))
  check('...and written through in the same tick', /patchRecord\(\{ tightAreas: areas \}\)/.test(hook))

  // NOT ON THE PLAN. The mesocycle's own warm-up is what makes a session the
  // same session every time it comes round; writing today's stiff hip into it
  // would carry that into next week.
  const panel = strip(read('src/components/exercise/TodayPanel.tsx'))
  check('the drills are computed at render, not stored', /tightnessWarmup\(tightAreas/.test(panel))
  check('...and handed to the warm-up as an addition', /extra=\{tightness\.items\}/.test(panel))

  // THE CLOSED SECTION MUST COUNT THEM. Adding three drills and leaving the
  // badge saying "4 moves" reads as the answer not landing.
  const section = strip(read('src/components/exercise/WarmupSection.tsx'))
  check('the move count includes them', /rampCount \+ extra\.length/.test(section))
  check('...and so does the minutes estimate', /totalMinutes \+ extraMinutes/.test(section))
  check('the caveat has somewhere to render', /extraCaveat/.test(section))
}

console.log(failures === 0 ? '\nTightness adds warm-up, says what it could not do, and never touches the plan.\n' : `\n${failures} check(s) failed.\n`)
process.exit(failures === 0 ? 0 : 1)
