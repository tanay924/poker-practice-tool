import type { ActionEntry, HandCreate } from "../types";

export type Street = "flop" | "turn" | "river";
export type TrainerAction =
  | "check"
  | "bet_33"
  | "bet_50"
  | "bet_66"
  | "bet_100"
  | "call"
  | "fold"
  | "raise_50"
  | "raise_100";

export interface TrainerState {
  heroCards: string[];
  villainCards: string[];
  board: string[];
  visibleBoard: string[];
  street: Street;
  pot: number;
  heroStack: number;
  villainStack: number;
  facingBet: boolean;
  facingBetAmount: number;
  actionHistory: ActionEntry[];
  handOver: boolean;
  result: Record<string, unknown> | null;
  message: string;
}

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const SUITS = ["s", "h", "d", "c"];

export function buildDeck(): string[] {
  return RANKS.flatMap((rank) => SUITS.map((suit) => `${rank}${suit}`));
}

export function startNewHand(): TrainerState {
  const deck = shuffle(buildDeck());
  const initialHistory: ActionEntry[] = [
    {
      street: "preflop",
      actor: "SB",
      action: "open_2_5",
      amount_bb: 2.5,
      pot_after: 2.5,
      node: "SB scripted open"
    },
    {
      street: "preflop",
      actor: "BB",
      action: "call",
      amount_bb: 2.5,
      pot_after: 5,
      node: "BB scripted call"
    }
  ];

  const base: TrainerState = {
    heroCards: deck.slice(0, 2),
    villainCards: deck.slice(2, 4),
    board: deck.slice(4, 9),
    visibleBoard: deck.slice(4, 7),
    street: "flop",
    pot: 5,
    heroStack: 97.5,
    villainStack: 97.5,
    facingBet: false,
    facingBetAmount: 0,
    actionHistory: initialHistory,
    handOver: false,
    result: null,
    message: "BB checks. Your flop decision."
  };

  return enterStreet(base, "flop");
}

export function legalHeroActions(state: TrainerState): TrainerAction[] {
  if (state.handOver) {
    return [];
  }

  if (state.facingBet) {
    return state.street === "flop" ? ["fold", "call", "raise_100"] : ["fold", "call", "raise_50", "raise_100"];
  }

  if (state.street === "flop") {
    return ["check", "bet_50", "bet_100"];
  }

  return ["check", "bet_33", "bet_66", "bet_100"];
}

export function applyHeroAction(state: TrainerState, action: TrainerAction): TrainerState {
  if (!legalHeroActions(state).includes(action)) {
    return state;
  }

  if (action === "fold") {
    return finishHand(addHeroAction(state, action, 0, state.pot), "villain", "hero_folded");
  }

  if (action === "call") {
    const called = addHeroAction(state, action, state.facingBetAmount, state.pot + state.facingBetAmount);
    return advanceAfterClosedAction({
      ...called,
      heroStack: roundBb(called.heroStack - state.facingBetAmount),
      facingBet: false,
      facingBetAmount: 0
    });
  }

  if (action === "check") {
    return advanceAfterClosedAction(addHeroAction(state, action, 0, state.pot));
  }

  const amount = amountForAction(action, state.pot);
  const afterHero = addHeroAction(state, action, amount, state.pot + amount);
  const afterHeroStack = { ...afterHero, heroStack: roundBb(afterHero.heroStack - amount), facingBet: false, facingBetAmount: 0 };

  if (Math.random() < 0.22) {
    return finishHand(addVillainAction(afterHeroStack, "fold", 0, afterHeroStack.pot), "hero", "villain_folded");
  }

  const called = addVillainAction(afterHeroStack, "call", amount, afterHeroStack.pot + amount);
  return advanceAfterClosedAction({
    ...called,
    villainStack: roundBb(called.villainStack - amount)
  });
}

export function toHandPayload(state: TrainerState): HandCreate {
  return {
    hero_position: "SB",
    villain_position: "BB",
    hero_cards: state.heroCards.join(""),
    villain_cards: state.villainCards.join(""),
    board_json: state.board,
    stack_bb: 100,
    pot: state.pot,
    action_history_json: state.actionHistory,
    result_json: state.result ?? { winner: "unknown", reason: "unsaved" }
  };
}

function shuffle(cards: string[]): string[] {
  const next = [...cards];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function enterStreet(state: TrainerState, street: Street): TrainerState {
  const visibleBoard = street === "flop" ? state.board.slice(0, 3) : street === "turn" ? state.board.slice(0, 4) : state.board;
  const nextState = {
    ...state,
    street,
    visibleBoard,
    facingBet: false,
    facingBetAmount: 0
  };

  if (Math.random() < 0.28) {
    const villainAction = street === "flop" ? "bet_50" : Math.random() < 0.5 ? "bet_33" : "bet_66";
    const amount = amountForAction(villainAction, nextState.pot);
    return {
      ...addVillainAction(nextState, villainAction, amount, nextState.pot + amount),
      villainStack: roundBb(nextState.villainStack - amount),
      facingBet: true,
      facingBetAmount: amount,
      message: `BB ${labelAction(villainAction)}. Your ${street} response.`
    };
  }

  return {
    ...addVillainAction(nextState, "check", 0, nextState.pot),
    message: `BB checks. Your ${street} decision.`
  };
}

function advanceAfterClosedAction(state: TrainerState): TrainerState {
  if (state.street === "flop") {
    return enterStreet(state, "turn");
  }
  if (state.street === "turn") {
    return enterStreet(state, "river");
  }
  return finishHand(state, "showdown", "river_completed");
}

function finishHand(state: TrainerState, winner: string, reason: string): TrainerState {
  return {
    ...state,
    handOver: true,
    visibleBoard: state.board,
    facingBet: false,
    facingBetAmount: 0,
    result: { winner, reason },
    message: winner === "showdown" ? "River action closed. Hand saved for review." : `${winner.toUpperCase()} wins by ${reason.replace("_", " ")}.`
  };
}

function addHeroAction(state: TrainerState, action: string, amount: number, potAfter: number): TrainerState {
  return appendAction(state, {
    street: state.street,
    actor: "SB",
    action,
    amount_bb: roundBb(amount),
    pot_after: roundBb(potAfter),
    node: `SB ${state.street} decision`
  });
}

function addVillainAction(state: TrainerState, action: string, amount: number, potAfter: number): TrainerState {
  return appendAction(state, {
    street: state.street,
    actor: "BB",
    action,
    amount_bb: roundBb(amount),
    pot_after: roundBb(potAfter),
    node: `BB ${state.street} action`
  });
}

function appendAction(state: TrainerState, entry: ActionEntry): TrainerState {
  return {
    ...state,
    pot: entry.pot_after,
    actionHistory: [...state.actionHistory, entry]
  };
}

function amountForAction(action: string, pot: number): number {
  if (action === "bet_33") {
    return roundBb(pot * 0.33);
  }
  if (action === "bet_50" || action === "raise_50") {
    return roundBb(pot * 0.5);
  }
  if (action === "bet_66") {
    return roundBb(pot * 0.66);
  }
  if (action === "bet_100" || action === "raise_100") {
    return roundBb(pot);
  }
  return 0;
}

function roundBb(value: number): number {
  return Math.round(value * 10) / 10;
}

function labelAction(action: string): string {
  return action.replace("_", " ");
}
