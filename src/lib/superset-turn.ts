// ---------------------------------------------------------------------------
// WHOSE TURN IT IS IN A SUPERSET, AND WHEN THE REST COMES (gym dry run, 28 Nov 2026; his "fix the superset").
//
// The card has always said "alternate — no rest between", and the Log button ignored it: it ran every set of A1
// (resting between them) before A2's first. He follows the button, so the pair was trained as two straight sets.
//
// The rule (CSCS, mine): a superset is done in ROUNDS. A1 set 1, A2 set 1, rest, A1 set 2, A2 set 2, rest... Whoever
// has done the fewest sets goes next (a tie goes to the earlier member), and the rest comes only once every member
// that still has a set to do has done this round's. A member with more sets than the other (3 holds beside 2 carries)
// finishes alone, resting between its sets as an ordinary exercise does. Warm-ups are not rounds: the card already
// says "ramp A1 first, then start the pairing", and nothing here counts them.
//
// One function for the button's "now" and one for the rest, both reading the same counts, so the two cannot disagree.
// ---------------------------------------------------------------------------

export interface SupersetMember {
  exIndex: number
  /** Working sets prescribed. */
  sets: number
  /** Working sets logged so far. */
  logged: number
}

/** The member whose set comes next, or null when every member is done. */
export function supersetTurn(members: readonly SupersetMember[]): number | null {
  let best: SupersetMember | null = null
  for (const m of members) {
    if (m.logged >= m.sets) continue
    if (!best || m.logged < best.logged) best = m
  }
  return best ? best.exIndex : null
}

/**
 * Whether logging set `setNumber` of member `exIndex` ends the round, and so starts the rest. False while another
 * member still owes this round's set: then he goes straight to it, no rest between.
 */
export function restAfterSupersetSet(members: readonly SupersetMember[], exIndex: number, setNumber: number): boolean {
  return !members.some(m => m.exIndex !== exIndex && m.logged < setNumber && m.logged < m.sets)
}
