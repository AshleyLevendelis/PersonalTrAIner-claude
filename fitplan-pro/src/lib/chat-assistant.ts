import type { UserProfile, MacroTargets, WorkoutDay, MealPlanDay } from './types'
import { getActivityLabel, getGoalLabel } from './calculations'

interface ChatContext {
  profile: UserProfile
  macros: MacroTargets
  exercisePlan: WorkoutDay[]
  mealPlan: MealPlanDay[]
}

function normalizeQuery(input: string): string {
  return input.toLowerCase().trim()
}

export function generateChatResponse(userMessage: string, context: ChatContext): string {
  const query = normalizeQuery(userMessage)

  if (query.includes('calorie') || query.includes('calories') || query.includes('tdee') || query.includes('bmr')) {
    return `Based on your profile, here's your calorie breakdown:\n\n` +
      `- BMR (Basal Metabolic Rate): ${Math.round(context.profile.bmr || 0)} kcal/day\n` +
      `- TDEE (Total Daily Energy Expenditure): ${Math.round(context.profile.tdee || 0)} kcal/day\n` +
      `- Daily Calorie Target: ${context.macros.calories} kcal/day\n\n` +
      `Your TDEE is calculated using the Mifflin-St Jeor equation combined with your activity level (${getActivityLabel(context.profile.activity_level)}). ` +
      `Your calorie target is adjusted for your goal: ${getGoalLabel(context.profile.fitness_goal)}.`
  }

  if (query.includes('macro') || query.includes('protein') || query.includes('carb') || query.includes('fat')) {
    return `Here are your daily macronutrient targets:\n\n` +
      `- Protein: ${context.macros.protein}g (${Math.round(context.macros.protein * 4 / context.macros.calories * 100)}% of calories)\n` +
      `- Carbohydrates: ${context.macros.carbs}g (${Math.round(context.macros.carbs * 4 / context.macros.calories * 100)}% of calories)\n` +
      `- Fat: ${context.macros.fat}g (${Math.round(context.macros.fat * 9 / context.macros.calories * 100)}% of calories)\n\n` +
      `These macros are optimized for your goal of "${getGoalLabel(context.profile.fitness_goal)}". ` +
      `Protein supports muscle repair, carbs fuel your workouts, and fat supports hormone production.`
  }

  if (query.includes('workout') || query.includes('exercise') || query.includes('training') || query.includes('gym')) {
    const days = context.exercisePlan.map(d => `${d.day}: ${d.focus}`).join('\n- ')
    return `Your weekly training schedule:\n\n- ${days}\n\n` +
      `This split is designed for your ${context.exercisePlan.length}-day training schedule. ` +
      `Each session includes compound movements for maximum efficiency. ` +
      `Remember to warm up for 5-10 minutes before each session and cool down with stretching afterward.`
  }

  if (query.includes('meal') || query.includes('food') || query.includes('eat') || query.includes('diet') || query.includes('nutrition')) {
    const meals = context.mealPlan.map(m => `${m.meal}: ${m.items[0].name} (${m.items[0].calories} kcal)`).join('\n- ')
    return `Your daily meal plan:\n\n- ${meals}\n\n` +
      `Each meal is designed to meet your macronutrient targets. You can swap any meal for its listed substitution. ` +
      `Try to eat your meals at consistent times each day for optimal energy and digestion.`
  }

  if (query.includes('substitute') || query.includes('swap') || query.includes('alternative') || query.includes('replace')) {
    const subs = context.mealPlan.map(m =>
      `${m.meal}: ${m.items[0].name} -> ${m.items[0].substitution}`
    ).join('\n- ')
    return `Here are meal substitutions you can make:\n\n- ${subs}\n\n` +
      `For exercise substitutions, check the exercise plan table -- each exercise has an alternative listed. ` +
      `Substitutions maintain similar macronutrient profiles and muscle activation patterns.`
  }

  if (query.includes('progress') || query.includes('track') || query.includes('measure')) {
    return `Tips for tracking your progress:\n\n` +
      `1. Weigh yourself at the same time each day (morning, after bathroom)\n` +
      `2. Track weekly averages, not daily fluctuations\n` +
      `3. Take progress photos every 2-4 weeks\n` +
      `4. Log your workouts to track strength gains\n` +
      `5. Monitor energy levels and sleep quality\n\n` +
      `For your goal of "${getGoalLabel(context.profile.fitness_goal)}", aim for gradual changes over 4-8 weeks before reassessing.`
  }

  if (query.includes('rest') || query.includes('recovery') || query.includes('sleep')) {
    return `Recovery is essential for results:\n\n` +
      `- Aim for 7-9 hours of sleep per night\n` +
      `- Take at least ${7 - context.exercisePlan.length} rest days per week\n` +
      `- Stay hydrated (aim for 3+ liters/day)\n` +
      `- Consider active recovery (walking, yoga) on rest days\n` +
      `- Manage stress, as cortisol can hinder progress\n\n` +
      `Your muscles grow during rest, not during training. Don't skip recovery days.`
  }

  if (query.includes('hello') || query.includes('hi') || query.includes('hey')) {
    return `Hello! I'm your fitness assistant. I can help you with:\n\n` +
      `- Understanding your calorie and macro targets\n` +
      `- Explaining your workout plan\n` +
      `- Discussing meal options and substitutions\n` +
      `- Tips on progress tracking and recovery\n` +
      `- General fitness guidance\n\n` +
      `What would you like to know?`
  }

  if (query.includes('weight') && (query.includes('lose') || query.includes('gain'))) {
    if (context.profile.fitness_goal === 'fat_loss') {
      return `For safe weight loss:\n\n` +
        `- Your deficit is ~${Math.round((context.profile.tdee || 0) - context.macros.calories)} calories below maintenance\n` +
        `- Expected loss: 0.5-1 lb per week\n` +
        `- Prioritize protein (${context.macros.protein}g/day) to preserve muscle\n` +
        `- Don't go below your BMR of ${Math.round(context.profile.bmr || 0)} calories\n` +
        `- Be patient -- sustainable fat loss takes time\n\n` +
        `If weight stalls for 2+ weeks, consider a diet break (eating at maintenance for 1 week) before continuing.`
    }
    return `For your goal of "${getGoalLabel(context.profile.fitness_goal)}":\n\n` +
      `- Your daily target is ${context.macros.calories} calories\n` +
      `- Consistency with your training and nutrition is key\n` +
      `- Adjust by 100-200 calories if progress stalls after 2-3 weeks\n` +
      `- Track your weight trend over weeks, not days`
  }

  return `I can help you with questions about:\n\n` +
    `- Your calorie and macronutrient targets\n` +
    `- Your workout schedule and exercises\n` +
    `- Meal plans and food substitutions\n` +
    `- Progress tracking and recovery tips\n` +
    `- Weight loss or muscle building strategies\n\n` +
    `Try asking something like "What are my macros?" or "Tell me about my workout plan" or "What should I eat for lunch?"`
}
