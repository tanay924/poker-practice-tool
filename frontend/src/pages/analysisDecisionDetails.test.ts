import assert from "node:assert/strict";

import { decisionDetailsAvailable, formatDetailBb, formatDetailPercent } from "./analysisDecisionDetails";

assert.equal(formatDetailPercent(1 / 3), "33.3%");
assert.equal(formatDetailPercent(null), "N/A");
assert.equal(formatDetailBb(5), "5bb");
assert.equal(formatDetailBb(2.5), "2.5bb");
assert.equal(formatDetailBb(null), "N/A");
assert.equal(decisionDetailsAvailable(undefined), false);
assert.equal(
  decisionDetailsAvailable({
    pot_odds: { available: false, reason: "not_facing_call" },
    equity: { available: false, source: "hidden_opponent_cards", hero: null, villain: null, note: "" }
  }),
  true
);

console.log("analysis decision detail tests passed");
