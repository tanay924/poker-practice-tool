import assert from "node:assert/strict";

import { playShortcutForAction, resolvePlayShortcut } from "./playActionShortcuts";
import type { TrainerAction } from "../poker/engine";

const checkBetActions: TrainerAction[] = [
  { action: "check", amountBb: 0, label: "Check" },
  { action: "bet", amountBb: 2, label: "Bet 50% (2bb)", sizeLabel: "50%" },
  { action: "bet", amountBb: 5, label: "Bet 100% (5bb)", sizeLabel: "100%" }
];

assert.deepEqual(playShortcutForAction(checkBetActions[0], 0, checkBetActions), {
  aria: "c 1",
  label: "C / 1"
});
assert.deepEqual(playShortcutForAction(checkBetActions[1], 1, checkBetActions), {
  aria: "2",
  label: "2"
});
assert.deepEqual(playShortcutForAction(checkBetActions[2], 2, checkBetActions), {
  aria: "3",
  label: "3"
});
assert.equal(resolvePlayShortcut("c", checkBetActions), checkBetActions[0]);
assert.equal(resolvePlayShortcut("2", checkBetActions), checkBetActions[1]);
assert.equal(resolvePlayShortcut("r", checkBetActions), null);

const preflopActions: TrainerAction[] = [
  { action: "fold", amountBb: 0, label: "Fold" },
  { action: "call", amountBb: 2.5, label: "Call 2.5bb" },
  { action: "raise", amountBb: 11.5, targetAmountBb: 11.5, label: "Raise to 11.5bb" },
  { action: "allin", amountBb: 100, targetAmountBb: 100, label: "All-in" }
];

assert.deepEqual(playShortcutForAction(preflopActions[0], 0, preflopActions), {
  aria: "f 1",
  label: "F / 1"
});
assert.deepEqual(playShortcutForAction(preflopActions[1], 1, preflopActions), {
  aria: "c 2",
  label: "C / 2"
});
assert.deepEqual(playShortcutForAction(preflopActions[2], 2, preflopActions), {
  aria: "r 3",
  label: "R / 3"
});
assert.equal(resolvePlayShortcut("f", preflopActions), preflopActions[0]);
assert.equal(resolvePlayShortcut("R", preflopActions), preflopActions[2]);
assert.equal(resolvePlayShortcut("4", preflopActions), preflopActions[3]);
assert.equal(resolvePlayShortcut("x", preflopActions), null);

console.log("play action shortcut tests passed");
