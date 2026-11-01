// ---------------------------------------------------------------------------
// VOICE TYPING SAYS EACH WORD ONCE (1 Nov 2026).
//
// Ashley, on her Android phone, said "what is the plan ..." into the chat and got
// "what what is what is what is the what is the what is the plan what is". The phone's
// speech engine, in continuous mode, does not hand back one result per phrase: it hands
// back a NEW result for each growing guess at the same phrase ("what", "what is",
// "what is", "what is the", ...), each one already marked final. The hook joined every
// final result with a space, which is right on a desktop browser (one result per
// phrase) and turns every guess into repeated words on Android.
//
// The rule here works on both: walk the results in order and, when one simply
// EXTENDS (or repeats) the result just before it, it replaces that result instead of
// being added after it. A result that is a shorter copy of the one before it (a guess
// the engine took back) is dropped. Anything else is a new phrase and is added.
// Compared word by word, ignoring case and punctuation, so "What is" and "what is,"
// are the same guess, and "what" is never read as the start of "whatever".
//
// THE COST, named: saying the very same phrase twice in a row ("no ... no") keeps one.
// That is the price of not repeating every guess, and a phrase can be typed again.
// ---------------------------------------------------------------------------

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/** True when every word of `a` begins `b`, in order (so `b` is `a` said again, or `a` and more). */
function startsWithWords(b: string[], a: string[]): boolean {
  if (a.length === 0 || a.length > b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/**
 * The text to show for a run of recognition results, in order: finals first, then the
 * one still being heard (if any). Each result is folded into the one before it when it
 * extends or repeats it, so a phrase the engine re-guessed five times appears once.
 */
export function mergeSpeechSegments(segments: readonly string[]): string {
  const kept: { text: string; w: string[] }[] = []
  for (const raw of segments) {
    const text = (raw ?? '').trim()
    const w = words(text)
    if (w.length === 0) continue
    const prev = kept[kept.length - 1]
    if (prev && startsWithWords(w, prev.w)) {
      kept[kept.length - 1] = { text, w } // the same phrase, said again or longer
      continue
    }
    if (prev && startsWithWords(prev.w, w)) continue // a shorter copy of what is already there
    kept.push({ text, w })
  }
  return kept.map(k => k.text).join(' ')
}
