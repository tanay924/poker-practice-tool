import { getRangeForSpot, legalActionsBySpot, PREFLOP_SPOTS, type PreflopSpotId } from "./rangeData";

export type Position = "SB" | "BB";
export type PreflopAction = "fold" | "limp" | "check" | "call" | "raise" | "allin";
export type Rng = () => number;

export interface ActionOption {
  action: PreflopAction;
  probability: number;
}

export interface PreflopDecision {
  actorPosition: Position;
  cards: [string, string];
  handKey: string;
  options: ActionOption[];
  prompt: string;
  spotId: PreflopSpotId;
  spotName: string;
}

export interface PreflopHistoryEntry {
  action: PreflopAction;
  actor: Position;
  automatic: boolean;
  handKey: string;
  probability: number;
  spotId: PreflopSpotId;
  spotName: string;
}

export interface PreflopFeedback {
  action: PreflopAction;
  correct: boolean;
  handKey: string;
  options: ActionOption[];
  selectedProbability: number;
  spotId: PreflopSpotId;
  spotName: string;
}

export interface PreflopRoundState {
  correctCount: number;
  currentDecision: PreflopDecision | null;
  decisionCount: number;
  heroCards: [string, string];
  heroPosition: Position;
  history: PreflopHistoryEntry[];
  isComplete: boolean;
  lastFeedback: PreflopFeedback | null;
  message: string;
  villainCards: [string, string];
}

export interface StartPreflopRoundOptions {
  heroCards?: [string, string];
  heroPosition?: Position;
  rng?: Rng;
  villainCards?: [string, string];
}

export type AnsweredPreflopRoundState = PreflopRoundState & { lastFeedback: PreflopFeedback };

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const SUITS = ["s", "h", "d", "c"];
const ACTION_LABELS: Record<PreflopAction, string> = {
  allin: "All-in",
  call: "Call",
  check: "Check",
  fold: "Fold",
  limp: "Limp",
  raise: "Raise"
};

export function handKeyFromCards(firstCard: string, secondCard: string): string {
  const firstRank = firstCard[0]?.toUpperCase();
  const secondRank = secondCard[0]?.toUpperCase();
  const firstSuit = firstCard[1]?.toLowerCase();
  const secondSuit = secondCard[1]?.toLowerCase();

  if (!RANKS.includes(firstRank) || !RANKS.includes(secondRank) || !SUITS.includes(firstSuit) || !SUITS.includes(secondSuit)) {
    throw new Error(`Invalid hole cards: ${firstCard} ${secondCard}`);
  }

  if (firstRank === secondRank) {
    return `${firstRank}${secondRank}`;
  }

  const orderedRanks = [firstRank, secondRank].sort((left, right) => RANKS.indexOf(left) - RANKS.indexOf(right));
  return `${orderedRanks[0]}${orderedRanks[1]}${firstSuit === secondSuit ? "s" : "o"}`;
}

export function legalActionsForSpot(spotId: PreflopSpotId): PreflopAction[] {
  return legalActionsBySpot[spotId];
}

export function actionLabel(action: PreflopAction): string {
  return ACTION_LABELS[action];
}

export function sampleAction(options: ActionOption[], rng: Rng = Math.random): ActionOption {
  const positiveOptions = options
    .filter((option) => option.probability > 0)
    .sort((left, right) => right.probability - left.probability || actionLabel(left.action).localeCompare(actionLabel(right.action)));

  if (positiveOptions.length === 0) {
    return options[0] ?? { action: "fold", probability: 0 };
  }

  const total = positiveOptions.reduce((sum, option) => sum + option.probability, 0);
  let threshold = clampRng(rng()) * total;

  for (const option of positiveOptions) {
    if (threshold < option.probability) {
      return option;
    }
    threshold -= option.probability;
  }

  return positiveOptions[positiveOptions.length - 1];
}

export function startPreflopRound(options: StartPreflopRoundOptions = {}): PreflopRoundState {
  const rng = options.rng ?? Math.random;
  const heroPosition = options.heroPosition ?? (rng() < 0.5 ? "SB" : "BB");
  const [heroCards, villainCards] = resolveHoleCards(options, rng);
  const baseState: PreflopRoundState = {
    correctCount: 0,
    currentDecision: null,
    decisionCount: 0,
    heroCards,
    heroPosition,
    history: [],
    isComplete: false,
    lastFeedback: null,
    message: "",
    villainCards
  };

  if (heroPosition === "SB") {
    return {
      ...baseState,
      currentDecision: buildDecision(PREFLOP_SPOTS.sbOpen, "SB", heroCards),
      message: "SB first action."
    };
  }

  return applyOpponentFirstAction(baseState, rng);
}

export function answerCurrentDecision(
  state: PreflopRoundState,
  action: PreflopAction,
  rng: Rng = Math.random
): AnsweredPreflopRoundState {
  if (!state.currentDecision) {
    return {
      ...state,
      lastFeedback:
        state.lastFeedback ??
        buildFeedback({
          action,
          correct: false,
          decision: buildDecision(PREFLOP_SPOTS.sbOpen, state.heroPosition, state.heroCards),
          selectedProbability: 0
        })
    };
  }

  const selectedProbability = probabilityForAction(state.currentDecision.options, action);
  const correct = selectedProbability > 0;
  const feedback = buildFeedback({ action, correct, decision: state.currentDecision, selectedProbability });
  const withHeroAction = appendHistory(state, state.currentDecision, action, selectedProbability, false);
  const scoredState: AnsweredPreflopRoundState = {
    ...withHeroAction,
    correctCount: state.correctCount + (correct ? 1 : 0),
    currentDecision: null,
    decisionCount: state.decisionCount + 1,
    isComplete: false,
    lastFeedback: feedback,
    message: correct ? "Correct GTO action. Preflop continues." : "That action has 0% frequency in this spot."
  };

  if (!correct) {
    return finishRound(scoredState, "Marked wrong and stopped so you can inspect the range.");
  }

  return advanceAfterHeroAction(scoredState, state.currentDecision, action, rng);
}

function applyOpponentFirstAction(state: PreflopRoundState, rng: Rng): PreflopRoundState {
  const decision = buildDecision(PREFLOP_SPOTS.sbOpen, "SB", state.villainCards);
  const sampled = sampleAction(decision.options, rng);
  const afterOpponent = appendHistory(state, decision, sampled.action, sampled.probability, true);

  if (sampled.action === "raise") {
    return {
      ...afterOpponent,
      currentDecision: buildDecision(PREFLOP_SPOTS.bbVsSbOpen, "BB", state.heroCards),
      message: "SB opens 2.5bb. BB decision."
    };
  }

  if (sampled.action === "limp") {
    return {
      ...afterOpponent,
      currentDecision: buildDecision(PREFLOP_SPOTS.bbVsSbLimp, "BB", state.heroCards),
      message: "SB limps. BB decision."
    };
  }

  return finishRound(afterOpponent, "SB folded. Preflop is over.");
}

function advanceAfterHeroAction(
  state: AnsweredPreflopRoundState,
  decision: PreflopDecision,
  action: PreflopAction,
  rng: Rng
): AnsweredPreflopRoundState {
  if (decision.spotId === PREFLOP_SPOTS.sbOpen) {
    return advanceAfterHeroSbOpen(state, action, rng);
  }

  if (decision.spotId === PREFLOP_SPOTS.bbVsSbOpen) {
    return advanceAfterHeroBbVsOpen(state, action, rng);
  }

  if (decision.spotId === PREFLOP_SPOTS.bbVsSbLimp) {
    return advanceAfterHeroBbVsLimp(state, action, rng);
  }

  return finishRound(state, "Your response closes the available preflop tree.");
}

function advanceAfterHeroSbOpen(
  state: AnsweredPreflopRoundState,
  action: PreflopAction,
  rng: Rng
): AnsweredPreflopRoundState {
  if (action === "fold") {
    return finishRound(state, "SB folded. Preflop is over.");
  }

  if (action === "limp") {
    const bbDecision = buildDecision(PREFLOP_SPOTS.bbVsSbLimp, "BB", state.villainCards);
    const bbAction = sampleAction(bbDecision.options, rng);
    const afterBbAction = appendHistory(state, bbDecision, bbAction.action, bbAction.probability, true);

    if (bbAction.action === "raise") {
      return {
        ...afterBbAction,
        currentDecision: buildDecision(PREFLOP_SPOTS.sbLimpVsBbRaise, "SB", state.heroCards),
        isComplete: false,
        message: "BB raises to 5bb. SB decision."
      };
    }

    return finishRound(afterBbAction, "BB checks. Preflop is over.");
  }

  const bbDecision = buildDecision(PREFLOP_SPOTS.bbVsSbOpen, "BB", state.villainCards);
  const bbAction = sampleAction(bbDecision.options, rng);
  const afterBbAction = appendHistory(state, bbDecision, bbAction.action, bbAction.probability, true);

  if (bbAction.action === "raise") {
    return {
      ...afterBbAction,
      currentDecision: buildDecision(PREFLOP_SPOTS.sbVsBbReraise, "SB", state.heroCards),
      isComplete: false,
      message: "BB 3-bets to 11.5bb. SB decision."
    };
  }

  return finishRound(afterBbAction, `BB ${actionLabel(bbAction.action).toLowerCase()}s. Preflop is over.`);
}

function advanceAfterHeroBbVsOpen(
  state: AnsweredPreflopRoundState,
  action: PreflopAction,
  rng: Rng
): AnsweredPreflopRoundState {
  if (action !== "raise") {
    return finishRound(state, `BB ${actionLabel(action).toLowerCase()}s. Preflop is over.`);
  }

  const sbDecision = buildDecision(PREFLOP_SPOTS.sbVsBbReraise, "SB", state.villainCards);
  const sbAction = sampleAction(sbDecision.options, rng);
  const afterSbAction = appendHistory(state, sbDecision, sbAction.action, sbAction.probability, true);
  return finishRound(afterSbAction, `SB ${actionLabel(sbAction.action).toLowerCase()}s versus the 3-bet. Preflop is over.`);
}

function advanceAfterHeroBbVsLimp(
  state: AnsweredPreflopRoundState,
  action: PreflopAction,
  rng: Rng
): AnsweredPreflopRoundState {
  if (action !== "raise") {
    return finishRound(state, "BB checks. Preflop is over.");
  }

  const sbDecision = buildDecision(PREFLOP_SPOTS.sbLimpVsBbRaise, "SB", state.villainCards);
  const sbAction = sampleAction(sbDecision.options, rng);
  const afterSbAction = appendHistory(state, sbDecision, sbAction.action, sbAction.probability, true);
  return finishRound(afterSbAction, `SB ${actionLabel(sbAction.action).toLowerCase()}s versus the 5bb raise. Preflop is over.`);
}

function buildDecision(spotId: PreflopSpotId, actorPosition: Position, cards: [string, string]): PreflopDecision {
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

function buildFeedback({
  action,
  correct,
  decision,
  selectedProbability
}: {
  action: PreflopAction;
  correct: boolean;
  decision: PreflopDecision;
  selectedProbability: number;
}): PreflopFeedback {
  return {
    action,
    correct,
    handKey: decision.handKey,
    options: sortOptionsForDisplay(decision.options),
    selectedProbability,
    spotId: decision.spotId,
    spotName: decision.spotName
  };
}

function appendHistory<T extends PreflopRoundState>(
  state: T,
  decision: PreflopDecision,
  action: PreflopAction,
  probability: number,
  automatic: boolean
): T {
  return {
    ...state,
    history: [
      ...state.history,
      {
        action,
        actor: decision.actorPosition,
        automatic,
        handKey: decision.handKey,
        probability,
        spotId: decision.spotId,
        spotName: decision.spotName
      }
    ]
  } as T;
}

function finishRound<T extends PreflopRoundState>(state: T, message: string): T {
  return {
    ...state,
    currentDecision: null,
    isComplete: true,
    message
  };
}

function probabilityForAction(options: ActionOption[], action: PreflopAction): number {
  return options.find((option) => option.action === action)?.probability ?? 0;
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

function sortOptionsForDisplay(options: ActionOption[]): ActionOption[] {
  const priority = new Map<PreflopAction, number>([
    ["fold", 0],
    ["check", 1],
    ["limp", 2],
    ["call", 3],
    ["raise", 4],
    ["allin", 5]
  ]);
  return [...options].sort((left, right) => (priority.get(left.action) ?? 99) - (priority.get(right.action) ?? 99));
}

function resolveHoleCards(options: StartPreflopRoundOptions, rng: Rng): [[string, string], [string, string]] {
  if (options.heroCards && options.villainCards) {
    return [options.heroCards, options.villainCards];
  }

  const excludedCards = [...(options.heroCards ?? []), ...(options.villainCards ?? [])];
  const deck = shuffle(buildDeck().filter((card) => !excludedCards.includes(card)), rng);
  const heroCards = options.heroCards ?? [deck[0], deck[1]];
  const villainCards = options.villainCards ?? [deck[2], deck[3]];
  return [heroCards, villainCards];
}

function buildDeck(): string[] {
  return RANKS.flatMap((rank) => SUITS.map((suit) => `${rank}${suit}`));
}

function shuffle(cards: string[], rng: Rng): string[] {
  const next = [...cards];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function clampRng(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(0.999999999, value));
}
