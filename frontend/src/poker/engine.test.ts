import assert from "node:assert/strict";

import {
  applyHeroAction,
  formatActionEntry,
  legalHeroActions,
  startNewHand,
  toHandPayload,
  type TrainerState,
} from "./engine";

function fixedRng(values: number[]) {
  return () => values.shift() ?? 0.99;
}

function choose(state: TrainerState, actionName: string) {
  const action = legalHeroActions(state).find((candidate) => candidate.action === actionName);
  assert.ok(action, `expected action ${actionName}`);
  return applyHeroAction(state, action);
}

const baseState: TrainerState = {
  heroCards: ["As", "Kd"],
  villainCards: ["Qc", "Jh"],
  board: ["Ks", "7d", "2c", "4h", "9s"],
  visibleBoard: ["Ks", "7d", "2c"],
  street: "flop",
  pot: 5,
  heroStack: 97.5,
  villainStack: 97.5,
  facingBet: false,
  facingBetAmount: 0,
  heroPosition: "SB",
  villainPosition: "BB",
  actionHistory: [],
  handOver: false,
  result: null,
  message: "Your flop decision.",
};

{
  const actions = legalHeroActions(baseState);
  assert.deepEqual(
    actions.map((action) => action.label),
    ["Check", "Bet 2bb", "Bet 5bb"],
  );
  assert.deepEqual(
    actions.map((action) => action.action),
    ["check", "bet", "bet"],
  );
}

{
  const potBet = legalHeroActions(baseState).find((action) => action.action === "bet" && action.amountBb === 5);
  assert.ok(potBet);

  const next = applyHeroAction(baseState, potBet);
  const entry = next.actionHistory[0];

  assert.equal(entry.action, "bet");
  assert.equal(entry.amount_bb, 5);
  assert.equal(formatActionEntry(entry), "bet 5bb");
}

{
  const facingBetState: TrainerState = {
    ...baseState,
    pot: 7,
    facingBet: true,
    facingBetAmount: 2,
  };
  const actions = legalHeroActions(facingBetState);
  assert.deepEqual(
    actions.map((action) => action.label),
    ["Fold", "Call 2bb"],
  );
  assert.equal(actions.some((action) => action.action === "raise_to"), false);
}

{
  const originalRandom = Math.random;
  const randomValues = [0.5, 0.1, 0.1];
  Math.random = () => randomValues.shift() ?? 0.9;
  try {
    const potBet = legalHeroActions(baseState).find((action) => action.action === "bet" && action.amountBb === 5);
    assert.ok(potBet);

    const turnState = applyHeroAction(baseState, potBet);
    const turnEntry = turnState.actionHistory.at(-1);

    assert.equal(turnEntry?.street, "turn");
    assert.equal(turnEntry?.actor, "BB");
    assert.equal(turnEntry?.action, "check");
    assert.equal(turnState.facingBet, false);
  } finally {
    Math.random = originalRandom;
  }
}

{
  const hand = startNewHand({
    heroPosition: "BB",
    heroCards: ["Kc", "9c"],
    villainCards: ["As", "Ah"],
    board: ["2d", "7h", "Jc", "4s", "Td"],
    rng: fixedRng([0.5])
  });

  assert.equal(hand.heroPosition, "BB");
  assert.equal(hand.villainPosition, "SB");
  assert.equal(hand.actionHistory[0].actor, "SB");
  assert.equal(hand.actionHistory[0].action, "raise");
  assert.equal(hand.actionHistory[0].automatic, true);
  assert.equal(hand.currentPreflopDecision?.actorPosition, "BB");
  assert.equal(hand.currentPreflopDecision?.spotId, "HU_SRP_BB_VS_SB_OPEN_100BB");

  const postflop = choose(hand, "call");
  assert.equal(postflop.street, "flop");
  assert.equal(postflop.pot, 5);
  assert.equal(postflop.heroStack, 97.5);
  assert.equal(postflop.villainStack, 97.5);
  assert.equal(postflop.actionHistory.at(-1)?.actor, "BB");
  assert.equal(postflop.actionHistory.at(-1)?.automatic, false);
  assert.deepEqual(
    legalHeroActions(postflop).map((action) => action.label),
    ["Check", "Bet 2bb", "Bet 5bb"],
  );

  const payload = toHandPayload(postflop);
  assert.equal(payload.hero_position, "BB");
  assert.equal(payload.villain_position, "SB");
}

{
  const hand = startNewHand({
    heroPosition: "BB",
    heroCards: ["Kc", "9c"],
    villainCards: ["As", "Ah"],
    board: ["2d", "7h", "Jc", "4s", "Td"],
    rng: fixedRng([0.5, 0.99])
  });
  const postflop = choose(hand, "call");
  const turn = choose(postflop, "check");

  assert.equal(turn.street, "turn");
  assert.equal(turn.actionHistory.at(-2)?.actor, "BB");
  assert.equal(turn.actionHistory.at(-2)?.action, "check");
  assert.equal(turn.actionHistory.at(-1)?.actor, "SB");
  assert.equal(turn.actionHistory.at(-1)?.action, "check");
}

{
  const hand = startNewHand({
    seatMode: "random",
    heroCards: ["Kc", "9c"],
    villainCards: ["As", "Ah"],
    board: ["2d", "7h", "Jc", "4s", "Td"],
    rng: fixedRng([0.75, 0.5])
  });

  assert.equal(hand.heroPosition, "BB");
  assert.equal(hand.villainPosition, "SB");
}

{
  const hand = startNewHand({
    heroCards: ["As", "Ah"],
    villainCards: ["Kc", "9c"],
    board: ["2d", "7h", "Jc", "4s", "Td"],
    rng: fixedRng([0.5])
  });
  const postflop = choose(hand, "raise");

  assert.equal(postflop.street, "flop");
  assert.equal(postflop.pot, 5);
  assert.equal(postflop.heroStack, 97.5);
  assert.equal(postflop.villainStack, 97.5);
  assert.equal(postflop.actionHistory[0].spot_id, "HU_SB_OPEN_2_5BB_OR_LIMP_100BB");
  assert.equal(postflop.actionHistory[0].hand_key, "AA");
  assert.equal(postflop.actionHistory[0].frequency, 0.9);
  assert.equal(postflop.actionHistory[0].automatic, false);
  assert.equal(postflop.actionHistory[1].action, "call");
  assert.equal(postflop.actionHistory[1].automatic, true);
}

{
  const hand = startNewHand({
    heroCards: ["As", "Ah"],
    villainCards: ["Kc", "9c"],
    board: ["2d", "7h", "Jc", "4s", "Td"],
    rng: fixedRng([0.5, 0.01])
  });
  const postflop = choose(hand, "raise");
  const firstPostflopEntry = postflop.actionHistory.at(-1);

  assert.equal(firstPostflopEntry?.street, "flop");
  assert.equal(firstPostflopEntry?.actor, "BB");
  assert.equal(firstPostflopEntry?.action, "check");
  assert.equal(postflop.facingBet, false);
}

{
  const hand = startNewHand({
    heroCards: ["As", "2s"],
    villainCards: ["Kc", "4c"],
    board: ["2d", "7h", "Jc", "4s", "Td"],
    rng: fixedRng([0.99])
  });
  const postflop = choose(hand, "limp");

  assert.equal(postflop.street, "flop");
  assert.equal(postflop.pot, 2);
  assert.equal(postflop.heroStack, 99);
  assert.equal(postflop.villainStack, 99);
  assert.equal(postflop.actionHistory[1].action, "check");
}

{
  const hand = startNewHand({
    heroCards: ["8d", "5c"],
    villainCards: ["Tc", "2h"],
    board: ["Jd", "6d", "7d", "Qc", "Js"],
    rng: fixedRng([0.99])
  });
  const postflop = choose(hand, "limp");
  const actions = legalHeroActions(postflop);

  assert.deepEqual(
    actions.map((action) => action.label),
    ["Check", "Bet 1bb", "Bet 2bb"],
  );
}

{
  const hand = startNewHand({
    heroCards: ["As", "7s"],
    villainCards: ["Kd", "Kh"],
    board: ["2d", "7h", "Jc", "4s", "Td"],
    rng: fixedRng([0.01])
  });
  const facingRaise = choose(hand, "limp");
  assert.equal(facingRaise.street, "preflop");

  const postflop = choose(facingRaise, "call");
  assert.equal(postflop.street, "flop");
  assert.equal(postflop.pot, 10);
  assert.equal(postflop.heroStack, 95);
  assert.equal(postflop.villainStack, 95);
}

{
  const hand = startNewHand({
    heroCards: ["As", "Qs"],
    villainCards: ["Kd", "Kh"],
    board: ["2d", "7h", "Jc", "4s", "Td"],
    rng: fixedRng([0.01])
  });
  const facingThreeBet = choose(hand, "raise");
  assert.equal(facingThreeBet.street, "preflop");

  const postflop = choose(facingThreeBet, "call");
  assert.equal(postflop.street, "flop");
  assert.equal(postflop.pot, 23);
  assert.equal(postflop.heroStack, 88.5);
  assert.equal(postflop.villainStack, 88.5);
}

{
  const hand = startNewHand({
    heroCards: ["As", "Ks"],
    villainCards: ["Qc", "4c"],
    board: ["2d", "7h", "Jc", "4s", "Td"],
    rng: fixedRng([0.99])
  });
  const postflop = choose(hand, "limp");

  assert.equal(postflop.handOver, false);
  assert.equal(postflop.actionHistory[0].action, "limp");
  assert.equal(postflop.actionHistory[0].frequency, 0);
}

{
  const hand = startNewHand({
    heroCards: ["7c", "2d"],
    villainCards: ["As", "Ks"],
    board: ["2h", "7h", "Jc", "4s", "Td"],
    rng: fixedRng([0.01])
  });
  const postflop = choose(hand, "raise");

  assert.equal(postflop.handOver, false);
  assert.equal(postflop.street, "flop");
  assert.equal(postflop.preflopBlocked, true);
  assert.equal(postflop.actionHistory[0].action, "raise");
  assert.equal(postflop.actionHistory[0].frequency, 0);
  assert.equal(postflop.actionHistory[1].actor, "BB");
  assert.equal(postflop.actionHistory[1].action, "call");
  assert.equal(postflop.actionHistory[1].automatic, true);
}

{
  const hand = startNewHand({
    heroPosition: "BB",
    heroCards: ["7c", "2d"],
    villainCards: ["As", "Ah"],
    board: ["2h", "7h", "Jc", "4s", "Td"],
    rng: fixedRng([0.01])
  });
  const postflop = choose(hand, "raise");

  assert.equal(postflop.handOver, false);
  assert.equal(postflop.street, "flop");
  assert.equal(postflop.preflopBlocked, true);
  assert.equal(postflop.actionHistory[1].actor, "BB");
  assert.equal(postflop.actionHistory[1].action, "raise");
  assert.equal(postflop.actionHistory[1].frequency, 0);
  assert.equal(postflop.actionHistory[2].actor, "SB");
  assert.equal(postflop.actionHistory[2].action, "call");
  assert.equal(postflop.actionHistory[2].automatic, true);
}

{
  const foldedOnFlop = choose({ ...baseState, rng: fixedRng([0.01]) }, "bet");

  assert.equal(foldedOnFlop.handOver, true);
  assert.equal(foldedOnFlop.result?.reason, "villain_folded");
  assert.deepEqual(foldedOnFlop.visibleBoard, ["Ks", "7d", "2c"]);
}

{
  const hand = startNewHand({
    heroCards: ["7c", "2d"],
    villainCards: ["Qc", "4c"],
    board: ["2h", "7h", "Jc", "4s", "Td"],
    rng: fixedRng([0.99])
  });
  const folded = choose(hand, "fold");

  assert.equal(folded.handOver, true);
  assert.equal(folded.result?.reason, "hero_folded_preflop");
  assert.equal(folded.message, "Opponent wins. Hero folded preflop.");
  assert.deepEqual(folded.visibleBoard, []);
}

{
  const riverState: TrainerState = {
    ...baseState,
    heroCards: ["As", "Ad"],
    villainCards: ["Kc", "Qd"],
    board: ["Ah", "7d", "2c", "4h", "9s"],
    visibleBoard: ["Ah", "7d", "2c", "4h", "9s"],
    street: "river",
    pot: 10,
    heroStack: 95,
    villainStack: 95,
    message: "Your river decision."
  };
  const completed = choose(riverState, "check");

  assert.equal(completed.handOver, true);
  assert.deepEqual(completed.result, {
    hero_hand: "Three of a kind, aces",
    reason: "river_completed",
    showdown: true,
    villain_hand: "High card, ace",
    winner: "hero",
    winning_hand: "Three of a kind, aces"
  });
  assert.equal(completed.message, "Hero wins at showdown.");
}

{
  const riverState: TrainerState = {
    ...baseState,
    heroCards: ["As", "Kd"],
    villainCards: ["Ac", "Kh"],
    board: ["2s", "3d", "4c", "5h", "9s"],
    visibleBoard: ["2s", "3d", "4c", "5h", "9s"],
    street: "river",
    pot: 10,
    heroStack: 95,
    villainStack: 95,
    message: "Your river decision."
  };
  const completed = choose(riverState, "check");

  assert.equal(completed.handOver, true);
  assert.equal(completed.result?.winner, "split");
  assert.equal(completed.result?.winning_hand, "Straight, five-high");
  assert.equal(completed.message, "Pot split at showdown.");
}

console.log("poker engine tests passed");
