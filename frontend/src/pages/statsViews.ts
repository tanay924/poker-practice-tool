export function formatStatsPercent(value: number | null): string {
  if (value === null) {
    return "Not enough data";
  }
  return `${Math.round(value * 100)}%`;
}

export function emptyStatsMessage(handsPlayed: number, handsAnalyzed: number): string | null {
  if (handsPlayed === 0) {
    return "Play a few hands to start building your stats.";
  }
  if (handsAnalyzed === 0) {
    return "Analyze saved hands to unlock accuracy and leak stats.";
  }
  return null;
}
