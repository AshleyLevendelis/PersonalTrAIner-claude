-- Additive, nullable — old snapshot rows have no anchor and are treated as
-- "no prior anchor" by nutrition-targets.ts's getEffectiveTargetWeightKg,
-- which is exactly the correct fallback (recompute fresh, same as today).
alter table daily_nutrition_targets add column if not exists calculated_weight_kg numeric;
