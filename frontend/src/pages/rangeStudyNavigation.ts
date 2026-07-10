import { rangePresentationForSpot } from "../preflop/rangeMatrix";
import type { PreflopSpotId } from "../preflop/rangeData";

export interface RangeNavigationItem {
  detail: string;
  spot: string;
  stackBb: number;
  title: string;
}

interface RangeLike {
  name: string;
  spot: string;
  stackBb: number;
}

export function rangeTabItems(ranges: RangeLike[]): RangeNavigationItem[] {
  return ranges.map((range) => {
    const presentation = rangePresentationForSpot(range.spot as PreflopSpotId);
    return {
      detail: presentation.detail,
      spot: range.spot,
      stackBb: range.stackBb,
      title: presentation.title
    };
  });
}

export function selectedRangeForSpot<T extends RangeLike>(ranges: T[], selectedSpot: string): T | null {
  return ranges.find((range) => range.spot === selectedSpot) ?? ranges[0] ?? null;
}
