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
import { readMuscleMap } from '../src/lib/muscle-map'

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
    /MuscleRegion/.test(mapLib) && !/MUSCLE_GROUPS/.test(mapLib))
}

console.log('\n2. The map works with no signal, because it is drawn not fetched\n')
{
  // The service worker never caches cross-origin content by design, so
  // anything fetched from elsewhere is blank on a gym floor. This is the
  // check that keeps the map on the right side of that.
  check('no image is loaded', !/<img|<image\b/.test(map))
  check('nothing is fetched at render time', !/fetch\(|XMLHttpRequest|import\(/.test(map))
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
  check('...below the image, so the picture leads',
    panel.indexOf('entry.demo_image && (') < panel.indexOf('<MuscleMap entry={entry} />'))

  // The tool that answers "does this set cover us" before money is spent.
  check('there is a coverage check to run before buying a set',
    existsSync(join(ROOT, 'scripts/check-demo-coverage.ts')))
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  check('...and it is runnable by name', !!pkg.scripts['check:demo-coverage'])
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nYou can see what it works, and how it goes.\n')
