import type { ActionEntry, HandCreate } from "../types";

export type Street = "flop" | "turn" | "river";
export type CanonicalAction = "check" | "bet" | "call" | "fold" | "raise_to";

export interface TrainerAction {
  action: CanonicalAction;
  amountBb: number;
  label: string;
  targetAmountBb?: number;
}

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
const MINIMUM_BET_BB = 2;

export function buildDeck(): string[] {
  return RANKS.flatMap((rank) => SUITS.map((suit) => `${rank}${suit}`));
}

export function startNewHand(): TrainerState {
  const deck = shuffle(buildDeck());
  const initialHistory: ActionEntry[] = [
    {
      street: "preflop",
      actor: "SB",
      action: "raise_to",
      amount_bb: 2.5,
      target_amount_bb: 2.5,
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
    const actions = [
      actionOption("fold"),
      actionOption("call", state.facingBetAmount),
      raiseToAction(sharkAmountForFraction(state.street === "flop" ? 1 : 0.5, state.pot, state.heroStack))
    ];
    if (state.street !== "flop") {
      actions.push(raiseToAction(sharkAmountForFraction(1, state.pot, state.heroStack)));
    }
    return uniqueLegalActions(actions);
  }

  const betFractions = state.street === "flop" ? [0.5, 1] : [0.33, 0.66, 1];
  return uniqueLegalActions([
    actionOption("check"),
    ...betFractions.map((fraction) => actionOption("bet", sharkAmountForFraction(fraction, state.pot, state.heroStack)))
  ]);
}

export function applyHeroAction(state: TrainerState, action: TrainerAction): TrainerState {
  if (!legalHeroActions(state).some((candidate) => sameAction(candidate, action))) {
    return state;
  }

  if (action.action === "fold") {
    return finishHand(addHeroAction(state, action), "villain", "hero_folded");
  }

  if (action.action === "call") {
    const called = addHeroAction(state, action);
    return advanceAfterClosedAction({
      ...called,
      heroStack: roundBb(called.heroStack - action.amountBb),
      facingBet: false,
      facingBetAmount: 0
    });
  }

  if (action.action === "check") {
    return advanceAfterClosedAction(addHeroAction(state, action));
  }

  const afterHero = addHeroAction(state, action);
  const afterHeroStack = {
    ...afterHero,
    heroStack: roundBb(afterHero.heroStack - action.amountBb),
    facingBet: false,
    facingBetAmount: 0
  };

  if (Math.random() < 0.22) {
    return finishHand(addVillainAction(afterHeroStack, actionOption("fold")), "hero", "villain_folded");
  }

  const called = addVillainAction(afterHeroStack, actionOption("call", action.amountBb));
  return advanceAfterClosedAction({
    ...called,
    villainStack: roundBb(called.villainStack - action.amountBb)
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

export function formatActionEntry(entry: ActionEntry): string {
  if (entry.action === "check" || entry.action === "fold") {
    return entry.action;
  }
  if (entry.action === "call") {
    return `call ${formatBb(entry.amount_bb)}`;
  }
  if (entry.action === "bet") {
    return `bet ${formatBb(entry.amount_bb)}`;
  }
  if (entry.action === "raise_to") {
    return `raise to ${formatBb(entry.target_amount_bb ?? entry.amount_bb)}`;
  }
  return legacyActionLabel(entry);
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
    const amount = sharkAmountForFraction(street === "flop" ? 1 : Math.random() < 0.5 ? 0.33 : 0.66, nextState.pot, nextState.villainStack);
    const villainAction = actionOption("bet", amount);
    return {
      ...addVillainAction(nextState, villainAction),
      villainStack: roundBb(nextState.villainStack - amount),
      facingBet: true,
      facingBetAmount: amount,
      message: `BB ${formatAction(villainAction)}. Your ${street} response.`
    };
  }

  return {
    ...addVillainAction(nextState, actionOption("check")),
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

function addHeroAction(state: TrainerState, action: TrainerAction): TrainerState {
  return appendAction(state, action, "SB", `SB ${state.street} decision`);
}

function addVillainAction(state: TrainerState, action: TrainerAction): TrainerState {
  return appendAction(state, action, "BB", `BB ${state.street} action`);
}

function appendAction(state: TrainerState, action: TrainerAction, actor: "SB" | "BB", node: string): TrainerState {
  const entry: ActionEntry = {
    street: state.street,
    actor,
    action: action.action,
    amount_bb: roundBb(action.amountBb),
    pot_after: roundBb(state.pot + action.amountBb),
    node
  };
  if (typeof action.targetAmountBb === "number") {
    entry.target_amount_bb = roundBb(action.targetAmountBb);
  }

  return {
    ...state,
    pot: entry.pot_after,
    actionHistory: [...state.actionHistory, entry]
  };
}

function actionOption(action: Exclude<CanonicalAction, "raise_to">, amountBb = 0): TrainerAction {
  return {
    action,
    amountBb: roundBb(amountBb),
    label: formatAction({ action, amountBb })
  };
}

function raiseToAction(targetAmountBb: number): TrainerAction {
  const target = roundBb(targetAmountBb);
  return {
    action: "raise_to",
    amountBb: target,
    targetAmountBb: target,
    label: `Raise to ${formatBb(target)}`
  };
}

function uniqueLegalActions(actions: TrainerAction[]): TrainerAction[] {
  const unique: TrainerAction[] = [];
  for (const action of actions) {
    if ((action.action === "bet" || action.action === "raise_to") && action.amountBb <= MINIMUM_BET_BB) {
      continue;
    }
    if (!unique.some((candidate) => sameAction(candidate, action))) {
      unique.push(action);
    }
  }
  return unique;
}

function sameAction(left: TrainerAction, right: TrainerAction): boolean {
  return left.action === right.action && left.amountBb === right.amountBb && left.targetAmountBb === right.targetAmountBb;
}

function sharkAmountForFraction(fraction: number, pot: number, stack: number): number {
  return Math.min(Math.trunc(fraction * pot), Math.trunc(stack));
}

function roundBb(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatAction(action: Pick<TrainerAction, "action" | "amountBb" | "targetAmountBb">): string {
  if (action.action === "check") {
    return "Check";
  }
  if (action.action === "fold") {
    return "Fold";
  }
  if (action.action === "call") {
    return `Call ${formatBb(action.amountBb)}`;
  }
  if (action.action === "bet") {
    return `Bet ${formatBb(action.amountBb)}`;
  }
  return `Raise to ${formatBb(action.targetAmountBb ?? action.amountBb)}`;
}

function formatBb(value: number): string {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}bb`;
}

function legacyActionLabel(entry: ActionEntry): string {
  const action = entry.action.replace(/_/g, " ");
  if (entry.amount_bb > 0) {
    return `${action} ${formatBb(entry.amount_bb)}`;
  }
  return action;
}
