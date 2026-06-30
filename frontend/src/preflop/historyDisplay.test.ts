import assert from "node:assert/strict";

import type { PreflopHistoryEntry } from "./engine";
import { historyEntryDisplay } from "./historyDisplay";
import { PREFLOP_SPOTS } from "./rangeData";

const automaticSetupAction: PreflopHistoryEntry = {
  action: "raise",
  actor: "BB",
  automatic: true,
  handKey: "A5s",
  probability: 0.42,
  spotId: PREFLOP_SPOTS.bbVsSbOpen,
  spotName: "BB versus SB open"
};

assert.deepEqual(historyEntryDisplay(automaticSetupAction, false), {
  handLabel: "--",
  probabilityLabel: "--"
});

assert.deepEqual(historyEntryDisplay(automaticSetupAction, true), {
  handLabel: "A5s",
  probabilityLabel: "42%"
});

assert.deepEqual(historyEntryDisplay({ ...automaticSetupAction, automatic: false }, false), {
  handLabel: "A5s",
  probabilityLabel: "42%"
});

console.log("preflop history display tests passed");
