import assert from "node:assert/strict";

import { settlementForTrainerState } from "./settlement";
import type { TrainerState } from "./engine";

const completedHand: TrainerState = {
  heroCards: ["As", "Kd"],
  villainCards: ["Qc", "Jh"],
  board: ["Ks", "7d", "2c", "4h", "9s"],
  visibleBoard: ["Ks", "7d", "2c"],
  street: "flop",
  pot: 12.5,
  heroStack: 87.5,
  villainStack: 91.5,
  facingBet: false,
  facingBetAmount: 0,
  heroPosition: "SB",
  villainPosition: "BB",
  actionHistory: [],
  handOver: true,
  result: { winner: "hero", reason: "villain_folded" },
  message: "Hero wins."
};

{
  const settlement = settlementForTrainerState(completedHand);

  assert.ok(settlement);
  assert.equal(settlement.status, "awarded");
  assert.equal(settlement.winner, "hero");
  assert.equal(settlement.headline, "Hero wins");
  assert.equal(settlement.detail, "Opponent folded.");
  assert.equal(settlement.potBb, 12.5);
  assert.equal(settlement.heroBeforeBb, 87.5);
  assert.equal(settlement.heroAfterBb, 100);
  assert.equal(settlement.opponentBeforeBb, 91.5);
  assert.equal(settlement.opponentAfterBb, 91.5);
}

{
  const settlement = settlementForTrainerState({
    ...completedHand,
    result: { winner: "villain", reason: "hero_folded_to_3bet" }
  });

  assert.ok(settlement);
  assert.equal(settlement.status, "awarded");
  assert.equal(settlement.winner, "opponent");
  assert.equal(settlement.headline, "Opponent wins");
  assert.equal(settlement.detail, "Hero folded.");
  assert.equal(settlement.heroAfterBb, 87.5);
  assert.equal(settlement.opponentAfterBb, 104);
}

{
  const settlement = settlementForTrainerState({
    ...completedHand,
    result: { winner: "villain", reason: "hero_folded_preflop" }
  });

  assert.ok(settlement);
  assert.equal(settlement.detail, "Hero folded preflop.");
}

{
  const settlement = settlementForTrainerState({
    ...completedHand,
    pot: 18,
    result: { winner: "showdown", reason: "river_completed" }
  });

  assert.ok(settlement);
  assert.equal(settlement.status, "showdown");
  assert.equal(settlement.winner, null);
  assert.equal(settlement.headline, "Showdown reached");
  assert.equal(settlement.detail, "Winner evaluation is not available yet.");
  assert.equal(settlement.heroAfterBb, 87.5);
  assert.equal(settlement.opponentAfterBb, 91.5);
}
