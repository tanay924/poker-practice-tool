import assert from "node:assert/strict";

import {
  PRACTICE_MODE_OPTIONS,
  SPOT_FOCUS_OPTIONS,
  practiceSettingsToStartOptions,
  type PreflopPracticeSettings
} from "./practiceModes";
import { PREFLOP_SPOTS } from "./rangeData";

assert.deepEqual(
  PRACTICE_MODE_OPTIONS.map((mode) => mode.id),
  ["mixed", "seat", "spot"]
);

{
  const settings: PreflopPracticeSettings = { mode: "mixed", seat: "SB", spotId: PREFLOP_SPOTS.sbOpen };
  assert.deepEqual(practiceSettingsToStartOptions(settings), {});
}

{
  const settings: PreflopPracticeSettings = { mode: "seat", seat: "BB", spotId: PREFLOP_SPOTS.sbOpen };
  assert.deepEqual(practiceSettingsToStartOptions(settings), { heroPosition: "BB" });
}

{
  const settings: PreflopPracticeSettings = { mode: "spot", seat: "BB", spotId: PREFLOP_SPOTS.sbVsBbReraise };
  assert.deepEqual(practiceSettingsToStartOptions(settings), { spotId: PREFLOP_SPOTS.sbVsBbReraise });
}

assert.equal(SPOT_FOCUS_OPTIONS.length, 5);
assert.equal(SPOT_FOCUS_OPTIONS.find((spot) => spot.spotId === PREFLOP_SPOTS.sbVsBbReraise)?.actorPosition, "SB");
assert.match(SPOT_FOCUS_OPTIONS.find((spot) => spot.spotId === PREFLOP_SPOTS.sbLimpVsBbRaise)?.title ?? "", /limp/i);

console.log("practice mode tests passed");
