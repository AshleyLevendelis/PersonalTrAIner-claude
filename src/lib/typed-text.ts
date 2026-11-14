// ---------------------------------------------------------------------------
// A PHONE TYPES CURLY APOSTROPHES (QA of setup, 14 Nov 2026). iPhone smart punctuation turns "can't" into "can’t",
// and every reader the app has for typed words was written for the straight one: "I can’t do Monday" recorded
// Monday as his only day, "I’m pregnant" was not read, "I don’t eat pork" was not put in Foods to avoid. What he
// types is made plain here, once, before the app's own readers see it.
// ---------------------------------------------------------------------------
export function plainTyped(text: string): string {
  return text.replace(/[‘’‛ʼ′]/g, "'").replace(/[“”‟″]/g, '"')
}
