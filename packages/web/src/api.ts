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
  config: () => publicGet<PublicConfig>('/public/config'),
  invitePreview: (token: string) => publicGet<InvitePreview>(`/public/invites/${enc(token)}`),

  me: () => request<MeResponse>('GET', '/api/me'),
  updateMe: (body: UpdateMeRequest) => request<MeResponse>('PATCH', '/api/me', body),
  linkCode: () => request<LinkCodeResponse>('POST', '/api/me/link-code'),
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
  shareRecipe: (rid: string, communityId: string) => request<Ok>('POST', `/api/recipes/${enc(rid)}/share`, { communityId }),

  uploadUrl: (contentType: string) => request<UploadUrlResponse>('POST', '/api/uploads', { contentType }),
  createImport: (body: CreateImportRequest) => request<ImportJob>('POST', '/api/imports', body),
  imports: () => request<ImportsResponse>('GET', '/api/imports'),
  importJob: (id: string) => request<ImportJob>('GET', `/api/imports/${enc(id)}`),

  plan: (cid: string, week: string) => request<PlanResponse>('GET', `/api/communities/${enc(cid)}/plans/${enc(week)}`),
  savePlan: (cid: string, week: string, body: SavePlanRequest) => request<PlanResponse>('PUT', `/api/communities/${enc(cid)}/plans/${enc(week)}`, body),
  suggestPlan: (cid: string, week: string, body: SuggestPlanRequest) =>
    request<SuggestPlanResponse>('POST', `/api/communities/${enc(cid)}/plans/${enc(week)}/suggest`, body),

  list: (cid: string, week: string) => request<ShoppingListResponse>('GET', `/api/communities/${enc(cid)}/lists/${enc(week)}`),
  generateList: (cid: string, week: string) => request<ShoppingListResponse>('POST', `/api/communities/${enc(cid)}/lists/${enc(week)}/generate`),
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
