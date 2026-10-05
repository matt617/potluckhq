/** HTTP API contract shared by the Lambda router and the web client. */
import type {
  Community,
  DietProfile,
  ImportJob,
  MealPlan,
  Membership,
  PlanConstraint,
  PlanEntry,
  Recipe,
  RecipeSummary,
  Role,
  ShoppingList,
  TierId,
  UserProfile,
} from './types.js';
import type { Budget } from './metering.js';

export interface LinkedChannel {
  kind: 'telegram' | 'whatsapp' | 'sms';
  address: string;
  linkedAt: string;
}

export interface MeResponse {
  user: UserProfile;
  budget: Budget;
  communities: (Community & { role: Role })[];
  channels: LinkedChannel[];
}

export interface PublicConfig {
  telegramBotUsername?: string;
  whatsappNumber?: string;
  smsNumber?: string;
  mediaBaseUrl: string;
  tiers: { id: TierId; name: string; priceCents: number; maxCommunities: number; maxMembersPerCommunity: number; importsPerMonth: number; aiFeatures: boolean; aiAllowanceMicros: number }[];
  creditPacks: { id: string; priceCents: number; creditMicros: number }[];
  billingEnabled: boolean;
}

export interface UpdateMeRequest {
  displayName?: string;
  defaultCommunityId?: string;
  units?: 'us' | 'metric';
  diet?: Partial<DietProfile>;
}

export interface CreateCommunityRequest { name: string; description?: string }
export interface UpdateCommunityRequest { name?: string; description?: string; pantryStaples?: string[] }

export interface CommunityDetail {
  community: Community;
  role: Role;
  members: Membership[];
  ownerTier: TierId;
}

export interface CreateInviteRequest { role?: 'admin' | 'member'; email?: string }
export interface InviteResponse { token: string; url: string; expiresAt: string }
export interface InvitePreview { communityName: string; invitedByName: string; expiresAt: string; full: boolean }

export interface CreateImportRequest {
  communityId: string;
  url?: string;
  imageKeys?: string[];
  text?: string;
}
export interface UploadUrlRequest { contentType: string }
export interface UploadUrlResponse { key: string; uploadUrl: string }

export interface RecipeListResponse { recipes: RecipeSummary[] }
/** Short-lived playback URLs for a technique's stored video, signed for the viewer. */
export interface RecipeMedia {
  videoUrl: string;
  clips: { startSec: number; endSec: number; url: string; posterUrl?: string }[];
  expiresAt: string;
}
export interface RecipeResponse { recipe: Recipe; canEdit: boolean; media?: RecipeMedia }
export type UpdateRecipeRequest = Partial<Pick<Recipe, 'title' | 'description' | 'servings' | 'prepMin' | 'cookMin' | 'tags' | 'ingredients' | 'steps' | 'tips' | 'cuisine'>>;
export interface ShareRecipeRequest { communityId: string }

export interface SavePlanRequest { entries: PlanEntry[]; constraints?: PlanConstraint[]; notes?: string }
export interface SuggestPlanRequest {
  constraints: PlanConstraint[];
  notes?: string;
  /** Days (0..6) nobody is cooking, e.g. travel days. */
  awayDays?: number[];
  slots?: ('breakfast' | 'lunch' | 'dinner' | 'snack')[];
  servings?: number;
  /** Allow suggestions of new dishes not yet in the book. */
  allowNewIdeas?: boolean;
}
export interface SuggestPlanResponse {
  plan: MealPlan;
  newIdeas: { title: string; why: string; searchQuery: string }[];
  costMicros: number;
}

export interface AddShoppingItemRequest { name: string; amount?: string }
export interface PatchShoppingItemRequest { checked?: boolean; remove?: boolean }

export interface CheckoutRequest { tier?: Exclude<TierId, 'free'>; creditPackId?: string }
export interface UrlResponse { url: string }

export interface LinkCodeResponse { code: string; expiresAt: string; instructions: string }

export interface ImportsResponse { imports: ImportJob[] }
export interface PlanResponse { plan: MealPlan; recipes: RecipeSummary[] }
export interface ShoppingListResponse { list: ShoppingList }

export interface ApiError { error: string; code?: string }
