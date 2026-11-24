// ---------------------------------------------------------------------------
// "SHOW ME A VIDEO" (his live test, 14 Nov 2026). Asked how to do box jumps, the coach gave steps and no video; asked
// for a video, it wrote "www.youtube.com/results?search_query=Box+Jumps+tutorial+form" as plain text the chat could not
// open. A link is now the APP's, never the model's: on a how-to or a video request naming an exercise the app knows,
// the chat draws a "Watch a video" button to a YouTube search the app builds from the catalogue's own name.
// ---------------------------------------------------------------------------
import { EXERCISE_DATABASE, searchExerciseCatalogByWords } from './exercise-db'

const ASKS_HOW_OR_VIDEO = /\bvideos?\b|\btutorials?\b|\bdemo\b|\bshow me\b|\bhow (do|should|to|would|can) (i|you|we)\b|\bhow is\b|\bform\b|\btechnique\b|\bteach me\b/i

/** He asked how to do something, or asked for a video. */
export function asksHowOrVideo(text: string): boolean {
  return ASKS_HOW_OR_VIDEO.test(text)
}

const GREETING = /^\s*(?:(?:hi|hey|hello|morning|evening)\b[\s,!.]*)?(?:good\s+(?:morning|afternoon|evening|night)\b)?/i
const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `
/** Each word with a trailing plural "s" dropped, so "box jumps" finds "Box Jump" and "lunges" finds "Lunge". */
const singular = (s: string) => s.replace(/(\w{3,})s\b/g, '$1')

let names: { name: string; key: string }[] | null = null
function catalogue(): { name: string; key: string }[] {
  if (!names) names = EXERCISE_DATABASE.map(e => ({ name: e.name, key: singular(norm(e.name)) })).sort((a, b) => b.key.length - a.key.length)
  return names
}

/** The catalogue exercise this text names, the longest match winning ("Barbell Back Squat" over "Squat"); null when none. */
export function exerciseNamedIn(text: string | null | undefined, opts: { wholeNameOnly?: boolean } = {}): string | null {
  if (!text) return null
  // A web address is not words ("com" found a Compound Chest Press by its prefix, in his live test's video reply).
  // A GREETING IS NOT AN EXERCISE (his live test, 23 Nov 2026: "Good morning. How can I improve my cardio conditioning
  // for muay thai?" got "Watch a video: Good Mornings"). "Good morning" (or afternoon, evening) opening a message, and
  // not followed by more of the exercise's name, is taken out before anything is matched; "how do I do good mornings?"
  // still finds the hinge.
  const t = singular(norm(text.replace(/(?:https?:\/\/|www\.)\S+/gi, ' ').replace(GREETING, ' ')))
  const whole = catalogue().find(n => t.includes(n.key))?.name
  if (whole || opts.wholeNameOnly) return whole ?? null
  // A shorter or reordered name ("lunges", "a barbell back squat"): the app's own exercise search over his words, the
  // longest run of words that finds something winning, so "back squat" is tried before "squat".
  // A LONE LETTER IS NOT A WORD (his screenshot, 16 Nov 2026): "today's" leaves an "s", which the exercise search matched
  // to Scapular Pull-Ups by its first letter, and "Show me videos of today's exercises" got that one button.
  const words = t.trim().split(' ').filter(w => w.length > 1 && !STOP.has(w))
  for (let n = Math.min(3, words.length); n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const asked = words.slice(i, i + n)
      const hit = searchExerciseCatalogByWords(asked.join(' '), 1)[0]
      if (hit && namesEveryWord(hit.name, asked)) return hit.name
    }
  }
  return null
}

/**
 * A SEARCH HIT MUST CONTAIN EVERY WORD HE SAID AS A WORD OF ITS OWN (his screenshot, 16 Nov 2026: "show me video for
 * all todays lifts" found "Bodyweight Hip Hinge to Wall" by the "all" inside "Wall", and "lift" found Deadlifts, so a
 * request for the whole session got one warm-up's button). "lunges" still finds Lunge, "back squat" Barbell Back Squat.
 */
function namesEveryWord(name: string, asked: string[]): boolean {
  const tokens = singular(norm(name)).trim().split(' ')
  return asked.every(w => tokens.some(t => t === w || (w.length >= 4 && t.startsWith(w))))
}

const STOP = new Set(['how', 'do', 'does', 'did', 'i', 'you', 'we', 'to', 'a', 'an', 'the', 'me', 'my', 'show', 'video', 'videos',
  'tutorial', 'demo', 'form', 'technique', 'teach', 'for', 'of', 'on', 'with', 'should', 'can', 'could', 'would', 'is', 'it',
  'this', 'that', 'please', 'properly', 'correctly', 'right', 'good', 'what', 'whats', 'way', 'best', 'and', 'or', 'in', 'at',
  'be', 'am', 'are', 'so', 'just', 'one', 'some', 'here', 'there', 'get', 'go', 'like', 'look', 'see', 'watch', 'done',
  'perform', 'exercise', 'exercises', 'workout', 'session', 'today', 'tomorrow', 'more', 'hi', 'hey', 'ok',
  // A body part or a habit is not an exercise ("eat" would find a Seated row by its prefix): "how do I brace my core" must not find a core machine.
  'core', 'back', 'chest', 'leg', 'legs', 'arm', 'arms', 'shoulder', 'shoulders', 'glute', 'glutes', 'abs', 'stomach',
  'knee', 'knees', 'hip', 'hips', 'posture', 'brace', 'breathe', 'breathing', 'stay', 'motivated', 'eat', 'cook', 'meal',
  'meals', 'sleep', 'lose', 'gain', 'weight', 'fat', 'muscle', 'build', 'grip'])

/** A YouTube search for this exercise's form: what the chat's video button and the How to tab's link both open. */
export function formVideoUrl(exercise: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${exercise} exercise form tutorial`)}`
}

/**
 * The video button for a coach reply, or null. Asked of HIS message (did he ask how, or for a video?) and named from his
 * message, else the reply (a whole catalogue name only: the coach's prose is not a search), else what he said just before ("show me a video" after "how do I do box jumps").
 */
export function formVideoFor(userText: string | null | undefined, replyText: string | null | undefined, earlierUserText?: string | null): { exercise: string; url: string } | null {
  if (!userText || !asksHowOrVideo(userText)) return null
  // WHAT HE SAID BEFORE ONLY ANSWERS A BARE REQUEST FOR A VIDEO ("show me a video"), never another how-to (QA, 14 Nov
  // 2026: "how do I brace my core?" after an RDL question got "Watch a video: Romanian Deadlifts").
  const asksForVideo = /\b(videos?|tutorials?|demo|show me)\b/i.test(userText)
  const exercise = exerciseNamedIn(userText) ?? exerciseNamedIn(replyText, { wholeNameOnly: true }) ?? (asksForVideo ? exerciseNamedIn(earlierUserText) : null)
  return exercise ? { exercise, url: formVideoUrl(exercise) } : null
}

const SESSION_WORDS = /\b(today|todays|session|workout|plan|routine|lifts?|exercises|movements?|them|these|all)\b/i
const MOST_BUTTONS = 8

/**
 * "SHOW ME VIDEOS OF TODAY'S EXERCISES" (his screenshot, 16 Nov 2026): the coach said "for each of today's lifts" and the
 * app drew one button, for an exercise that was not in the session. A request for videos that names no exercise but
 * speaks of the session gets one button for each exercise of today's session, in its order, the catalogue's own name.
 * Never for a how-to ("how do I brace my core"), which asks about one thing.
 */
export function sessionVideosFor(userText: string | null | undefined, sessionExercises: readonly string[]): { exercise: string; url: string }[] {
  if (!userText || sessionExercises.length === 0) return []
  if (!/\b(videos?|tutorials?|demos?|show me)\b/i.test(userText) || !SESSION_WORDS.test(userText)) return []
  if (exerciseNamedIn(userText)) return []
  const seen = new Set<string>()
  const out: { exercise: string; url: string }[] = []
  for (const name of sessionExercises) {
    if (!name || seen.has(name)) continue
    seen.add(name)
    out.push({ exercise: name, url: formVideoUrl(name) })
    if (out.length >= MOST_BUTTONS) break
  }
  return out
}

/**
 * A web address the coach typed as bare text becomes a markdown link, so the chat's link renderer (which adds https and
 * opens a new tab) can open it. An address already inside a markdown link is left alone.
 */
export function linkifyBareUrls(text: string): string {
  return text.replace(/(^|\s)((?:https?:\/\/|www\.)[^\s<>()\]]+[^\s<>()\].,!?;:'"])/g, (_m, pre: string, url: string) => `${pre}[${url}](${url})`)
}
