import type { TrainerState } from "./engine";
import { roundBb, type SettlementSummary } from "../settlement";

export function settlementForTrainerState(state: TrainerState): SettlementSummary | null {
  if (!state.handOver || !state.result) {
    return null;
  }

  const winner = typeof state.result.winner === "string" ? state.result.winner : "";
  const reason = typeof state.result.reason === "string" ? state.result.reason : "";
  const potBb = roundBb(state.pot);
  const heroBeforeBb = roundBb(state.heroStack);
  const opponentBeforeBb = roundBb(state.villainStack);

  if (winner === "showdown") {
    return {
      detail: "Winner evaluation is not available yet.",
      headline: "Showdown reached",
      heroAfterBb: heroBeforeBb,
      heroBeforeBb,
      opponentAfterBb: opponentBeforeBb,
      opponentBeforeBb,
      potBb,
      status: "showdown",
      winner: null
    };
  }

  if (winner === "split") {
    const halfPot = roundBb(potBb / 2);
    return {
      detail: splitDetail(state.result),
      headline: "Pot split",
      heroAfterBb: roundBb(heroBeforeBb + halfPot),
      heroBeforeBb,
      opponentAfterBb: roundBb(opponentBeforeBb + halfPot),
      opponentBeforeBb,
      potBb,
      status: "split",
      winner: null
    };
  }

  if (winner !== "hero" && winner !== "villain") {
    return null;
  }

  const heroWins = winner === "hero";
  return {
    detail: detailForResult(reason, heroWins, state.result),
    headline: heroWins ? "Hero wins" : "Opponent wins",
    heroAfterBb: heroWins ? roundBb(heroBeforeBb + potBb) : heroBeforeBb,
    heroBeforeBb,
    opponentAfterBb: heroWins ? opponentBeforeBb : roundBb(opponentBeforeBb + potBb),
    opponentBeforeBb,
    potBb,
    status: "awarded",
    winner: heroWins ? "hero" : "opponent"
  };
}

function detailForResult(reason: string, heroWins: boolean, result: Record<string, unknown>): string {
  if (reason === "river_completed") {
    const winningHand = typeof result.winning_hand === "string" ? result.winning_hand : "";
    return winningHand ? `Won at showdown with ${winningHand}.` : "Won at showdown.";
  }
  if (reason.includes("folded")) {
    const stage = reason.includes("preflop") ? " preflop" : "";
    return heroWins ? `Opponent folded${stage}.` : `Hero folded${stage}.`;
  }
  if (reason.includes("allin")) {
    return heroWins ? "Hero's all-in branch ended the hand." : "Opponent's all-in branch ended the hand.";
  }
  if (reason.includes("4bet") || reason.includes("reraised")) {
    return "The available preflop tree ended here.";
  }
  if (reason.includes("tree_closed")) {
    return "The supported line ended here.";
  }
  return heroWins ? "The pot was awarded to Hero." : "The pot was awarded to Opponent.";
}

function splitDetail(result: Record<string, unknown>): string {
  const winningHand = typeof result.winning_hand === "string" ? result.winning_hand : "";
  return winningHand ? `Both players chopped with ${winningHand}.` : "Both players chopped at showdown.";
}
