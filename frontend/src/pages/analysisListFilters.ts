import type { AnalysisListItem, AnalysisStatus } from "../types";

export type AnalysisStatusFilter = AnalysisStatus | "all";

export interface AnalysisFilterState {
  query: string;
  status: AnalysisStatusFilter;
}

const ANALYSIS_STATUSES: AnalysisStatus[] = ["ready", "queued", "solving", "failed", "unsupported", "cancelled"];

export function filterAnalysisItems(items: AnalysisListItem[], filters: AnalysisFilterState): AnalysisListItem[] {
  const normalizedQuery = normalize(filters.query);
  return items.filter((item) => {
    if (filters.status !== "all" && item.status !== filters.status) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return searchableText(item).includes(normalizedQuery);
  });
}

export function analysisStatusCounts(items: AnalysisListItem[]): Record<AnalysisStatusFilter, number> {
  const counts: Record<AnalysisStatusFilter, number> = {
    all: items.length,
    failed: 0,
    queued: 0,
    ready: 0,
    solving: 0,
    unsupported: 0,
    cancelled: 0
  };
  for (const item of items) {
    counts[item.status] += 1;
  }
  return counts;
}

export function analysisStatusOptions(): AnalysisStatusFilter[] {
  return ["all", ...ANALYSIS_STATUSES];
}

function searchableText(item: AnalysisListItem): string {
  return normalize([
    item.hand_id,
    item.hero_hand,
    item.board.join(" "),
    item.status,
    item.error ?? ""
  ].join(" "));
}

function normalize(value: unknown): string {
  return String(value).trim().toLowerCase().replace(/^#(?=\d)/, "");
}
