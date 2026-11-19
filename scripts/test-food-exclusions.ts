/**
 * test:food-exclusions — "I don't eat pork", said in passing, goes into Foods
 * to avoid with a tick; and setup stops promising what it cannot check.
 *
 * Ashley's ruling of 9 Oct 2026, "Build all four", items 1 and 2 (test log
 * H12, H13; tracer D). Plan: docs/plans/food-exclusions-said-in-passing.md.
 *
 * The property that failed in H12 is checked end to end: a word the app
 * captures must actually BLOCK its food through the real avoid filter —
 * "mushrooms and pork" was saved as one avoid that blocked nothing.
 * One exit; every check runs every time.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { detectFoodExclusions, mergeFoodsToAvoid, isFoodToAvoid } from '../src/lib/food-exclusions'
import { splitFoodList, readFoodList, unreadFoodLine } from '../src/lib/food-list'
import { containsPhrase } from '../src/lib/meal-ingredients'
import { assembleProfile, initialSlotValues } from '../src/lib/onboarding-slots'
import { allergenFilterReceipt } from '../src/lib/coach-voice'
// The limit sentence, read back out of the receipt itself: the phrasebook keeps it private.
const ALLERGEN_FILTER_LIMIT = allergenFilterReceipt(['X']).replace(/^X filter on\. /, '')

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let ran = 0
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const raw = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const code = (f: string) => raw(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const blocks = (avoid: string, food: string) => containsPhrase(food, [food], avoid)

console.log('\n1. A typed list is one food per item')
{
  const CASES: [string, string[]][] = [
    ['mushrooms and pork', ['mushrooms', 'pork']], ['mushrooms, pork & olives', ['mushrooms', 'pork', 'olives']],
    ['pork or beef', ['pork', 'beef']], ['no pork please', ['pork']], ['any mushrooms at all', ['mushrooms']],
    ['none', []], ['Nothing', []], ['coriander/celery', ['coriander', 'celery']], ['Mushrooms', ['mushrooms']],
  ]
  const wrong = CASES.map(([t, want]) => [t, splitFoodList(t), want] as const).filter(([, got, want]) => JSON.stringify(got) !== JSON.stringify(want))
  check(`${CASES.length} typed lists split into foods`, wrong.length === 0, wrong)
}

console.log('\n2. Said in passing: caught when it is a plain "I don\'t eat X", and only then')
{
  const CATCH: [string, string[]][] = [
    ["I'm allergic to tree nuts, and I don't eat pork", ['pork']],  // the test log, word for word
    ["I don't eat pork", ['pork']], ['I can\'t stand mushrooms', ['mushrooms']], ['I never eat red meat', ['red meat']],
    ['No pork for me please', ['pork']], ["I'm not a fan of mushrooms or olives", ['mushrooms', 'olives']],
    ["I don't do dairy", ['dairy']], ["I'm allergic to mushrooms", ['mushrooms']], ["we don't eat beef because of religion", ['beef']],
    ["I don't eat pork or shellfish", ['pork', 'shellfish']], ["I won't eat bacon, ham or sausages", ['bacon', 'ham', 'sausages']],
    ["I don't eat pork anymore", ['pork']],
  ]
  const missed = CATCH.map(([t, want]) => [t, detectFoodExclusions(t), want] as const).filter(([, got, want]) => JSON.stringify(got) !== JSON.stringify(want))
  check(`${CATCH.length} plain statements are caught, exactly`, missed.length === 0, missed)
  const LEAVE: string[] = [
    "I don't eat much fish", "I don't eat meat on weekdays", "I don't eat after 8pm", "I don't eat breakfast",
    "I don't like cardio", "I don't have any milk", 'I hate burpees', "I don't really like mushrooms", 'I love pork',
    "I don't usually have bread", 'I had pork last night', "I don't eat red meat often",
    // the qualifier binds even when one of the foods is plain: not "pork" from these
    "I don't eat pork or beef on weekdays", "I don't eat bread or pasta before training",
  ]
  const caught = LEAVE.map(t => [t, detectFoodExclusions(t)] as const).filter(([, got]) => got.length > 0)
  check(`${LEAVE.length} statements that are a habit, a time, the fridge or not food capture NOTHING`, caught.length === 0, caught)
  check('"breakfast" and "cardio" are not foods; "pork", "beef", "mushrooms" are', !isFoodToAvoid('breakfast') && !isFoodToAvoid('cardio') && isFoodToAvoid('pork') && isFoodToAvoid('beef') && isFoodToAvoid('mushrooms'))
}

console.log('\n3. What is captured actually blocks the food (the H12 failure)')
{
  const PAIRS: [string, string][] = [['pork', 'pork chop'], ['pork', 'bacon'], ['pork', 'ham'], ['mushrooms', 'mushroom'],
    ['beef', 'beef mince 5% fat'], ['sausages', 'pork sausage'], ['sausages', 'vegan sausage'], ['red meat', 'lamb chop'], ['dairy', 'cheddar cheese']]
  const leaks = PAIRS.filter(([avoid, food]) => !blocks(avoid, food))
  check(`each of ${PAIRS.length} captured words blocks its food through the real avoid filter`, leaks.length === 0, leaks)
  check('"mushrooms and pork" as ONE avoid blocks nothing (why the split matters)', !blocks('mushrooms and pork', 'pork chop') && !blocks('mushrooms and pork', 'mushroom'))
  const profile = assembleProfile({ ...initialSlotValues(), dislikedFoods: 'mushrooms and pork' })
  check('setup\'s answer "mushrooms and pork" becomes two avoids, and each blocks its food',
    JSON.stringify(profile.disliked_foods) === JSON.stringify(['mushrooms', 'pork']) && blocks('pork', 'bacon') && blocks('mushrooms', 'mushroom'), profile.disliked_foods)
  const m = mergeFoodsToAvoid(['Mushrooms'], ['mushroom', 'pork', 'pork'])
  check('merging never repeats a food (case and a plural do not make a new one)', JSON.stringify(m.list) === JSON.stringify(['Mushrooms', 'pork']) && JSON.stringify(m.added) === JSON.stringify(['pork']), m)
}

console.log('\n4. The app\'s own words when an allergy is switched on (H13)')
{
  const one = allergenFilterReceipt(['Nut-free'])
  check('the receipt says what was done, in the meal screens\' own sentence', one === `Nut-free filter on. ${ALLERGEN_FILTER_LIMIT}`, one)
  check('...and never promises anything about every meal', !/kept out|every meal|entirely|absolutely|guarantee/i.test(one + allergenFilterReceipt(['Nut-free', 'Dairy-free'])))
  check('two filters read as two', allergenFilterReceipt(['Nut-free', 'Dairy-free']).startsWith('Nut-free and Dairy-free filters on.'))
  const screens = ['src/components/MealPlan.tsx', 'src/components/GroceryList.tsx'].map(raw)
  check('the limit sentence read out of the receipt is a real sentence (an empty one is in every screen)', /^Ingredients are filtered, not verified\./.test(ALLERGEN_FILTER_LIMIT), ALLERGEN_FILTER_LIMIT)
  check('the sentence is word for word what the meal screens print (MealPlan and GroceryList)', screens.every(sc => sc.replace(/\s+/g, ' ').includes(ALLERGEN_FILTER_LIMIT)))
  const appText = ['src/components/onboarding/ConversationalOnboarding.tsx', 'src/lib/onboarding-slots.ts', 'src/lib/coach-voice.ts'].map(code).join('\n')
  check('no app-authored setup string says "kept out of every meal"', !/kept out of every meal/i.test(appText))
}

console.log('\n5. Setup: the backstop, the summary edit, the guard')
{
  const onb = code('src/components/onboarding/ConversationalOnboarding.tsx')
  const send = onb.slice(onb.indexOf('const sendMessage'), onb.indexOf('const settleEdit'))
  check('every typed message is read for foods she does not eat, and they are added to Foods to avoid',
    send.length > 1000 && /detectFoodExclusions\(trimmed\)/.test(send) && /mergeFoodsToAvoid\(splitFoodList\(ws\.values\.dislikedFoods\),\s*saidNotToEat\)/.test(send)
    && /applySlot\(ws,\s*'dislikedFoods',\s*capturedFoods\.list\.join\(', '\),\s*ws\.values\)/.test(send))
  check('...BEFORE the coach is asked (committed with the turn, so the model sees it answered)',
    send.indexOf('detectFoodExclusions(') > 0 && send.indexOf('detectFoodExclusions(') < send.indexOf('functions/v1/onboarding-chat'))
  check('the coach can add to Foods to avoid but never take one off: after its actions, the list as the turn began is put back',
    /executeActions\(responseWs[\s\S]{0,3000}mergeFoodsToAvoid\(splitFoodList\(responseWs\.values\.dislikedFoods\),\s*splitFoodList\(ws\.values\.dislikedFoods\)\)\s*if \(keptFoods\.added\.length > 0\) applySlot\(responseWs,\s*'dislikedFoods'/.test(send))
  check('"Change Foods to avoid" from the summary is settled in code: split into foods, saved, no model call',
/if \(!preRecorded && editingKey === 'dislikedFoods' && \(isPlainNone\(trimmed\) \|\| \(typedFoods\.length > 0 && typedFoods\.every\(isFoodToAvoid\)\)\)\) \{[\s\S]{0,200}applySlot\(edit,\s*'dislikedFoods',\s*typedFoods\.join\(', '\),\s*values\)\s*&&\s*settleEdit\(edit,\s*trimmed\)\)\s*return/.test(send)
    && send.indexOf("editingKey === 'dislikedFoods'") < send.indexOf('setBusy(true)'))
  check('the allergy tick is the phrasebook\'s honest sentence', /allergenFilterReceipt\(labels\)/.test(send))
}

console.log('\n6. The coach (main chat) and Profile')
{
  const chat = code('src/components/ChatAssistant.tsx')
  const send = chat.slice(chat.indexOf('const sendMessage = async'), chat.indexOf('const handleClearChat'))
  check('after a coach turn that did not record a food dislike, what she typed is read for foods and saved',
    send.length > 1000 && /if \(!failed && !coachSavedAFoodDislike\)[\s\S]{0,120}saveFoodsSaidInPassing\(userText\)/.test(send)
    && /coachSavedAFoodDislike = dislikeFact\(result\.memoryIntent\?\.tool, result\.memoryIntent\?\.rawArgs\)/.test(send))
  // 15 Nov 2026, browser test: "I don't like salmon" got a "Remember — salmon" card AND the question, because the coach
  // sent it as a record_fact PROPOSAL and both checks looked only at an outright save.
  check('a food dislike the coach sent as a proposal is the question, not a card, and the backstop does not ask again',
    /dislikeFact\(result\.proposal\?\.kind, result\.proposal\?\.rawArgs/.test(send)
    && /else if \(dislikeToAsk\.length > 0\) refusal = DISLIKE_ASK\.turn\(dislikeToAsk\)/.test(chat))
  const saver = chat.slice(chat.indexOf('const saveFoodsSaidInPassing'), chat.indexOf('const resolveAndSaveMemory'))
  check('...through the same write as Profile\'s Foods to avoid (a hard food dislike), each with an Undo; only what was said firmly (his "Ask, and hold Tuesday")',
    saver.length > 200 && /firmFoodExclusions\(userText\)/.test(saver) && /kind: 'food_preference'/.test(saver) && /polarity: 'dislike', hardness: 'hard'/.test(saver) && /undoToken: row\.id/.test(saver))
  const prof = code('src/components/ProfileScreen.tsx')
  // The property, not the prop's name (18 Nov 2026): the box reads what is typed as a list of foods to avoid, and that
  // reader makes "mushrooms and pork" two foods (section 1 and section 8 hold the reader itself).
  check('Profile\'s Foods to avoid box splits what is typed into foods', /<EditableTagList values=\{hardFoodDislikeValues\}[^>]*foodSide="avoid"/.test(prof) && readFoodList('mushrooms and pork', 'avoid').foods.length === 2)
}

console.log('\n7. The prompts')
{
  const onb = raw('supabase/functions/onboarding-chat/index.ts')
  check('setup\'s coach: a food they don\'t eat is set_slot(dislikedFoods), never a memory note',
    /A FOOD THEY DON'T EAT IS AN ANSWER[^\n]*set_slot\(dislikedFoods[^\n]*NEVER record_context_fact/.test(onb))
  check('...and no guarantee words about the filter', !/actually keeps that food out of their meals/.test(onb) && !/All twelve are enforced by meal generation/.test(onb))
  const chatFn = raw('supabase/functions/chat-gemini/index.ts')
  check('the main coach no longer says "you cannot set those"; a food dislike is record_fact',
    !/you cannot set those/.test(chatFn) && /Never again, in anything is a DISLIKE: call record_fact/.test(chatFn))
  const rules = raw('supabase/functions/_shared/coach-rules.ts')
  check('the honesty block bans a promise about the plan (the future-tense verdict), with a wrong and a right example',
    /PROMISE ABOUT THEIR PLAN IS THE SAME VERDICT IN THE FUTURE TENSE[\s\S]{0,600}WRONG:[\s\S]{0,200}RIGHT:/.test(rules))
  check('...and no longer says the five allergens have NO tag, or that a dish name drops to one ingredient',
    !/NO tag mechanism at all/.test(rules) && !/can resolve to plain "cod,"/.test(rules) && /THIN/.test(rules))
}

console.log('\n8. A sentence typed into a list box is read as the food, or said to be unread (18 Nov 2026)')
{
  const avoid = (t: string) => readFoodList(t, 'avoid')
  const like = (t: string) => readFoodList(t, 'like')
  // THE REPORT: typed into "Anything else you'd rather I left out?" and into Profile's Foods to avoid.
  check('"I don\'t eat pork" is the food pork', avoid("I don't eat pork").foods.join() === 'pork' && avoid("I don't eat pork").unread.length === 0, avoid("I don't eat pork"))
  check('...with or without the apostrophe, and for "can\'t have", "never eat", "hate", "avoid", "allergic to"',
    ["i dont eat pork", "I can't have pork", "I cannot eat pork", "I never eat pork", "I hate pork", "I avoid pork", "I'm allergic to pork", "I am allergic to pork", "not a fan of pork", "please leave out pork", "nothing with pork in it", "I won't eat pork"]
      .every(t => avoid(t).foods.join() === 'pork' && avoid(t).unread.length === 0),
    ["i dont eat pork", "I can't have pork", "I cannot eat pork", "I never eat pork", "I hate pork", "I avoid pork", "I'm allergic to pork", "I am allergic to pork", "not a fan of pork", "please leave out pork", "nothing with pork in it", "I won't eat pork"].map(t => [t, avoid(t)]).filter(([, r]) => (r as { foods: string[] }).foods.join() !== 'pork'))
  check('the lead-in covers the whole answer: "I can\'t have gluten or dairy" is two foods', avoid("I can't have gluten or dairy").foods.join() === 'gluten,dairy')
  check('a plain list is read exactly as before', avoid('mushrooms and pork').foods.join() === 'mushrooms,pork' && avoid('no mushrooms, no pork').foods.join() === 'mushrooms,pork' && splitFoodList('pork and prawns').join() === 'pork,prawns')
  check('a food that starts with the letter i is still a food', avoid('ice cream').foods.join() === 'ice cream' && avoid('iceberg lettuce and icing').foods.join() === 'iceberg lettuce,icing')
  // WHAT IT SAVES ACTUALLY BLOCKS (the point): the sentence as typed blocked nothing.
  check('the food it reads blocks the ingredient; the sentence as it used to be saved blocked nothing',
    avoid("I don't eat pork").foods.every(f => blocks(f, 'pork chop') && blocks(f, 'bacon')) && !blocks('i don t eat pork', 'pork chop') && !blocks('i don t eat pork', 'bacon'))
  // THE OTHER BOX'S WORDS ARE NEVER READ AS THIS BOX'S FOOD: "I love pizza" under foods to avoid must not leave pizza out.
  check('"I love pizza" in the avoid box adds nothing and is handed back', avoid('I love pizza').foods.length === 0 && avoid('I love pizza').unread.join() === 'I love pizza', avoid('I love pizza'))
  check('"I don\'t eat pork" in the likes box adds nothing and is handed back', like("I don't eat pork").foods.length === 0 && like("I don't eat pork").unread.length === 1, like("I don't eat pork"))
  // THE DANGEROUS HALF: a like that names two foods must not leave the second one out, and the other way round.
  check('"I love pizza and pasta" under foods to avoid leaves NEITHER out', avoid('I love pizza and pasta').foods.length === 0 && avoid('I love pizza and pasta').unread.join() === 'I love pizza and pasta', avoid('I love pizza and pasta'))
  check('"I don\'t eat pork, prawns" under foods you like likes NEITHER', like("I don't eat pork, prawns").foods.length === 0 && like("I don't eat pork, prawns").unread.length === 1, like("I don't eat pork, prawns"))
  check('a lead-in part-way through is read too: "pork, I don\'t eat prawns" is two foods', avoid("pork, I don't eat prawns").foods.join() === 'pork,prawns' && avoid("pork, I don't eat prawns").unread.length === 0, avoid("pork, I don't eat prawns"))
  check('...and the other box\'s words part-way through are handed back, the food before them kept', avoid('pork, big fan of sushi').foods.join() === 'pork' && avoid('pork, big fan of sushi').unread.join() === 'big fan of sushi', avoid('pork, big fan of sushi'))
  check('a mixed answer adds nothing rather than guess which half is which', avoid('prawns but I like crab').foods.length === 0 && avoid('fish. I love chicken').foods.length === 0, [avoid('prawns but I like crab'), avoid('fish. I love chicken')])
  check('a diet typed as a food ("I\'m vegetarian") is not saved as one', avoid("I'm vegetarian").foods.length === 0 && avoid("I'm vegetarian").unread.length === 1, avoid("I'm vegetarian"))
  check('"none" clears and reports nothing unread', avoid('none').foods.length === 0 && avoid('none').unread.length === 0)
  // THE LIKES BOX: its own way of saying it, commas only ("chicken and rice" is one meal).
  check('"I love pizza" in the likes box is the like pizza', like('I love pizza').foods.join() === 'pizza' && like('my favourite is lasagne').foods.join() === 'lasagne' && like("I'm a big fan of thai green curry").foods.join() === 'thai green curry')
  check('...and a likes list splits on commas, never on "and"', like('salmon, curry').foods.join() === 'salmon,curry' && like('chicken and rice').foods.join() === 'chicken and rice')
  // THE SENTENCE THE SCREEN SAYS.
  check('nothing unread: no sentence', unreadFoodLine([], 'avoid') === null && unreadFoodLine([], 'like') === null)
  const said = unreadFoodLine(['I love pizza'], 'avoid') ?? ''
  check('the avoid box quotes what it could not read, says nothing was added, and shows how to type it', said.includes('"I love pizza"') && /nothing was added/.test(said) && /like "pork"/.test(said), said)
  check('the likes box says its own', /food you like/.test(unreadFoodLine(['I hate olives'], 'like') ?? ''))
  // WIRED: both Profile boxes and setup's diet screen read through it (source; verify:profile-fixes drives the box).
  const profileSrc = code('src/components/ProfileScreen.tsx')
  check('Profile\'s Foods to avoid and Foods you like boxes both read as food lists', /saveDislikedFoods\}[^>]*foodSide="avoid"/.test(profileSrc) && /saveLikedFoods\}[^>]*foodSide="like"/.test(profileSrc))
  check('...and the box shows the unread line and keeps the unread words', /unreadFoodLine\(read\.unread, foodSide\)/.test(profileSrc) && /setInput\(read\.unread\.join\(', '\)\)/.test(profileSrc) && profileSrc.includes('data-testid="food-list-unread"'))
  const setupSrc = code('src/components/onboarding/ConversationalOnboarding.tsx')
  const at = setupSrc.indexOf("readFoodList(companion.value, 'avoid')")
  check('setup\'s "anything else to leave out" holds the screen on words it cannot read, before anything is recorded',
    at > 0 && /unreadFoodLine\(typed\.unread, 'avoid'\)[\s\S]{0,260}return/.test(setupSrc.slice(at, at + 700)) && setupSrc.indexOf('applySlot(ws, companion.key', at) > setupSrc.indexOf('return', at))
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.error(`${failures} food-exclusion check(s) failed`); process.exit(1) }
console.log('A food she says she does not eat is a food she is not served, and the app says only what it did.\n')
