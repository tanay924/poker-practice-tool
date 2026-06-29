import assert from "node:assert/strict";

import { shouldRevealOpponentCards, visibleBoardForHistory } from "../poker/visibility";

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
assert.equal(shouldRevealOpponentCards({ winner: "showdown", reason: "river_completed" }), true);

console.log("analysis detail tests passed");
