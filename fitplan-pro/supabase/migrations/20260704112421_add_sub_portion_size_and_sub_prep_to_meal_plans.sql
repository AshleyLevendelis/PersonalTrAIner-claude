DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meal_plans' AND column_name = 'sub_portion_size') THEN
    ALTER TABLE meal_plans ADD COLUMN sub_portion_size text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meal_plans' AND column_name = 'sub_prep') THEN
    ALTER TABLE meal_plans ADD COLUMN sub_prep text;
  END IF;
END $$;
