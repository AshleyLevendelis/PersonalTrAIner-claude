// ---------------------------------------------------------------------------
// ONE QUESTION PER SCREEN — design handoff 2e, 10 Oct 2026.
//
// A coach turn often opens with a sentence or two ("Nice — four days works.")
// before the question it asks. The setup screen sets the QUESTION large and
// the lead-in small above it, so this finds the question: the last sentence
// that ends in "?". With no question mark the whole line is the question, so
// nothing the coach said is ever dropped.
// ---------------------------------------------------------------------------

/** [lead-in, question]. The two always join back into the whole message. */
export function splitQuestion(text: string): [string, string] {
  const trimmed = text.trim()
  const m = /(?:^|[.!?\n])\s*([^.!?\n]*\?)\s*$/.exec(trimmed)
  if (!m || !m[1].trim()) return ['', trimmed]
  const ask = m[1].trim()
  return [trimmed.slice(0, trimmed.length - m[0].length + m[0].indexOf(m[1])).trim(), ask]
}
