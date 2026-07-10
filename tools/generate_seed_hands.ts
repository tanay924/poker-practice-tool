import { writeFile } from "node:fs/promises";

import {
  applyHeroAction,
  legalHeroActions,
  startNewHand,
  toHandPayload,
  buildDeck,
  type TrainerAction,
  type TrainerState
} from "../frontend/src/poker/engine";

interface SeedHandRecord {
  fingerprint: string;
  index: number;
  payload: ReturnType<typeof toHandPayload>;
}

interface SeedManifest {
  generated_at: string;
  hands: SeedHandRecord[];
  requested_hands: number;
  seed: number;
  version: 1;
}

const args = parseArgs(process.argv.slice(2));
const requestedHands = positiveInt(args.hands, 100);
const seed = positiveInt(args.seed, 20260709);
const output = args.output ?? `backend/data/study-bank-seed-${seed}.json`;

// Reusing a small, deterministic board pool lets Shark reuse its expensive
// postflop trees while the hole cards and played lines still vary. Every
// board is a valid five-card board with no duplicate cards.
const BOARD_POOL: Array<[string, string, string, string, string]> = [
  ["As", "Kd", "7c", "2h", "9s"],
  ["Qh", "Jc", "8d", "4s", "2c"],
  ["Ts", "9h", "6c", "3d", "2s"],
  ["Ac", "Qc", "7h", "5d", "4s"],
  ["Kh", "8h", "6d", "3c", "2d"],
  ["Js", "Td", "7s", "5c", "4h"],
  ["Ah", "Jd", "8c", "6s", "3h"],
  ["Ks", "Qd", "9c", "5h", "2s"]
];

validateBoardPool();

async function main() {
  const hands = generateHands(requestedHands, seed);
  const manifest: SeedManifest = {
    generated_at: new Date().toISOString(),
    hands,
    requested_hands: requestedHands,
    seed,
    version: 1
  };

  await writeFile(output, JSON.stringify(manifest, null, 2), "utf8");
  console.log(JSON.stringify({ output, requested_hands: requestedHands, generated_hands: hands.length }, null, 2));
}

void main();

function generateHands(target: number, seedValue: number): SeedHandRecord[] {
  const rng = mulberry32(seedValue);
  const records: SeedHandRecord[] = [];
  const fingerprints = new Set<string>();
  let attempts = 0;

  while (records.length < target && attempts < target * 30) {
    attempts += 1;
    const state = generateCompleteHand(rng, attempts);
    if (!state) {
      continue;
    }

    const payload = toHandPayload(state);
    const hasPostflopHeroDecision = payload.action_history_json.some(
      (entry) => entry.street !== "preflop" && entry.actor === payload.hero_position
    );
    if (!hasPostflopHeroDecision) {
      continue;
    }
    if (!isStandardSingleRaisedPot(payload.action_history_json)) {
      continue;
    }

    const fingerprint = JSON.stringify({
      hero_cards: payload.hero_cards,
      villain_cards: payload.villain_cards,
      board: payload.board_json,
      history: payload.action_history_json
    });
    if (fingerprints.has(fingerprint)) {
      continue;
    }
    fingerprints.add(fingerprint);
    records.push({ fingerprint, index: records.length, payload });
  }

  if (records.length < target) {
    throw new Error(`Could only generate ${records.length} qualifying hands after ${attempts} attempts.`);
  }
  return records;
}

function generateCompleteHand(rng: Rng, attempt: number): TrainerState | null {
  const seatMode = attempt % 3 === 0 ? "random" : attempt % 2 === 0 ? "SB" : "BB";
  let state = startNewHand({ rng, seatMode, board: BOARD_POOL[(attempt - 1) % BOARD_POOL.length] });

  for (let step = 0; step < 80 && !state.handOver; step += 1) {
    const legalActions = legalHeroActions(state);
    if (legalActions.length === 0) {
      return null;
    }
    const action = chooseAction(state, legalActions, rng);
    state = applyHeroAction(state, action);
  }

  return state.handOver ? state : null;
}

function chooseAction(state: TrainerState, actions: TrainerAction[], rng: Rng): TrainerAction {
  if (state.currentPreflopDecision) {
    const preferredPreflopAction = actions.find((action) => action.action === "raise")
      ?? actions.find((action) => action.action === "call");
    if (preferredPreflopAction) {
      return preferredPreflopAction;
    }
    const scored = actions
      .map((action) => ({
        action,
        weight: state.currentPreflopDecision?.options.find((option) => option.action === action.action)?.probability ?? 0
      }))
      .filter((candidate) => candidate.weight > 0);
    const continuing = scored.filter(({ action }) => !["fold", "allin"].includes(action.action));
    return weightedChoice(continuing.length > 0 ? continuing : scored, rng) ?? actions[0];
  }

  if (state.facingBet) {
    const call = actions.find((action) => action.action === "call");
    if (call && rng() < 0.85) {
      return call;
    }
    return actions.find((action) => action.action === "fold") ?? call ?? actions[0];
  }

  const check = actions.find((action) => action.action === "check");
  const bets = actions.filter((action) => action.action === "bet");
  if (check && bets.length > 0) {
    return rng() < 0.75 ? check : bets[Math.floor(rng() * bets.length)];
  }
  return actions[Math.floor(rng() * actions.length)];
}

function isStandardSingleRaisedPot(actionHistory: Array<{ street: string; actor: string; action: string }>): boolean {
  const preflop = actionHistory.filter((entry) => entry.street === "preflop");
  return preflop.length === 2
    && preflop[0].actor === "SB"
    && preflop[0].action === "raise"
    && preflop[1].actor === "BB"
    && preflop[1].action === "call";
}

function validateBoardPool(): void {
  const deck = new Set(buildDeck());
  for (const board of BOARD_POOL) {
    const seen = new Set<string>();
    if (board.length !== 5 || board.some((card) => !deck.has(card) || seen.has(card))) {
      throw new Error("Invalid or overlapping board in BOARD_POOL");
    }
    board.forEach((card) => seen.add(card));
  }
}

type Rng = () => number;

function weightedChoice<T>(items: Array<{ action: T; weight: number }>, rng: Rng): T | null {
  if (items.length === 0) {
    return null;
  }
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) {
    return items[0].action;
  }
  let threshold = rng() * total;
  for (const item of items) {
    threshold -= item.weight;
    if (threshold <= 0) {
      return item.action;
    }
  }
  return items[items.length - 1].action;
}

function mulberry32(initialSeed: number): Rng {
  let value = initialSeed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      continue;
    }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
