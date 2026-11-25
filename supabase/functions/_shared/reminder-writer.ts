// ---------------------------------------------------------------------------
// THE COACH WRITES THE REMINDER; THE APP CHECKS IT.
//
// Ashley's ruling, 6 Nov 2026, "Coach writes, app checks" (over warmer fixed
// sentences and over leaving them): a reminder is written fresh by the coach
// from her real day, in its warm voice with a why, so it is never the same
// twice. The app checks it says nothing untrue and sends a warm fixed sentence
// (coach-moments.ts `coachMessage`) when it does not pass.
//
// WHAT THE COACH IS GIVEN: only facts the app holds about this moment, the
// same ones the fixed sentence is built from. It is never given her meals,
// her diet or her allergies, so it may never NAME A FOOD: a reminder that
// suggested almonds to someone with a nut allergy would be a safety defect in
// a message nobody reviewed.
//
// THE CHECKS (checkReminder), each a reason a written message is refused:
//   - empty, over 240 characters, or more than three sentences;
//   - formatting, a list, or an app marker;
//   - a number the fixed sentence does not carry (the coach never invents one);
//   - a food named;
//   - a wrong claim about her day: that she trained when nothing is logged,
//     or the wrong part of the day (today-claim.ts, the chat's own check);
//   - talk about being an AI;
//   - more than one emoji;
//   - not opening with a greeting: her WhatsApp shape ("Hey Ashley, are you ready..."), widened 25 Nov 2026 to
//     the time of day ("Morning Ashley, ...") so every reminder does not start with the same word;
//   - a message carrying one-tap answers that does not end on a question.
// Any refusal, a slow or failed call, or no key: the fixed sentence goes.
//
// Everything that touches the world is handed in (`call`), so
// test:reminder-writer drives this exact code with a fake.
// ---------------------------------------------------------------------------
import type { CoachMoment, MomentFacts } from './coach-moments.ts'
import { detectTodayClaim } from './today-claim.ts'

export const MAX_REMINDER_CHARS = 240

/**
 * WHO IS WRITING (Ashley's brief, 25 Nov 2026: "still robotic, still no personality, still not enthusiastic"): the same
 * coach as the chat (chat-gemini §0), so a reminder and a reply sound like one person.
 */
export const COACH_PERSONA = "You are this person's coach and training partner: sharp, upbeat, grounded and genuinely invested in them. You know your stuff, you have been watching their week, you know what is coming next, and you talk like a real person: contractions, everyday words, real energy about real progress, no fake hype, no corporate filler."

/** A reminder opens with a greeting (her 6 Nov "Hey Ashley" shape, widened 25 Nov 2026 to fit the time of day). */
export const GREETING = /^(?:hey|hi|morning|good morning|afternoon|good afternoon|evening|good evening)\b/i

/** The part of the day on her clock, in the today-claim check's words. */
export function partOfDayFor(hour: number): 'morning' | 'afternoon' | 'evening' {
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
}

/** What this moment is for, said to the coach. Only what the app knows. */
function purpose(moment: CoachMoment, f: MomentFacts): string {
  switch (moment.key) {
    case 'workout_today': {
      const t = f.todaySession
      return t
        ? `Today's session is ${t.name}${t.lift && t.weight ? `, built around ${t.lift} at ${t.weight}` : ''}, and nothing is logged yet. Name the session, and get them keen for it.`
        : 'Today is a training day and nothing is logged yet. Get them ready and keen for it.'
    }
    case 'load_clash': {
      const c = f.clash
      const t = f.todaySession
      return `Today's session is ${t?.name ?? 'a training session'}${c?.lift ? `, built around ${c.lift}` : ''}, a heavy leg day, and they have ${c?.activity ?? 'a hard class'} ${c?.when === 'yesterday' ? 'yesterday, so their legs may be tired' : 'on the same day'}. Say the clash in a line${c?.when === 'today' ? ', tell them to lift first' : ''}, and offer to trim the extra exercises today while keeping ${c?.lift ?? 'the main lift'} as planned. End on that offer as one short question.`
    }
    case 'pattern_spotted': {
      const p = f.pattern
      if (p?.kind === 'stuck_lift') return `${p.lift} has been at ${p.weight} for ${p.sessions} sessions with no rep gained. Say it is normal and fixable, and offer the fix. End on that offer as one short question.`
      if (p?.kind === 'too_hard') return `They have answered "too hard" on ${p.times} lifts in the last week. Say tiredness is building, and offer a lighter next session so they recover. End on that offer as one short question.`
      return `Their protein has been short on ${p?.days ?? 3} days running. Offer a hand closing the gap, never naming a food. End on that offer as one short question.`
    }
    case 'session_feel': return `They finished a session ${f.finishedWhen ?? 'earlier'}. Ask how it felt; their answer helps you adjust the next one.`
    case 'session_not_logged': return "Today's planned session is still waiting and the day is getting on. Encourage a session, even a shorter one, without guilt."
    case 'missed_yesterday': return "Yesterday's planned session did not happen. Be kind, no guilt, and ask whether to move it or let it go."
    case 'comeback': return 'Nothing has been logged for three days. Do NOT mention what was missed. Offer one small, easy next step for today, warmly, with no guilt.'
    case 'door_open': return 'Nothing has been logged for two weeks. Say, warmly and with no pressure, that the door is open whenever they want to start again, and that it will start gently. Ask nothing of them.'
    case 'week_review': return `It is Saturday. This week so far: ${f.weekSessionsDone ?? 0} of ${f.weekSessionsPlanned ?? 0} planned sessions done. Name one thing that went well, give that one number, and offer to adjust next week. No guilt.`
    case 'plan_week': return 'It is Sunday. Offer to plan next week together: which days suit training, and any meals out. One short question.'
    case 'meal_not_logged': return (f.mealsAccountedToday ?? 0) >= 1
      ? 'Only one meal is logged on Nutrition today. Encourage adding the rest so the day adds up.'
      : 'Nothing is logged on Nutrition yet today. Encourage adding what they have eaten.'
    case 'protein_short': return 'They are behind on their protein target today. Encourage closing the gap this evening, with one short why. Never name a food.'
    case 'block_review': return 'A training block just finished. Be glad, and offer to look at what moved.'
    case 'beat_target': return 'They have been beating the weights you set. Say what that means, and offer to raise them.'
    default: return moment.text
  }
}

/** The brief the coach writes from. */
export function reminderPrompt(moment: CoachMoment, f: MomentFacts): string {
  const name = (f.name ?? '').trim()
  return [
    COACH_PERSONA,
    'Write ONE text message to them, the way a coach who has been watching their week texts. It must give them something: a heads-up, the session, a fix or an offer. Never a message that only checks in.',
    `What it is for: ${purpose(moment, f)}`,
    `It is ${partOfDayFor(f.localHour)} for them.${f.loggedToday ? '' : ' Nothing has been trained or logged today.'}`,
    `Start with a greeting that fits the time of day ("Hey", ${f.localHour < 12 ? '"Morning"' : f.localHour >= 17 ? '"Evening"' : '"Afternoon"'})${name ? `, then "${name}"` : ''}, and keep it to one or two short sentences, under 200 characters. Lead with the thing that matters, not with small talk.`,
    'Where it fits, add one short why in plain words, so they learn something.',
    moment.chips.length > 0 ? `It offers something: end on ONE short question, and the app puts these answers under it: ${moment.chips.map(c => `"${c}"`).join(' / ')}. Make the question one those answer.` : '',
    'Rules: no number unless it is one given above; never name a food or a drink; never say they trained, ate or did anything the facts above do not say; no lists, no formatting; at most one emoji; never mention being an AI.',
    `For reference, a plain version: "${moment.text}" Write your own, warmer and more natural; do not copy it.`,
    'Reply with the message only.',
  ].filter(Boolean).join('\n')
}

/** Words that name a food or a drink. A reminder never knows her allergies, so it never names one. */
export const FOOD = /\b(?:nuts?|peanuts?|almonds?|cashews?|walnuts?|milk|yog(?:h)?urts?|cheese|eggs?|fish|salmon|tuna|prawns?|shrimp|shellfish|soy|soya|tofu|wheat|bread|toast|oats?|porridge|rice|pasta|potato(?:es)?|chicken|beef|pork|turkey|ham|bacon|steak|lentils?|beans?|chickpeas?|hummus|banana|apples?|berries|fruit|shakes?|whey|protein\s+bars?|bars?|smoothies?|coffee|tea|juice|sesame|quark|skyr|cottage)\b/i
const AI_TALK = /\b(?:as an ai|i'?m an ai|language model|i am an ai)\b/i
const EMOJI = /\p{Extended_Pictographic}/gu

function sentenceCount(t: string): number {
  return t.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean).length
}

export type ReminderCheck = { ok: true; text: string } | { ok: false; why: string }

/** What a coach-written line is checked against: the fixed sentence it replaces, and her day. */
export interface LineRules {
  /** The app's own sentence: the only source of numbers the coach may use. */
  fixed: string
  partOfDay: 'morning' | 'afternoon' | 'evening' | null
  trainedToday: boolean | null
  /** Reminders open "Hey" (her WhatsApp shape); the chat opener greets as it likes. */
  mustOpenHey: boolean
  /** When buttons answer a question, the message must END on exactly that question. */
  mustEndWith?: string | null
  /** The message carries one-tap answers (25 Nov 2026): it must end on a question. */
  mustEndQuestion?: boolean
}

/** Is this coach-written line safe to show in place of the fixed sentence? */
export function checkCoachLine(raw: string | null | undefined, r: LineRules): ReminderCheck {
  const text = (raw ?? '').replace(/^["“]|["”]$/g, '').trim()
  if (!text) return { ok: false, why: 'empty' }
  if (text.length > MAX_REMINDER_CHARS) return { ok: false, why: 'too long' }
  if (sentenceCount(text) > 3) return { ok: false, why: 'too many sentences' }
  if (/[\n#*_`[\]]|^\s*[-•\d]+[.)]\s/m.test(text)) return { ok: false, why: 'formatting or a list' }
  if (r.mustOpenHey && !GREETING.test(text)) return { ok: false, why: 'does not open with a greeting' }
  if (r.mustEndQuestion && !text.trimEnd().endsWith('?')) return { ok: false, why: 'offers something but does not end on the question its buttons answer' }
  if (r.mustEndWith && !text.toLowerCase().endsWith(r.mustEndWith.toLowerCase())) return { ok: false, why: 'does not end on the question its buttons answer' }
  const allowed = new Set(r.fixed.match(/\d+/g) ?? [])
  const stray = (text.match(/\d+/g) ?? []).filter(n => !allowed.has(n))
  if (stray.length > 0) return { ok: false, why: `a number it was not given (${stray.join(', ')})` }
  const food = text.match(FOOD)
  if (food && !new RegExp(`\\b${food[0]}\\b`, 'i').test(r.fixed)) return { ok: false, why: `names a food (${food[0]})` }
  if (AI_TALK.test(text)) return { ok: false, why: 'talks about being an AI' }
  if ((text.match(EMOJI) ?? []).length > 1) return { ok: false, why: 'more than one emoji' }
  const claim = detectTodayClaim(text, { partOfDay: r.partOfDay, trainedToday: r.trainedToday })
  if (claim) return { ok: false, why: `a wrong claim about her day (${claim.kind})` }
  return { ok: true, text }
}

/** Is this written reminder safe to send in place of the fixed sentence? */
export function checkReminder(raw: string | null | undefined, moment: CoachMoment, f: MomentFacts): ReminderCheck {
  return checkCoachLine(raw, { fixed: moment.text, partOfDay: partOfDayFor(f.localHour), trainedToday: f.loggedToday, mustOpenHey: true, mustEndQuestion: moment.chips.length > 0 })
}

export interface WrittenReminder {
  text: string
  by: 'coach' | 'fixed'
  /** Why the coach's version was not used, when it was not. */
  why?: string
}

/**
 * THE MESSAGE TO SEND: the coach's own words when they pass, else the fixed
 * sentence. `call` returns the model's text, or null on any failure; it is
 * never trusted further than checkReminder.
 */
export async function writeReminder(
  moment: CoachMoment,
  f: MomentFacts,
  call: ((prompt: string) => Promise<string | null>) | null,
): Promise<WrittenReminder> {
  if (!call) return { text: moment.text, by: 'fixed', why: 'no writer' }
  let raw: string | null = null
  try { raw = await call(reminderPrompt(moment, f)) } catch { raw = null }
  const checked = checkReminder(raw, moment, f)
  return checked.ok ? { text: checked.text, by: 'coach' } : { text: moment.text, by: 'fixed', why: checked.why }
}

// ---------------------------------------------------------------------------
// THE CHAT OPENER, the same way (her ruling covered "reminders, the chat
// opener, check-ins"). The app still decides WHAT the opener is about
// (coach-opener.ts picks one thing from real data); the coach only says it in
// its own words. The app sends its fixed opener; nothing else about her is
// sent or needed, so the coach can only restate what the app already chose.
// ---------------------------------------------------------------------------

export interface OpenerAsk {
  /** The app's fixed opener, greeting included: the facts, and the fallback. */
  fixed: string
  partOfDay: 'morning' | 'afternoon' | 'evening' | null
  trainedToday: boolean | null
  /** The question its tap-buttons answer, when it has buttons: the message must end on it, word for word. */
  question: string | null
}

export function openerPrompt(a: OpenerAsk): string {
  return [
    COACH_PERSONA,
    'They have just opened the chat. Write the first message, the way a coach who has been watching their week texts.',
    `What the app wants said, plainly: "${a.fixed}"`,
    'Say the same thing in your own warm, natural words. Keep every fact exactly as given and add none: no new exercise, session, day, number or food.',
    a.question ? `End with exactly this question, word for word: "${a.question}"` : 'If it asks a question, end on a question.',
    `It is ${a.partOfDay ?? 'today'} for them.${a.trainedToday === false ? ' Nothing has been trained or logged today.' : ''}`,
    'One or two short sentences, under 200 characters. No lists, no formatting, at most one emoji, never mention being an AI.',
    'Reply with the message only.',
  ].join('\n')
}

export async function writeOpener(a: OpenerAsk, call: ((prompt: string) => Promise<string | null>) | null): Promise<WrittenReminder> {
  if (!call) return { text: a.fixed, by: 'fixed', why: 'no writer' }
  let raw: string | null = null
  try { raw = await call(openerPrompt(a)) } catch { raw = null }
  const checked = checkCoachLine(raw, {
    fixed: a.fixed, partOfDay: a.partOfDay, trainedToday: a.trainedToday, mustOpenHey: false,
    mustEndWith: a.question,
  })
  return checked.ok ? { text: checked.text, by: 'coach' } : { text: a.fixed, by: 'fixed', why: checked.why }
}
