/*
# Add display_name column to fitness_profiles

1. Modified Tables
  - `fitness_profiles`
    - `display_name` (text, nullable) - The name/nickname the user wants the AI coach to call them. Used in chat greetings and personalized coaching responses.

2. Security
  - No policy changes needed (existing anon+authenticated CRUD policies cover new column).

3. Important Notes
  - Column is nullable but the onboarding UI enforces it as mandatory.
  - Used by the AI chat system prompt to address the user by name.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fitness_profiles' AND column_name = 'display_name'
  ) THEN
    ALTER TABLE fitness_profiles ADD COLUMN display_name text;
  END IF;
END $$;