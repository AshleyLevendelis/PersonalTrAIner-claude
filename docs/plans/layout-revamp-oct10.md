# Layout revamp, 10 Oct 2026 (design_handoff_app_revamp: 2a-2e, 4c)

Ashley sent the design zip with no message. Asked what to do, from four options she chose
**"Build all six, then show me"**. Branch `claude/layout-revamp-oct10`, cut from
`claude/test-log-fixes-oct9` at 980a8352 — NOT pushed to that branch, because her hand-off prompt
fast-forwards main to whatever that branch's head is, and the layout must not ride along unseen.

The brief (README in the zip) is a layout pass: the Nightshift theme, accent override, Space
Grotesk, mono numerals and glow stay. Every colour maps to an existing token. Mock screenshots
were rendered locally (CDN blocked; libraries pulled from the npm registry) into the session
scratchpad, `mockshot/2a.png … 4c.png`.

## Her rulings during this build

1. **"Build all six, then show me"** (10 Oct, from four options).
2. **The name stays "Personal TrAIner"** (10 Oct, from three options): her earlier polish brief said
   "the assistant is 'Personal TrAIner' everywhere in UI text" (held by `test:profile-groups` §6);
   the new brief says "Coach" in three places. Recommended and chosen: keep Personal TrAIner. So the
   Home tip label reads "TRAINER · {TAG}", setup says "Your Personal TrAIner", Profile's fourth
   group is "Personal TrAIner & app".

## Decisions taken here (mine, recorded with the reason)

### Every screen
- **Nothing the screen does today is dropped silently.** Where the brief omits a control, it moves
  inside the closest new element (an expanded row, a sheet) rather than disappearing.
- `.glow-violet-soft` and `--surface-sunken` are added as the brief asks, per theme where needed.
- `TrainerNudge` is restyled ONCE to the 2a coach-note look, so Home, Nutrition and Exercise share it.

### Home (2a)
- **Coach note rotates only plain tips.** An adaptation message carries Yes/No actions; it is shown
  alone and never rotates away (a question must not vanish while being read). Plain tips: the coach
  tips that are eligible today (a new function returns ALL eligible rules, not a seeded one), and
  `whatsLeftLine` as its own tip. One tip: no dots, no rotation. None: no note.
- **Rotation is pausable** (WCAG 2.2.2, moving content over 5s): it never auto-rotates under
  `prefers-reduced-motion`, pauses while focused or pressed, and a tap advances. 6s, fade .25s.
- **"Ask ↗" prefill bug fixed**: ChatAssistant read `takeChatPrefill()` once at mount and is always
  mounted, so a prefill set later was never read. Found by the Home trace, by reading.
- **Streak keeps "sessions in a row"** (an existing pinned rule), not the brief's "day streak".
- **Done state**: time from the stored session duration; PR count from records beaten today;
  sets from the shared `sessionSetCount` (so a short session reads "5/19 sets", her M39 ruling).
- **Weight panel opens the weigh-in** (the Weight cell was its only door) and keeps
  "since you started" as the measure for the change.
- **Volume this week**: logged working sets Mon..today vs last week Mon..same weekday — never a
  partial week against a whole one. No % when last week had none.
- Unknown / moved / rest hero branches keep their words in the new panel.
- Coach prompt's description of Home (chat-gemini + coach-rules) updated → needs the chat-gemini deploy.

### Nutrition (2b)
- **Unlogged meals other than "Up next" stay**, as a "Later" list between Up next and Eaten. Every row
  (later or eaten) expands to the existing full meal row with all its controls.
- **Fat**: a muted line under the ring key (the brief's own suggestion for its open question).
- The coach line keeps the real shortfall rule's words and silence; the brief's sentence is an example.
- The planned-day verdict (`TotalsHero`, her 10 Oct "one calculation" ruling) stays, compact, above
  the meal lists. Day strip, Regenerate all, allergy line, Target row: kept.

### Exercise (2c)
- Week row: "Week n of N · {phase}" from real data (there is no "Build" phase; phases are Adaptation,
  Hypertrophy …). Minutes move to the hero meta row.
- Day strip states: done/partial → accent dot (partial hollow), missed → warn dot, rest kinds → no
  dot + dim name, swapped/moved/rest_chosen → dim hollow dot; aria-label stays `dayLabel(d)`.
- Hero sets count is `sessionSetCount` (capped, the same count Home and the finished bar use).
- **The fixed CTA during a session logs the next set through the row's own tick**, label and save
  read from the same set-row functions; while resting the dock owns the bottom. Finish session stays
  in the hero. (Reverses the pinned "bar only before the session starts", because her design draws it.)
- Warm-up "done": no source exists; no check is drawn (an invented "done" would claim something the
  app does not know).
- Collapsed rows: index, name, set dots, prescription, load chip (progressing = `didProgress`, from
  the logged history the app already reads). Tapping expands inline as today.

### Profile (2d)
- Becomes a full-screen page with four groups of rows; each row opens its existing editors in a
  sheet. Deep links (dietary, goals, facts, context) open the matching sheet.
- "‹ {tab}" names the tab it returns to (it closes back to whatever was behind).
- "Tone" row opens the existing reply-speed control (the only "Tone" there is; no persona editor exists).
- Stat strip needs the live calorie target: new prop from App's `macros`.

### Setup (2e)
- One question per screen. The question's own card is the screen; earlier turns are not shown,
  except the last thing said as a bubble.
- **Skip only where a question can already be skipped** (`canDeclineSlot`); never on a required
  question, never past injuries or diet unasked.
- No new questions (the mock's "days a week" is an example; the real question is which days).
- "{Section} · n of N" and six ticks: sections derived from the slot order (Training, Body, Food).
  This reverses the v2 "no visible count" choice, because her brief draws one.
- Select then Next for single-choice; free text still goes through the existing parser; the mic
  appears only where speech is supported. The review step stays as the last screen.

### Round timer (4c)
- Beep, buzz, countdown and full-screen-on-start live in their own small stored record, not the
  timer record (which is rebuilt from scratch at four sites and would drop them).
- Buzz is hidden where the phone cannot vibrate (iPhone), so nothing is offered that does nothing.
- Beep/buzz switches gate only the round timer's cues; the rest timer's chime is untouched.
- Steppers write a draft (selected) config; tapping Custom saves it; a draft matching a preset
  lights that preset.

## Known collisions with other branches
- `claude/coach-empty-text-fix-2c4bzv` (week boundaries, layoff, circuit log, user-test fixes)
  touches Dashboard, the timers and Home tips. Whichever merges second resolves conflicts.
