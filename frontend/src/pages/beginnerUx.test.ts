import assert from "node:assert/strict";

import {
  analysisEmptyState,
  playGuideSteps,
  primaryNavigationItems,
  rangePageIntro
} from "./beginnerUx";

assert.deepEqual(
  primaryNavigationItems().map((item) => [item.label, item.to]),
  [
    ["Play hand", "/play"],
    ["Preflop drill", "/preflop"],
    ["Hand library", "/analysis"],
    ["Range charts", "/ranges"]
  ]
);

for (const step of playGuideSteps()) {
  assert.equal(step.detail.length <= 72, true, `${step.title} detail is too long`);
}
assert.deepEqual(
  playGuideSteps().map((step) => step.title),
  ["Choose seat", "Play decisions", "Review leaks"]
);

assert.deepEqual(analysisEmptyState({ hasItems: false, hasQuery: false }), {
  actionLabel: "Play a hand",
  actionTo: "/play",
  message: "Play one hand, then request analysis to build your library.",
  title: "No hands saved yet"
});

assert.deepEqual(analysisEmptyState({ hasItems: true, hasQuery: true }), {
  actionLabel: "Clear filters",
  actionTo: null,
  message: "Try a different hand number, card, board, or status.",
  title: "No matching hands"
});

assert.deepEqual(rangePageIntro(), {
  eyebrow: "100bb heads-up cash",
  subtitle: "Use these as reference charts, then drill the same spots in Preflop.",
  title: "Range Charts"
});

console.log("beginner UX tests passed");
