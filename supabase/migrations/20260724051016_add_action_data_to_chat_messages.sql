/*
# Add action_data column to chat_messages

1. Modified Tables
   - `chat_messages`
     - Added `action_data` (jsonb, nullable) — stores the PlanAction JSON object
       associated with assistant messages (food replacements, exercise swaps,
       schedule updates, volume adjustments, bans). Enables action badges to
       render correctly when chat history is reloaded.

2. Important Notes
   - Column is nullable because most messages (user messages and text-only
     assistant messages) will not have an associated action.
   - No index added since this column is not queried by value.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chat_messages'
      AND column_name = 'action_data'
  ) THEN
    ALTER TABLE chat_messages ADD COLUMN action_data jsonb;
  END IF;
END $$;
