import type { ActionEntry } from "../types";

type StreetMarker = Pick<ActionEntry, "street">;

const BOARD_CARDS_BY_STREET: Record<ActionEntry["street"], number> = {
  preflop: 0,
  flop: 3,
  turn: 4,
  river: 5
};

export function visibleBoardForHistory(board: string[], actionHistory: StreetMarker[]): string[] {
  const visibleCardCount = actionHistory.reduce((count, entry) => {
    return Math.max(count, BOARD_CARDS_BY_STREET[entry.street] ?? 0);
  }, 0);
  return board.slice(0, visibleCardCount);
}

export function shouldRevealOpponentCards(result: Record<string, unknown> | null | undefined): boolean {
  return result?.reason === "river_completed";
}
