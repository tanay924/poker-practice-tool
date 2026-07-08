import assert from "node:assert/strict";

import { shouldRevealOpponentCards, visibleBoardForHistory } from "../poker/visibility";
import { formatPostflopSummaryText, formatResultText } from "./analysisResultText";

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
assert.equal(
  formatPostflopSummaryText({
    preflopBlocksPostflop: true,
    solverOutput: {
      postflop_status: "skipped",
      street_results: [],
      summary: { largest_mistake: null, overall: "preflop_only" }
    },
    visibleBoardCardCount: 0
  }),
  "Postflop solver was not run because Hero chose a 0% preflop line."
);
assert.equal(
  formatPostflopSummaryText({
    preflopBlocksPostflop: false,
    solverOutput: {
      postflop_status: "skipped",
      street_results: [],
      summary: { largest_mistake: null, overall: "preflop_only" }
    },
    visibleBoardCardCount: 0
  }),
  "Postflop solver was not run because the hand ended before the flop."
);
assert.equal(
  formatPostflopSummaryText({
    preflopBlocksPostflop: false,
    solverOutput: {
      postflop_status: "ready",
      street_results: [],
      summary: { largest_mistake: null, overall: "ok" }
    },
    visibleBoardCardCount: 3
  }),
  "No large solver mistake flagged."
);

console.log("analysis detail tests passed");
