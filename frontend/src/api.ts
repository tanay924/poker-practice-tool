import type { AnalysisDetail, AnalysisJob, AnalysisListItem, HandCreate, HandRead, PreflopRange } from "./types";

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
