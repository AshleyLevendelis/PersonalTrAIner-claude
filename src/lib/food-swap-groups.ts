/**
 * WHAT CAN STAND IN FOR WHAT ON A PLATE.
 *
 * 9 Oct 2026, the test log's L19: taking the blueberries out of a pancake
 * breakfast offered "65g lime" and "80g avocado". The swap list took every
 * food in the same database CATEGORY — and `fruit` holds lime, lemon and
 * avocado beside the berries — then put whatever was already in the person's
 * meals first. Lime was in a chicken marinade that week, so a marinade
 * ingredient led the list for pancakes. The numbers matched. The food did not.
 *
 * DECIDED AS A CSCS COACH / NUTRITION GENERALIST (basis in BACKLOG): a
 * substitute has to do the same JOB in the meal, not only close the same
 * macro. A coach who is told "I'm out of blueberries" says raspberries, not
 * lime. So every food belongs to one swap group, and only foods in the same
 * group are ever candidates for each other. Pantry-first and the macro match
 * still decide the ORDER, inside the group.
 *
 * Two kinds of food are in no group, listed in NO_SWAP below:
 *   - seasonings, sauces and aromatics (lime, garlic, cumin, soy sauce...).
 *     They flavour a dish; they are never offered in place of a FOOD, and a
 *     removed one is not "replaced" by 60 g of another.
 *   - one-off foods with nothing that does their job (liver, ackee, water).
 * For those the swap list is empty, which is the designed honest outcome
 * (meal-food-edit.ts): the card still says what the removal costs.
 *
 * EVERY FOOD IN THE DATABASE IS IN EXACTLY ONE PLACE HERE. test:food-swaps
 * fails on a food that is missing or listed twice, so adding a food to the
 * database forces this decision instead of silently defaulting it.
 *
 * Names only — this file knows nothing about allergens or diets and changes
 * nothing about how a food is found. Whether a candidate may be SERVED to this
 * person is still decided by the replace builder's own trial.
 */
export const SWAP_GROUPS: Record<string, readonly string[]> = {
  // --- protein ---
  'lean meat': ['chicken breast', 'turkey breast', 'pork loin', 'venison', 'beef rump steak', 'beef steak sirloin', 'chicken drumstick'],
  'richer meat': ['chicken thigh', 'duck breast', 'lamb chop', 'pork chop', 'beef brisket', 'pork belly'],
  'mince': ['chicken mince', 'turkey mince', 'beef mince 5% fat', 'beef mince 20% fat', 'lamb mince', 'pork mince', 'soy mince', 'quorn mince', 'vegan mince'],
  'cured meat and sausages': ['bacon', 'ham', 'gammon', 'chorizo', 'pepperoni', 'salami', 'pork sausage', 'vegan sausage'],
  'white fish': ['cod', 'haddock', 'tilapia', 'sea bass', 'red snapper', 'tuna steak fresh'],
  'oily fish': ['salmon', 'mackerel', 'trout'],
  'tinned and smoked fish': ['tuna canned in water', 'sardines canned', 'smoked salmon'],
  'shellfish': ['prawns', 'crab meat', 'mussels', 'squid', 'scallops', 'lobster', 'oysters'],
  'eggs': ['egg', 'egg white'],
  'protein powder': ['whey protein powder', 'vegan protein powder'],
  'tofu and meat-free pieces': ['tofu firm', 'tofu silken', 'tempeh', 'seitan', 'seitan strips', 'quorn fillet', 'falafel'],
  'beans and pulses': ['chickpeas', 'lentils red', 'lentils green', 'brown lentils', 'black beans', 'kidney beans', 'pinto beans', 'butter beans', 'cannellini beans', 'haricot beans', 'split peas', 'edamame'],
  // --- dairy and its stand-ins ---
  'yoghurt': ['greek yoghurt 0%', 'greek yoghurt full fat', 'natural yoghurt', 'skyr', 'quark', 'cottage cheese', 'soy yoghurt', 'coconut yoghurt'],
  'soft cheese': ['ricotta cheese', 'cream cheese'],
  'cheese': ['cheddar cheese', 'mozzarella', 'feta cheese', 'halloumi', 'parmesan', 'paneer', 'sulguni cheese'],
  'milk': ['milk whole', 'milk semi skimmed', 'milk skimmed', 'soy milk', 'almond milk', 'oat milk'],
  'cream': ['double cream', 'single cream', 'sour cream', 'creme fraiche', 'coconut cream', 'coconut milk canned'],
  // --- fats ---
  'cooking fat': ['olive oil', 'vegetable oil', 'coconut oil', 'sesame oil', 'peanut oil', 'safflower oil', 'ghee', 'butter'],
  'nut butter': ['peanut butter', 'almond butter', 'tahini'],
  'nuts': ['almonds', 'walnuts', 'cashews', 'peanuts', 'mixed nuts', 'pistachios', 'brazil nuts', 'pecans', 'hazelnuts', 'trail mix'],
  'seeds': ['chia seeds', 'flaxseed', 'sunflower seeds', 'pumpkin seeds', 'sesame seeds', 'hemp seeds'],
  'avocado and olives': ['avocado', 'guacamole', 'olives'],
  // --- starches ---
  'rice and grains': ['white rice cooked', 'brown rice cooked', 'basmati rice cooked', 'couscous cooked', 'quinoa cooked', 'bulgur wheat cooked', 'millet cooked', 'buckwheat cooked', 'barley', 'polenta cooked'],
  'pasta and noodles': ['pasta cooked', 'wholewheat pasta cooked', 'gluten free pasta', 'protein pasta', 'egg noodles cooked', 'rice noodles cooked', 'gnocchi'],
  'bread': ['white bread', 'wholemeal bread', 'gluten free bread', 'bagel', 'brioche', 'croissant', 'french toast'],
  'wraps and flatbreads': ['tortilla wrap', 'corn tortilla', 'pitta bread', 'naan bread', 'chapati', 'injera flatbread'],
  'starchy veg': ['potato boiled', 'potato baked', 'mashed potato', 'sweet potato baked', 'sweet potato raw', 'taro root', 'yellow yam', 'plantain', 'parsnip', 'butternut squash'],
  'breakfast cereal': ['oats', 'granola', 'muesli', 'cornflakes', 'weetabix'],
  'crackers and crisp snacks': ['rice cakes', 'crackers', 'rye crispbread', 'popcorn', 'tortilla chips'],
  'flour': ['plain flour', 'cornmeal', 'lupin flour'],
  // --- fruit ---
  'berries': ['strawberries', 'blueberries', 'raspberries', 'blackberries', 'mixed berries', 'cherries'],
  'sweet fruit': ['banana', 'apple', 'orange', 'grapes', 'mango', 'pineapple', 'kiwi', 'watermelon', 'pear', 'peach', 'plum', 'grapefruit', 'passion fruit', 'papaya', 'pomegranate', 'figs'],
  'dried fruit': ['dates', 'raisins', 'dried apricots'],
  // --- vegetables ---
  'leafy veg': ['spinach', 'kale', 'mixed salad leaves', 'rocket', 'watercress', 'bok choy', 'cabbage'],
  'salad veg': ['tomato', 'cherry tomatoes', 'cucumber', 'bell pepper', 'radish', 'celery', 'bean sprouts'],
  'cooked veg': ['broccoli', 'cauliflower', 'green beans', 'peas', 'asparagus', 'brussels sprouts', 'courgette', 'aubergine', 'mushroom', 'carrot', 'leek', 'fennel', 'artichoke', 'okra', 'turnip', 'celeriac', 'pumpkin', 'bamboo shoots', 'sweetcorn', 'beetroot'],
  // --- the few sauces and extras that do have a like-for-like ---
  'sweetener': ['honey', 'maple syrup', 'sugar white', 'brown sugar', 'jam'],
  'soy sauce': ['soy sauce', 'tamari'],
  'tomato base': ['tomato passata', 'chopped tomatoes canned', 'marinara sauce'],
  'broth': ['beef broth', 'chicken broth'],
  'dips': ['hummus', 'tzatziki', 'salsa'],
  'chocolate': ['dark chocolate', 'milk chocolate'],
  'snack bars': ['protein bar generic', 'greek yoghurt bar'],
}

/**
 * Never a candidate, and nothing is offered for them. Seasonings first (the
 * lime that started this), then the one-offs.
 */
export const NO_SWAP: readonly string[] = [
  // citrus used as seasoning, and aromatics
  'lemon', 'lime', 'calamansi juice', 'onion', 'garlic', 'spring onion', 'shallots',
  // sauces, pastes and dressings
  'mayonnaise', 'ketchup', 'mustard', 'bbq sauce', 'sriracha', 'balsamic vinegar', 'pesto', 'curry paste',
  'gravy granules made', 'worcestershire sauce', 'teriyaki sauce', 'vegetable stock cube', 'rice vinegar', 'fish sauce',
  'miso paste', 'gochujang', 'harissa', 'coleslaw', 'vinaigrette dressing', 'ranch dressing', 'apple cider vinegar',
  'oyster sauce', 'hoisin sauce', 'sweet chili sauce', 'tamarind paste', 'white vinegar', 'jerk seasoning paste',
  // herbs, spices and baking bits
  'cornflour', 'curry powder', 'paprika', 'cinnamon', 'cumin', 'black pepper', 'vanilla extract', 'coriander', 'dill',
  'basil', 'lemongrass', 'turmeric powder', 'bay leaves', 'star anise', 'curry leaves', 'garam masala',
  'chana masala spice mix', 'chaat masala', 'berbere spice mix', 'cajun seasoning', 'suya spice rub', 'chili powder',
  'cayenne pepper', 'tajin seasoning', 'capers', 'nutritional yeast', 'anchovies', 'breadcrumbs', 'pancake mix',
  // one-offs: nothing else does their job
  'egg yolk', 'chicken liver', 'beef jerky', 'coconut flakes', 'coconut flesh', 'ackee', 'rice paper wrappers',
  'water', 'black coffee',
]

const GROUP_OF: ReadonlyMap<string, string> = new Map(
  Object.entries(SWAP_GROUPS).flatMap(([group, names]) => names.map(n => [n, group] as const)),
)

/** The swap group a food belongs to, by its database name. Null for a seasoning, a one-off, or a food this file has not been told about. */
export function swapGroupOf(foodName: string): string | null {
  return GROUP_OF.get(foodName) ?? null
}
