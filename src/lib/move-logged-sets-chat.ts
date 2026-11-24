import { resolveExerciseName, isNamedByTheUser } from './set-parse'

// The chat's half of move-logged-sets.ts, in its own file so the Exercise screen's sheet does not pull the message
// reader (set-parse) into the app's first download (test:bundle, 24 Nov 2026).
/**
 * WHAT THE CHAT'S MOVE MEANS, OR WHAT TO ASK (24 Nov 2026). The exercise logged by mistake must be one on today's own
 * log (the 15 Sep rule: a correction points at what the app wrote down, never at a name the model offers); the exercise
 * he did must be in his own words and in the catalogue (the 14 Sep rule: nothing goes into history under a name he did
 * not say). Anything less is asked about in plain words and nothing is written.
 */
export type ChatMoveDecision =
  | { kind: 'move'; fromName: string; toId: string; toName: string }
  | { kind: 'ask'; say: string }

export function decideChatMove(input: { fromPhrase: string; toPhrase: string; userSaid: string; loggedNames: string[] }): ChatMoveDecision {
  const { fromPhrase, toPhrase, userSaid, loggedNames } = input
  const list = (names: string[]) => names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
  if (loggedNames.length === 0) return { kind: 'ask', say: "I can't see anything logged today to move. Which day was it?" }
  const fromRes = resolveExerciseName(fromPhrase, loggedNames)
  const fromCands = fromRes.resolution === 'resolved' ? [fromRes.exerciseName]
    : fromRes.resolution === 'ambiguous' ? fromRes.candidates.map(c => c.name) : []
  const onLog = [...new Set(fromCands.filter(n => loggedNames.includes(n)))]
  const fromName = onLog.length === 1 ? onLog[0] : loggedNames.length === 1 ? loggedNames[0] : null
  if (!fromName) return { kind: 'ask', say: `Which exercise did you log by mistake: ${list(loggedNames)}?` }
  if (!toPhrase.trim() || !isNamedByTheUser(toPhrase, userSaid)) return { kind: 'ask', say: `Which exercise did you actually do instead of ${fromName}?` }
  const toRes = resolveExerciseName(toPhrase, [])
  if (toRes.resolution === 'ambiguous') return { kind: 'ask', say: `Which one did you do: ${list(toRes.candidates.map(c => c.name).slice(0, 4))}?` }
  if (toRes.resolution !== 'resolved') return { kind: 'ask', say: `I couldn't find "${toPhrase.trim()}" in the exercise list. What's it called?` }
  if (toRes.exerciseName === fromName) return { kind: 'ask', say: `${fromName} is already what's logged. Which exercise did you actually do?` }
  return { kind: 'move', fromName, toId: toRes.exerciseId, toName: toRes.exerciseName }
}
