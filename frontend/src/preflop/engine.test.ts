import assert from "node:assert/strict";

import {
  answerCurrentDecision,
  handKeyFromCards,
  legalActionsForSpot,
  sampleAction,
  startPreflopRound,
  type ActionOption,
} from "./engine";
import { PREFLOP_SPOTS, getRangeForSpot } from "./rangeData";

function fixedRng(values: number[]) {
  let index = 0;
  return () => {
    const value = values[index] ?? values[values.length - 1] ?? 0;
    index += 1;
    return value;
  };
}

function option(options: ActionOption[], action: string) {
  const found = options.find((candidate) => candidate.action === action);
  assert.ok(found, `expected option ${action}`);
  return found;
}

assert.equal(handKeyFromCards("As", "Ah"), "AA");
assert.equal(handKeyFromCards("As", "Ks"), "AKs");
assert.equal(handKeyFromCards("Kc", "Ah"), "AKo");

assert.deepEqual(legalActionsForSpot(PREFLOP_SPOTS.sbOpen), ["fold", "limp", "raise"]);
assert.deepEqual(legalActionsForSpot(PREFLOP_SPOTS.bbVsSbOpen), ["fold", "call", "raise", "allin"]);
assert.deepEqual(legalActionsForSpot(PREFLOP_SPOTS.bbVsSbLimp), ["check", "raise"]);

{
  const range = getRangeForSpot(PREFLOP_SPOTS.sbOpen);
  assert.equal(range.handKeys().includes("72o"), true);
  const options = range.optionsForHand("72o");
  assert.equal(option(options, "fold").probability, 1);
  assert.equal(option(options, "raise").probability, 0);
}

{
  const range = getRangeForSpot(PREFLOP_SPOTS.sbVsBbReraise);
  assert.equal(range.handKeys().includes("72o"), false);
  assert.equal(range.handKeys().includes("J3s"), true);
  assert.equal(option(range.optionsForHand("J3s"), "fold").probability, 1);
}

{
  const range = getRangeForSpot(PREFLOP_SPOTS.sbOpen);
  assert.equal(sampleAction(range.optionsForHand("AA"), fixedRng([0.05])).action, "raise");
  assert.equal(sampleAction(range.optionsForHand("AA"), fixedRng([0.95])).action, "limp");
}

{
  const round = startPreflopRound({
    heroPosition: "SB",
    heroCards: ["7s", "2h"],
    villainCards: ["As", "Ad"],
    rng: fixedRng([0.1]),
  });
  assert.equal(round.currentDecision?.spotId, PREFLOP_SPOTS.sbOpen);

  const answered = answerCurrentDecision(round, "raise", fixedRng([0.1]));
  assert.equal(answered.lastFeedback?.correct, false);
  assert.equal(answered.lastFeedback?.selectedProbability, 0);
  assert.equal(answered.isComplete, true);
  assert.equal(option(answered.lastFeedback.options, "fold").probability, 1);
}

{
  const round = startPreflopRound({
    heroPosition: "SB",
    heroCards: ["As", "Ah"],
    villainCards: ["Ks", "Kh"],
    rng: fixedRng([0.1]),
  });
  const answered = answerCurrentDecision(round, "limp", fixedRng([0.99]));

  assert.equal(answered.lastFeedback?.correct, true);
  assert.equal(answered.currentDecision?.spotId, PREFLOP_SPOTS.sbLimpVsBbRaise);
  assert.equal(answered.history.at(-1)?.actor, "BB");
  assert.equal(answered.history.at(-1)?.action, "raise");
}

{
  const round = startPreflopRound({
    heroPosition: "BB",
    heroCards: ["Ks", "Qh"],
    villainCards: ["As", "Ah"],
    rng: fixedRng([0.05]),
  });

  assert.equal(round.heroPosition, "BB");
  assert.equal(round.currentDecision?.spotId, PREFLOP_SPOTS.bbVsSbOpen);
  assert.equal(round.history[0].actor, "SB");
  assert.equal(round.history[0].action, "raise");
}

{
  const round = startPreflopRound({
    heroPosition: "BB",
    heroCards: ["As", "Ah"],
    villainCards: ["Ks", "Qh"],
    rng: fixedRng([0.05, 0.05]),
  });
  const answered = answerCurrentDecision(round, "raise", fixedRng([0.05]));

  assert.equal(answered.lastFeedback?.correct, true);
  assert.equal(answered.isComplete, true);
  assert.equal(answered.history.at(-1)?.actor, "SB");
  assert.equal(answered.history.at(-1)?.spotId, PREFLOP_SPOTS.sbVsBbReraise);
}

{
  const round = startPreflopRound({
    spotId: PREFLOP_SPOTS.sbVsBbReraise,
    rng: fixedRng([0.5])
  });

  assert.equal(round.heroPosition, "SB");
  assert.equal(round.currentDecision?.spotId, PREFLOP_SPOTS.sbVsBbReraise);
  assert.ok(getRangeForSpot(PREFLOP_SPOTS.sbVsBbReraise).handKeys().includes(round.currentDecision?.handKey ?? ""));
  assert.deepEqual(
    round.history.map((entry) => `${entry.actor}:${entry.action}:${entry.automatic}`),
    ["SB:raise:true", "BB:raise:true"]
  );
}

{
  const round = startPreflopRound({
    spotId: PREFLOP_SPOTS.bbVsSbLimp,
    rng: fixedRng([0.25])
  });

  assert.equal(round.heroPosition, "BB");
  assert.equal(round.currentDecision?.spotId, PREFLOP_SPOTS.bbVsSbLimp);
  assert.ok(getRangeForSpot(PREFLOP_SPOTS.bbVsSbLimp).handKeys().includes(round.currentDecision?.handKey ?? ""));
  assert.deepEqual(
    round.history.map((entry) => `${entry.actor}:${entry.action}:${entry.automatic}`),
    ["SB:limp:true"]
  );
}

console.log("preflop engine tests passed");
