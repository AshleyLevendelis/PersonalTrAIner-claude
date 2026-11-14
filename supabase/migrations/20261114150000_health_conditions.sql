-- What a doctor has said to watch, ticked in setup's injuries card or on Profile (his ruling 14 Nov 2026, "Fold into
-- injuries"; src/lib/health-conditions.ts). Not joints, so never stored in `injuries`. Empty means none.
-- Codes: high_blood_pressure, heart_condition, diabetes, blood_thinners, pregnancy.
-- Before this runs, the app's insert retries without the column and Profile's row says it is not switched on yet.
ALTER TABLE fitness_profiles ADD COLUMN IF NOT EXISTS health_conditions text[] NOT NULL DEFAULT '{}';
