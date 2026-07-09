import assert from "node:assert/strict";

import { formatSpotTags, formatStrategySummary } from "./studySpotViews";

assert.equal(formatStrategySummary({ call: 0.1, fold: 0.9 }), "fold 90%, call 10%");
assert.equal(formatStrategySummary({}), "No strategy available");
assert.deepEqual(formatSpotTags(["single-raised-pot", "facing-bet", "flop"]), ["Single raised pot", "Facing bet", "Flop"]);

console.log("study spot view tests passed");
