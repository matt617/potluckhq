/** Shared domain types. Everything persisted in DynamoDB or sent over the API is described here. */

export type TierId = 'free' | 'plus' | 'pro';
export type Role = 'owner' | 'admin' | 'member';
export type ChannelKind = 'telegram' | 'whatsapp' | 'sms' | 'web';
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export type Aisle =
  | 'produce'
  | 'meat_seafood'
  | 'dairy_eggs'
  | 'bakery'
  | 'pantry'
  | 'spices'
  | 'frozen'
  | 'beverages'
  | 'condiments'
  | 'other';

export const AISLES: { id: Aisle; label: string }[] = [
  { id: 'produce', label: 'Produce' },
  { id: 'meat_seafood', label: 'Meat & seafood' },
  { id: 'dairy_eggs', label: 'Dairy & eggs' },
  { id: 'bakery', label: 'Bakery' },
  { id: 'pantry', label: 'Pantry' },
  { id: 'spices', label: 'Spices' },
  { id: 'condiments', label: 'Sauces & condiments' },
  { id: 'frozen', label: 'Frozen' },
  { id: 'beverages', label: 'Beverages' },
  { id: 'other', label: 'Other' },
];

export interface Ingredient {
  /** Numeric amount, or null for "to taste" style items. */
  quantity: number | null;
  /** Normalized unit such as "g", "cup", "tbsp", "clove"; empty string when count-only. */
  unit: string;
  /** Ingredient name without quantity, e.g. "yellow onion". */
  name: string;
  /** Prep note such as "finely diced". */
  note?: string;
  aisle: Aisle;
  /** True when Gemini had to estimate the amount because the video did not state it. */
  estimated?: boolean;
  /** Optional sub-group heading, e.g. "Sauce". */
  group?: string;
}

export interface Step {
  text: string;
  /** Seconds into the source video where this step starts, when known. */
  timestampSec?: number | null;
  /** Seconds into the source video where this step's action ends; used to cut technique clips. */
  endSec?: number | null;
  durationMin?: number | null;
}

/** Recipes are planned and shopped for; techniques teach a cooking method and are only watched. */
export type RecipeKind = 'recipe' | 'technique';

export interface TechniqueDetails {
  /** One or two sentences on what the technique is. */
  summary?: string;
  /** The food science or reason it works, when the video explains it. */
  whyItWorks?: string;
  /** Dishes or ingredients the technique is used for, e.g. "beef stir-fry". */
  appliesTo: string[];
  /** Common mistakes the video warns about. */
  mistakes: string[];
}

/** Short muted loop of one moment in a stored video. */
export interface VideoClip {
  startSec: number;
  endSec: number;
  /** Private media key; served through short-lived signed URLs. */
  key: string;
  posterKey?: string;
}

/** A video kept for playback (technique videos only). Keys are private; never served from /media. */
export interface StoredVideo {
  key: string;
  mimeType: string;
  durationSec?: number;
  clips: VideoClip[];
}

export interface Nutrition {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export interface RecipeSource {
  url?: string;
  platform: Platform;
  author?: string;
  thumbnailKey?: string;
}

export type Platform =
  | 'tiktok'
  | 'instagram'
  | 'youtube'
  | 'facebook'
  | 'pinterest'
  | 'x'
  | 'web'
  | 'photo'
  | 'upload'
  | 'text';

export interface Recipe {
  id: string;
  /** Missing on older records, which are all recipes. */
  kind?: RecipeKind;
  ownerId: string;
  title: string;
  description?: string;
  servings: number;
  prepMin?: number | null;
  cookMin?: number | null;
  totalMin?: number | null;
  cuisine?: string;
  tags: string[];
  ingredients: Ingredient[];
  steps: Step[];
  /** Per serving, estimated by AI. */
  nutrition?: Nutrition | null;
  equipment?: string[];
  tips?: string[];
  technique?: TechniqueDetails;
  video?: StoredVideo;
  source: RecipeSource;
  communityIds: string[];
  /** Overall extraction confidence 0..1 reported by the model. */
  confidence?: number;
  createdAt: string;
  updatedAt: string;
}

/** Lightweight copy stored per community for list views. */
export interface RecipeSummary {
  id: string;
  kind?: RecipeKind;
  title: string;
  ownerId: string;
  addedBy: string;
  tags: string[];
  totalMin?: number | null;
  servings: number;
  thumbnailKey?: string;
  platform: Platform;
  proteinG?: number | null;
  calories?: number | null;
  addedAt: string;
}

export interface DietProfile {
  allergies: string[];
  /** e.g. vegetarian, pescatarian, keto */
  diets: string[];
  dislikes: string[];
  /** Free-form goals, e.g. "build muscle, 4 lifting days" */
  goals?: string;
  /** User opted in to GLP-1 friendly suggestions (smaller, protein-forward portions). */
  glp1?: boolean;
  dailyProteinTargetG?: number | null;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  tier: TierId;
  defaultCommunityId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: string;
  diet: DietProfile;
  units: 'us' | 'metric';
  /** Purchased AI credit balance in micro-USD of raw model cost. */
  aiCreditMicros: number;
  /** Month key (YYYY-MM) the usage counters below belong to. */
  usageMonth: string;
  aiUsedMicros: number;
  importsUsed: number;
  createdAt: string;
}

export interface Community {
  id: string;
  name: string;
  ownerId: string;
  description?: string;
  memberCount: number;
  pantryStaples: string[];
  createdAt: string;
}

export interface Membership {
  communityId: string;
  userId: string;
  role: Role;
  displayName: string;
  joinedAt: string;
}

export interface Invite {
  token: string;
  communityId: string;
  communityName: string;
  invitedBy: string;
  role: Exclude<Role, 'owner'>;
  email?: string;
  expiresAt: string;
}

export type ImportStatus = 'queued' | 'downloading' | 'extracting' | 'done' | 'failed';

/** Why an import failed, so clients can phrase it and offer the right next step. */
export type ImportErrorCode =
  | 'blocked'
  | 'too_long'
  | 'unsupported'
  | 'download'
  | 'busy'
  | 'quota'
  | 'not_recipe'
  | 'unreadable'
  | 'internal';

export interface ImportJob {
  id: string;
  userId: string;
  communityId: string;
  status: ImportStatus;
  kind: 'url' | 'image' | 'video' | 'text';
  url?: string;
  /** S3 keys for uploaded photos. */
  imageKeys?: string[];
  /** S3 key for a video sent directly to a bot. */
  videoKey?: string;
  text?: string;
  channel: ChannelKind;
  /** Where to send the result for messaging channels (chat id / phone). */
  replyTo?: string;
  recipeId?: string;
  error?: string;
  errorCode?: ImportErrorCode;
  /** Set when the user hides a failed import from their list. */
  dismissedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanEntry {
  id: string;
  /** 0 = first day of the week (Monday). */
  day: number;
  slot: MealSlot;
  recipeId?: string;
  /** Free text when no recipe, e.g. "Eat out" or "Leftovers". */
  label?: string;
  servings: number;
  /** Plan entry id this one reuses as leftovers. */
  leftoverOf?: string;
  note?: string;
}

export type PlanConstraint =
  | 'travel'
  | 'long_workdays'
  | 'long_weekend'
  | 'glp1'
  | 'workout'
  | 'budget'
  | 'quick'
  | 'batch_cook';

export const PLAN_CONSTRAINTS: { id: PlanConstraint; label: string; hint: string }[] = [
  { id: 'travel', label: 'Travel', hint: 'Away some days; skip cooking, use portable or freezer-friendly food.' },
  { id: 'long_workdays', label: 'Long work days', hint: 'Weeknight dinners under 30 minutes or prepped ahead.' },
  { id: 'long_weekend', label: 'Long weekend', hint: 'Time for a project cook or hosting on the weekend.' },
  { id: 'glp1', label: 'GLP-1', hint: 'Smaller, protein-forward, fiber-rich portions; gentle on the stomach.' },
  { id: 'workout', label: 'Workout routine', hint: 'Higher protein, carbs around training days.' },
  { id: 'budget', label: 'Budget', hint: 'Reuse ingredients across meals, fewer specialty items.' },
  { id: 'quick', label: 'Quick meals', hint: 'Everything under 30 minutes.' },
  { id: 'batch_cook', label: 'Batch cooking', hint: 'Cook once, eat twice; plan leftovers deliberately.' },
];

export interface MealPlan {
  communityId: string;
  /** ISO date (YYYY-MM-DD) of the Monday the plan starts on. */
  weekStart: string;
  entries: PlanEntry[];
  constraints: PlanConstraint[];
  notes?: string;
  /** Rationale returned by the AI planner, shown to users. */
  aiSummary?: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface ShoppingItem {
  key: string;
  name: string;
  quantity: number | null;
  unit: string;
  aisle: Aisle;
  checked: boolean;
  /** True when added by hand rather than generated from the plan. */
  manual?: boolean;
  /** True when this matches a pantry staple; shown collapsed. */
  staple?: boolean;
  recipeIds: string[];
  /** Human readable amount, e.g. "2 cups + 3 tbsp". */
  display: string;
}

export interface ShoppingList {
  communityId: string;
  weekStart: string;
  items: ShoppingItem[];
  generatedAt: string;
  updatedAt: string;
}

/** Shape Gemini must return when extracting a recipe. */
export interface HeroMoment {
  timestampSec: number;
  why?: string;
}

export interface ExtractedRecipe {
  isRecipe: boolean;
  /** True when the video teaches a cooking method rather than a complete dish. */
  isTechnique?: boolean;
  reason?: string;
  title: string;
  description?: string;
  servings: number;
  prepMin?: number | null;
  cookMin?: number | null;
  cuisine?: string;
  tags: string[];
  ingredients: Ingredient[];
  steps: Step[];
  nutrition?: Nutrition | null;
  equipment?: string[];
  tips?: string[];
  author?: string;
  confidence: number;
  /** Other dishes found in the same video, if more than one was made. */
  additionalDishes?: string[];
  technique?: TechniqueDetails | null;
  /** Best moments for the preview image, best first. */
  heroMoments?: HeroMoment[];
  /** For photo imports: index of the most appetizing photo. */
  heroImageIndex?: number | null;
}
