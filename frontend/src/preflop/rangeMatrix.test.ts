import assert from "node:assert/strict";

import { getRangeForSpot, PREFLOP_SPOTS } from "./rangeData";
import { buildRangeMatrix, handKeyForMatrixCell, rangePresentationForSpot } from "./rangeMatrix";

assert.equal(handKeyForMatrixCell(0, 0), "AA");
assert.equal(handKeyForMatrixCell(12, 12), "22");
assert.equal(handKeyForMatrixCell(0, 1), "AKs");
assert.equal(handKeyForMatrixCell(1, 0), "AKo");
assert.equal(handKeyForMatrixCell(8, 10), "64s");
assert.equal(handKeyForMatrixCell(10, 8), "64o");

assert.equal(rangePresentationForSpot(PREFLOP_SPOTS.sbOpen).title, "SB first action");
assert.equal(rangePresentationForSpot(PREFLOP_SPOTS.bbVsSbOpen).title, "BB versus 2.5bb open");
assert.equal(rangePresentationForSpot(PREFLOP_SPOTS.bbVsSbLimp).title, "BB versus limp");

{
  const matrix = buildRangeMatrix(getRangeForSpot(PREFLOP_SPOTS.sbOpen));
  assert.equal(matrix.length, 169);
  assert.equal(matrix[0].handKey, "AA");
  assert.equal(matrix[168].handKey, "22");
  assert.equal(matrix[0].segments[0].action, "raise");
  assert.equal(matrix[0].segments[0].probability, 0.9);
  assert.equal(matrix[0].segments[1].action, "limp");
  assert.equal(matrix[0].segments[1].probability, 0.1);
}

{
  const matrix = buildRangeMatrix(getRangeForSpot(PREFLOP_SPOTS.bbVsSbOpen));
  const akSuited = matrix.find((cell) => cell.handKey === "AKs");
  assert.ok(akSuited);
  assert.equal(akSuited.segments[0].action, "allin");
  assert.equal(akSuited.segments[0].probability, 1);
  assert.match(akSuited.background, /linear-gradient/);
}

console.log("range matrix tests passed");
