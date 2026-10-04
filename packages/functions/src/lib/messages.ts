import { AISLES, DAY_NAMES, MEAL_SLOTS, shoppingListText, weekStartOf, type Aisle, type MealPlan, type Recipe, type RecipeSummary, type ShoppingList } from '@potluck/core';
import { env } from './env.js';

export const aisleLabel = (a: Aisle) => AISLES.find((x) => x.id === a)?.label ?? a;

export function recipeLink(recipeId: string): string {
  return `${env.appUrl}/book/${recipeId}`;
}

export function recipeReadyText(recipe: Recipe, communityName: string): string {
  const time = recipe.totalMin ? ` · ${recipe.totalMin} min` : '';
  const protein = recipe.nutrition ? ` · ~${recipe.nutrition.proteinG} g protein/serving` : '';
  const estimated = recipe.ingredients.some((i) => i.estimated) ? '\nSome amounts were estimated because the video did not say. Check them before cooking.' : '';
  return `*${recipe.title}* is in ${communityName}'s book.\nServes ${recipe.servings}${time}${protein}\n${recipe.ingredients.length} ingredients, ${recipe.steps.length} steps.${estimated}\n\n${recipeLink(recipe.id)}`;
}

export function planText(plan: MealPlan | undefined, recipes: Map<string, RecipeSummary>, communityName: string): string {
  const week = plan?.weekStart ?? weekStartOf();
  if (!plan || !plan.entries.length) return `No meals planned for the week of ${week} in ${communityName} yet.\nPlan it here: ${env.appUrl}/plan`;
  const lines = [`*${communityName} - week of ${week}*`];
  for (let d = 0; d < 7; d++) {
    const day = plan.entries.filter((e) => e.day === d).sort((a, b) => MEAL_SLOTS.indexOf(a.slot) - MEAL_SLOTS.indexOf(b.slot));
    if (!day.length) continue;
    lines.push('', `*${DAY_NAMES[d]}*`);
    for (const e of day) {
      const title = e.recipeId ? recipes.get(e.recipeId)?.title ?? 'Recipe' : e.label ?? '';
      lines.push(`• ${e.slot}: ${title}${e.leftoverOf ? ' (leftovers)' : ''}`);
    }
  }
  return lines.join('\n');
}

export function listText(list: ShoppingList | undefined, communityName: string): string {
  if (!list || !list.items.length) return `The shopping list for ${communityName} is empty. Generate it from your plan: ${env.appUrl}/shop`;
  return `🛒 *${communityName} shopping list*\n\n${shoppingListText(list.items, aisleLabel)}`;
}

export const HELP_TEXT = `Send me a recipe link from TikTok, Instagram, YouTube, Facebook or a recipe site, a photo of a cookbook page, or a cooking video, and I'll add it to your recipe book.

Commands:
• *plan* - this week's meal plan
• *shop* - this week's shopping list
• *recipes* - your latest recipes
• *communities* - list your communities
• *use <name>* - choose where new recipes go
• Add *#name* after a link to send it to a specific community`;
