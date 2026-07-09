import assert from "node:assert/strict";

import { emptyStatsMessage, formatStatsPercent } from "./statsViews";

assert.equal(formatStatsPercent(0.5), "50%");
assert.equal(formatStatsPercent(0.3333), "33%");
assert.equal(formatStatsPercent(null), "Not enough data");
assert.equal(emptyStatsMessage(0, 0), "Play a few hands to start building your stats.");
assert.equal(emptyStatsMessage(3, 0), "Analyze saved hands to unlock accuracy and leak stats.");
assert.equal(emptyStatsMessage(3, 1), null);

console.log("stats views tests passed");
