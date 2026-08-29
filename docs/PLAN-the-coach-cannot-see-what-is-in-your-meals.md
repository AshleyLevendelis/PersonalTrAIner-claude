# The coach cannot see what is in your meals

**Status: plan only. Not built.** Dietary enforcement gets a plan before a
build (CLAUDE.md), even when the fix looks obvious — and this one does.

## What Ashley hit

She told the coach *"I dont want almond butter in my food choices. Remove it"*,
then *"Remove almond butter from my meal plan"*. It replied:

> "I've removed almond butter from your future meal suggestions. **Looking at
> your plan for today, none of your scheduled meals actually contain almond
> butter, so you're all set.**"

Her breakfast at that moment was a Greek Yoghurt Berry Crunch Bowl containing
**13g almond butter**. The sentence is false, it is specific, and it claims to
have *looked*.

Her two complaints, in her words: *"it didn't even offer to remove it from my
meal"*, and *"it confirmed it removed it but it was still in my meal."*

## One root cause

`ChatAssistant.tsx:678` builds everything the coach knows about food:

```ts
const mealSummary = mealPlan
  .map(m => `${m.meal}: ${m.items.map(i => `${i.name} (${i.calories} kcal, …)`).join(', ')}`)
  .join('\n')
```

**Dish names and macros. No ingredients.** So the coach sees
`Breakfast: Greek Yoghurt Berry Crunch Bowl (584 kcal, P:35g C:82g F:15g)`
and nothing else. Asked whether almond butter is in there, it cannot know —
and answered anyway, confidently.

Both of Ashley's complaints fall out of this single gap. It could not offer to
remove almond butter from today's breakfast because it did not know it was
there.

## The app already knows — and said so on the previous turn

`ChatAssistant.tsx:1461`, the receipt rendered one message earlier, scans the
same `mealPlan` for the disliked phrase across **`i.ingredients`** and prints:

> **Today's Breakfast** — still has it — swap from the Nutrition tab if you
> don't want it today

That row appeared in Ashley's screenshot. The item name does not contain
"almond butter", so it matched on the ingredients array — **live proof that
`ingredients` is populated on today's plan**. The knowledge exists on the same
object, one function away, and is simply not passed on.

So the transcript contains the app being right and then the model being wrong
about the same fact, two messages apart.

## The build

### 1. Put ingredients in the summary — `ChatAssistant.tsx:678`

Append each item's ingredient names to its line. Names only, no quantities:
enough to answer "is X in this?", not enough to invite the model to recompute
macros it is already forbidden to state. Cap per item and mark truncation
honestly (`+3 more`) so a long recipe cannot silently become a short one — a
truncated list read as complete is the same bug in a new place.

Cost is small: Ashley's breakfast is 6 short strings, a day is ~5 meals.

### 2. Say what the summary is, in the prompt — `chat-gemini/index.ts:1469`

The model was never told the summary was partial, so treating it as complete
was reasonable. Label it, and state the rule that follows: an ingredient list
shown is what the app has; if a meal has no list, say so rather than inferring
from the dish name.

### 3. Extend the honesty rule past allergens — `index.ts:987`

ALLERGEN HONESTY already forbids exactly this sentence shape — *"never state
or imply a meal 'is X-free' or 'won't contain' X"* — but only for the eight
tagged allergen categories. Almond butter came in as a **preference**, so
nothing covered it, and the model produced a textbook "is X-free" claim.

The reason the rule exists (matching is imperfect; state the action, not the
verification) applies identically to preferences. Extend it: a claim about
what a meal contains is only allowed against a list actually in front of it.

### 4. Offer the swap — Ashley's first complaint

When a hard food dislike is recorded and today's plan still contains it, the
receipt currently ends at *"swap from the Nutrition tab if you don't want it
today"* — an instruction to go and do it herself. With (1) in place the coach
can offer instead, through the **existing** `propose_meal_swap` tool, which
already renders a before/after macro card she confirms herself.

Follows the established convention rather than inventing one: the app proposes
and the user taps Confirm. Nothing silently rewrites a plan she is looking at.

## Not in scope

- **Changing what regeneration does.** The "excluded starting your next meal
  regenerate" promise is real and was verified: `verifyProposal`
  (`meal-generation.ts:297`) hard-filters candidates whose ingredient names
  contain the disliked phrase. That half works.
- **Synonyms.** "almond butter" will not catch "almond paste". The avoid-list
  is documented as literal word-matching and the honesty rules already say so.
  Widening it is a separate decision.

## Verification

New gate `test:coach-sees-ingredients`:

- the summary builder emits ingredients for an item that has them, and says
  so honestly for one that does not
- truncation is labelled, and the label is not itself truncatable
- the summary a known day produces **contains the string a dislike would be
  matched against** — i.e. the receipt's scan and the coach's context can
  never disagree, which is the exact divergence in Ashley's transcript
- the prompt carries the extended honesty rule, and the allergen rule is not
  weakened by the edit
- mutations: drop ingredients from the summary; remove the truncation marker;
  revert the honesty rule to allergen-only

Then `test:chat-actions`, `test:chat-app-reality`, `test:coach-promises`,
`test:memory`, `test:soft-preferences`.

**`test:meal-quality` still cannot run in the sandbox** (needs the TEST
project). It is the gate that proves end-to-end that a filtered ingredient
never reaches a plate, so it stays Ashley's machine.

## Deploy

Two halves, and they are independent:

- **(1) is client-side** — ships with the Vercel push, and is the half that
  makes the coach able to see the ingredient at all.
- **(2) and (3) are prompt changes** — inert until
  `npm run deploy:functions:prod -- chat-gemini`, which is already outstanding
  for two other rules.

Worth stating plainly: shipping (1) alone still leaves a model that has never
been told the list is authoritative. (1) removes the blindness; (3) removes
the licence to guess. The honest order is both, together.
