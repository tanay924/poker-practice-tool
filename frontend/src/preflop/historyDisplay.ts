import type { PreflopHistoryEntry } from "./engine";

export interface PreflopHistoryEntryDisplay {
  handLabel: string;
  probabilityLabel: string;
}

export function historyEntryDisplay(entry: PreflopHistoryEntry, isComplete: boolean): PreflopHistoryEntryDisplay {
  const hideSetupDetails = entry.automatic && !isComplete;
  return {
    handLabel: hideSetupDetails ? "--" : entry.handKey,
    probabilityLabel: hideSetupDetails ? "--" : `${Math.round(entry.probability * 100)}%`
  };
}
