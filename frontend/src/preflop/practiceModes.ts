import type { Position, StartPreflopRoundOptions } from "./engine";
import { PREFLOP_SPOTS, type PreflopSpotId } from "./rangeData";

export type PreflopPracticeMode = "mixed" | "seat" | "spot";

export interface PreflopPracticeSettings {
  mode: PreflopPracticeMode;
  seat: Position;
  spotId: PreflopSpotId;
}

export interface PracticeModeOption {
  description: string;
  id: PreflopPracticeMode;
  label: string;
}

export interface SpotFocusOption {
  actorPosition: Position;
  detail: string;
  spotId: PreflopSpotId;
  title: string;
}

export const DEFAULT_PRACTICE_SETTINGS: PreflopPracticeSettings = {
  mode: "mixed",
  seat: "SB",
  spotId: PREFLOP_SPOTS.sbOpen
};

export const PRACTICE_MODE_OPTIONS: PracticeModeOption[] = [
  {
    description: "Random seat and random starting hand across the available 100bb HU tree.",
    id: "mixed",
    label: "Mixed Drill"
  },
  {
    description: "Lock the drill to SB or BB while keeping hands and branches random.",
    id: "seat",
    label: "Seat Focus"
  },
  {
    description: "Start directly from one imported range and practice that decision node.",
    id: "spot",
    label: "Spot Focus"
  }
];

export const SPOT_FOCUS_OPTIONS: SpotFocusOption[] = [
  {
    actorPosition: "SB",
    detail: "First action: fold, limp, or open to 2.5bb.",
    spotId: PREFLOP_SPOTS.sbOpen,
    title: "SB first action"
  },
  {
    actorPosition: "BB",
    detail: "SB has opened to 2.5bb. Choose BB's response.",
    spotId: PREFLOP_SPOTS.bbVsSbOpen,
    title: "BB versus 2.5bb open"
  },
  {
    actorPosition: "SB",
    detail: "SB opened, BB 3-bet to 11.5bb. Choose SB's response.",
    spotId: PREFLOP_SPOTS.sbVsBbReraise,
    title: "SB versus 11.5bb 3-bet"
  },
  {
    actorPosition: "BB",
    detail: "SB has limped. Choose BB's response.",
    spotId: PREFLOP_SPOTS.bbVsSbLimp,
    title: "BB versus limp"
  },
  {
    actorPosition: "SB",
    detail: "SB limped, BB raised to 5bb. Choose SB's response.",
    spotId: PREFLOP_SPOTS.sbLimpVsBbRaise,
    title: "SB limp versus 5bb raise"
  }
];

export function practiceSettingsToStartOptions(settings: PreflopPracticeSettings): StartPreflopRoundOptions {
  if (settings.mode === "seat") {
    return { heroPosition: settings.seat };
  }
  if (settings.mode === "spot") {
    return { spotId: settings.spotId };
  }
  return {};
}
