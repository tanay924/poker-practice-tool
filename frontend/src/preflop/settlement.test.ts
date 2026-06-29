import assert from "node:assert/strict";

import { settlementForPreflopRound } from "./settlement";
import { PREFLOP_SPOTS } from "./rangeData";
import type { PreflopRoundState } from "./engine";

const baseRound: PreflopRoundState = {
  correctCount: 0,
  currentDecision: null,
  decisionCount: 1,
  heroCards: ["As", "Kd"],
  heroPosition: "SB",
  history: [],
  isComplete: true,
  lastFeedback: null,
  message: "Preflop is over.",
  villainCards: ["Qc", "Jh"]
};

{
  const settlement = settlementForPreflopRound({
    ...baseRound,
    history: [
      {
        action: "raise",
        actor: "SB",
        automatic: false,
        handKey: "AKo",
        probability: 1,
        spotId: PREFLOP_SPOTS.sbOpen,
        spotName: "SB open"
      },
      {
        action: "fold",
        actor: "BB",
        automatic: true,
        handKey: "QJo",
        probability: 1,
        spotId: PREFLOP_SPOTS.bbVsSbOpen,
        spotName: "BB versus SB open"
      }
    ]
  });

  assert.ok(settlement);
  assert.equal(settlement.status, "awarded");
  assert.equal(settlement.winner, "hero");
  assert.equal(settlement.headline, "Hero wins");
  assert.equal(settlement.detail, "Opponent folded preflop.");
  assert.equal(settlement.potBb, 2.5);
  assert.equal(settlement.heroBeforeBb, 97.5);
  assert.equal(settlement.heroAfterBb, 100);
  assert.equal(settlement.opponentBeforeBb, 100);
  assert.equal(settlement.opponentAfterBb, 100);
}

{
  const settlement = settlementForPreflopRound({
    ...baseRound,
    history: [
      {
        action: "fold",
        actor: "SB",
        automatic: false,
        handKey: "72o",
        probability: 1,
        spotId: PREFLOP_SPOTS.sbOpen,
        spotName: "SB open"
      }
    ]
  });

  assert.ok(settlement);
  assert.equal(settlement.status, "awarded");
  assert.equal(settlement.winner, "opponent");
  assert.equal(settlement.headline, "Opponent wins");
  assert.equal(settlement.detail, "Hero folded preflop.");
  assert.equal(settlement.potBb, 0);
}

{
  const settlement = settlementForPreflopRound({
    ...baseRound,
    history: [
      {
        action: "limp",
        actor: "SB",
        automatic: false,
        handKey: "K2s",
        probability: 1,
        spotId: PREFLOP_SPOTS.sbOpen,
        spotName: "SB open"
      },
      {
        action: "check",
        actor: "BB",
        automatic: true,
        handKey: "T8o",
        probability: 1,
        spotId: PREFLOP_SPOTS.bbVsSbLimp,
        spotName: "BB versus SB limp"
      }
    ]
  });

  assert.equal(settlement, null);
}
