import type {
  AnalysisDetail,
  AnalysisJob,
  AnalysisListItem,
  FriendRead,
  FriendRequestRead,
  HandCreate,
  HandRead,
  MyStats,
  NotificationCounts,
  PreflopRange,
  ProfileRead,
  SimilarStudySpots,
  SharedHandRead
} from "./types";

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const API_BASE = env?.VITE_API_URL ?? "http://127.0.0.1:8000";

export interface ApiAuthContext {
  accessToken?: string | null;
  guestSessionId?: string | null;
}

export function requestInitWithAuth(accessToken?: string | null, options: RequestInit = {}, guestSessionId?: string | null): RequestInit {
  const providedHeaders = headersToRecord(options.headers);
  return {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(!accessToken && guestSessionId ? { "X-Guest-Session": guestSessionId } : {}),
      ...providedHeaders
    }
  };
}

async function request<T>(path: string, options: RequestInit = {}, auth?: string | null | ApiAuthContext): Promise<T> {
  const authContext = typeof auth === "object" && auth !== null ? auth : { accessToken: auth };
  const response = await fetch(`${API_BASE}${path}`, {
    ...requestInitWithAuth(authContext.accessToken, options, authContext.guestSessionId)
  });

  if (!response.ok) {
    const message = await errorMessageForResponse(response);
    throw new Error(message || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function saveHand(hand: HandCreate, auth?: string | null | ApiAuthContext): Promise<HandRead> {
  return request<HandRead>("/api/hands", {
    method: "POST",
    body: JSON.stringify(hand)
  }, auth);
}

export function analyzeHand(handId: number, auth?: string | null | ApiAuthContext): Promise<AnalysisJob> {
  return request<AnalysisJob>(`/api/hands/${handId}/analyze`, { method: "POST" }, auth);
}

export function listAnalysis(auth?: string | null | ApiAuthContext): Promise<AnalysisListItem[]> {
  return request<AnalysisListItem[]>("/api/analysis", {}, auth);
}

export function getAnalysis(handId: string | number, auth?: string | null | ApiAuthContext): Promise<AnalysisDetail> {
  return request<AnalysisDetail>(`/api/analysis/${handId}`, {}, auth);
}

export function syncProfile(username: string, accessToken?: string | null): Promise<ProfileRead> {
  return request<ProfileRead>("/api/social/profile", {
    method: "PUT",
    body: JSON.stringify({ username })
  }, accessToken);
}

export function getNotifications(accessToken?: string | null): Promise<NotificationCounts> {
  return request<NotificationCounts>("/api/social/notifications", {}, accessToken);
}

export function listFriendRequests(accessToken?: string | null): Promise<FriendRequestRead[]> {
  return request<FriendRequestRead[]>("/api/social/friend-requests", {}, accessToken);
}

export function sendFriendRequest(username: string, accessToken?: string | null): Promise<FriendRequestRead> {
  return request<FriendRequestRead>("/api/social/friend-requests", {
    method: "POST",
    body: JSON.stringify({ username })
  }, accessToken);
}

export function acceptFriendRequest(requestId: number, accessToken?: string | null): Promise<FriendRequestRead> {
  return request<FriendRequestRead>(`/api/social/friend-requests/${requestId}/accept`, { method: "POST" }, accessToken);
}

export function declineFriendRequest(requestId: number, accessToken?: string | null): Promise<FriendRequestRead> {
  return request<FriendRequestRead>(`/api/social/friend-requests/${requestId}/decline`, { method: "POST" }, accessToken);
}

export function listFriends(accessToken?: string | null): Promise<FriendRead[]> {
  return request<FriendRead[]>("/api/social/friends", {}, accessToken);
}

export function shareHand(handId: number, username: string, accessToken?: string | null): Promise<SharedHandRead> {
  return request<SharedHandRead>("/api/social/shared-hands", {
    method: "POST",
    body: JSON.stringify({ hand_id: handId, username })
  }, accessToken);
}

export function listSharedHands(accessToken?: string | null): Promise<SharedHandRead[]> {
  return request<SharedHandRead[]>("/api/social/shared-hands", {}, accessToken);
}

export function markSharedHandRead(shareId: number, accessToken?: string | null): Promise<SharedHandRead> {
  return request<SharedHandRead>(`/api/social/shared-hands/${shareId}/read`, { method: "POST" }, accessToken);
}

export function getMyStats(accessToken?: string | null): Promise<MyStats> {
  return request<MyStats>("/api/stats/me", {}, accessToken);
}

export function listSimilarStudySpots(
  params: { handId: number; node?: string; street: string },
  auth?: string | null | ApiAuthContext
): Promise<SimilarStudySpots> {
  const query = new URLSearchParams({
    hand_id: String(params.handId),
    street: params.street
  });
  if (params.node) {
    query.set("node", params.node);
  }
  return request<SimilarStudySpots>(`/api/study-spots/similar?${query.toString()}`, {}, auth);
}

export function importRange(payload: unknown, accessToken?: string | null): Promise<PreflopRange> {
  return request<PreflopRange>("/api/ranges/import", {
    method: "POST",
    body: JSON.stringify(payload)
  }, accessToken);
}

export function listRanges(): Promise<PreflopRange[]> {
  return request<PreflopRange[]>("/api/ranges");
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return headers;
}

async function errorMessageForResponse(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) {
    return "";
  }
  try {
    const parsed = JSON.parse(text) as { detail?: unknown };
    return typeof parsed.detail === "string" ? parsed.detail : text;
  } catch {
    return text;
  }
}
