// ---------------------------------------------------------------------------
// THE COACH NEVER QUOTES A PAST LIFT THE LOGS DO NOT HOLD (his report 17 Nov 2026, a profile started the day before):
// "Aim for 72.5kg ... because you killed 70kg for 8 reps last week." He had never done a trap bar deadlift, and there
// was no last week. Traced: the coach's own instructions carried a worked example, "Last session you hit 70kg x 8 on
// bench. Try 72.5kg x 8 today", and today's plan figure was 72.5kg, so the example was copied as his history.
//
// The example is gone from the prompt. This is the part code can hold: a sentence in the reply that states what he
// lifted BEFORE ("last week", "last session", "yesterday", "you killed / lifted ... kg") with a weight that
// appears nowhere in the logged sets the app sent the coach is taken out of the reply. A sentence the logs do support
// stays, and so does every sentence about today's target. When the whole reply would go, it is left as it was (a
// reply never goes out empty) and the case is logged.
// ---------------------------------------------------------------------------

/** A sentence about something he lifted before, with a weight in it. */
// A time in the past, or a verb that can only be past ("you killed 70kg"). "Once you hit 75kg" is about the future and
// is not caught: "hit", "did" and "got" alone say nothing about when.
const PAST_CLAIM = /\b(?:last\s+(?:week|session|time|workout|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|yesterday|previous(?:ly)?|you\s+(?:killed|smashed|crushed|nailed|lifted|pulled|pressed|squatted|benched))\b/i
const KG = /(\d+(?:\.\d+)?)\s*(?:kg|kilos?)\b/gi

/** Every weight (kg) the logged sets mention. */
export function loggedWeights(history: string): Set<string> {
  const out = new Set<string>()
  for (const m of (history ?? '').matchAll(/(\d+(?:\.\d+)?)\s*kg/gi)) out.add(String(Number(m[1])))
  return out
}

/** The reply with every unsupported past-lift sentence taken out, and how many were. */
export function dropUnloggedPastLifts(reply: string, history: string): { text: string; dropped: number } {
  const logged = loggedWeights(history)
  let dropped = 0
  // Sentences, keeping paragraphs: split each line into sentences and rebuild.
  const lines = (reply ?? '').split('\n').map(line => {
    const sentences = line.split(/(?<=[.!?])\s+/)
    const kept = sentences.map(sentence => {
      if (!PAST_CLAIM.test(sentence)) return sentence
      const weights = [...sentence.matchAll(KG)].map(m => String(Number(m[1])))
      // Kept when any weight in it is one he logged: "You pressed 34kg last session, so try 36kg today" names his real
      // set and today's target in one breath.
      if (weights.length === 0 || weights.some(w => logged.has(w))) return sentence
      // A sentence mixing a past claim with today's target ("Aim for 72.5kg because you hit 70kg last week") keeps
      // the target: the clause from "because" / "since" / ", as" on is what goes.
      const cut = sentence.search(/\s*(?:,\s*)?\b(?:because|since|as|after)\b\s+you\b/i)
      if (cut > 0) {
        const head = sentence.slice(0, cut).trim()
        const headWeights = [...head.matchAll(KG)].map(m => String(Number(m[1])))
        if (!PAST_CLAIM.test(head) || headWeights.some(w => logged.has(w))) { dropped++; return head.replace(/[,;:]$/, '') + '.' }
      }
      dropped++
      return null
    }).filter((s): s is string => s !== null)
    return kept.join(' ')
  })
  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!text) return { text: reply, dropped: 0 }
  return { text, dropped }
}

/** The response, with the check applied to its reply. Nothing else in it changes. */
export async function guardPastLifts(res: Response, history: unknown, log: (...a: unknown[]) => void = console.log): Promise<Response> {
  const type = res.headers.get('Content-Type') ?? ''
  if (!type.includes('application/json')) return res
  const body = await res.clone().json().catch(() => null) as { reply?: unknown } | null
  if (!body || typeof body.reply !== 'string' || !body.reply.trim()) return res
  const { text, dropped } = dropUnloggedPastLifts(body.reply, typeof history === 'string' ? history : '')
  if (dropped === 0) return res
  log(`past-lifts dropped=${dropped}`)
  return new Response(JSON.stringify({ ...body, reply: text }), { status: res.status, headers: res.headers })
}
