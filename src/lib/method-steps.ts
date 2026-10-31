/**
 * THE METHOD AS NUMBERED STEPS (design 3b, 31 Oct 2026): the recipe sheet draws the cooking method as 1, 2, 3.
 *
 * Presentation only. The text it splits is the one `methodToShow` already decided may be shown (the amount
 * rule, then the restriction and truth check), so nothing here decides WHETHER a method is drawn. The one rule
 * this owns is that splitting loses nothing: every word of the method is in exactly one step, in order. A method
 * written one step per line keeps its lines (a leading "1." or "Step 2:" is dropped, because the sheet numbers
 * them); one written as a paragraph becomes a step per sentence.
 */
export function methodSteps(method: string): string[] {
  const lines = method
    .split(/\n+/)
    .map(l => l.replace(/^\s*(?:step\s*)?\d+\s*[.):-]\s*/i, '').trim())
    .filter(Boolean)
  if (lines.length !== 1) return lines
  // A paragraph: a new step where a sentence ends and the next one starts with a capital.
  return lines[0].split(/(?<=[.!?])\s+(?=[A-Z])/).map(s => s.trim()).filter(Boolean)
}
