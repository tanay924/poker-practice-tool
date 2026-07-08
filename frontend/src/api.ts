import type { AnalysisDetail, AnalysisJob, AnalysisListItem, HandCreate, HandRead, PreflopRange } from "./types";

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const API_BASE = env?.VITE_API_URL ?? "http://127.0.0.1:8000";

export function requestInitWithAuth(accessToken?: string | null, options: RequestInit = {}): RequestInit {
  const providedHeaders = headersToRecord(options.headers);
  return {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...providedHeaders
    }
  };
}

async function request<T>(path: string, options: RequestInit = {}, accessToken?: string | null): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...requestInitWithAuth(accessToken, options)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function saveHand(hand: HandCreate, accessToken?: string | null): Promise<HandRead> {
  return request<HandRead>("/api/hands", {
    method: "POST",
    body: JSON.stringify(hand)
  }, accessToken);
}

export function analyzeHand(handId: number, accessToken?: string | null): Promise<AnalysisJob> {
  return request<AnalysisJob>(`/api/hands/${handId}/analyze`, { method: "POST" }, accessToken);
}

export function listAnalysis(accessToken?: string | null): Promise<AnalysisListItem[]> {
  return request<AnalysisListItem[]>("/api/analysis", {}, accessToken);
}

export function getAnalysis(handId: string | number, accessToken?: string | null): Promise<AnalysisDetail> {
  return request<AnalysisDetail>(`/api/analysis/${handId}`, {}, accessToken);
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
