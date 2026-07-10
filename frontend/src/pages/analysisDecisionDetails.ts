import type { DecisionDetails } from "../types";

export function decisionDetailsAvailable(details: DecisionDetails | undefined): boolean {
  return Boolean(details?.pot_odds || details?.equity);
}

export function formatDetailPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }
  return `${(value * 100).toFixed(1)}%`;
}

export function formatDetailBb(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}bb`;
}
