import bbVsSbLimpRaw from "./ranges/hu_100bb_bb_vs_sb_limp_raise_5bb_revised.json";
import bbVsSbOpenRaw from "./ranges/hu_100bb_bb_vs_sb_2_5bb_open_revised.json";
import sbLimpVsBbRaiseRaw from "./ranges/hu_100bb_sb_limp_vs_bb_raise_5bb_revised.json";
import sbOpenRaw from "./ranges/hu_100bb_sb_open_2_5bb_revised.json";
import sbVsBbReraiseRaw from "./ranges/hu_100bb_sb_vs_bb_11_5bb_reraise.json";

import type { ActionOption, PreflopAction } from "./engine";

export const PREFLOP_SPOTS = {
  sbOpen: "HU_SB_OPEN_2_5BB_OR_LIMP_100BB",
  bbVsSbOpen: "HU_SRP_BB_VS_SB_OPEN_100BB",
  sbVsBbReraise: "HU_SB_VS_BB_RERAISE_11_5BB_100BB",
  sbLimpVsBbRaise: "HU_LIMP_SB_VS_BB_RAISE_5BB_100BB",
  bbVsSbLimp: "HU_LIMP_BB_VS_SB_100BB"
} as const;

export type PreflopSpotId = (typeof PREFLOP_SPOTS)[keyof typeof PREFLOP_SPOTS];

export interface RawRangeFile {
  name: string;
  spot: string;
  stack_bb: number;
  actions: Record<string, Partial<Record<PreflopAction, number>>>;
}

export class BundledPreflopRange {
  readonly name: string;
  readonly spot: PreflopSpotId;
  readonly stackBb: number;
  readonly actions: Record<string, Partial<Record<PreflopAction, number>>>;

  constructor(raw: RawRangeFile) {
    if (!isPreflopSpotId(raw.spot)) {
      throw new Error(`Unsupported bundled preflop spot: ${raw.spot}`);
    }

    this.name = raw.name;
    this.spot = raw.spot;
    this.stackBb = raw.stack_bb;
    this.actions = raw.actions;
  }

  optionsForHand(handKey: string): ActionOption[] {
    const rawActions = this.actions[handKey] ?? {};
    const legalActions = legalActionsBySpot[this.spot];
    const seen = new Set<PreflopAction>();
    const options: ActionOption[] = [];

    for (const [action, probability] of Object.entries(rawActions)) {
      if (isPreflopAction(action) && legalActions.includes(action)) {
        seen.add(action);
        options.push({ action, probability: clampProbability(probability ?? 0) });
      }
    }

    for (const action of legalActions) {
      if (!seen.has(action)) {
        options.push({ action, probability: 0 });
      }
    }

    return options;
  }
}

export const legalActionsBySpot: Record<PreflopSpotId, PreflopAction[]> = {
  [PREFLOP_SPOTS.sbOpen]: ["fold", "limp", "raise"],
  [PREFLOP_SPOTS.bbVsSbOpen]: ["fold", "call", "raise", "allin"],
  [PREFLOP_SPOTS.sbVsBbReraise]: ["fold", "call", "raise"],
  [PREFLOP_SPOTS.sbLimpVsBbRaise]: ["fold", "call", "raise"],
  [PREFLOP_SPOTS.bbVsSbLimp]: ["check", "raise"]
};

const bundledRanges = [
  new BundledPreflopRange(sbOpenRaw),
  new BundledPreflopRange(bbVsSbOpenRaw),
  new BundledPreflopRange(sbVsBbReraiseRaw),
  new BundledPreflopRange(sbLimpVsBbRaiseRaw),
  new BundledPreflopRange(bbVsSbLimpRaw)
];

const rangesBySpot = new Map<PreflopSpotId, BundledPreflopRange>(
  bundledRanges.map((range) => [range.spot, range])
);

export function getRangeForSpot(spot: PreflopSpotId): BundledPreflopRange {
  const range = rangesBySpot.get(spot);
  if (!range) {
    throw new Error(`Missing bundled preflop range for ${spot}`);
  }
  return range;
}

export function listBundledPreflopRanges(): BundledPreflopRange[] {
  return bundledRanges;
}

function isPreflopSpotId(value: string): value is PreflopSpotId {
  return Object.values(PREFLOP_SPOTS).includes(value as PreflopSpotId);
}

function isPreflopAction(value: string): value is PreflopAction {
  return ["fold", "limp", "check", "call", "raise", "allin"].includes(value);
}

function clampProbability(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}
