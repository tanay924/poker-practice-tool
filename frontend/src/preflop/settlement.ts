import type { Position, PreflopHistoryEntry, PreflopRoundState } from "./engine";
import { PREFLOP_SPOTS } from "./rangeData";
import { roundBb, type SettlementSummary } from "../settlement";

const STARTING_STACK_BB = 100;

export function settlementForPreflopRound(round: PreflopRoundState): SettlementSummary | null {
  if (!round.isComplete) {
    return null;
  }

  const lastAction = round.history[round.history.length - 1];
  if (!lastAction || lastAction.action !== "fold") {
    return null;
  }

  const heroContribution = contributionForActor(round.history, round.heroPosition);
  const opponentPosition = round.heroPosition === "SB" ? "BB" : "SB";
  const opponentContribution = contributionForActor(round.history, opponentPosition);
  const potBb = roundBb(heroContribution + opponentContribution);
  const heroBeforeBb = roundBb(STARTING_STACK_BB - heroContribution);
  const opponentBeforeBb = roundBb(STARTING_STACK_BB - opponentContribution);
  const heroWins = lastAction.actor !== round.heroPosition;

  return {
    detail: heroWins ? "Opponent folded preflop." : "Hero folded preflop.",
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

function contributionForActor(history: PreflopHistoryEntry[], actor: Position): number {
  return roundBb(
    history
      .filter((entry) => entry.actor === actor)
      .reduce((total, entry) => total + contributionForAction(entry), 0)
  );
}

function contributionForAction(entry: PreflopHistoryEntry): number {
  if (entry.spotId === PREFLOP_SPOTS.sbOpen) {
    if (entry.action === "raise") {
      return 2.5;
    }
    if (entry.action === "limp") {
      return 1;
    }
    return 0;
  }

  if (entry.spotId === PREFLOP_SPOTS.bbVsSbOpen) {
    if (entry.action === "call") {
      return 2.5;
    }
    if (entry.action === "raise") {
      return 11.5;
    }
    if (entry.action === "allin") {
      return 100;
    }
    return 0;
  }

  if (entry.spotId === PREFLOP_SPOTS.sbVsBbReraise) {
    if (entry.action === "call") {
      return 9;
    }
    if (entry.action === "raise") {
      return 23;
    }
    return 0;
  }

  if (entry.spotId === PREFLOP_SPOTS.bbVsSbLimp) {
    return entry.action === "raise" ? 5 : 0;
  }

  if (entry.spotId === PREFLOP_SPOTS.sbLimpVsBbRaise) {
    if (entry.action === "call") {
      return 4;
    }
    if (entry.action === "raise") {
      return 14;
    }
    return 0;
  }

  return 0;
}
