import type { ActionEntry, HandCreate } from "../types";
import {
  actionLabel as preflopActionLabel,
  handKeyFromCards,
  sampleAction,
  type ActionOption as PreflopOption,
  type Position,
  type PreflopAction,
  type Rng
} from "../preflop/engine";
import { getRangeForSpot, legalActionsBySpot, PREFLOP_SPOTS, type PreflopSpotId } from "../preflop/rangeData";

export type Street = "preflop" | "flop" | "turn" | "river";
export type CanonicalAction = "check" | "bet" | "call" | "fold" | "raise_to" | "raise" | "limp" | "allin";

export interface TrainerAction {
  action: CanonicalAction;
  amountBb: number;
  label: string;
  targetAmountBb?: number;
}

interface TrainerPreflopDecision {
  actorPosition: Position;
  cards: [string, string];
  handKey: string;
  options: PreflopOption[];
  prompt: string;
  spotId: PreflopSpotId;
  spotName: string;
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
  currentPreflopDecision?: TrainerPreflopDecision | null;
  postflopBranchId?: string;
  preflopBlocked?: boolean;
  rng?: Rng;
}

export interface StartHandOptions {
  board?: [string, string, string, string, string];
  heroCards?: [string, string];
  rng?: Rng;
  villainCards?: [string, string];
}

interface PreflopActionState {
  amountBb: number;
  potAfter: number;
  targetAmountBb?: number;
}

interface PostflopBranch {
  branchId: string;
  pot: number;
  stack: number;
}

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const SUITS = ["s", "h", "d", "c"];
const MINIMUM_BET_BB = 1;

export function buildDeck(): string[] {
  return RANKS.flatMap((rank) => SUITS.map((suit) => `${rank}${suit}`));
}

export function startNewHand(options: StartHandOptions = {}): TrainerState {
  const rng = options.rng ?? Math.random;
  const { heroCards, villainCards, board } = dealCards(options, rng);
  return {
    heroCards,
    villainCards,
    board,
    visibleBoard: [],
    street: "preflop",
    pot: 0,
    heroStack: 100,
    villainStack: 100,
    facingBet: false,
    facingBetAmount: 0,
    actionHistory: [],
    handOver: false,
    result: null,
    currentPreflopDecision: buildPreflopDecision(PREFLOP_SPOTS.sbOpen, "SB", heroCards),
    preflopBlocked: false,
    rng,
    message: "SB preflop decision."
  };
}

export function legalHeroActions(state: TrainerState): TrainerAction[] {
  if (state.handOver) {
    return [];
  }

  if (state.currentPreflopDecision) {
    return legalActionsBySpot[state.currentPreflopDecision.spotId].map((action) => preflopActionOption(state, action));
  }

  if (state.facingBet) {
    return uniqueLegalActions([
      actionOption("fold"),
      actionOption("call", state.facingBetAmount)
    ]);
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

  if (state.currentPreflopDecision) {
    return applyHeroPreflopAction(state, action.action as PreflopAction);
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

  if ((state.rng ?? Math.random)() < 0.22) {
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
  if (entry.action === "limp") {
    return `limp ${formatBb(entry.amount_bb)}`;
  }
  if (entry.action === "call") {
    return `call ${formatBb(entry.amount_bb)}`;
  }
  if (entry.action === "bet") {
    return `bet ${formatBb(entry.amount_bb)}`;
  }
  if (entry.action === "raise" || entry.action === "raise_to") {
    return `raise to ${formatBb(entry.target_amount_bb ?? entry.amount_bb)}`;
  }
  if (entry.action === "allin") {
    return "all-in";
  }
  return legacyActionLabel(entry);
}

function applyHeroPreflopAction(state: TrainerState, action: PreflopAction): TrainerState {
  const decision = state.currentPreflopDecision;
  if (!decision) {
    return state;
  }

  const selectedFrequency = probabilityForAction(decision.options, action);
  const withHeroAction = appendPreflopAction(state, decision, action, false);
  const scoredState = {
    ...withHeroAction,
    preflopBlocked: Boolean(withHeroAction.preflopBlocked || selectedFrequency <= 0)
  };

  if (decision.spotId === PREFLOP_SPOTS.sbOpen) {
    return advanceAfterHeroSbOpen(scoredState, action);
  }
  if (decision.spotId === PREFLOP_SPOTS.sbVsBbReraise) {
    return advanceAfterHeroSbVsThreeBet(scoredState, action);
  }
  if (decision.spotId === PREFLOP_SPOTS.sbLimpVsBbRaise) {
    return advanceAfterHeroSbLimpVsRaise(scoredState, action);
  }

  return finishHand(scoredState, "showdown", "preflop_tree_closed");
}

function advanceAfterHeroSbOpen(state: TrainerState, action: PreflopAction): TrainerState {
  if (action === "fold") {
    return finishHand(state, "villain", "hero_folded_preflop");
  }

  if (action === "limp") {
    const bbDecision = buildPreflopDecision(PREFLOP_SPOTS.bbVsSbLimp, "BB", state.villainCards as [string, string]);
    const bbAction = sampleAction(bbDecision.options, state.rng ?? Math.random).action;
    const afterBbAction = appendPreflopAction(state, bbDecision, bbAction, true);

    if (bbAction === "raise") {
      return {
        ...afterBbAction,
        currentPreflopDecision: buildPreflopDecision(PREFLOP_SPOTS.sbLimpVsBbRaise, "SB", state.heroCards as [string, string]),
        message: "BB raises to 5bb. SB decision."
      };
    }

    return enterPostflopBranch(afterBbAction, { branchId: "limp_check", pot: 2, stack: 99 });
  }

  if (action === "raise") {
    const bbDecision = buildPreflopDecision(PREFLOP_SPOTS.bbVsSbOpen, "BB", state.villainCards as [string, string]);
    const bbAction = sampleAction(bbDecision.options, state.rng ?? Math.random).action;
    const afterBbAction = appendPreflopAction(state, bbDecision, bbAction, true);

    if (bbAction === "call") {
      return enterPostflopBranch(afterBbAction, { branchId: "srp_open_call", pot: 5, stack: 97.5 });
    }
    if (bbAction === "raise") {
      return {
        ...afterBbAction,
        currentPreflopDecision: buildPreflopDecision(PREFLOP_SPOTS.sbVsBbReraise, "SB", state.heroCards as [string, string]),
        message: "BB 3-bets to 11.5bb. SB decision."
      };
    }
    return finishHand(afterBbAction, "villain", bbAction === "allin" ? "bb_allin_preflop" : "bb_folded_preflop");
  }

  return finishHand(state, "showdown", "preflop_tree_closed");
}

function advanceAfterHeroSbVsThreeBet(state: TrainerState, action: PreflopAction): TrainerState {
  if (action === "call") {
    return enterPostflopBranch(state, { branchId: "three_bet_call", pot: 23, stack: 88.5 });
  }
  return finishHand(state, action === "fold" ? "villain" : "hero", action === "fold" ? "hero_folded_to_3bet" : "hero_4bet_preflop");
}

function advanceAfterHeroSbLimpVsRaise(state: TrainerState, action: PreflopAction): TrainerState {
  if (action === "call") {
    return enterPostflopBranch(state, { branchId: "limp_raise_call", pot: 10, stack: 95 });
  }
  return finishHand(state, action === "fold" ? "villain" : "hero", action === "fold" ? "hero_folded_to_limp_raise" : "hero_limp_reraised_preflop");
}

function enterPostflopBranch(state: TrainerState, branch: PostflopBranch): TrainerState {
  return enterStreet(
    {
      ...state,
      currentPreflopDecision: null,
      postflopBranchId: branch.branchId,
      pot: branch.pot,
      heroStack: branch.stack,
      villainStack: branch.stack,
      street: "flop",
      visibleBoard: state.board.slice(0, 3),
      facingBet: false,
      facingBetAmount: 0,
      message: "BB checks. Your flop decision."
    },
    "flop"
  );
}

function buildPreflopDecision(spotId: PreflopSpotId, actorPosition: Position, cards: [string, string]): TrainerPreflopDecision {
  const range = getRangeForSpot(spotId);
  const handKey = handKeyFromCards(cards[0], cards[1]);
  return {
    actorPosition,
    cards,
    handKey,
    options: range.optionsForHand(handKey),
    prompt: promptForSpot(spotId),
    spotId,
    spotName: range.name
  };
}

function appendPreflopAction(state: TrainerState, decision: TrainerPreflopDecision, action: PreflopAction, automatic: boolean): TrainerState {
  const actionState = preflopActionState(decision.spotId, action);
  const entry: ActionEntry = {
    street: "preflop",
    actor: decision.actorPosition,
    action,
    amount_bb: actionState.amountBb,
    pot_after: actionState.potAfter,
    node: decision.prompt,
    spot_id: decision.spotId,
    hand_key: decision.handKey,
    frequency: probabilityForAction(decision.options, action),
    automatic
  };
  if (typeof actionState.targetAmountBb === "number") {
    entry.target_amount_bb = actionState.targetAmountBb;
  }

  return {
    ...state,
    pot: actionState.potAfter,
    heroStack: decision.actorPosition === "SB" ? roundBb(state.heroStack - actionState.amountBb) : state.heroStack,
    villainStack: decision.actorPosition === "BB" ? roundBb(state.villainStack - actionState.amountBb) : state.villainStack,
    actionHistory: [...state.actionHistory, entry],
    currentPreflopDecision: null
  };
}

function preflopActionState(spotId: PreflopSpotId, action: PreflopAction): PreflopActionState {
  if (spotId === PREFLOP_SPOTS.sbOpen) {
    if (action === "raise") {
      return { amountBb: 2.5, targetAmountBb: 2.5, potAfter: 2.5 };
    }
    if (action === "limp") {
      return { amountBb: 1, potAfter: 2 };
    }
    return { amountBb: 0, potAfter: 0 };
  }

  if (spotId === PREFLOP_SPOTS.bbVsSbOpen) {
    if (action === "call") {
      return { amountBb: 2.5, potAfter: 5 };
    }
    if (action === "raise") {
      return { amountBb: 11.5, targetAmountBb: 11.5, potAfter: 14 };
    }
    if (action === "allin") {
      return { amountBb: 100, targetAmountBb: 100, potAfter: 102.5 };
    }
    return { amountBb: 0, potAfter: 2.5 };
  }

  if (spotId === PREFLOP_SPOTS.sbVsBbReraise) {
    if (action === "call") {
      return { amountBb: 9, potAfter: 23 };
    }
    if (action === "raise") {
      return { amountBb: 23, targetAmountBb: 34.5, potAfter: 37 };
    }
    return { amountBb: 0, potAfter: 14 };
  }

  if (spotId === PREFLOP_SPOTS.bbVsSbLimp) {
    if (action === "raise") {
      return { amountBb: 5, targetAmountBb: 5, potAfter: 6 };
    }
    return { amountBb: 0, potAfter: 2 };
  }

  if (spotId === PREFLOP_SPOTS.sbLimpVsBbRaise) {
    if (action === "call") {
      return { amountBb: 4, potAfter: 10 };
    }
    if (action === "raise") {
      return { amountBb: 14, targetAmountBb: 15, potAfter: 20 };
    }
    return { amountBb: 0, potAfter: 6 };
  }

  return { amountBb: 0, potAfter: 0 };
}

function promptForSpot(spotId: PreflopSpotId): string {
  switch (spotId) {
    case PREFLOP_SPOTS.sbOpen:
      return "SB first action";
    case PREFLOP_SPOTS.bbVsSbOpen:
      return "BB versus SB 2.5bb open";
    case PREFLOP_SPOTS.sbVsBbReraise:
      return "SB versus BB 11.5bb 3-bet";
    case PREFLOP_SPOTS.sbLimpVsBbRaise:
      return "SB limp versus BB 5bb raise";
    case PREFLOP_SPOTS.bbVsSbLimp:
      return "BB versus SB limp";
  }
}

function preflopActionOption(state: TrainerState, action: PreflopAction): TrainerAction {
  const decision = state.currentPreflopDecision;
  const actionState = decision ? preflopActionState(decision.spotId, action) : { amountBb: 0, potAfter: state.pot };
  return {
    action,
    amountBb: actionState.amountBb,
    targetAmountBb: actionState.targetAmountBb,
    label: preflopActionLabel(action)
  };
}

function probabilityForAction(options: PreflopOption[], action: PreflopAction): number {
  return options.find((option) => option.action === action)?.probability ?? 0;
}

function dealCards(options: StartHandOptions, rng: Rng): { board: string[]; heroCards: [string, string]; villainCards: [string, string] } {
  if (options.heroCards && options.villainCards && options.board) {
    return {
      heroCards: options.heroCards,
      villainCards: options.villainCards,
      board: options.board
    };
  }

  const excluded = [...(options.heroCards ?? []), ...(options.villainCards ?? []), ...(options.board ?? [])];
  const deck = shuffle(buildDeck().filter((card) => !excluded.includes(card)), rng);
  const heroCards = options.heroCards ?? [deck[0], deck[1]];
  const villainCards = options.villainCards ?? [deck[2], deck[3]];
  const board = options.board ?? [deck[4], deck[5], deck[6], deck[7], deck[8]];
  return { heroCards, villainCards, board };
}

function shuffle(cards: string[], rng: Rng): string[] {
  const next = [...cards];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function enterStreet(state: TrainerState, street: Exclude<Street, "preflop">): TrainerState {
  const visibleBoard = street === "flop" ? state.board.slice(0, 3) : street === "turn" ? state.board.slice(0, 4) : state.board;
  const nextState = {
    ...state,
    street,
    visibleBoard,
    facingBet: false,
    facingBetAmount: 0
  };
  const rng = state.rng ?? Math.random;

  if (villainCanLeadStreet(nextState, street) && rng() < 0.28) {
    const amount = sharkAmountForFraction(street === "flop" ? 1 : rng() < 0.5 ? 0.33 : 0.66, nextState.pot, nextState.villainStack);
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

function villainCanLeadStreet(state: TrainerState, street: Street): boolean {
  if (street === "preflop") {
    return false;
  }
  if (street === "flop") {
    return false;
  }

  const previousStreet = street === "turn" ? "flop" : "turn";
  return lastAggressor(state.actionHistory, previousStreet) === "BB";
}

function lastAggressor(actionHistory: ActionEntry[], street: Street): ActionEntry["actor"] | null {
  let aggressor: ActionEntry["actor"] | null = null;
  for (const entry of actionHistory) {
    if (entry.street === street && (entry.action === "bet" || entry.action === "raise_to")) {
      aggressor = entry.actor;
    }
  }
  return aggressor;
}

function finishHand(state: TrainerState, winner: string, reason: string): TrainerState {
  return {
    ...state,
    handOver: true,
    visibleBoard: state.board,
    facingBet: false,
    facingBetAmount: 0,
    currentPreflopDecision: null,
    result: { winner, reason },
    message: winner === "showdown" ? "River action closed. Hand saved for review." : `${winner.toUpperCase()} wins by ${reason.replace(/_/g, " ")}.`
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

function actionOption(action: Exclude<CanonicalAction, "raise_to" | "raise" | "limp" | "allin">, amountBb = 0): TrainerAction {
  return {
    action,
    amountBb: roundBb(amountBb),
    label: formatAction({ action, amountBb })
  };
}

function uniqueLegalActions(actions: TrainerAction[]): TrainerAction[] {
  const unique: TrainerAction[] = [];
  for (const action of actions) {
    if ((action.action === "bet" || action.action === "raise_to") && action.amountBb < MINIMUM_BET_BB) {
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
  if (action.action === "limp") {
    return "Limp";
  }
  if (action.action === "allin") {
    return "All-in";
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
