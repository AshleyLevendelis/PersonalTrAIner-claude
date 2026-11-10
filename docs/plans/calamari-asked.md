# Bare "calamari" is asked about: breaded or plain

**His ruling, 10 Nov 2026: "Ask which"**, from three options (ask / block as "can't confirm it's gluten-free" /
leave it as plain squid). Allergen path, so this plan is written down with the build.

## What was wrong (measured first)

- "150g calamari" resolved to plain squid. Plain squid carries no gluten tag, so a **gluten-free** person's calamari
  passed the diet check. Calamari is very often floured or breaded.
- Said in the chat ("can I have calamari tonight?") by a gluten-free person: no clash, and the coach was free to card it.
- The shellfish side was right, and depended on the same table entry: the shellfish word list does not name squid or
  calamari, so the table is the only thing that knows calamari is shellfish.

## How it differs from Greek yoghurt and mince

Those two change the NUMBERS with their kind. This one changes an ALLERGEN TAG. So simply removing the word from the
table (what mince does) would have lost the shellfish block in the chat and in recipe steps. Instead:

1. **The word stays in the table** as squid. Only the ingredient lookup refuses it until a word says the kind.
2. **What is true of every kind is still known.** The two kinds are plain squid and the fried, floured entry.
   - a restriction BOTH break (shellfish-free, vegan, vegetarian, kosher): a definite "contains", as before;
   - a restriction NEITHER breaks (nut-free): not blocked; the food goes on to be asked about;
   - a restriction they disagree on (gluten-free): "can't confirm", refused until the kind is said.
3. **A word for the kind settles it.** Grilled, plain, boiled, steamed, chargrilled, poached, braised, tubes: squid.
   Fried, breaded, battered, crispy, crumbed, floured, salt and pepper: the fried entry (gluten). "Fried" alone is
   read as floured, the stricter reading; a phrase saying both is read as coated.

## Where the question is asked

| Where | Before | Now |
|---|---|---|
| Coach logs a meal he ate | counted as plain squid | "Was the calamari breaded or fried in flour, or plain (grilled or boiled)?" No card until he answers |
| Adding a meal by name | added, as plain squid | the same question; shellfish-free is refused outright, not asked |
| A stored meal card, gluten-free | shown as fine | "I can't confirm calamari is gluten-free, so this one's off for you." (a card cannot ask) |
| Said in the chat, gluten-free | nothing; the coach could card it | the APP's question, read off his message; no food card is built that turn, and talk offering to build it is replaced |
| Said in the chat, shellfish-free | refused in his words | unchanged |
| The meal writer | could write "calamari" | told to write "squid" or "fried calamari"; a bare one drops the dish |

The chat's sentence (mine, his to change): *"Is the calamari breaded or fried in flour, or plain (grilled or
boiled)? Breaded or floured calamari has gluten in it, and your profile says gluten-free, so I need to know before I
suggest it or add it to your meals."*

## Not done, named

- "Squid rings" and bare "squid" stay plain squid: the ruling was about the word "calamari".
- Whether the deployed coach asks by itself is model behaviour (its instructions now say so; the exam grades it). The
  app's half does not depend on it.
- Stored meals holding a bare "calamari" line are not repaired (no live users); such a card reads "can't confirm" for
  a gluten-free person.
- Octopus and cuttlefish are not in the shellfish word list either; not looked at here.

## Checks

`test:calamari-asked`, `verify:named-food-clash` §7-9, `test:food-figures`. Needs the `chat-gemini` and
`generate-meals` deploys for the coach's food table and both instruction lines.
