// ---------------------------------------------------------------------------
// HOW THE APP DECIDES — the app's own reasons, for the coach (24 Nov 2026).
//
// Ashley: "Does the chat have the same cscs logic so it can answer questions correctly or will it take answers from
// somewhere else?" Measured: the coach is handed the plan's NUMBERS but a REASON only where one is written into its
// prompt, so "why don't I get a rest timer after my warm-up?" was answered from the model's own general knowledge,
// against an app-map line that was itself wrong. His "build the why sheet", the same day.
//
// One entry per coaching decision the app makes: what it does, in plain words, and why, as the code's own record
// gives it (each drafted from the file named in `anchor` and checked against it). `test:app-decisions` holds it:
// every anchor still exists in that file's code, every app file that records a coaching (CSCS) decision has an entry
// or a written exemption, no entry carries an internal name, and real questions retrieve the right entries.
//
// IT TRAVELS BY TOPIC, NOT WHOLE. The coach's instructions are ~175k characters; the whole sheet would add a quarter
// to every message. `appDecisionsFor(message)` picks the entries whose words the question shares (up to MAX_PICKED),
// and the coach is told what to do when the answer is not among them.
//
// Zero imports, so the chat function (Deno) and the gates (Node) read the same file.
// ---------------------------------------------------------------------------

export interface AppDecision {
  area: 'Training' | 'Warm-up' | 'Rest' | 'Load' | 'Progression' | 'Weekly structure' | 'Recovery' | 'Injuries & health' | 'Nutrition' | 'Coaching'
  /** What the app does, plain words, the code's own numbers. */
  rule: string
  /** The reason, as the code's own record gives it. Empty where none is recorded: the coach must not invent one. */
  why: string
  /** Where it is enforced: a src/ file and a token in its code. Never shown to the coach. */
  anchor: { file: string; token: string }
  /** Extra words a person might use for this that the rule does not contain. */
  also?: string[]
  /** Where a number in `rule` lives when it is not beside the anchor (checked the same way). Never shown to the coach. */
  numbersFrom?: { file: string; token: string }[]
}

export const APP_DECISIONS: AppDecision[] = [
  // ---- Warm-up and rest -------------------------------------------------------------------------------------------
  { area: 'Rest', anchor: { file: 'src/lib/warmup-rest.ts', token: 'restAfterWarmupSeconds' }, also: ['timer', 'warmup', 'warm up', 'warm-up sets', 'ramp'],
    rule: 'There is no rest timer between warm-up sets; after the last warm-up before the first working set a short rest runs: 60 seconds before an ordinary lift, 90 before a main lift, 120 before a heavy main lift (6 reps or fewer at the top of its range), never longer than that lift\'s own working rest.',
    why: 'Each warm-up is just the next step up, so plates are changed and you go again; the last one sits near the working weight, and the first working set should not start short of breath from it.' },
  { area: 'Warm-up', anchor: { file: 'src/lib/warmup.ts', token: 'buildWarmup' }, numbersFrom: [{ file: 'src/lib/warmup.ts', token: 'RAMP_SCHEMES' }], also: ['ramp', 'build-up', 'warmup', 'empty bar'],
    rule: 'Heavy loaded lifts get a build-up of lighter sets first: a beginner does an empty-bar set of 10 then 50% for 8; a novice adds 75% for 3; an intermediate does 50% x5, 70% x3, 85% x2; an advanced lifter adds 92% x1; later heavy lifts in the session get a shorter 50/70/85 ladder.',
    why: 'Percentages are of today\'s working weight, not a tested max; beginners lift light enough that a long ramp wastes time, heavier working loads need more steps, and a later lift is not starting cold.' },
  { area: 'Warm-up', anchor: { file: 'src/lib/warmup.ts', token: 'shortenRampsToFit' }, also: ['short session', '20 minutes', '30 minutes', 'warmup'],
    rule: 'In a 20-30 minute session the first lift\'s build-up drops its empty-bar set and anything above 85%, and each later lift gets one build-up set at about 70%.',
    why: 'A short session still needs to feel the weight before working, but a long ramp would eat the time meant for the work.' },
  { area: 'Warm-up', anchor: { file: 'src/lib/exercise-plan.ts', token: 'shortenWarmupToFit' }, also: ['warmup', 'short session', 'stretches'],
    rule: 'In a 20-30 minute session the warm-up is trimmed to about five minutes before any working set is cut; build-up sets, pelvic floor work and the balance hold are never cut.',
    why: 'A coach warms up for about five minutes in a session that short, instead of spending a third of it before the first working set.' },
  { area: 'Warm-up', anchor: { file: 'src/lib/warmup.ts', token: 'export function prepLoadKg' }, also: ['movement prep', 'kettlebell', 'warmup', 'swing', 'too light'],
    rule: 'A movement-prep drill that needs a weight starts at half the working load, except a kettlebell swing, which uses its own easy-effort weight, not halved.',
    why: 'Half is the usual first step of a build-up; a warm-up swing is there for a hard hip snap before a hinge, which a bell half that weight cannot ask for.' },
  { area: 'Warm-up', anchor: { file: 'src/lib/exercise-plan.ts', token: 'movementPrepReps' }, also: ['movement prep', 'activation', 'warmup', 'drill'],
    rule: 'Movement-prep drills are 5 reps for explosive ones (jumps, slams, swings) and 10 controlled reps for activation and mobility drills, the same every week.',
    why: 'Prep is not progressed like training: explosive prep is a few fast reps at full quality, activation and mobility about ten controlled ones.' },
  { area: 'Warm-up', anchor: { file: 'src/lib/session-derive.ts', token: 'climbingSteps' }, also: ['warmup', 'identical', 'same weight'],
    rule: 'A build-up set only gets its own row if it is heavier than the one before and lighter than the working weight, so there are never two identical warm-ups or a warm-up at the working weight.',
    why: 'A warm-up is a climb towards the working weight; a repeat of the last weight, or the working weight itself, prepares nothing and costs time.' },
  { area: 'Warm-up', anchor: { file: 'src/lib/coach-voice.ts', token: 'supersetAlternation' }, also: ['superset', 'warmup'],
    rule: 'In a superset where one lift has build-up sets, you ramp that lift on its own first, then start alternating the pair.',
    why: 'A build-up prepares one movement at rising load; alternating it with something else adds fatigue and time between steps meant to run close together.' },
  { area: 'Warm-up', anchor: { file: 'src/lib/session-edit.ts', token: 'warmUpNowAfterWork' }, also: ['move', 'order', 'warmup'],
    rule: 'Moving an exercise so the warm-up drill ends up after a working lift is allowed, and the app says so.',
    why: 'A warm-up drill is there to prepare the first lift; after it, it is just two more easy sets. The order is still yours to choose.' },
  { area: 'Warm-up', anchor: { file: 'src/lib/pathway.ts', token: 'needsBalanceWork' }, also: ['balance', 'older', 'age'],
    rule: 'From 65, and for beginners from 60, the warm-up includes a single-leg balance hold: 2 x 20-30 seconds each leg, a hand near support.',
    why: 'Balance training is part of every older-adult activity guideline and starts earlier for someone new to exercise.' },
  { area: 'Rest', anchor: { file: 'src/lib/exercise-plan.ts', token: 'mainLiftRestFloor' }, also: ['rest', 'short rest', 'seconds', 'between sets'],
    rule: 'The day\'s main lift never rests less than 60 seconds between sets, and a weighted main lift gets at least the goal\'s longer floor for heavy lifts; when a session is short of time, accessory sets go before rest does.',
    why: 'A short rest on a heavy lift is a different exercise: the reps printed beside it stop being reachable. A shorter session is fewer sets, not shorter rests.' },
  { area: 'Training', anchor: { file: 'src/lib/session-derive.ts', token: 'trainingMinutes' }, also: ['session time', 'duration', 'how long'],
    rule: 'A session\'s length counts training time only: from the start to the last set, with no single gap counted as more than 10 minutes.',
    why: 'The longest planned rest is five minutes, so a gap past ten is an interruption, not training.' },

  // ---- Load ---------------------------------------------------------------------------------------------------------
  { area: 'Load', anchor: { file: 'src/lib/load-prescription.ts', token: 'CALIBRATION_WEEK_CONSERVATISM_BY_EXPERIENCE' }, also: ['first week', 'calibration', 'testing week', 'too light', 'weight'],
    rule: 'In the first week on a lift the app has never seen you do, it starts at about half its estimate: 55% for beginners and novices, 50% for intermediates, 45% for advanced.',
    why: 'The estimate comes from your stated experience and strength tables; the higher the claimed level, the bigger the cost if it is wrong. That week exists to find your real number.' },
  { area: 'Load', anchor: { file: 'src/lib/load-prescription.ts', token: 'UNVERIFIED_RAMP_STEP_KG' }, also: ['weight', 'increase', 'jump'],
    rule: 'Until you log a real weight on a lift, its planned weight rises at most one small step between loading weeks: 5 kg on a barbell or machine, 2 kg on dumbbells or a kettlebell.',
    why: 'Otherwise an untested lift could jump from its careful first-week number to the full estimate in one go.' },
  { area: 'Load', anchor: { file: 'src/lib/load-prescription.ts', token: 'effectiveLoadingCeilingKg' }, also: ['heaviest', 'dumbbell', 'kettlebell', 'own', 'limit'],
    rule: 'If you have said the heaviest dumbbell, kettlebell or bag you own, the plan never prescribes more than that; a stated limit can only lower the app\'s own ceiling.',
    why: 'The app\'s tables describe a commercial gym, not a spare room, and being light is the safe side to be wrong on.' },
  { area: 'Load', anchor: { file: 'src/lib/load-prescription.ts', token: 'IMPROVISED_IMPLEMENT_CEILING_KG' }, also: ['backpack', 'rucksack'],
    rule: 'A backpack-loaded lift is capped at 8 kg for beginners, 12 kg for novices, 20 kg for intermediates and 25 kg for advanced.',
    why: 'A backpack\'s straps and shape fail the same way whatever your strength, so the cap is a fixed number.' },
  { area: 'Load', anchor: { file: 'src/lib/load-prescription.ts', token: 'FLAGGED_JOINT_LOAD_FACTOR' }, also: ['knee', 'leg press', 'injury', 'lighter'],
    rule: 'With a knee on the injuries list, leg lifts that still load it (like a leg press) start at 80% of the normal estimate.',
    why: 'One clear step down, so the first sets are comfortably easy; your logged sets set the weight from there.' },
  { area: 'Load', anchor: { file: 'src/lib/load-prescription.ts', token: 'prescribeAddedLoad' }, numbersFrom: [{ file: 'src/lib/load-prescription.ts', token: 'ADDED_LOAD_BODYWEIGHT_FRACTION' }], also: ['weighted pull-up', 'dip belt', 'belt', 'pull-ups', 'dips'],
    rule: 'Pull-ups and dips only get added weight for intermediate (10% of bodyweight) or advanced (18%) lifters in a muscle, strength or power block at 10 reps or fewer, never in a deload or the first week, and never past 35% of bodyweight.',
    why: 'Past novice, a coach adds a belt once bodyweight alone is too easy for 6-10 reps; the limits keep it sensible.' },
  { area: 'Load', anchor: { file: 'src/lib/load-prescription.ts', token: 'SINGLE_IMPLEMENT_TRICEP_FACTOR' }, also: ['overhead tricep', 'triceps extension'],
    rule: 'An overhead triceps extension with one dumbbell in both hands is priced at 65% of a cable pushdown.',
    why: 'That grip works at roughly 60-70% of the pushdown figure and is limited by the shoulder and the hold first.' },
  { area: 'Load', anchor: { file: 'src/lib/exercise-plan.ts', token: 'LOADED_REP_CEILING' }, also: ['high reps', 'too many reps', '25 reps', '30 reps'],
    rule: 'No lift whose resistance can be raised (weight, machine stack, band) is prescribed past 20 reps; bodyweight-only moves are not capped.',
    why: 'Past about 20 reps a loaded set tests how long a muscle can burn rather than building strength or size; the weight goes up instead.' },
  { area: 'Load', anchor: { file: 'src/lib/set-nudge.ts', token: 'setNudgeFor' }, numbersFrom: [{ file: 'src/lib/load-prescription.ts', token: 'export function probeNextKg' }], also: ['next set', 'weight changed', 'went up', 'went down', 'mid session'],
    rule: 'Within a session, 3 or more reps over the top of the range moves the next set up one step, and 2 or more under the bottom brings it down about 5%; not in a testing week, deload, first session back, or a stepped prescription.',
    why: 'A rep either side is the plan working as fatigue builds; three over means the weight is clearly light, and the app takes the cautious half because fatigue keeps building.' },
  { area: 'Load', anchor: { file: 'src/lib/set-row.ts', token: 'carriedWeightFor' }, also: ['blank', 'empty box', 'weight box'],
    rule: 'A set ticked with the weight box blank logs the weight of the set just done, unless the plan steps the weight up between sets.',
    why: 'Straight sets repeat the load, so the set just done is the best evidence of what the next one weighs.' },
  { area: 'Load', anchor: { file: 'src/lib/working-weight.ts', token: 'referenceWeightFromSet' }, also: ['setup', 'recent hard set', 'my numbers', 'one rep max'],
    rule: 'A recent hard set you give (a weight and 1-15 reps) is read as taken to your limit and turned into the weight for about 10 reps with 2 left in the tank.',
    why: 'You are not asked how many reps were left, and "none left" is the reading that starts you lightest: a little light is fixed in a session, too heavy is not.' },
  { area: 'Load', anchor: { file: 'src/lib/first-session-lifts.ts', token: 'firstLiftsFor' }, also: ['first session', 'squat bench deadlift', 'my numbers'],
    rule: 'The first session asks for a recent hard squat, bench and deadlift only when the answer can change the plan, and never for a lift that loads a joint on your injuries list.',
    why: 'A near-max set on an injured joint is not a number to go and find, and for everyone else the testing week finds the weights.' },
  { area: 'Load', anchor: { file: 'src/lib/beat-target-offer.ts', token: 'carriedForRepRange' }, also: ['new block', 'rep range', 'carried over'],
    rule: 'When a new block changes the rep range, the weight carried over is worked from your best set last block, taken down to the top of the new range and rounded down.',
    why: 'Last block\'s weight is the wrong number for different reps, so it is re-expressed with a rep or two in reserve.' },

  { area: 'Load', anchor: { file: 'src/lib/calibration-anchor.ts', token: 'calibrationLowersFor' }, numbersFrom: [{ file: 'src/lib/calibration-anchor.ts', token: 'heaviestKg * 1.1' }], also: ['testing week', 'week 2', 'too heavy', 'too light', 'first week'],
    rule: 'The testing week sets the week after it in both directions: sets called Hard, short of the range or lighter than printed bring that lift down; easy sets bring it up, never more than 10% over the heaviest set lifted.',
    why: 'The testing week exists to find your real numbers, so what you lifted and how hard it felt decides the next week, not the first guess.' },

  // ---- Progression ------------------------------------------------------------------------------------------------
  { area: 'Progression', anchor: { file: 'src/lib/progression-engine.ts', token: 'getDoubleProgressionRecommendation' }, also: ['weight not going up', 'increase', 'progress', 'stuck', 'top of range'],
    rule: 'The weight goes up one step once every set reaches the top of the rep range (or "About right" twice running with every set done); a set under the range, or "Too hard", holds it, and two such sessions running bring it down a step.',
    why: 'Double progression: earn the reps first, then the weight, so each increase is one you can actually lift.' },
  { area: 'Progression', anchor: { file: 'src/lib/progression-engine.ts', token: 'findWeightStartKg' }, also: ['too easy', 'find your weight'],
    rule: '"Too easy" makes the next session a find-your-weight session starting 10% heavier (at least one step); go up while it still feels easy and the heaviest good set becomes your weight.',
    why: 'A weight that easy is far off, so it is re-tested rather than crept towards one small step a session.' },
  { area: 'Progression', anchor: { file: 'src/lib/outgrown.ts', token: 'outgrownWeightKg' }, also: ['big jump', 'too light', 'beat the reps'],
    rule: 'If every working set beats the top of the range by at least 3 reps (and half the range), the next weight jumps further than one step, by up to 10%.',
    why: 'Beating the range by two or more reps is the classic sign to add load, and 10% is the same cap the find-your-weight search uses.' },
  { area: 'Progression', anchor: { file: 'src/lib/beat-target-offer.ts', token: 'beatTargetInBlock' }, also: ['offer', 'new block', 'beat the plan'],
    rule: 'If you beat a main lift\'s planned weight across a finished block (three sessions or more), the app offers to start the next block from what you lifted; nothing changes unless you say yes.',
    why: 'Declining only means weight you earned is not added, the safe outcome; three sessions tell a trend from an off day.' },
  { area: 'Progression', anchor: { file: 'src/lib/periodization.ts', token: 'PHASE_CONFIGS' }, also: ['block', 'phase', 'hypertrophy', 'strength block', 'adaptation'],
    rule: 'Each block asks something different: Adaptation fewer sets, higher reps, shorter rest, easy effort; Hypertrophy more sets at a harder effort; Strength fewer reps and longer rest; Power longer rest at a lower effort.',
    why: 'A plan moves through blocks so each one builds on the last instead of repeating the same week.' },
  { area: 'Progression', anchor: { file: 'src/lib/periodization.ts', token: 'stepHoldSeconds' }, also: ['plank', 'hold', 'seconds'],
    rule: 'Timed holds like planks add 5 seconds in week 2 and 10 in week 3 of a block, then drop back in the deload.',
    why: 'One second a week is too small to feel; holds go up in round steps to about a minute, then the exercise itself gets harder.' },
  { area: 'Progression', anchor: { file: 'src/lib/mesocycle-edit.ts', token: 'swapExerciseInMesocycle' }, also: ['swap', 'swapped exercise', 'whole block'],
    rule: 'A lift swapped in for the whole block with no logged weight starts at the first-week price and climbs one step a loading week towards the estimate, never past it.',
    why: 'The plan\'s own untested lifts progress the same way.' },
  { area: 'Progression', anchor: { file: 'src/lib/plan-adaptations.ts', token: 'carryHerChoices' }, also: ['rebuild', 'kept my weights', 'lost my swap'],
    rule: 'A rebuild keeps a swap you chose wherever it is still allowed, and keeps weights already earned for the same lift at the same reps, never lowered and never put into a deload.',
    why: 'Progression is built on loads already earned; resetting them is a step backwards nobody asked for.' },
  { area: 'Progression', anchor: { file: 'src/lib/pr-engine.ts', token: 'comparePR' }, also: ['pr', 'personal best', 'record', 'first time'],
    rule: 'The first time you log a lift is a starting point, not a personal best; a best needs an earlier performance to beat.',
    why: 'A record is an improvement on something; calling a first log a best teaches that turning up is the same as getting stronger.' },
  { area: 'Progression', anchor: { file: 'src/lib/pr-engine.ts', token: 'canHoldRecord' }, also: ['pr', 'personal best', 'warm-up', 'drop set'],
    rule: 'Warm-up moves, cardio machines, warm-up sets and drop sets never count as a personal best.',
    why: 'Prep is done at an easy dose, cardio is logged in minutes, and a drop is the easier half of one effort.' },
  { area: 'Progression', anchor: { file: 'src/lib/session-derive.ts', token: 'setVolumeKg' }, also: ['volume', 'per hand', 'dumbbells', 'total'],
    rule: 'Dumbbells logged per hand count both hands in the total weight moved.',
    why: 'Volume is the load actually moved; counting one hand made a dumbbell day look like half the work.' },

  // ---- Recovery -----------------------------------------------------------------------------------------------------
  { area: 'Recovery', anchor: { file: 'src/lib/progression-engine.ts', token: 'cardLoadFor' }, numbersFrom: [{ file: 'src/lib/load-prescription.ts', token: 'DELOAD_LOAD_FRACTION' }], also: ['deload', 'lighter week', 'easy week'],
    rule: 'A deload week cuts the weight to 70% (or the plan\'s own lighter number), and the session after it picks up from about where you were before.',
    why: 'A deload is a planned drop so the body absorbs the work; the week after returns to the thread rather than starting over.' },
  { area: 'Recovery', anchor: { file: 'src/lib/load-prescription.ts', token: 'DELOAD_LOAD_FRACTION' }, also: ['deload', 'lighter week'],
    rule: 'A deload uses 70% of the last heavy week\'s weight; at the lightest weight the kit allows, fewer sets do the reducing.',
    why: 'So a deload stays a real back-off.' },
  { area: 'Recovery', anchor: { file: 'src/lib/layoff.ts', token: 'BANDS' }, also: ['break', 'time off', 'holiday', 'coming back', 'restart', 'missed weeks'],
    rule: 'After a break the first session back changes with time away: under 10 days nothing; 10-20 days repeat last time with no increase; 3-6 weeks about 90%; 6-12 weeks about 80%; 12 weeks or more 80% and an offer to restart from week 1.',
    why: 'Strength holds for about three weeks and fades slowly after, and comes back faster than it was built; the risk on return is unaccustomed work, not the bar weight.' },
  { area: 'Recovery', anchor: { file: 'src/lib/layoff.ts', token: 'liftLayoff' }, also: ['one lift', 'dropped a lift', 'break'],
    rule: 'A single lift not trained for a while is eased on its own clock, by the same bands, even if you trained other lifts.',
    why: 'Strength is specific to the movement, so a month away from one lift is a month away whatever else you did.' },
  { area: 'Recovery', anchor: { file: 'src/lib/exercise-plan.ts', token: 'noRestDayActivity' }, also: ['rest day', 'cardio', 'optional'],
    rule: 'Beginners and low-recovery plans get no extra cardio on rest days; others get it on rest days, always marked optional, with at least one true rest day left unless recovery is high.',
    why: 'Recovery between chosen sessions is what lets a beginner repeat them, and moderate recovery cannot absorb cardio every rest day.' },
  { area: 'Recovery', anchor: { file: 'src/lib/coach-patterns.ts', token: 'tirednessBuilding' }, also: ['tired', 'fatigue', 'too hard'],
    rule: 'The coach is told tiredness may be building when "Too hard" was answered on three or more lift-days in the last seven days.',
    why: 'It uses your own answers, not a guess from your numbers.' },

  // ---- Training -----------------------------------------------------------------------------------------------------
  { area: 'Training', anchor: { file: 'src/lib/exercise-plan.ts', token: 'isSecondMainLift' }, also: ['main lift', 'two big lifts'],
    rule: 'A session has one main lift, never two.',
    why: 'The second heavy compound would be done already tired, at a worse stimulus, and drag down everything after it.' },
  { area: 'Training', anchor: { file: 'src/lib/periodization.ts', token: 'ASSISTANCE_REP_FLOOR' }, also: ['low reps', 'heavy accessory'],
    rule: 'Only the day\'s main lift can go below 6 reps; every other exercise starts at 6 or more.',
    why: 'Accessory work should be no heavier than about an 8-rep max.' },
  { area: 'Training', anchor: { file: 'src/lib/exercise-plan.ts', token: 'BEGINNER_MAX_WORKING_SETS' }, also: ['beginner', 'too many sets', 'how many sets'],
    rule: 'A beginner\'s session holds at most 18 working sets; spare minutes go to optional mobility.',
    why: 'A first-timer adapts to far less, and technique fades before the muscle does.' },
  { area: 'Training', anchor: { file: 'src/lib/session-edit.ts', token: 'MIN_EXERCISES_PER_SESSION' }, also: ['remove exercise', 'too few'],
    rule: 'An exercise is not removed if it would leave fewer than 3 exercises; the app suggests a day off or something easier instead.',
    why: 'Below that it stops being a session.' },
  { area: 'Training', anchor: { file: 'src/lib/exercise-plan.ts', token: 'shortenOrFloor' }, also: ['shortest version', 'bad day', 'short on time'],
    rule: 'The shortest version of a session keeps the main lift whole and at least three exercises, with sets cut to each one\'s minimum, and it counts as a session done.',
    why: 'The main lift plus two more is a real stimulus and keeps progression moving on a bad day.' },
  { area: 'Training', anchor: { file: 'src/lib/lighter-today.ts', token: 'planLighterToday' }, also: ['easier today', 'tired', 'lighter'],
    rule: '"Make it easier today" cuts sets on that day only, keeps weights and reps, never touches the rest of the week, and is refused in a deload week.',
    why: 'A lighter day for fatigue is a deliberate dip; paying it back on another day would load the days after a tired one.' },
  { area: 'Training', anchor: { file: 'src/lib/session-rebuild.ts', token: 'rebuildDayAroundMainLift' }, also: ['different session', 'rebuild today'],
    rule: 'A different version of today keeps the main lift at its weight and sets and changes the rest; a weighted lift is only replaced by another weighted lift.',
    why: 'You still do the main lift, so its progression is untouched.' },
  { area: 'Training', anchor: { file: 'src/lib/session-kind.ts', token: 'RECIPES' }, also: ['cardio day', 'functional', 'different kind'],
    rule: 'A different-kind session runs explosive work first, then the big patterns, conditioning last; shortened, it loses accessories and the finisher first, and a cardio day carries no weights.',
    why: 'Power before strength before conditioning is the standard order.' },
  { area: 'Training', anchor: { file: 'src/lib/session-derive.ts', token: 'canAnchor' }, also: ['main lift label'],
    rule: 'The "Main lift" label never goes to a rehab drill, hold, carry or interval; if nothing qualifies, the day shows none.',
    why: 'The main lift is the one progressed by load and reps.' },
  { area: 'Training', anchor: { file: 'src/lib/movement-difficulty.ts', token: 'ANCHOR_DIFFICULTY_BUMP' }, also: ['main lift', 'goblet squat', 'leg press', 'smith'],
    rule: 'Hard loaded lifts like goblet squats, leg press, hack squat and Smith squat and bench are preferred as a day\'s main lift over easier moves of the same kind.',
    why: 'The session is built around its hardest loaded pattern.' },
  { area: 'Training', anchor: { file: 'src/lib/mesocycle-edit.ts', token: 'pickAutomaticReplacement' }, also: ['replaced', 'substitute', 'injury swap'],
    rule: 'An automatic swap (after an injury or kit change) takes the same movement type in your style first; a small isolation exercise is dropped rather than replaced with unrelated work.',
    why: 'A substitute should train what the original exercise was there for.' },
  { area: 'Training', anchor: { file: 'src/lib/mesocycle-edit.ts', token: 'replacementProgramming' }, also: ['swap', 'reps changed'],
    rule: 'A swapped-in exercise gets its own rep range for its type, style, goal and phase rather than the old exercise\'s reps.',
    why: 'Reps are set by what limits that movement.' },
  { area: 'Training', anchor: { file: 'src/lib/exercise-add-candidates.ts', token: 'getAdditionCandidates' }, also: ['add exercise', 'suggestions'],
    rule: 'Suggestions for adding an exercise match the day: no press on a pull day or row on a push day (isolation aside), no new lower-body pattern on a day without one, nothing that loads a flagged shoulder or back. Search still finds anything.',
    why: 'An opposite compound turns the session into a different session.' },
  { area: 'Training', anchor: { file: 'src/lib/swap-name-fallback.ts', token: 'swapNameFallback' }, also: ['swap', 'search'],
    rule: 'Typed swap names are ordered so the version using the most of your kit comes first; anything your kit or injuries rule out is still left out.',
    why: 'Among lookalikes, a coach gives the version your kit allows.' },
  { area: 'Training', anchor: { file: 'src/lib/exercise-aliases.ts', token: 'EXERCISE_ALIASES' }, also: ['rdl', 'ohp', 'shorthand'],
    rule: 'Gym shorthand maps to one exercise (RDL is the two-legged Romanian deadlift, OHP the barbell overhead press, bench the barbell bench press); ambiguous words like "squat" or "rows" are asked about.',
    why: 'That is ordinary gym usage; a wrong guess logs the wrong lift.' },
  { area: 'Training', anchor: { file: 'src/lib/exercise-db.ts', token: 'REHAB_ONLY' }, also: ['rehab', 'physio'],
    rule: 'Physio-style drills (wrist work, ankle dorsiflexion, terminal knee extension, Spanish squat) are only planned with the matching injury.',
    why: 'Given to someone with nothing wrong, they spend training time on a problem the person does not have.' },
  { area: 'Training', anchor: { file: 'src/lib/exercise-db.ts', token: 'Pull-Up Negatives' }, also: ['kettlebell swing', 'beginner'],
    rule: 'Beginners are not given kettlebell swings or pull-up negatives; they learn the kettlebell deadlift and pulldowns first.',
    why: 'The hinge is taught slow before fast, and lowering your whole bodyweight needs a base a first-timer has not built.' },
  { area: 'Training', anchor: { file: 'src/lib/older-beginner.ts', token: 'liftFastCue' }, also: ['lift fast', 'power', 'older', '60'],
    rule: 'From 60, main multi-joint lifts carry a "Lift fast, lower slow" cue at the prescribed weights.',
    why: 'Power falls faster than strength with age and is what gets you out of a chair or catches a stumble.' },
  { area: 'Training', anchor: { file: 'src/lib/older-beginner.ts', token: 'OLDER_BEGINNER_FOUNDATIONS' }, also: ['older', 'beginner', 'squat', 'hinge'],
    rule: 'An older beginner\'s lower-body work is a kettlebell deadlift, suitcase deadlift or glute bridge, and a goblet squat, box squat or leg press.',
    why: 'Picking something up and sitting and standing are taught first, from two feet, with the weight in the hands.' },
  { area: 'Training', anchor: { file: 'src/lib/running.ts', token: 'runningWeek' }, numbersFrom: [{ file: 'src/lib/running.ts', token: 'LIGHTER_FACTOR' }], also: ['run', 'running', 'walk-run', '5k'],
    rule: 'A running plan builds from walk-run to continuous runs, never rising more than about 10% a step, with every fourth week lighter at about 70% of the time.',
    why: 'Time on feet never jumps, and the lighter week absorbs the work before the next push.' },
  { area: 'Training', anchor: { file: 'src/lib/running.ts', token: 'runForToday' }, also: ['run', 'running', 'long run', '10%'],
    rule: 'Today\'s run is never more than 10% longer than your longest run logged in 30 days; with nothing logged it is held to 20 minutes.',
    why: 'The 10% rule for growing running load.' },
  { area: 'Training', anchor: { file: 'src/lib/running.ts', token: 'taperForRace' }, also: ['race', 'taper'],
    rule: 'With a race date, the last week\'s runs are halved and the week before cut to seven tenths, and race day says start easy.',
    why: 'So you arrive at the race fresh.' },
  { area: 'Training', anchor: { file: 'src/lib/running.ts', token: 'startState' }, also: ['running', 'older', '65'],
    rule: 'From 65 the last four walk-run steps are always done, even for someone who can already run 20 minutes.',
    why: 'Age only adds safeguards.' },
  { area: 'Training', anchor: { file: 'src/lib/cardio-presets.ts', token: 'cardioPresetsFor' }, also: ['cardio options', 'presets'],
    rule: 'Quick cardio picks follow your kit: a full gym gets incline walk, heavy bag, HIIT bike and Zone 2; everyone else brisk walk, run, bodyweight circuit and Zone 2.',
    why: 'A suggestion you cannot do is not a suggestion.' },
  { area: 'Weekly structure', anchor: { file: 'src/lib/cardio-days.ts', token: 'cardioSplitFor' }, also: ['cardio days', 'hiit', 'intervals', 'steady cardio', 'conditioning'],
    rule: 'Cardio days you ask for (up to three) take the place of lifting days but never leave fewer than two; with three, two are intervals and one steady, a beginner or low recovery gets one interval day at most, and a running goal comes first.',
    why: 'Cardio replaces lifting rather than stacking on top so you can recover, and hard intervals are kept off the day before a lift.' },

  // ---- Weekly structure ---------------------------------------------------------------------------------------------
  { area: 'Weekly structure', anchor: { file: 'src/lib/exercise-plan.ts', token: 'lowerMainToPrefer' }, also: ['squat', 'deadlift', 'full body'],
    rule: 'On full-body days the main lower-body lift alternates between a squat and a hinge across the week.',
    why: 'So a week does not end up with two deadlift days and no squat.' },
  { area: 'Weekly structure', anchor: { file: 'src/lib/exercise-plan.ts', token: 'isSecondFloorPull' }, also: ['deadlift', 'lower back'],
    rule: 'A week has at most one heavy deadlift from the floor; the second hip day is a Romanian deadlift, hip thrust or squat.',
    why: 'A heavy floor pull is the hardest thing in a week on the lower back.' },
  { area: 'Weekly structure', anchor: { file: 'src/lib/exercise-plan.ts', token: 'CORE_FLOOR_PER_WEEK' }, also: ['core', 'abs', 'trunk', 'plank'],
    rule: 'Every week has trunk work at least twice, starting with stability moves (Pallof press, bird dog, dead bug, side plank, plank), at 8 reps or more.',
    why: 'A coach gives trunk work at least twice a week; its job is holding position, not a heavy low-rep set.' },
  { area: 'Weekly structure', anchor: { file: 'src/lib/session-kind.ts', token: 'planSessionKindToday' }, also: ['cardio today', 'different session'],
    rule: 'A different kind of session for today only redraws today; the rest of the week is not rebalanced around it.',
    why: 'Rebalancing would take work away from days you can still do.' },
  { area: 'Weekly structure', anchor: { file: 'src/lib/session-move.ts', token: 'resolveMoveTarget' }, also: ['move session', 'earlier'],
    rule: 'A session can be moved earlier as well as later, to a free day from today on within the same training week.',
    why: 'A session pulled a day or two forward still has recovery either side.' },
  { area: 'Weekly structure', anchor: { file: 'src/lib/missed-day.ts', token: 'missedDayView' }, also: ['missed', 'two sessions', 'double up'],
    rule: '"Do it today" for a missed session, on a day that already has one, offers the next free day instead of stacking two.',
    why: 'Two full sessions in one day is a worse version of both, not catching up.' },
  { area: 'Weekly structure', anchor: { file: 'src/lib/plan-adaptations.ts', token: 'restoreDisplacedSessions' }, also: ['rebuild', 'same session twice'],
    rule: 'A rebuild never leaves a week with one session twice and another missing.',
    why: 'The week exists to cover every movement pattern once.' },
  { area: 'Weekly structure', anchor: { file: 'src/lib/running.ts', token: 'runningCounts' }, also: ['running', 'lifting days'],
    rule: 'A running goal adds up to three runs a week, replacing lifting days down to two (one for a half marathon).',
    why: 'Recovery is the limit for a new runner, so runs replace lifting days rather than stacking on top.' },
  { area: 'Weekly structure', anchor: { file: 'src/lib/running.ts', token: 'chooseRunningDays' }, also: ['running', 'long run', 'rest day'],
    rule: 'No lifting the day before the long or hard run, the two never back to back, the long run preferably at the weekend, and at least one full rest day.',
    why: 'Sore legs spoil both the lift and the run.' },
  { area: 'Weekly structure', anchor: { file: 'src/lib/week-role.ts', token: 'weekRole' }, also: ['week name', 'peak', 'baseline', 'building'],
    rule: 'Each four-week block runs Baseline, Building, Peak, Deload, and the plan\'s first week is Calibration; in a base block the third week is Building, not Peak.',
    why: 'A base block builds work at moderate loads, so its third week is more of the same, not a heaviest effort.' },
  { area: 'Weekly structure', anchor: { file: 'src/lib/pathway.ts', token: 'HOME_STRENGTH_FROM_WEEK' }, numbersFrom: [{ file: 'src/lib/pathway.ts', token: 'function homeStrengthReps' }], also: ['walking plan', 'starter'],
    rule: 'On the walking starter plan, from week 3 two walk days open with about 15 minutes of home strength (squat, incline push-up, towel row, glute bridge), 2 sets of 8-12 at an easy effort.',
    why: 'Strength joins walking once the habit is started, in short sessions that need no kit.' },
  { area: 'Weekly structure', anchor: { file: 'src/lib/quality-score.ts', token: 'scorePlan' }, also: ['push pull', 'balance', 'more pulling'],
    rule: 'A week with more pulling than pressing is fine when injuries leave only one press; more pressing than pulling is always treated as out of balance.',
    why: 'When pressing hurts, pulling more is the right prescription; push-heavy is the direction that costs a shoulder.' },
  { area: 'Weekly structure', anchor: { file: 'src/lib/edit-tradeoff.ts', token: 'MATERIAL_VOLUME_SHIFT' }, numbersFrom: [{ file: 'src/lib/edit-tradeoff.ts', token: "volume.direction === 'down' && volume.fraction >= 0.4" }], also: ['change costs', 'sets a week'],
    rule: 'A change says what it costs only when one muscle\'s weekly sets move by 25% or more; a lasting cut of 40% or more asks first, with "do it anyway" one tap away.',
    why: 'Compared with your own plan, not an invented number; a change against your goal is asked about, never refused.' },

  // ---- Injuries and health ------------------------------------------------------------------------------------------
  { area: 'Injuries & health', anchor: { file: 'src/lib/plan-guard.ts', token: 'buildDayGuard' }, also: ['trained', 'already done'],
    rule: 'A day already trained, finished, missed, rested or swapped, or any earlier day, is never rewritten by an injury change, kit change or rebuild.',
    why: 'The training record is what progression is built on; a plan that disagrees with the log makes both untrustworthy.' },
  { area: 'Injuries & health', anchor: { file: 'src/lib/health-conditions.ts', token: 'HEALTH_SET_RPE_CEILING' }, also: ['blood pressure', 'heart', 'diabetes', 'medication'],
    rule: 'With high blood pressure, a heart condition, diabetes, blood thinners or pregnancy ticked, no set is harder than effort 8 of 10, cardio is capped at 7 and described in effort words, never heart rate, and there are no all-out intervals.',
    why: 'Moderate intensity with no maximal straining is the guidance, and medication can blunt heart rate, so effort is the honest measure. Check with your GP before a new plan.' },
  { area: 'Injuries & health', anchor: { file: 'src/lib/exercise-plan.ts', token: 'LOWER_BACK_MAX_WORKING_SETS' }, also: ['lower back', 'back pain'],
    rule: 'With a lower back on the injuries list a session holds at most 22 working sets, isolation trimmed first.',
    why: 'Every standing set asks the trunk to hold position, and with back pain that fatigue is what a coach manages.' },
  { area: 'Injuries & health', anchor: { file: 'src/lib/exercise-plan.ts', token: 'pickRehabMovement' }, also: ['knee', 'rehab', 'quad'],
    rule: 'A flagged knee\'s rehab exercise is a quad drill (terminal knee extension, short-arc quad set) where one exists, picked from the gentlest and rotated, on leg days.',
    why: 'Quadriceps strength is what knee-pain guidelines put first.' },
  { area: 'Injuries & health', anchor: { file: 'src/lib/cardio-ease-off.ts', token: 'easeOffQuestion' }, also: ['run', 'knee', 'ankle', 'hip', 'ease off'],
    rule: 'Logging a run, hike, skipping or field sport during a temporary knee, ankle or hip ease-off gets one question afterwards (fine, or it hurt) and nothing is blocked.',
    why: 'Those load the same joints the ease-off is protecting, so a coach would ask how it went rather than stop you.' },
  { area: 'Injuries & health', anchor: { file: 'src/lib/older-beginner.ts', token: 'olderBeginnerExclusion' }, also: ['older', '60', 'barbell', 'beginner'],
    rule: 'Beginners from 60 get no barbell lifts, hanging or dip work, jumps or technique-heavy lifts; they start on dumbbells, kettlebells, machines, cables and bands, until past beginner.',
    why: 'Those implements start near zero and rise in small steps; the barbell, hanging work and jumping come later.' },
  { area: 'Injuries & health', anchor: { file: 'src/lib/older-beginner.ts', token: 'olderAdultExclusion' }, also: ['older', '65', 'jumps', 'burpees'],
    rule: 'From 65, at any level, plans leave out jumps with a real flight and landing (box jumps, broad jumps, burpees).',
    why: 'A coach adds landing work only after screening joints and bone health, which the app cannot do.' },
  { area: 'Injuries & health', anchor: { file: 'src/lib/pregnancy-rules.ts', token: 'PREGNANCY_LYING' }, also: ['pregnant', 'pregnancy', 'lying on back'],
    rule: 'While pregnant: no jumping or impact moves, nothing lying flat on the back or face down, no hard ab moves; each is replaced with a move of the same kind.',
    why: 'Pregnancy guidance advises against impact, fall risk and lying flat on the back from the second trimester; hard ab moves strain a stomach wall already stretching.' },
  { area: 'Injuries & health', anchor: { file: 'src/lib/pregnancy-rules.ts', token: 'PREGNANCY_REP_FLOOR' }, also: ['pregnant', 'reps'],
    rule: 'While pregnant every working set is 8 reps or more, with no strength or power block.',
    why: 'A low-rep set is still near-maximal with the breath-hold that brings; the guidance is moderate weights you can breathe through.' },
  { area: 'Injuries & health', anchor: { file: 'src/lib/pregnancy-rules.ts', token: 'PREGNANCY_LATE_EXCLUDED' }, also: ['pregnant', '28 weeks', 'third trimester'],
    rule: 'From 28 weeks pregnant, lunges, step-ups and single-leg work become two-footed or supported, and face-down work becomes incline.',
    why: 'Balance gets harder as the centre of gravity shifts and joints loosen.' },
  { area: 'Injuries & health', anchor: { file: 'src/lib/health-conditions.ts', token: 'lateInPregnancy' }, also: ['pregnant', '28 weeks'],
    rule: 'From 28 weeks pregnant, sets are capped one notch lower at effort 7 and weights are held, not increased.',
    why: '' },
  { area: 'Warm-up', anchor: { file: 'src/lib/pregnancy-rules.ts', token: 'PELVIC_FLOOR_WARMUP_ITEM' }, also: ['pelvic floor', 'pregnant'],
    rule: 'While pregnant, every training day\'s warm-up includes pelvic floor exercises: 10 slow squeezes held up to 10 seconds, then 10 quick ones.',
    why: 'Recommended for everyone who is pregnant: they support the bladder and bowel, now and after the birth.' },
  { area: 'Injuries & health', anchor: { file: 'src/lib/coach-voice.ts', token: 'setupHealthQuestionLine' }, also: ['safe to train', 'medication', 'condition'],
    rule: 'Asked whether it is safe to train with a condition, medication or pregnancy, the app says straight away to check with a GP.',
    why: 'A strength coach does not assess a medical condition.' },

  // ---- Nutrition ----------------------------------------------------------------------------------------------------
  { area: 'Nutrition', anchor: { file: 'src/lib/macro-calculator.ts', token: 'applyGoalAdjustment' }, also: ['calories', 'deficit', 'fat loss', 'surplus', 'muscle gain'],
    rule: 'Fat loss sets calories 20% below maintenance but never more than 500 kcal below, and never under 1,500 for men or 1,200 for women; muscle gain adds 300 kcal.',
    why: 'A flat 500 is a much bigger cut for a light person; 20% is the middle of the usual sustainable range.' },
  { area: 'Nutrition', anchor: { file: 'src/lib/macro-calculator.ts', token: 'nutritionReferenceWeightKg' }, also: ['protein', 'bmi', 'heavy'],
    rule: 'Above a BMI of 30, protein, minimum fat and training-day carbs count only a quarter of the weight over that line; calories still use real weight.',
    why: 'Protein needs follow lean mass, not total mass.' },
  { area: 'Nutrition', anchor: { file: 'src/lib/macro-calculator.ts', token: 'BEGINNER_PROTEIN_OFFSET' }, also: ['protein', 'beginner', 'grams per kilo'],
    rule: 'Beginners get protein 0.4 g per kg lower than the standard presets, never below 1.6 g per kg.',
    why: 'Muscle gain from lifting levels off near 1.6 g per kg; the higher figures are for lean trained athletes in a deficit.' },
  { area: 'Nutrition', anchor: { file: 'src/lib/nutrition-targets.ts', token: 'getEffectiveTargetWeightKg' }, also: ['weigh in', 'targets changed', 'calories changed'],
    rule: 'Targets only move with weigh-ins on at least 3 days in the last 7 whose average moved 1 kg or more; in pregnancy never on weight gain.',
    why: 'Day-to-day weight swings are water, food and salt, not a trend.' },
  { area: 'Nutrition', anchor: { file: 'src/lib/weigh-in-check.ts', token: 'checkWeighIn' }, also: ['weigh in', 'weight', 'typo'],
    rule: 'A weigh-in more than about 3% from the last one (plus a little per day since) is asked about before it is saved.',
    why: 'Daily weight moves 1-2% on water and food; 3% in a day is more likely a typo than a change.' },
  { area: 'Nutrition', anchor: { file: 'src/lib/weigh-in-check.ts', token: 'weighInStanding' }, also: ['weigh in', 'targets'],
    rule: 'A surprising weigh-in you confirm is kept, but the targets wait until a later day lands within 1 kg of it.',
    why: 'So one odd reading cannot move your calories.' },
  { area: 'Nutrition', anchor: { file: 'src/lib/health-conditions.ts', token: 'nutritionGoalOf' }, also: ['pregnant', 'calories', 'maintenance'],
    rule: 'While pregnant, calories and macros are maintenance, the goal is kept for later, and the app never adds pregnancy calories itself.',
    why: 'Extra pregnancy calories are the midwife\'s number.' },
  { area: 'Nutrition', anchor: { file: 'src/lib/meal-generation.ts', token: 'DAY_CALORIE_TOLERANCE' }, also: ['on target', 'off target'],
    rule: 'A day is on target when calories are within 5%, protein 0.95 to 1.10 times target, and carbs and fat each within 10%.',
    why: 'Tight enough that "on target" means it.' },
  { area: 'Nutrition', anchor: { file: 'src/lib/meal-generation.ts', token: 'BASE_RATIOS' }, also: ['lunch', 'dinner', 'meal split', 'big lunch', 'protein per meal'],
    rule: 'On three meals a day, breakfast takes 30% of the day and lunch and dinner 35% each.',
    why: 'Protein is better spread across the meals than piled into one, and a leftover lunch should be the same size as the dinner it came from.' },
  { area: 'Nutrition', anchor: { file: 'src/lib/meal-generation.ts', token: 'MEAL_SHARE_BAND' }, also: ['meal size', 'small dinner', 'big lunch'],
    rule: 'Around a fixed meal, another main meal stays between 60% and 150% of its share of the day (snacks 50-200%).',
    why: 'Under that a main meal is snack-sized with too little protein; over it the same the other way.' },
  { area: 'Nutrition', anchor: { file: 'src/lib/meal-generation.ts', token: 'QUIET_RESIZE_MIN' }, also: ['portion', 'resized', 'bigger', 'smaller'],
    rule: 'To land a day on target the app may resize the biggest free dish between 0.75 and 1.35 times without saying so.',
    why: 'Within that it is the same dish at a different portion.' },
  { area: 'Nutrition', anchor: { file: 'src/lib/meal-generation.ts', token: 'OFF_TARGET_VARIETY_MARGIN' }, also: ['same meals', 'variety'],
    rule: 'When no day can be on target, a different day within about 3% of calories of the closest is preferred over the same day again; an on-target day always wins.',
    why: 'The same three meals seven days running is not a plan a coach would write.' },
  { area: 'Nutrition', anchor: { file: 'src/lib/meal-addition.ts', token: 'sizeToProtein' }, also: ['how much', 'portion', 'add a meal'],
    rule: 'An added dish is sized protein first to the meal\'s share, then carbs towards its calories (grown at most 30%), and any gap is said in numbers.',
    why: 'Scaling a whole dish to calories carries its protein with it and can ask for a plate nobody would eat.' },
  { area: 'Nutrition', anchor: { file: 'src/lib/meal-rebalance.ts', token: 'REBALANCE_MIN_KEEP' }, also: ['move calories', 'lunch', 'dinner'],
    rule: 'Moving calories between meals keeps the smaller meal at least half its size and grows the bigger one to at most double.',
    why: 'Half still makes a real meal with useful protein; when the day matches, how it is split barely matters.' },
  { area: 'Nutrition', anchor: { file: 'src/lib/meal-rotation.ts', token: 'EATING_OUT_PROTEIN_FLOOR' }, also: ['eating out', 'restaurant'],
    rule: 'Eating out shrinks the day\'s other meals together by no more than a quarter, and not below 95% of protein.',
    why: 'No meal is skipped to earn a night out, and protein protects muscle on a lighter day.' },
  { area: 'Nutrition', anchor: { file: 'src/lib/eating-out.ts', token: 'EATING_OUT_FACTOR' }, numbersFrom: [{ file: 'src/lib/eating-out.ts', token: 'EATING_OUT_SPREAD' }], also: ['eating out', 'restaurant', 'estimate'],
    rule: 'A meal out is estimated at the meal\'s planned calories times 1.0 (light), 1.35 (normal) or 1.7 (big night), shown as a range about 15% either side.',
    why: 'Restaurant meals are bigger than home dinners, mostly in sauces, sides and drinks, and the recipe is unknown.' },
  { area: 'Nutrition', anchor: { file: 'src/lib/meal-like-offer.ts', token: 'offersEveryDay' }, also: ['every day', 'same breakfast'],
    rule: 'A liked meal is offered every day only for breakfast or a snack; lunch or dinner gets tomorrow or "just remember".',
    why: 'A daily breakfast costs little variety; the same dinner every day takes most of the week\'s.' },
  { area: 'Nutrition', anchor: { file: 'src/lib/macro-shortfall.ts', token: 'macroShortfallLine' }, also: ['behind', 'low protein'],
    rule: 'With three or more past meals unlogged, the app says your log is behind rather than that a macro is low.',
    why: 'The numbers then reflect what was logged, not what was eaten.' },
  { area: 'Nutrition', anchor: { file: 'src/lib/portion-scaler.ts', token: 'kitchenRound' }, also: ['grams', 'rounding'],
    rule: 'Portions are rounded to the nearest 5 g from 20 g up, spoons to quarters, and eggs to whole ones.',
    why: 'Five grams is well inside what a home scale varies by.' },
  { area: 'Nutrition', anchor: { file: 'src/lib/portion-scaler.ts', token: 'PLATE_MAX_G' }, also: ['plate', 'too much food', 'bread'],
    rule: 'Bread and wraps come in half or whole pieces, and a main meal is capped at about 1,100 g on the plate.',
    why: 'Past about a kilo people do not finish it.' },
  { area: 'Nutrition', anchor: { file: 'src/lib/food-swap-groups.ts', token: 'SWAP_GROUPS' }, also: ['swap food', 'replace'],
    rule: 'A food swap offers foods that do the same job (berries for berries, white fish for white fish), never a seasoning or sauce.',
    why: 'A substitute has to do the same job in the meal, not only close the macros.' },
  { area: 'Nutrition', anchor: { file: 'src/lib/amount-said.ts', token: 'sizedToReplace' }, also: ['swap food', 'amount'],
    rule: 'A swapped-in food is sized to the calories of the food it replaces.',
    why: 'A like-for-like swap keeps the meal where the plan put it.' },
  { area: 'Nutrition', anchor: { file: 'src/lib/weekly-average.ts', token: 'weeklyAverage' }, also: ['week average', 'over target'],
    rule: 'The week-so-far average counts finished days you logged, and one day over is not a failure if the week lands.',
    why: 'Body composition follows the week\'s energy balance, not one day.' },
  { area: 'Nutrition', anchor: { file: 'src/lib/setup-sports.ts', token: 'sportSessionKcal' }, also: ['sport', 'class', 'extra calories'],
    rule: 'A weekly sport session adds that day\'s energy as (the sport\'s MET minus 1) x bodyweight x one hour.',
    why: 'The resting hour is already in the day\'s baseline; the class length is assumed to be an hour.' },

  // ---- Coaching -----------------------------------------------------------------------------------------------------
  { area: 'Coaching', anchor: { file: 'src/lib/consistency.ts', token: 'sessionsForOnPlan' }, also: ['weeks on plan', 'streak'],
    rule: 'A week is on plan at three quarters of its sessions, rounded up, and Home shows how many of the last 12 weeks were.',
    why: 'Missing one in four keeps the weekly dose; a count of weeks never shows a broken run.' },
  { area: 'Coaching', anchor: { file: 'src/lib/session-feel.ts', token: 'feelRun' }, also: ['less volume', 'rough sessions'],
    rule: 'The coach offers less volume when two of your last three sessions felt rough, or all three hard.',
    why: 'One awful session is a bad day; reacting to each one teaches people not to answer honestly.' },
  { area: 'Coaching', anchor: { file: 'src/lib/session-feel.ts', token: 'effortToFelt' }, also: ['effort', '1 to 10'],
    rule: 'The 1-10 session effort counts 1-3 easy, 4-8 good and 9-10 hard; only 9-10 counts towards a back-off.',
    why: '7-8 is what a well-built session should feel like.' },
  { area: 'Coaching', anchor: { file: 'src/lib/coach-patterns.ts', token: 'stuckLifts' }, also: ['stuck', 'plateau'],
    rule: 'A lift is called stuck when three sessions running held the same top weight with no extra rep.',
    why: 'One or two is noise from sleep or a bad day.' },
  { area: 'Coaching', anchor: { file: 'src/lib/coach-patterns.ts', token: 'lowProtein' }, also: ['protein', 'low'],
    rule: 'Protein is called low when three logged days running were under 80% of target.',
    why: 'One off day is never a pattern, and an unlogged day is not an uneaten one.' },
  { area: 'Coaching', anchor: { file: 'src/lib/coach-moments.ts', token: 'PROTEIN_SHORT_SHARE' }, also: ['protein', 'nudge', 'evening'],
    rule: 'The "behind on protein" nudge comes only from 7pm, with two meals logged, under 80% of target and at least 20 g short.',
    why: 'A day\'s eating is unfinished at lunchtime.' },
  { area: 'Coaching', anchor: { file: 'src/lib/coach-moments.ts', token: 'dailyCap' }, also: ['messages', 'notifications', 'how often'],
    rule: 'Unprompted messages are at most 1 a day on Light, 3 on Normal, 5 on Lots, at least 3 hours apart, never before 8am or from 9pm.',
    why: 'Nobody should be overwhelmed, and a message at night is a bad night\'s sleep, not accountability.' },
  { area: 'Coaching', anchor: { file: 'src/lib/coach-moments.ts', token: 'COMEBACK_AFTER_DAYS' }, also: ['quiet', 'came back'],
    rule: 'After 3 quiet days the coach sends one small-step message and stops session reminders; after 14, one "door is open", then silence until you log.',
    why: 'A lapse is met with one small step, not repeated nags.' },
  { area: 'Coaching', anchor: { file: 'src/lib/coach-lessons.ts', token: 'lessonDue' }, also: ['lesson', 'tip'],
    rule: 'The coach teaches at most one short lesson a day, only when your own week makes it relevant, never repeated.',
    why: 'So you learn the reasons behind your plan as you go.' },
]

/** Files that mention a coaching decision but make none of their own; each with the reason. */
export const APP_DECISIONS_EXEMPT: Record<string, string> = {
  'src/lib/set-parse.ts': 'parses typed workouts; its one CSCS note points at the alias table, which has its own entry',
  'src/lib/types.ts': 'type definitions; the macro default it mentions is decided in macro-calculator.ts',
}

const MAX_PICKED = 8

const STOP = new Set('a an and are as at be but by can do does dont don\'t for from get got have how i if in is it its me my no not of on or so that the this to was we what when why will with you your yours am im i\'m just still there their them they than then also any every each into over under about after before more less very'.split(' '))

function words(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9%\s-]/g, ' ').split(/[\s-]+/)
    .filter(w => w.length > 1 && !STOP.has(w))
    // One ending at a time, plural first, so "swings" and "swing" meet ("swings" had become "swing", "swing" "sw").
    .map(w => w.replace(/ies$/, 'y').replace(/([^s])s$/, '$1').replace(/(ing|ed|e)$/, ''))
    .filter(w => w.length > 1)
}

/** Each entry's own words, worked out once. */
const ENTRY_WORDS: Set<string>[] = APP_DECISIONS.map(d => new Set(words(`${d.rule} ${(d.also ?? []).join(' ')}`)))
/** How telling a word is: one that few entries use ("swing") counts for more than one most use ("warm"). */
const RARITY = new Map<string, number>()
for (const set of ENTRY_WORDS) for (const w of set) RARITY.set(w, (RARITY.get(w) ?? 0) + 1)
const weightOf = (w: string) => Math.log((APP_DECISIONS.length + 1) / (RARITY.get(w) ?? APP_DECISIONS.length))

/** The entries a message is about, best first. Empty when nothing matches well enough. */
export function pickAppDecisions(message: string): AppDecision[] {
  const asked = new Set(words(message))
  if (asked.size === 0) return []
  const lower = message.toLowerCase()
  const scored = APP_DECISIONS.map((d, i) => {
    let shared = 0
    let weight = 0
    for (const w of asked) if (ENTRY_WORDS[i].has(w)) { shared++; weight += weightOf(w) }
    // A phrase from `also` said whole is worth more than the words it is made of.
    for (const phrase of d.also ?? []) if (phrase.includes(' ') && lower.includes(phrase)) { shared += 2; weight += 2 }
    return { d, i, shared, weight }
  })
  // At least two words in common to count at all; then the rarer the words shared, the better the match.
  return scored.filter(s => s.shared >= 2).sort((a, b) => b.weight - a.weight || a.i - b.i).slice(0, MAX_PICKED).map(s => s.d)
}

/** The block the coach is given for this message. Always carries the rule; the entries only when some match. */
export function appDecisionsFor(message: string): string {
  const picked = pickAppDecisions(message)
  const lines = picked.map(d => `- ${d.rule}${d.why ? ` Why: ${d.why}` : ' (No reason is recorded for this one: say what it does, not why.)'}`)
  return `=== 1-WHY-APP. WHY THE APP DID WHAT IT DID ===
When they ask why the app did something to their plan, food or screen (a weight, a rest, a set count, an exercise, a target, a timer), answer with the app's OWN reason below, in your words, tied to them. Never give a different reason of your own as if it were the app's. If the reason is not below, say what the plan shows and that you do not have the app's reasoning for that one; do not invent it. Your own general knowledge is still yours for questions that are not about why the app did something.
${lines.length ? `HOW THE APP DECIDES, the entries that match this message:\n${lines.join('\n')}` : 'No entry of the app\'s own reasons matches this message.'}`
}
