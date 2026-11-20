// ---------------------------------------------------------------------------
// THE CHAT'S CONTEXT STRIP (design handoff, Chat 2b, 31 Oct 2026): small pills
// under the header saying where today stands, built from the SAME readings
// Home and Nutrition draw — never a second calculation.
//
//   - mid-session: "<focus> · N of M sets", tapping opens Exercise. The count
//     is sessionSetCount (Home's "N of M sets", the strips' and the coach's);
//   - session done: "Session done · 45 min", static, no link. The minutes are
//     Home's own (the finish card's, else the session row's);
//   - rest day, a moved day, not started yet, or not known: no workout pill;
//   - "1,410 kcal left" (or "120 kcal over"), tapping opens Nutrition, through
//     the phrasebook's kcalLeftOrOver, the words Nutrition's hero uses;
//   - nothing to say: no strip at all.
//
// DELIBERATE DEVIATION FROM THE DESIGN'S COPY, kept: the design drew "set 2 of
// 12" (the set she is on). The app counts sets LOGGED, and Home says "N of M
// sets", so the pill says that too: one count, one wording.
// REMOVED FROM THE CHAT, 20 Nov 2026 (his request: "The session done and kcal left in the chat is unnecessary"): the
// strip of pills is gone. What stays is the calorie wording, which the coach's own today-numbers still use.
// ---------------------------------------------------------------------------
import { kcalLeftOrOver } from './coach-voice'

/** "1,410 kcal left" / "120 kcal over" — Nutrition's hero, word for word. */
export function kcalPillText(target: number, eaten: number): string {
  const [amount, word] = kcalLeftOrOver(target - eaten).split(' ')
  return `${Number(amount).toLocaleString()} kcal ${word}`
}
