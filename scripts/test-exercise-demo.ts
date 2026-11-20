/**
 * Gate: seeing the exercise — the muscle map, and the video that is only
 * there when someone watched it.
 *
 * Ashley asked for demonstrations twice. The first time, only the form-cue
 * half of her sentence was built and nothing recorded a decision to drop the
 * rest. This gate exists so the second half cannot quietly rot the same way,
 * and so the two honest limits it ships with stay honest:
 *
 *   THE MAP IS NOT A DEMONSTRATION. It shows which muscles a lift works, on a
 *   generic figure. §1 makes sure every exercise gets one or an explicit
 *   sentence instead — never a grey body, which reads as a bug.
 *
 *   THE VIDEO IS NOT ALWAYS THERE. A video teaches a lift correctly or it
 *   teaches someone to hurt themselves, so an id here means a person watched
 *   it. §3 asserts the button is CONDITIONAL and the ids well-formed. It
 *   deliberately does NOT require a minimum count: zero videos is a valid,
 *   honest state, and demanding a number would be pressure to add one nobody
 *   had watched.
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { EXERCISE_DATABASE, MUSCLE_GROUPS } from '../src/lib/exercise-db'
import { readMuscleMap, SHAPES_ON } from '../src/lib/muscle-map'
import { BODY_SHAPES } from '../src/lib/body-paths'
import { execSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const raw = (p: string) => readFileSync(join(ROOT, p), 'utf8')
// Comments are not code. Two checks in this repo have already gone red
// against correct files by matching the prose explaining the fix.
const read = (p: string) =>
  raw(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const map = read('src/components/exercise/MuscleMap.tsx')
const mapLib = read('src/lib/muscle-map.ts')
const panel = read('src/components/exercise/ExerciseDetailDialog.tsx')

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

const live = EXERCISE_DATABASE.filter(e => !e.retired)

console.log('\n1. Every exercise can answer "what does this work?"\n')
{
  const unrecognised = live.filter(e => readMuscleMap(e).unrecognised.length > 0)
  // A spelling this file has never seen is the silent-skip failure: it would
  // simply not light up, and nothing would say so. There is no budget for it.
  check('no exercise names a muscle the map has never heard of', unrecognised.length === 0,
    unrecognised.map(e => ({ [e.name]: readMuscleMap(e).unrecognised })))

  const blank = live.filter(e => {
    const r = readMuscleMap(e)
    return r.regions.length === 0 && !r.wordsOnly
  })
  check(`all ${live.length} live exercises light something up or say why not`, blank.length === 0,
    blank.map(e => e.name))

  const painted = live.filter(e => readMuscleMap(e).regions.length > 0)
  const wordsOnly = live.filter(e => readMuscleMap(e).wordsOnly)
  console.log(`     ${painted.length} painted, ${wordsOnly.length} words-only (${wordsOnly.map(e => e.name).join(', ') || 'none'})`)
  // The scan has to be finding real data, or "no blanks" is a statement about
  // a loop that ran zero times.
  check('it read a real catalogue (sanity check on this check)', live.length > 150, live.length)

  // THE MEASUREMENT VOCABULARY IS NOT THE DISPLAY ONE. MUSCLE_GROUPS is the
  // denominator for weekly per-muscle volume and feeds test:muscle-balance.
  // Adding a group to it so a picture looks better would silently change what
  // that metric measures and make every prior number non-comparable.
  check('the volume metric\'s denominator is untouched — still 11 groups',
    MUSCLE_GROUPS.length === 11, MUSCLE_GROUPS)
  check('...and the map keeps its own region list rather than borrowing it',
    /MuscleSlug/.test(mapLib) && !/MUSCLE_GROUPS/.test(mapLib))
}

console.log('\n1b. The mapping to the drawing\'s own slugs\n')
{
  // THE BODY SHAPES ARE VENDORED FROM react-native-body-highlighter, and its
  // licence travels with them (MIT requires the notice).
  const paths = raw('src/lib/body-paths.ts')   // raw on purpose: the licence IS a comment
  check('the vendored shapes carry the library licence and say where they came from',
    /MIT License/.test(paths) && /ELABBASSI Hicham/.test(paths) && /react-native-body-highlighter 3\.2\.0/.test(paths))
  const frontSlugs = new Set(BODY_SHAPES.front.map(([s]) => s))
  const backSlugs = new Set(BODY_SHAPES.back.map(([s]) => s))
  check('the drawing has real shapes on both views', BODY_SHAPES.front.length >= 15 && BODY_SHAPES.back.length >= 15,
    [BODY_SHAPES.front.length, BODY_SHAPES.back.length])
  check('every shape is a non-empty path', [...BODY_SHAPES.front, ...BODY_SHAPES.back].every(([, ds]) => ds.length > 0 && ds.every(d => /^M/i.test(d))))

  // The written-out list of shapes per view (so the mapping never imports the path data) cannot drift from the data.
  const same = (a: ReadonlySet<string>, b: Set<string>) => a.size === b.size && [...a].every(x => b.has(x))
  check('the mapping\'s list of shapes per view is exactly what the vendored data draws',
    same(SHAPES_ON.front, frontSlugs) && same(SHAPES_ON.back, backSlugs),
    { front: [...SHAPES_ON.front], back: [...SHAPES_ON.back] })

  // Every slug a live exercise lights must be a shape the drawing HAS, on at least one view.
  const lit = new Set(live.flatMap(e => readMuscleMap(e).regions))
  const missing = [...lit].filter(s => !frontSlugs.has(s) && !backSlugs.has(s))
  check('every slug the catalogue lights up exists on the drawing', missing.length === 0 && lit.size > 10, [...missing, lit.size])

  const byName = (n: string) => readMuscleMap(live.find(e => e.name === n)!)
  const chin = byName('Chin-Ups')
  const primaryOn = (v: 'front' | 'back') => Object.entries(chin.lit[v]).filter(([, t]) => t === 'primary').map(([s]) => s).sort()
  check('Chin-Ups: biceps, abs and obliques are the primary shapes on the front', JSON.stringify(primaryOn('front')) === JSON.stringify(['abs', 'biceps', 'obliques']), chin.lit.front)
  check('Chin-Ups: lats and teres major land on the upper back, the only primary shape on the back view', JSON.stringify(primaryOn('back')) === JSON.stringify(['upper-back']), chin.lit.back)
  check('core lights BOTH abs and obliques on the front',
    'abs' in readMuscleMap({ primary_muscles: ['core'] }).lit.front && 'obliques' in readMuscleMap({ primary_muscles: ['core'] }).lit.front)
  check('a slug is only recorded on a view where the drawing has it (no biceps on the back)',
    !('biceps' in chin.lit.back) && !('upper-back' in chin.lit.front))
  check('anterior deltoid is front only; rear deltoid is back only',
    'deltoids' in readMuscleMap({ primary_muscles: ['anterior deltoid'] }).lit.front
    && !('deltoids' in readMuscleMap({ primary_muscles: ['anterior deltoid'] }).lit.back)
    && 'deltoids' in readMuscleMap({ primary_muscles: ['rear deltoid'] }).lit.back
    && !('deltoids' in readMuscleMap({ primary_muscles: ['rear deltoid'] }).lit.front))
  // Where the library has an exact shape, use it rather than the nearest.
  check('adductors, tibialis and ankles use their own shapes, not a neighbour',
    'adductors' in readMuscleMap({ primary_muscles: ['adductors'] }).lit.front
    && 'tibialis' in readMuscleMap({ primary_muscles: ['tibialis anterior'] }).lit.front
    && 'ankles' in readMuscleMap({ primary_muscles: ['ankle stabilisers'] }).lit.front)

  // Secondary: paler tier, primary wins. No catalogue entry has the field today.
  const both = readMuscleMap({ primary_muscles: ['chest'], secondary_muscles: ['triceps', 'chest'] })
  check('a secondary muscle is tiered secondary and a primary one stays primary',
    both.lit.front.triceps === 'secondary' && both.lit.front.chest === 'primary', both.lit.front)
  check('a primary is never downgraded by a secondary naming the same shape',
    readMuscleMap({ primary_muscles: ['chest'], secondary_muscles: ['chest'] }).lit.front.chest === 'primary')

  // THE WARNING. A muscle with no mapping is logged and listed, never skipped quietly.
  const warnings: string[] = []
  const realWarn = console.warn
  console.warn = (...a: unknown[]) => { warnings.push(a.join(' ')) }
  const odd = readMuscleMap({ primary_muscles: ['flux capacitor', 'chest'] })
  readMuscleMap({ primary_muscles: ['flux capacitor'] })
  console.warn = realWarn
  check('an unmapped muscle is listed as unrecognised, and the mapped one still lights',
    odd.unrecognised.length === 1 && odd.unrecognised[0] === 'flux capacitor' && 'chest' in odd.lit.front, odd)
  check('...and it logs ONE warning naming the muscle', warnings.length === 1 && /flux capacitor/.test(warnings[0]), warnings)
  check('the colour tiers are the accent, a paler accent, and the panel\'s own raised purple',
    /secondary: \{ fill: 'var\(--primary\)', opacity: 0\.\d+/.test(map) && /off: \{ fill: 'var\(--surface-raised\)'/.test(map)
    && /primary: \{ fill: 'var\(--primary\)', opacity: 1/.test(map))
}

console.log('\n1c. Secondary muscles: real assistors, said once, decided for every exercise\n')
{
  // Exercises with NOTHING honest to add. Absent is a decision, never a gap: a new exercise must either carry
  // `secondary_muscles` or be added here with its reason, so a forgotten one fails rather than going unlit.
  //   bench and chest presses, push-ups, dips: the primary list already is the whole prime-mover and brace set.
  //   hip adduction and back extension machines: single-joint, no honest assistor.   Burpees: not a place on a body.
  //   bent-knee calf raise: its target IS the soleus, which the primary "calves" already covers.
  const NONE = new Set([
    'Archer Push-Ups', 'Assisted Dip Machine', 'Back Extension Machine', 'Barbell Bench Press', 'Barbell Floor Press', 'Bent-Knee Calf Raise (Bodyweight)', 'Burpees', 'Chest Dips', 'Chest Press Machine', 'Close-Grip Bench Press', 'Close-Grip Push-Ups', 'Decline Push-Ups', 'Deficit Push-Ups', 'Dumbbell Bench Press', 'Dumbbell Floor Press', 'Dumbbell Squeeze Press', 'Hip Adduction Machine', 'Incline Barbell Bench Press', 'Incline Dumbbell Press', 'Incline Machine Press', 'Incline Push-Ups', 'Neutral-Grip Dumbbell Press', 'Push-Ups', 'Seated Dip Machine', 'Single-Arm Dumbbell Bench Press', 'Smith Machine Bench Press', 'Tricep Dips'
  ])
  const missingDecision = live.filter(e => !e.secondary_muscles?.length && !NONE.has(e.name))
  check('every exercise has secondary muscles or is on the named "nothing to add" list', missingDecision.length === 0,
    missingDecision.map(e => e.name))
  const staleNone = [...NONE].filter(n => { const e = live.find(x => x.name === n); return !e || !!e.secondary_muscles?.length })
  check('...and nothing on that list has gone stale (renamed, retired, or given secondaries)', staleNone.length === 0, staleNone)
  const withSecondary = live.filter(e => e.secondary_muscles?.length)
  console.log(`     ${withSecondary.length} of ${live.length} have secondary muscles, ${NONE.size} deliberately none`)
  check('it read a real catalogue (sanity check on this check)', withSecondary.length > 200, withSecondary.length)

  // Same vocabulary as primary: a spelling the map has never seen is already caught by section 1's unrecognised
  // check, which reads both tiers; this pins that the secondary tier really is read.
  const odd = readMuscleMap({ primary_muscles: ['chest'], secondary_muscles: ['flux capacitor'] })
  const realWarn = console.warn; console.warn = () => {}
  const oddSecondary = readMuscleMap({ primary_muscles: ['chest'], secondary_muscles: ['flux capacitor'] }).unrecognised
  console.warn = realWarn
  check('an unknown SECONDARY spelling is caught the same way as a primary one', oddSecondary.includes('flux capacitor') && odd !== undefined)

  // Said once: a secondary that repeats a primary (or a synonym spelling of one) is padding, and the caption would
  // print it twice.
  const SAME = [['quads', 'quadriceps'], ['upper traps', 'upper trapezius', 'traps'], ['biceps', 'biceps brachii'],
    ['glutes', 'glute max'], ['shoulders', 'anterior deltoid', 'front deltoid'], ['forearms', 'forearm flexors', 'forearm extensors'],
    ['core', 'rectus abdominis'], ['erectors', 'erector spinae'], ['triceps', 'triceps (long head)']]
  const groupOf = (m: string) => SAME.find(g => g.includes(m)) ?? [m]
  const repeats = withSecondary.flatMap(e => e.secondary_muscles!.filter(sm =>
    e.primary_muscles.some(pm => groupOf(pm).includes(sm.toLowerCase()) || pm.toLowerCase() === sm.toLowerCase())).map(sm => `${e.name}: ${sm}`))
  check('no secondary repeats a primary muscle or a synonym spelling of one', repeats.length === 0, repeats)
  const dupes = withSecondary.filter(e => new Set(e.secondary_muscles!.map(m => m.toLowerCase())).size !== e.secondary_muscles!.length)
  check('no secondary list repeats itself', dupes.length === 0, dupes.map(e => e.name))
  const tooMany = withSecondary.filter(e => e.secondary_muscles!.length > 4)
  check('four or fewer a lift: a list that long stops saying which ones matter', tooMany.length === 0, tooMany.map(e => e.name))
  const shapes = withSecondary.filter(e => e.secondary_muscles!.some(m => m !== m.trim().toLowerCase()))
  check('written in the catalogue\'s own lower-case spelling', shapes.length === 0, shapes.map(e => e.name))

  // DISPLAY ONLY. The volume metric, the pool filters and the prescription all read primary_muscles; none may read
  // this field, or adding it would silently change what they measure.
  const readers = ['src', 'supabase/functions'].flatMap(d =>
    execSync(`grep -rln "secondary_muscles" ${d} || true`, { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean))
  const allowed = ['src/lib/exercise-db.ts', 'src/lib/muscle-map.ts']
  check('only the catalogue and the muscle map read secondary_muscles — no engine, no coach', readers.every(f => allowed.includes(f)) && readers.length === allowed.length, readers)

  // The ruling's own case, end to end.
  const chin = readMuscleMap(live.find(e => e.name === 'Chin-Ups')!)
  check('Chin-Ups: the secondary tier is drawn and the primary tier is untouched',
    chin.lit.back.trapezius === 'secondary' && chin.lit.back['upper-back'] === 'primary' && chin.lit.front.biceps === 'primary', chin.lit)
  check('...and its secondary names are listed for the caption', chin.secondaryNames.includes('Lower trapezius'), chin.secondaryNames)
}

console.log('\n2. The map works with no signal, because it is drawn not fetched\n')
{
  // The service worker never caches cross-origin content by design, so
  // anything fetched from elsewhere is blank on a gym floor. This is the
  // check that keeps the map on the right side of that.
  check('no image is loaded', !/<img|<image\b/.test(map))
  check('nothing is fetched at render time', !/fetch\(|XMLHttpRequest/.test(map))
  // The shapes are their own chunk, loaded on first draw. That is the ONE dynamic import the map may have, it must
  // name the own-bundle module, and the build's asset manifest (which the service worker saves to the phone) must
  // list every built .js so the chunk is there with no signal.
  // (`typeof import('…')` in a type is erased at build and is not a load, so it is not counted.)
  const dynamic = map.match(/(?<!typeof\s)import\(\s*(['"`])[^'"`]*\1\s*\)/g) ?? []
  check('the one dynamic import is the shapes chunk, an own-bundle module',
    dynamic.length === 1 && /import\(\s*'@\/lib\/body-paths'\s*\)/.test(dynamic[0]), dynamic)
  check('...so the 45 kB of path data is not imported statically by the map or its mapping',
    !/from '@\/lib\/body-paths'/.test(map.replace(/import type[^\n]*\n/g, '').replace(/type Shapes[^\n]*\n/, ''))
    && !/import \{[^}]*\} from '\.\/body-paths'/.test(mapLib.replace(/import type[^\n]*\n/g, '')))
  check('...and the build lists every .js it makes for the service worker, so that chunk is saved offline',
    /\.\(js\|css\)\$/.test(read('vite-asset-manifest.ts')) && /asset-manifest\.json/.test(read('public/sw.js')))
  check('a chunk that cannot load says so and leaves the muscle names',
    /failed &&/.test(map) && /couldn&apos;t load/.test(map) && /\{names\.join/.test(map))
  check('no external host appears at all', !/https?:\/\//.test(map))
  check('it is drawn as SVG in the bundle', /<svg/.test(map) && /viewBox/.test(map))
  // Red already means "avoid with" on this same panel. Lighting the muscles
  // you are about to train in the danger colour would collide.
  check('working muscles use the accent, not the warning colour',
    /var\(--primary\)/.test(map) && !/role-warn/.test(map))
  // Nothing moves, so there is nothing for prefers-reduced-motion to suppress.
  check('nothing animates', !/animate|@keyframes|transition:/.test(map))
  // A figure with nothing lit reads as a rendering failure. The words do not.
  check('the nothing-to-paint case renders a sentence, not an unlit body',
    /wordsOnly/.test(map) && /Nothing to highlight/.test(map))
  // The drawing approximates; the words must not. Whatever is painted, the
  // catalogue's own muscle names are printed underneath.
  check('the exact muscle names are printed alongside the drawing', /\{names\.join/.test(map))
  check('...and the graphic carries a text alternative', /role="img"/.test(map) && /aria-label=/.test(map))
}

console.log('\n3. The video appears only where a person watched one\n')
{
  const withVideo = live.filter(e => e.demo_video_id)
  console.log(`     ${withVideo.length} of ${live.length} exercises have a checked video`)

  // THE GUARD, NOT THE STRING. Replacing the condition with `true` leaves the
  // markup in place and a presence check passes against a button that renders
  // for every exercise — the dead-control failure this repo keeps producing,
  // one layer down. Caught by mutation.
  check('the Watch button is guarded on the id being present',
    /\{entry\.demo_video_id && \(/.test(panel))
  check('...and there is a button to guard', /Watch demonstration/.test(panel))

  // Deliberately no minimum. Zero is honest; a number here would be pressure
  // to add a video nobody had watched.
  for (const e of withVideo) {
    check(`${e.name}: the id is a bare YouTube id, not a URL`,
      /^[A-Za-z0-9_-]{11}$/.test(e.demo_video_id!), e.demo_video_id)
    check(`${e.name}: the video is credited to whoever made it`,
      !!e.demo_video_credit?.trim(), e.demo_video_credit)
  }

  // One host, and the no-cookie one. A URL field could carry anything; the
  // catalogue stores an id precisely so this template is the only way out.
  check('the player embeds youtube-nocookie and nothing else',
    /youtube-nocookie\.com\/embed\//.test(panel)
    && !/[^-]youtube\.com|youtu\.be/.test(panel))
  // A video needs signal and always will. Saying so beats a black rectangle.
  check('the player says it needs a connection, and what still works without one',
    /Needs a connection/.test(panel) && /work without one/.test(panel))
  check('...and credits the video beside it', /demo_video_credit/.test(panel))
}

console.log('\n4. What it is, and what it is not\n')
{
  // The map and a borrowed video are both short of coaching, and the panel
  // has said so since the cues shipped. Adding pictures makes that line more
  // load-bearing, not less.
  check('the honest line survived the rebuild',
    /reminders, not coaching/.test(panel) && /reason to stop/.test(panel))
  check('the map is rendered by the panel, not built and left unused',
    /<MuscleMap/.test(panel))
  check('...and the component exists to be rendered',
    existsSync(join(ROOT, 'src/components/exercise/MuscleMap.tsx')))
}

console.log('\n5. The demonstration image: a socket, and nothing hot-linked\n')
{
  // Ashley, 7 Sep 2026: "the anatomical body ... are not at all what I had in
  // mind. I asked for exercise demos and more realistic images." Her ruling
  // once the options and prices were in front of her: wire it up ready, buy
  // the set separately. So this section gates the SOCKET.
  //
  // Zero images is a pass, exactly as zero videos is above. What is not a pass
  // is a slot that renders without one, or a filename that turns out to be a
  // vendor's URL.
  const withImage = live.filter(e => e.demo_image)
  console.log(`     ${withImage.length} of ${live.length} exercises have a licensed image`)

  // THE GUARD, NOT THE MARKUP — same mutation this file's §3 was written for.
  // Replacing the condition with `true` leaves an <img> with an undefined src
  // on all 200 exercises: a broken frame on every card.
  check('the image renders only where one exists', /\{entry\.demo_image && \(/.test(panel))
  check('...and there is an image to guard', /src=\{`\/exercise-demos\/\$\{entry\.demo_image\}`\}/.test(panel))
  check('...with alt text, since it is the whole point of the picture',
    /alt=\{`\$\{exerciseName\} demonstration`\}/.test(panel))

  // SAME ORIGIN OR IT IS BLANK IN A BASEMENT. sw.js:70 returns early for
  // anything cross-origin, so a hot-linked image is a white rectangle exactly
  // where VISION says the app has to work — the property the 5 Sep decision
  // cited when it chose hand-rolled SVG over a bought set. The field takes a
  // filename so it CANNOT carry a host; these checks are what keep that true.
  check('the path is built from our own public folder, not from the field',
    !/src=\{entry\.demo_image\}/.test(panel))
  const sw = readFileSync(join(ROOT, 'public/sw.js'), 'utf8')
  check('...and the service worker still refuses cross-origin, which is why',
    /url\.origin !== self\.location\.origin\) return/.test(sw))

  const DEMO_DIR = join(ROOT, 'public/exercise-demos')
  for (const e of withImage) {
    const value = e.demo_image!
    check(`${e.name}: the image is a bare filename, not a URL or a path`,
      /^[A-Za-z0-9._-]+\.(webp|png|jpg|jpeg|gif|svg)$/.test(value) && !value.includes('..'), value)
    check(`${e.name}: the file is actually there`, existsSync(join(DEMO_DIR, value)), value)
    if (e.demo_image_credit !== undefined) {
      check(`${e.name}: a credit that exists is a real one`, !!e.demo_image_credit.trim(), e.demo_image_credit)
    }
  }

  // The map is the fallback, not the thing being replaced: every exercise
  // still gets one, and an exercise with an image gets both.
  check('the muscle map still renders regardless', /<MuscleMap entry=\{entry\} \/>/.test(panel))
  // RE-ANCHORED 20 Nov 2026 (his report: "Summary" showed the muscles): the picture is a demonstration, so it
  // leads the How to tab; the map is the Muscles tab. Both still render for an exercise with an image.
  const tabSlice = (v: string) => (panel.match(new RegExp(`<TabsContent value="${v}"[\\s\\S]*?</TabsContent>`)) ?? [''])[0]
  check('...the picture leads How to, the map is on Muscles',
    /entry\.demo_image && \(/.test(tabSlice('howto')) && /<MuscleMap entry=\{entry\} \/>/.test(tabSlice('summary'))
    && tabSlice('howto').indexOf('entry.demo_image && (') < tabSlice('howto').indexOf('form_cues'))

  // The tool that answers "does this set cover us" before money is spent.
  check('there is a coverage check to run before buying a set',
    existsSync(join(ROOT, 'scripts/check-demo-coverage.ts')))
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  check('...and it is runnable by name', !!pkg.scripts['check:demo-coverage'])
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nYou can see what it works, and how it goes.\n')
