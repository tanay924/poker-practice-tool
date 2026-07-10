export function formatStrategySummary(strategy: Record<string, number>): string {
  const entries = Object.entries(strategy)
    .filter(([, frequency]) => Number.isFinite(frequency))
    .sort((first, second) => second[1] - first[1]);
  if (entries.length === 0) {
    return "No strategy available";
  }
  return entries.map(([action, frequency]) => `${action.replace("_", " ")} ${Math.round(frequency * 100)}%`).join(", ");
}

export function formatSpotTags(tags: string[]): string[] {
  return tags.map((tag) => {
    const label = tag.replace(/-/g, " ");
    return label.charAt(0).toUpperCase() + label.slice(1);
  });
}
