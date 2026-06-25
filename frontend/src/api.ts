import type { AnalysisDetail, AnalysisJob, AnalysisListItem, HandCreate, HandRead, PreflopRange } from "./types";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function saveHand(hand: HandCreate): Promise<HandRead> {
  return request<HandRead>("/api/hands", {
    method: "POST",
    body: JSON.stringify(hand)
  });
}

export function analyzeHand(handId: number): Promise<AnalysisJob> {
  return request<AnalysisJob>(`/api/hands/${handId}/analyze`, { method: "POST" });
}

export function listAnalysis(): Promise<AnalysisListItem[]> {
  return request<AnalysisListItem[]>("/api/analysis");
}

export function getAnalysis(handId: string | number): Promise<AnalysisDetail> {
  return request<AnalysisDetail>(`/api/analysis/${handId}`);
}

export function importRange(payload: unknown): Promise<PreflopRange> {
  return request<PreflopRange>("/api/ranges/import", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function listRanges(): Promise<PreflopRange[]> {
  return request<PreflopRange[]>("/api/ranges");
}
