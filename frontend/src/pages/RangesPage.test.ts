import assert from "node:assert/strict";

import { rangeTabItems, selectedRangeForSpot } from "./rangeStudyNavigation";

const ranges = [
  {
    name: "SB open",
    spot: "HU_SB_OPEN_2_5BB_OR_LIMP_100BB",
    stackBb: 100
  },
  {
    name: "BB vs open",
    spot: "HU_SRP_BB_VS_SB_OPEN_100BB",
    stackBb: 100
  }
];

assert.deepEqual(
  rangeTabItems(ranges).map((tab) => tab.title),
  ["SB first action", "BB versus 2.5bb open"]
);
assert.equal(selectedRangeForSpot(ranges, "HU_SRP_BB_VS_SB_OPEN_100BB")?.name, "BB vs open");
assert.equal(selectedRangeForSpot(ranges, "missing")?.name, "SB open");
assert.equal(selectedRangeForSpot([], "missing"), null);

console.log("ranges page tests passed");
