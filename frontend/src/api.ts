import type {
  AnalysisDetail,
  AnalysisJob,
  AnalysisListItem,
  AnalysisPage,
  AccountDeletion,
  AccountExport,
  AnalysisControl,
  FriendRead,
  BlockRead,
  FriendRequestRead,
  GuestSessionAllowance,
  HandCreate,
  HandRead,
  MyStats,
  NotificationCounts,
  PreflopRange,
  ProfileRead,
  SimilarStudySpots,
  SharedHandRead,
  ReportRead
} from "./types";

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const API_BASE = env?.VITE_API_URL ?? "http://127.0.0.1:8000";
let guestSessionPromise: Promise<boolean> | null = null;
const API_REQUEST_TIMEOUT_MS = 30_000;

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
    },
    credentials: "include"
  };
}

async function request<T>(path: string, options: RequestInit = {}, auth?: string | null | ApiAuthContext): Promise<T> {
  const authContext = typeof auth === "object" && auth !== null ? auth : { accessToken: auth };
  const serverGuestSessionReady = !authContext.accessToken && path !== "/api/guest-sessions"
    ? await ensureServerGuestSession()
    : false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);
  const requestInit = requestInitWithAuth(
    authContext.accessToken,
    options,
    serverGuestSessionReady ? undefined : authContext.guestSessionId
  );
  if (!requestInit.signal) {
    requestInit.signal = controller.signal;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, requestInit);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("The request timed out. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const message = await errorMessageForResponse(response);
    throw new Error(message || `Request failed with ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

async function ensureServerGuestSession(): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }
  if (guestSessionPromise) {
    return guestSessionPromise;
  }
  const requestPromise = fetch(`${API_BASE}/api/guest-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include"
  })
    .then((response) => {
      if (!response.ok) {
        guestSessionPromise = null;
        return false;
      }
      return true;
    })
    .catch(() => {
      guestSessionPromise = null;
      return false;
    });
  guestSessionPromise = requestPromise;
  return requestPromise;
}

export function saveHand(
  hand: HandCreate,
  auth?: string | null | ApiAuthContext,
  idempotencyKey?: string
): Promise<HandRead> {
  return request<HandRead>("/api/hands", {
    method: "POST",
    body: JSON.stringify(hand),
    ...(idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : {})
  }, auth);
}

export function analyzeHand(handId: number, auth?: string | null | ApiAuthContext): Promise<AnalysisJob> {
  return request<AnalysisJob>(`/api/hands/${handId}/analyze`, { method: "POST" }, auth);
}

export function retryAnalysis(handId: number, auth?: string | null | ApiAuthContext): Promise<AnalysisJob> {
  return request<AnalysisJob>(`/api/analysis/${handId}/retry`, { method: "POST" }, auth);
}

export function cancelAnalysis(handId: number, auth?: string | null | ApiAuthContext): Promise<AnalysisJob> {
  return request<AnalysisJob>(`/api/analysis/${handId}/cancel`, { method: "POST" }, auth);
}

export function deleteHand(handId: number, auth?: string | null | ApiAuthContext): Promise<void> {
  return request<void>(`/api/hands/${handId}`, { method: "DELETE" }, auth);
}

export function listAnalysis(auth?: string | null | ApiAuthContext): Promise<AnalysisListItem[]> {
  return request<AnalysisListItem[]>("/api/analysis", {}, auth);
}

export function listAnalysisPage(
  auth?: string | null | ApiAuthContext,
  cursor?: string | null,
  limit = 25
): Promise<AnalysisPage> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) {
    query.set("cursor", cursor);
  }
  return request<AnalysisPage>(`/api/analysis/page?${query.toString()}`, {}, auth);
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

export function removeFriend(userId: string, accessToken?: string | null): Promise<void> {
  return request<void>(`/api/social/friends/${encodeURIComponent(userId)}`, { method: "DELETE" }, accessToken);
}

export function blockUser(username: string, accessToken?: string | null): Promise<BlockRead> {
  return request<BlockRead>("/api/social/blocks", {
    method: "POST",
    body: JSON.stringify({ username })
  }, accessToken);
}

export function listBlocks(accessToken?: string | null): Promise<BlockRead[]> {
  return request<BlockRead[]>("/api/social/blocks", {}, accessToken);
}

export function unblockUser(userId: string, accessToken?: string | null): Promise<void> {
  return request<void>(`/api/social/blocks/${encodeURIComponent(userId)}`, { method: "DELETE" }, accessToken);
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

export function revokeSharedHand(shareId: number, accessToken?: string | null): Promise<void> {
  return request<void>(`/api/social/shared-hands/${shareId}`, { method: "DELETE" }, accessToken);
}

export function reportSocialContent(
  payload: { username?: string; share_id?: number; reason: string; details?: string },
  accessToken?: string | null
): Promise<ReportRead> {
  return request<ReportRead>("/api/social/reports", {
    method: "POST",
    body: JSON.stringify(payload)
  }, accessToken);
}

export function exportAccount(accessToken?: string | null): Promise<AccountExport> {
  return request<AccountExport>("/api/account/export", {}, accessToken);
}

export function deleteAccount(accessToken?: string | null): Promise<AccountDeletion> {
  return request<AccountDeletion>("/api/account", { method: "DELETE" }, accessToken);
}

export function getAnalysisAvailability(): Promise<AnalysisControl> {
  return request<AnalysisControl>("/api/admin/analysis/status");
}

export function getGuestSessionAllowance(): Promise<GuestSessionAllowance> {
  return request<GuestSessionAllowance>("/api/guest-sessions", { method: "POST" });
}

export function consumeGuestPreflopTrial(): Promise<GuestSessionAllowance> {
  return request<GuestSessionAllowance>("/api/guest-sessions/use-preflop", { method: "POST" });
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
  const requestId = response.headers.get("X-Request-ID");
  const suffix = requestId ? ` (Request ID: ${requestId})` : "";
  if (!text) {
    return suffix.trim();
  }
  try {
    const parsed = JSON.parse(text) as { detail?: unknown };
    return typeof parsed.detail === "string" ? `${parsed.detail}${suffix}` : `${text}${suffix}`;
  } catch {
    return `${text}${suffix}`;
  }
}
