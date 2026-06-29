import assert from "node:assert/strict";

import { shouldRevealOpponentCards, visibleBoardForHistory } from "../poker/visibility";
import { formatResultText } from "./analysisResultText";

const board = ["Ah", "Jh", "9d", "Js", "Td"];

{
  const visibleBoard = visibleBoardForHistory(
    board,
    [
      { street: "preflop" },
      { street: "flop" },
      { street: "flop" }
    ]
  );

  assert.deepEqual(visibleBoard, ["Ah", "Jh", "9d"]);
}

{
  const visibleBoard = visibleBoardForHistory(
    board,
    [{ street: "preflop" }]
  );

  assert.deepEqual(visibleBoard, []);
}

{
  const visibleBoard = visibleBoardForHistory(
    board,
    [{ street: "river" }]
  );

  assert.deepEqual(visibleBoard, board);
}

assert.equal(shouldRevealOpponentCards({ winner: "hero", reason: "villain_folded" }), false);
assert.equal(shouldRevealOpponentCards({ winner: "hero", reason: "river_completed" }), true);
assert.equal(shouldRevealOpponentCards({ winner: "split", reason: "river_completed" }), true);
assert.equal(
  formatResultText({ winner: "villain", reason: "river_completed", winning_hand: "Pair of tens" }),
  "Opponent won at showdown with Pair of tens."
);
assert.equal(
  formatResultText({ winner: "split", reason: "river_completed", winning_hand: "Straight, five-high" }),
  "The pot was split at showdown with Straight, five-high."
);

console.log("analysis detail tests passed");
