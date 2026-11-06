# The coach texts you: put it live (6 Nov 2026)

Paste the block below into Claude Code in VS Code, in the PersonalTrAIner-claude folder, AFTER Ashley's "merge".
Steps marked (Ashley types) need the yes-production phrase.

```
GOAL: put the "coach texts you" change live, then prove it on Ashley's Android phone. You are on Ashley's machine; a
cloud session wrote this and cannot see your environment, so verify every step yourself and report what you saw.

WHY: on 6 Nov 2026 Ashley asked for reminders to feel like a WhatsApp message from her coach. The change:
- A reminder is now a real coach message in the chat. The notification is titled "Trainer", reads like
  "Hey Ashley, are you ready for your session today?", and the same words are in the chat when she opens it. Session
  and food reminders have a small button under them in the chat.
- A coach REPLY pings her phone like a text when she has left the app, and is saved in the chat even if the app
  closed mid-reply. It does not ping while she is looking at the app.
- Profile > Reminders has Light (1 a day), Normal (up to 3), Lots (up to 5), and a "Message me when the coach
  replies" switch.
The app part goes live with the merge (Vercel). Two edge functions changed and must be deployed: coach-reach-out
and chat-gemini. A new shared file, supabase/functions/_shared/push.ts, is bundled with both. No migration.

WHAT YOU CANNOT DO: anything needing the typed phrase yes-production. Prepare it and tell Ashley what to type.
Never print or ask for a secret.

STEP 1. Code
  git fetch origin && git checkout claude/coach-empty-text-fix-2c4bzv && git pull origin claude/coach-empty-text-fix-2c4bzv
  VERIFY: git log --oneline origin/main | grep "The coach texts you"   prints one line (Ashley's "merge" landed it).
  If it prints nothing, stop: main does not have it yet.
  VERIFY: git diff --stat origin/main...HEAD -- supabase/   prints NOTHING.
  On Windows, if a deploy refuses a _shared copy as STALE, run npm run sync:shared (rewrites line endings only) and
  confirm git diff is empty before retrying.

STEP 2. Deploy to TEST (you can):  npm run deploy:functions:test
  VERIFY: it names vswuurrtbzbrgubddefv and lists coach-reach-out and chat-gemini as deployed.

STEP 3. Deploy to PRODUCTION (Ashley types):  npm run deploy:functions:prod
  VERIFY with her: it names sdkhuczcfnqqimdgfiks before the phrase and both functions after.
  VERIFY: curl the PRODUCTION ?vapid endpoint as on 5 Nov: still 200 with a publicKey (the key code moved into
  _shared/push.ts; this proves the move deployed).

STEP 4. Her name (PRODUCTION SQL editor, a read):  select display_name from fitness_profiles where id = '<her id>';
  If it is empty, the messages say "Hey, ..." with no name. Tell Ashley; she can set her name on Profile.

STEP 5. A reply that pings (Ashley does this on her phone; nothing for you to run):
  a) Open the app, Profile > Reminders: the three choices (Light / Normal / Lots) and the replies switch are there.
  b) Open the chat, send the coach a question, and IMMEDIATELY leave the app (home button).
  c) VERIFY with her: within about half a minute a notification titled "Trainer" shows the coach's reply; tapping
     it opens the chat with the reply at the bottom.
  d) Ask again with the chat open and stay on it: VERIFY no notification pops up over the chat.
  e) If no ping arrives: the chat-gemini logs (Supabase dashboard > Edge Functions > chat-gemini > Logs) should show
     "[chat-gemini] reply push: sent". Report what the logs say, word for word.

STEP 6. A reminder as a message (needs a real moment, so it may be the next morning):
  VERIFY with her: the next reminder is titled "Trainer", starts "Hey Ashley, ...", and the same message is at the
  bottom of the chat when she taps it, with "Open today's session" under a training-day one.
  (PRODUCTION SQL editor, a read)  select content, action_data, created_at from chat_messages
    where action_data->>'source' = 'reminder' order by created_at desc limit 3;   shows the rows.

DONE MEANS: both functions deployed to TEST and PRODUCTION; ?vapid still answers; a reply pinged her phone with the
app closed and did not ping with the chat open; the next reminder is in the chat. Report each as seen, or not yet.
```
