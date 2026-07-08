import type { SolverOutput } from "../types";

interface PostflopSummaryInput {
  preflopBlocksPostflop: boolean;
  solverOutput: Pick<SolverOutput, "postflop_error" | "postflop_status" | "street_results" | "summary">;
  visibleBoardCardCount: number;
}

export function formatResultText(result: Record<string, unknown>) {
  const winner = typeof result.winner === "string" ? result.winner : "unknown";
  const reason = typeof result.reason === "string" ? result.reason : "";
  const winningHand = typeof result.winning_hand === "string" ? result.winning_hand : "";

  if (winner === "hero") {
    return reason === "river_completed"
      ? `Hero won at showdown${winningHand ? ` with ${winningHand}` : ""}.`
      : `Hero won${formatWinningReason(reason, "opponent")}.`;
  }
  if (winner === "villain") {
    return reason === "river_completed"
      ? `Opponent won at showdown${winningHand ? ` with ${winningHand}` : ""}.`
      : `Opponent won${formatWinningReason(reason, "hero")}.`;
  }
  if (winner === "split") {
    return reason === "river_completed"
      ? `The pot was split at showdown${winningHand ? ` with ${winningHand}` : ""}.`
      : "The pot was split.";
  }
  if (winner === "showdown") {
    return "The hand reached showdown after the river action closed.";
  }
  return "The hand is complete.";
}

export function formatPostflopSummaryText(input: PostflopSummaryInput): string | null {
  const { preflopBlocksPostflop, solverOutput, visibleBoardCardCount } = input;

  if (solverOutput.postflop_status === "skipped") {
    if (preflopBlocksPostflop) {
      return "Postflop solver was not run because Hero chose a 0% preflop line.";
    }
    if (visibleBoardCardCount === 0) {
      return "Postflop solver was not run because the hand ended before the flop.";
    }
    return "Postflop solver was not run for this hand.";
  }

  if (solverOutput.summary.largest_mistake === null) {
    return "No large solver mistake flagged.";
  }

  return null;
}

function formatWinningReason(reason: string, foldedPlayer: "hero" | "opponent") {
  const foldReasons = new Set([
    "hero_folded",
    "hero_folded_preflop",
    "hero_folded_to_3bet",
    "hero_folded_to_limp_raise",
    "villain_folded",
    "villain_folded_preflop",
    "villain_folded_to_3bet",
    "villain_folded_to_limp_raise"
  ]);
  if (foldReasons.has(reason)) {
    return ` when ${foldedPlayer} folded`;
  }

  const allInReasons = new Set(["bb_allin_preflop", "hero_allin_preflop"]);
  if (allInReasons.has(reason)) {
    return " when the preflop line reached an all-in branch";
  }

  const treeClosedReasons = new Set([
    "preflop_tree_closed",
    "hero_4bet_preflop",
    "hero_limp_reraised_preflop",
    "villain_4bet_preflop",
    "villain_limp_reraised_preflop"
  ]);
  if (treeClosedReasons.has(reason)) {
    return " when the supported preflop tree ended";
  }

  return "";
}
