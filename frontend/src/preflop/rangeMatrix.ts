import type { PreflopAction } from "./engine";
import { type BundledPreflopRange, PREFLOP_SPOTS, type PreflopSpotId } from "./rangeData";

export const MATRIX_RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;

export interface RangeActionSegment {
  action: PreflopAction;
  color: string;
  label: string;
  probability: number;
}

export interface RangeMatrixCell {
  background: string;
  handKey: string;
  row: number;
  segments: RangeActionSegment[];
  column: number;
}

export interface RangeSpotPresentation {
  detail: string;
  title: string;
}

const ACTION_PRESENTATION: Record<PreflopAction, { color: string; label: string }> = {
  allin: { color: "#7c3aed", label: "All-in" },
  call: { color: "#238b63", label: "Call" },
  check: { color: "#238b63", label: "Check" },
  fold: { color: "#c84b55", label: "Fold" },
  limp: { color: "#238b63", label: "Limp" },
  raise: { color: "#d09425", label: "Raise" }
};

const SPOT_PRESENTATION: Record<PreflopSpotId, RangeSpotPresentation> = {
  [PREFLOP_SPOTS.sbOpen]: {
    detail: "SB chooses fold, limp, or open to 2.5bb.",
    title: "SB first action"
  },
  [PREFLOP_SPOTS.bbVsSbOpen]: {
    detail: "BB responds after SB opens to 2.5bb.",
    title: "BB versus 2.5bb open"
  },
  [PREFLOP_SPOTS.sbVsBbReraise]: {
    detail: "SB responds after BB 3-bets to 11.5bb.",
    title: "SB versus 11.5bb 3-bet"
  },
  [PREFLOP_SPOTS.sbLimpVsBbRaise]: {
    detail: "SB responds after limping and facing a 5bb BB raise.",
    title: "SB limp versus 5bb raise"
  },
  [PREFLOP_SPOTS.bbVsSbLimp]: {
    detail: "BB checks or raises after SB limps.",
    title: "BB versus limp"
  }
};

export function handKeyForMatrixCell(row: number, column: number): string {
  const rowRank = MATRIX_RANKS[row];
  const columnRank = MATRIX_RANKS[column];
  if (!rowRank || !columnRank) {
    throw new Error(`Invalid range matrix cell ${row},${column}`);
  }

  if (row === column) {
    return `${rowRank}${columnRank}`;
  }
  if (row < column) {
    return `${rowRank}${columnRank}s`;
  }
  return `${columnRank}${rowRank}o`;
}

export function buildRangeMatrix(range: BundledPreflopRange): RangeMatrixCell[] {
  return MATRIX_RANKS.flatMap((_, row) =>
    MATRIX_RANKS.map((__, column) => {
      const handKey = handKeyForMatrixCell(row, column);
      const segments = range
        .optionsForHand(handKey)
        .filter((option) => option.probability > 0)
        .map((option) => ({
          action: option.action,
          color: ACTION_PRESENTATION[option.action].color,
          label: ACTION_PRESENTATION[option.action].label,
          probability: option.probability
        }))
        .sort((left, right) => right.probability - left.probability || left.label.localeCompare(right.label));

      return {
        background: buildCellBackground(segments),
        column,
        handKey,
        row,
        segments
      };
    })
  );
}

export function rangePresentationForSpot(spot: PreflopSpotId): RangeSpotPresentation {
  return SPOT_PRESENTATION[spot];
}

export function actionPresentation(action: PreflopAction): { color: string; label: string } {
  return ACTION_PRESENTATION[action];
}

export function formatProbability(probability: number): string {
  const percent = Math.round(probability * 100);
  return `${percent}%`;
}

export function segmentSummary(segments: RangeActionSegment[]): string {
  return segments.map((segment) => `${segment.label} ${formatProbability(segment.probability)}`).join(", ");
}

function buildCellBackground(segments: RangeActionSegment[]): string {
  if (segments.length === 0) {
    return "#f1f5f2";
  }

  let cursor = 0;
  const stops: string[] = [];
  for (const segment of segments) {
    const nextCursor = cursor + segment.probability * 100;
    stops.push(`${segment.color} ${cursor.toFixed(2)}%`, `${segment.color} ${nextCursor.toFixed(2)}%`);
    cursor = nextCursor;
  }
  if (cursor < 100) {
    stops.push(`#eef3ef ${cursor.toFixed(2)}%`, "#eef3ef 100%");
  }
  return `linear-gradient(135deg, ${stops.join(", ")})`;
}
