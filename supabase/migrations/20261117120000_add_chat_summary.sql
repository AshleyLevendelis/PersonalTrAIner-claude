-- THE COACH REMEMBERS OLDER CHATS (17 Nov 2026, the chat review). The running summary of messages that have left the
-- coach's 20-message window: { text, through } (src/lib/chat-summary.ts). Written by the app after a short coach call
-- and a check; cleared with the chat. Null until the first summary. The app keeps a copy on the phone, so nothing
-- breaks before this column exists (a write naming it is tolerated as missing).
alter table public.fitness_profiles add column if not exists chat_summary jsonb;
