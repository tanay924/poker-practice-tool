import assert from "node:assert/strict";

import {
  applyHeroAction,
  formatActionEntry,
  legalHeroActions,
  type TrainerState,
} from "./engine";

const baseState: TrainerState = {
  heroCards: ["As", "Kd"],
  villainCards: ["Qc", "Jh"],
  board: ["Ks", "7d", "2c", "4h", "9s"],
  visibleBoard: ["Ks", "7d", "2c"],
  street: "flop",
  pot: 5,
  heroStack: 97.5,
  villainStack: 97.5,
  facingBet: false,
  facingBetAmount: 0,
  actionHistory: [],
  handOver: false,
  result: null,
  message: "Your flop decision.",
};

{
  const actions = legalHeroActions(baseState);
  assert.deepEqual(
    actions.map((action) => action.label),
    ["Check", "Bet 5bb"],
  );
  assert.deepEqual(
    actions.map((action) => action.action),
    ["check", "bet"],
  );
}

{
  const potBet = legalHeroActions(baseState).find((action) => action.action === "bet" && action.amountBb === 5);
  assert.ok(potBet);

  const next = applyHeroAction(baseState, potBet);
  const entry = next.actionHistory[0];

  assert.equal(entry.action, "bet");
  assert.equal(entry.amount_bb, 5);
  assert.equal(formatActionEntry(entry), "bet 5bb");
}

{
  const facingBetState: TrainerState = {
    ...baseState,
    pot: 7,
    facingBet: true,
    facingBetAmount: 2,
  };
  const actions = legalHeroActions(facingBetState);
  assert.deepEqual(
    actions.map((action) => action.label),
    ["Fold", "Call 2bb", "Raise to 7bb"],
  );
  assert.equal(actions[2].action, "raise_to");
  assert.equal(actions[2].targetAmountBb, 7);
}

console.log("poker engine tests passed");
