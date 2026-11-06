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
//   - not opening "Hey", her WhatsApp shape ("Hey Ashley, are you ready...").
// Any refusal, a slow or failed call, or no key: the fixed sentence goes.
//
// Everything that touches the world is handed in (`call`), so
// test:reminder-writer drives this exact code with a fake.
// ---------------------------------------------------------------------------
import type { CoachMoment, MomentFacts } from './coach-moments.ts'
import { detectTodayClaim } from './today-claim.ts'

export const MAX_REMINDER_CHARS = 240

/** The part of the day on her clock, in the today-claim check's words. */
export function partOfDayFor(hour: number): 'morning' | 'afternoon' | 'evening' {
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
}

/** What this moment is for, said to the coach. Only what the app knows. */
function purpose(moment: CoachMoment, f: MomentFacts): string {
  switch (moment.key) {
    case 'workout_today': return 'Today is a training day and nothing is logged yet. Get them ready and keen for it.'
    case 'session_feel': return `They finished a session ${f.finishedWhen ?? 'earlier'}. Ask how it felt; their answer helps you adjust the next one.`
    case 'session_not_logged': return "Today's planned session is still waiting and the day is getting on. Encourage a session, even a shorter one, without guilt."
    case 'missed_yesterday': return "Yesterday's planned session did not happen. Be kind, no guilt, and ask whether to move it or let it go."
    case 'week_gone_quiet': return 'Nothing has been logged for a week or more. Be warm, no guilt, and invite a small first step back.'
    case 'streak_at_risk': return `They have ${f.streakDays} sessions in a row and today's is due. Be glad for the run and encourage keeping it going.`
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
    "You are this person's fitness and nutrition coach: warm, encouraging, knowledgeable, in their corner. Write ONE text message to them, the way a good coach texts.",
    `What it is for: ${purpose(moment, f)}`,
    `It is ${partOfDayFor(f.localHour)} for them.${f.loggedToday ? '' : ' Nothing has been trained or logged today.'}`,
    `Start with "Hey${name ? ` ${name}` : ''}," and keep it to one or two short sentences, under 200 characters.`,
    'Where it fits, add one short why in plain words, so they learn something.',
    'Rules: no number unless it is one given above; never name a food or a drink; never say they trained, ate or did anything the facts above do not say; no lists, no formatting; at most one emoji; never mention being an AI.',
    `For reference, a plain version: "${moment.text}" Write your own, warmer and more natural; do not copy it.`,
    'Reply with the message only.',
  ].join('\n')
}

/** Words that name a food or a drink. A reminder never knows her allergies, so it never names one. */
const FOOD = /\b(?:nuts?|peanuts?|almonds?|cashews?|walnuts?|milk|yog(?:h)?urts?|cheese|eggs?|fish|salmon|tuna|prawns?|shrimp|shellfish|soy|soya|tofu|wheat|bread|toast|oats?|porridge|rice|pasta|potato(?:es)?|chicken|beef|pork|turkey|ham|bacon|steak|lentils?|beans?|chickpeas?|hummus|banana|apples?|berries|fruit|shakes?|whey|protein\s+bars?|bars?|smoothies?|coffee|tea|juice|sesame|quark|skyr|cottage)\b/i
const AI_TALK = /\b(?:as an ai|i'?m an ai|language model|i am an ai)\b/i
const EMOJI = /\p{Extended_Pictographic}/gu

function sentenceCount(t: string): number {
  return t.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean).length
}

export type ReminderCheck = { ok: true; text: string } | { ok: false; why: string }

/** Is this written message safe to send in place of the fixed sentence? */
export function checkReminder(raw: string | null | undefined, moment: CoachMoment, f: MomentFacts): ReminderCheck {
  const text = (raw ?? '').replace(/^["“]|["”]$/g, '').trim()
  if (!text) return { ok: false, why: 'empty' }
  if (text.length > MAX_REMINDER_CHARS) return { ok: false, why: 'too long' }
  if (sentenceCount(text) > 3) return { ok: false, why: 'too many sentences' }
  if (/[\n#*_`[\]]|^\s*[-•\d]+[.)]\s/m.test(text)) return { ok: false, why: 'formatting or a list' }
  if (!/^hey\b/i.test(text)) return { ok: false, why: 'does not open "Hey"' }
  const allowed = new Set(moment.text.match(/\d+/g) ?? [])
  const stray = (text.match(/\d+/g) ?? []).filter(n => !allowed.has(n))
  if (stray.length > 0) return { ok: false, why: `a number it was not given (${stray.join(', ')})` }
  const food = text.match(FOOD)
  if (food) return { ok: false, why: `names a food (${food[0]})` }
  if (AI_TALK.test(text)) return { ok: false, why: 'talks about being an AI' }
  if ((text.match(EMOJI) ?? []).length > 1) return { ok: false, why: 'more than one emoji' }
  const claim = detectTodayClaim(text, { partOfDay: partOfDayFor(f.localHour), trainedToday: f.loggedToday })
  if (claim) return { ok: false, why: `a wrong claim about her day (${claim.kind})` }
  return { ok: true, text }
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
