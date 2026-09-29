# One dish, edited: variety counts the dish, not the name

29 Sep 2026, Ashley's list, item 3 of 3: *"A meal with a food added (your
yoghurt bowl with honey) counts as a different dish, so the app thinks it's
giving variety when it isn't."* Mechanical, so no ruling was needed.

## What was wrong, measured

An edit never changes a meal; it stores a NEW option beside it, named
`<meal> + <food>` (food add), `<meal> without <food>`, `<meal> with ...`
(replace and resize) or `<meal> (as dinner)` (slot move). Every variety rule
compared dishes by NAME: "was this served yesterday?", "the last three days",
"which has rested longest", and the rule that a leftover lunch gives way to a
dinner that is the same dish. So the plain bowl on Monday and the honey bowl on
Tuesday read as two dishes.

Measured on 60 seeded pools (four real-food dishes a meal, three meals a day,
one edited copy of one dish per meal), consecutive days serving the SAME DISH:

| pool | same name back to back | same dish back to back |
|---|---|---|
| no edited copy | 524 | 524 |
| an edited copy, before | 395 | **601** |
| an edited copy, after | 500 | 536 |

Variety scored better and got worse: the copy looked like a change and was
served straight after its base. After the fix the residue (+12 of 1,080) is
the copy giving the search more combinations that fit, which is what it is
for.

## The fix

`meal-dish-identity.ts`: a dish has an identity, and an edited copy shares its
base's. Read by NAME, not by a tag, because a tag would only reach meals edited
from now on and this has to work on the plan she already has. The base is
another option in the same pool whose name the copy's name STARTS WITH, followed
by one of the builders' own connectors. Two things stop that misfiring:

- only options tagged `user-requested` are read as copies. Every option an edit,
  an addition or a custom meal makes carries it and no generated option does, so
  a generated "Salmon with New Potatoes" beside a generated "Salmon" stay two
  dishes;
- the connector is required, so a requested "Salmon bowl" is not a copy of
  "Salmon".

The longest matching base wins, so a requested "Salmon with New Potatoes + rice"
is a copy of "Salmon with New Potatoes" and not of "Salmon".

Used by the variety cost (history and options both mapped to identities, once
per day rather than per combination: the search was made 44x faster on 28 Sep
and this must not undo it) and by the two places a leftover lunch yields to a
dinner that is "the same dish".

## What it does not change

Nothing is merged or deleted: the copy stays a separate option she can pick,
swap to and see. It only stops counting as a *change* from its base. Portions,
targets, bands and verification are untouched. Pinned meals are still served as
pinned.

## Gates

`test:meal-variety` §8: who is a copy of whom (each connector, chains, the two
false positives with their twins, the longest base), the ranking in both
directions with the copy the closest fit, the seeded population, and the
leftover. Mutation-tested.
