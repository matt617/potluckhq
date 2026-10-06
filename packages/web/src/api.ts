import type { MemberCandidate, MemberNomination } from '@potluck/core';
/** Typed client for the Potluck HTTP API. Same origin, ID token as bearer. */
import type {
  AddShoppingItemRequest,
  CheckoutRequest,
  Community,
  CommunityDetail,
  CreateCommunityRequest,
  CreateImportRequest,
  CreateInviteRequest,
  ImportJob,
  ImportsResponse,
  InvitePreview,
  InviteResponse,
  LinkCodeResponse,
  MeResponse,
  Membership,
  PatchShoppingItemRequest,
  PlanResponse,
  PublicConfig,
  RecipeListResponse,
  RecipeResponse,
  Role,
  SavePlanRequest,
  ShoppingListResponse,
  SuggestPlanRequest,
  SuggestPlanResponse,
  UpdateCommunityRequest,
  UpdateMeRequest,
  UpdateRecipeRequest,
  UploadUrlResponse,
  UrlResponse,
} from '@potluck/core';
import { getIdToken, login } from './lib/auth';
import type { Budget, Diner, KitchenActivity, OwnershipTransfer, Recipe, RecipeAnnotation, TierConfig } from '@potluck/core';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isQuotaError(e: unknown): e is ApiError {
  return e instanceof ApiError && e.status === 402;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const err = (body ?? {}) as { error?: string; message?: string; code?: string };
    throw new ApiError(res.status, err.error || err.message || `Request failed (${res.status})`, err.code);
  }
  return body as T;
}

async function request<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
  const token = await getIdToken(retried);
  if (!token) return login();
  const res = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    if (!retried) return request<T>(method, path, body, true);
    return login();
  }
  return parse<T>(res);
}

async function publicGet<T>(path: string): Promise<T> {
  return parse<T>(await fetch(path));
}

const enc = encodeURIComponent;
type Ok = { ok: boolean };

export const api = {
  searchMembers: (cid: string, query: string, cursor?: string) =>
    request<{ members: MemberCandidate[]; cursor?: string }>('POST', `/api/communities/${enc(cid)}/member-search`, { query, cursor }),
  nominations: (cid: string) => request<{ nominations: MemberNomination[] }>('GET', `/api/communities/${enc(cid)}/nominations`),
  myNominations: () => request<{ nominations: MemberNomination[] }>('GET', '/api/me/nominations'),
  nominate: (cid: string, userId: string, role: 'member' | 'admin') =>
    request<{ nomination: MemberNomination }>('POST', `/api/communities/${enc(cid)}/nominations`, { userId, role }),
  cancelNomination: (cid: string, uid: string) => request<Ok>('DELETE', `/api/communities/${enc(cid)}/nominations/${enc(uid)}`),
  acceptNomination: (cid: string) => request<Community>('POST', `/api/communities/${enc(cid)}/nominations/accept`),
  startKitchen: () => request<Community>('POST', '/api/kitchens/start'),
  participation: (cid: string) =>
    request<{ weeks: { week: string; saved: boolean; planned: boolean; shopped: boolean; cooked: boolean; participants: number }[] }>(
      'GET',
      `/api/communities/${enc(cid)}/participation`,
    ),
  library: () => request<RecipeListResponse & { annotations: RecipeAnnotation[] }>('GET', '/api/library'),
  savePersonal: (rid: string) => request<{ recipe: Recipe }>('POST', `/api/library/${enc(rid)}`),
  annotate: (rid: string, body: Omit<RecipeAnnotation, 'recipeId'>) => request<RecipeAnnotation>('PUT', `/api/library/${enc(rid)}/annotation`, body),
  origin: (rid: string) => request<{ available: boolean; changed?: boolean; recipe?: Recipe }>('GET', `/api/recipes/${enc(rid)}/origin`),
  publishRecipe: (rid: string) => request<Ok>('POST', `/api/recipes/${enc(rid)}/publish`),
  applyOrigin: (rid: string, updatedAt: string, originUpdatedAt: string) =>
    request<RecipeResponse>('POST', `/api/recipes/${enc(rid)}/origin`, { updatedAt, originUpdatedAt }),
  diners: (cid: string) => request<{ diners: Diner[] }>('GET', `/api/communities/${enc(cid)}/people`),
  saveDiner: (cid: string, diner: Diner) => request<Diner>('PUT', `/api/communities/${enc(cid)}/people/${enc(diner.id)}`, diner),
  removeDiner: (cid: string, id: string) => request<Ok>('DELETE', `/api/communities/${enc(cid)}/people/${enc(id)}`),
  activity: (cid: string) => request<{ activity: KitchenActivity[] }>('GET', `/api/communities/${enc(cid)}/activity`),
  addActivity: (cid: string, body: Pick<KitchenActivity, 'recipeId' | 'kind' | 'note'>) =>
    request<KitchenActivity>('POST', `/api/communities/${enc(cid)}/activity`, body),
  removeActivity: (cid: string, id: string) => request<Ok>('DELETE', `/api/communities/${enc(cid)}/activity/${enc(id)}`),
  allowance: (cid: string) =>
    request<{ ownerName: string; ownerId: string; budget: Budget; tier: TierConfig }>('GET', `/api/communities/${enc(cid)}/allowance`),
  transfer: (cid: string) => request<{ transfer: OwnershipTransfer | null }>('GET', `/api/communities/${enc(cid)}/transfer`),
  offerTransfer: (cid: string, to: string) => request<{ transfer: OwnershipTransfer }>('POST', `/api/communities/${enc(cid)}/transfer`, { to }),
  cancelTransfer: (cid: string) => request<Ok>('DELETE', `/api/communities/${enc(cid)}/transfer`),
  acceptTransfer: (cid: string) => request<Ok>('POST', `/api/communities/${enc(cid)}/transfer/accept`),
  invites: (cid: string) => request<{ invites: { token: string; expiresAt: string; role: string }[] }>('GET', `/api/communities/${enc(cid)}/invites`),
  revokeInvite: (cid: string, token: string) => request<Ok>('DELETE', `/api/communities/${enc(cid)}/invites/${enc(token)}`),
  config: () => publicGet<PublicConfig>('/public/config'),
  invitePreview: (token: string) => publicGet<InvitePreview>(`/public/invites/${enc(token)}`),

  me: () => request<MeResponse>('GET', '/api/me'),
  updateMe: (body: UpdateMeRequest) => request<MeResponse>('PATCH', '/api/me', body),
  linkCode: () => request<LinkCodeResponse>('POST', '/api/me/link-code'),
  exportMe: () => request<unknown>('GET', '/api/me/export'),
  deleteMe: () => request<Ok>('DELETE', '/api/me'),
  unlinkChannel: (kind: string, address: string) => request<Ok>('DELETE', `/api/me/channels/${enc(kind)}/${enc(address)}`),

  createCommunity: (body: CreateCommunityRequest) => request<Community>('POST', '/api/communities', body),
  community: (cid: string) => request<CommunityDetail>('GET', `/api/communities/${enc(cid)}`),
  updateCommunity: (cid: string, body: UpdateCommunityRequest) => request<Community>('PATCH', `/api/communities/${enc(cid)}`, body),
  deleteCommunity: (cid: string) => request<Ok>('DELETE', `/api/communities/${enc(cid)}`),
  createInvite: (cid: string, body: CreateInviteRequest) => request<InviteResponse>('POST', `/api/communities/${enc(cid)}/invites`, body),
  setMemberRole: (cid: string, uid: string, role: Role) => request<Membership>('PATCH', `/api/communities/${enc(cid)}/members/${enc(uid)}`, { role }),
  removeMember: (cid: string, uid: string) => request<Ok>('DELETE', `/api/communities/${enc(cid)}/members/${enc(uid)}`),
  acceptInvite: (token: string) => request<Community>('POST', `/api/invites/${enc(token)}/accept`),

  recipes: (cid: string) => request<RecipeListResponse>('GET', `/api/communities/${enc(cid)}/recipes`),
  removeFromCommunity: (cid: string, rid: string) => request<Ok>('DELETE', `/api/communities/${enc(cid)}/recipes/${enc(rid)}`),
  recipe: (rid: string) => request<RecipeResponse>('GET', `/api/recipes/${enc(rid)}`),
  updateRecipe: (rid: string, body: UpdateRecipeRequest) => request<RecipeResponse>('PATCH', `/api/recipes/${enc(rid)}`, body),
  deleteRecipe: (rid: string) => request<Ok>('DELETE', `/api/recipes/${enc(rid)}`),
  shareRecipe: (rid: string, communityId: string) => request<Ok & { recipe: Recipe }>('POST', `/api/recipes/${enc(rid)}/share`, { communityId }),

  uploadUrl: (contentType: string) => request<UploadUrlResponse>('POST', '/api/uploads', { contentType }),
  createImport: (body: CreateImportRequest) => request<ImportJob>('POST', '/api/imports', body),
  imports: () => request<ImportsResponse>('GET', '/api/imports'),
  importJob: (id: string) => request<ImportJob>('GET', `/api/imports/${enc(id)}`),
  retryImport: (id: string) => request<ImportJob>('POST', `/api/imports/${enc(id)}/retry`),
  dismissImport: (id: string) => request<Ok>('POST', `/api/imports/${enc(id)}/dismiss`),

  plan: (cid: string, week: string) => request<PlanResponse>('GET', `/api/communities/${enc(cid)}/plans/${enc(week)}`),
  savePlan: (cid: string, week: string, body: SavePlanRequest) => request<PlanResponse>('PUT', `/api/communities/${enc(cid)}/plans/${enc(week)}`, body),
  suggestPlan: (cid: string, week: string, body: SuggestPlanRequest) =>
    request<SuggestPlanResponse>('POST', `/api/communities/${enc(cid)}/plans/${enc(week)}/suggest`, body),

  list: (cid: string, week: string) => request<ShoppingListResponse>('GET', `/api/communities/${enc(cid)}/lists/${enc(week)}`),
  previewList: (cid: string, week: string) =>
    request<ShoppingListResponse>('POST', `/api/communities/${enc(cid)}/lists/${enc(week)}/generate`, { preview: true }),
  generateList: (cid: string, week: string, planFingerprint: string) =>
    request<ShoppingListResponse>('POST', `/api/communities/${enc(cid)}/lists/${enc(week)}/generate`, { planFingerprint }),
  addListItem: (cid: string, week: string, body: AddShoppingItemRequest) =>
    request<ShoppingListResponse>('POST', `/api/communities/${enc(cid)}/lists/${enc(week)}/items`, body),
  patchListItem: (cid: string, week: string, key: string, body: PatchShoppingItemRequest) =>
    request<ShoppingListResponse>('PATCH', `/api/communities/${enc(cid)}/lists/${enc(week)}/items/${enc(key)}`, body),
  sendList: (cid: string, week: string) => request<{ ok: boolean; sentTo?: string }>('POST', `/api/communities/${enc(cid)}/lists/${enc(week)}/send`),

  checkout: (body: CheckoutRequest) => request<UrlResponse>('POST', '/api/billing/checkout', body),
  portal: () => request<UrlResponse>('POST', '/api/billing/portal'),
};

/** PUT a file straight to S3 using a presigned URL. */
export async function uploadToPresigned(url: string, file: File): Promise<void> {
  const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
}
