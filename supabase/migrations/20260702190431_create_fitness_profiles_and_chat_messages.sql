/*
# Create fitness profiles and chat messages tables (single-tenant, no auth)

1. New Tables
  - `fitness_profiles`
    - `id` (uuid, primary key) - unique profile identifier
    - `age` (integer, not null) - user's age in years
    - `gender` (text, not null) - male or female
    - `height_cm` (numeric, not null) - height in centimeters
    - `weight_kg` (numeric, not null) - weight in kilograms
    - `activity_level` (text, not null) - sedentary/light/moderate/active/very_active
    - `fitness_goal` (text, not null) - lose_weight/maintain/build_muscle/improve_endurance
    - `training_days` (jsonb, not null) - array of day objects with availability
    - `preferred_time` (text, not null) - morning or evening
    - `bmr` (numeric) - calculated Basal Metabolic Rate
    - `tdee` (numeric) - calculated Total Daily Energy Expenditure
    - `calorie_target` (numeric) - daily calorie goal
    - `protein_g` (numeric) - daily protein target in grams
    - `carbs_g` (numeric) - daily carbs target in grams
    - `fat_g` (numeric) - daily fat target in grams
    - `created_at` (timestamptz) - when profile was created

  - `chat_messages`
    - `id` (uuid, primary key) - unique message identifier
    - `profile_id` (uuid, not null, FK) - references the fitness profile
    - `role` (text, not null) - user or assistant
    - `content` (text, not null) - message text
    - `created_at` (timestamptz) - when message was sent

2. Security
  - Enable RLS on both tables.
  - Allow anon + authenticated full CRUD (single-tenant, no sign-in required).
  - Data is intentionally shared/public since there is no authentication.

3. Indexes
  - Index on chat_messages.profile_id for fast lookups
  - Index on chat_messages.created_at for ordering
*/

CREATE TABLE IF NOT EXISTS fitness_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  age integer NOT NULL,
  gender text NOT NULL,
  height_cm numeric NOT NULL,
  weight_kg numeric NOT NULL,
  activity_level text NOT NULL,
  fitness_goal text NOT NULL,
  training_days jsonb NOT NULL DEFAULT '[]'::jsonb,
  preferred_time text NOT NULL,
  bmr numeric,
  tdee numeric,
  calorie_target numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE fitness_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_profiles" ON fitness_profiles;
CREATE POLICY "anon_select_profiles" ON fitness_profiles FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_profiles" ON fitness_profiles;
CREATE POLICY "anon_insert_profiles" ON fitness_profiles FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_profiles" ON fitness_profiles;
CREATE POLICY "anon_update_profiles" ON fitness_profiles FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_profiles" ON fitness_profiles;
CREATE POLICY "anon_delete_profiles" ON fitness_profiles FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES fitness_profiles(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_messages" ON chat_messages;
CREATE POLICY "anon_select_messages" ON chat_messages FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_messages" ON chat_messages;
CREATE POLICY "anon_insert_messages" ON chat_messages FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_messages" ON chat_messages;
CREATE POLICY "anon_update_messages" ON chat_messages FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_messages" ON chat_messages;
CREATE POLICY "anon_delete_messages" ON chat_messages FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_chat_messages_profile_id ON chat_messages(profile_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
