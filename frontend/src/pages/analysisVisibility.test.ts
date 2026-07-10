import assert from "node:assert/strict";

import { shouldRevealAnalysisOpponentCards } from "./analysisVisibility";

assert.equal(shouldRevealAnalysisOpponentCards({ winner: "hero", reason: "villain_folded" }), true);
assert.equal(shouldRevealAnalysisOpponentCards({ winner: "villain", reason: "hero_folded" }), true);
assert.equal(shouldRevealAnalysisOpponentCards({ winner: "hero", reason: "river_completed" }), true);
assert.equal(shouldRevealAnalysisOpponentCards(null), true);

console.log("analysis visibility tests passed");
