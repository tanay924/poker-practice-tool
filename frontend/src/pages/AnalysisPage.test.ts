import assert from "node:assert/strict";

import { analysisStatusCounts, filterAnalysisItems } from "./analysisListFilters";
import type { AnalysisListItem } from "../types";

const items: AnalysisListItem[] = [
  {
    board: [],
    created_at: "2026-07-08T10:00:00Z",
    error: null,
    hand_id: 67,
    hero_hand: "AdTd",
    job_id: 1,
    status: "ready"
  },
  {
    board: ["Ks", "7d", "2c"],
    created_at: "2026-07-08T10:05:00Z",
    error: null,
    hand_id: 68,
    hero_hand: "QcJh",
    job_id: 2,
    status: "unsupported"
  },
  {
    board: ["Ah", "Jd", "3c", "9s", "2h"],
    created_at: "2026-07-08T10:10:00Z",
    error: "solver failed",
    hand_id: 69,
    hero_hand: "8s8d",
    job_id: 3,
    status: "failed"
  }
];

assert.deepEqual(
  filterAnalysisItems(items, { query: "adtd", status: "all" }).map((item) => item.hand_id),
  [67]
);
assert.deepEqual(
  filterAnalysisItems(items, { query: "#67", status: "all" }).map((item) => item.hand_id),
  [67]
);
assert.deepEqual(
  filterAnalysisItems(items, { query: "ks 7d", status: "all" }).map((item) => item.hand_id),
  [68]
);
assert.deepEqual(
  filterAnalysisItems(items, { query: "", status: "failed" }).map((item) => item.hand_id),
  [69]
);
assert.deepEqual(analysisStatusCounts(items), {
  all: 3,
  failed: 1,
  queued: 0,
  ready: 1,
  solving: 0,
  unsupported: 1
});

console.log("analysis page tests passed");
