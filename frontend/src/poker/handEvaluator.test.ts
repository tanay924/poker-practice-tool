import assert from "node:assert/strict";

import { evaluateHoldemShowdown } from "./handEvaluator";

{
  const result = evaluateHoldemShowdown(
    ["As", "Ad"],
    ["Kc", "Qd"],
    ["Ah", "7d", "2c", "4h", "9s"]
  );

  assert.equal(result.winner, "hero");
  assert.equal(result.winningHand, "Three of a kind, aces");
}

{
  const result = evaluateHoldemShowdown(
    ["As", "Ad"],
    ["Kc", "Qd"],
    ["Js", "Tc", "9d", "2h", "3s"]
  );

  assert.equal(result.winner, "villain");
  assert.equal(result.winningHand, "Straight, king-high");
}

{
  const result = evaluateHoldemShowdown(
    ["As", "Kd"],
    ["Ac", "Kh"],
    ["2s", "3d", "4c", "5h", "9s"]
  );

  assert.equal(result.winner, "split");
  assert.equal(result.winningHand, "Straight, five-high");
}

console.log("hand evaluator tests passed");
