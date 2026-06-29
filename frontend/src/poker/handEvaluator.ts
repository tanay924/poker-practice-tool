export type ShowdownWinner = "hero" | "villain" | "split";

export interface ShowdownEvaluation {
  heroHand: string;
  villainHand: string;
  winner: ShowdownWinner;
  winningHand: string;
}

interface Card {
  rank: number;
  suit: string;
}

interface FiveCardEvaluation {
  label: string;
  score: number[];
}

const RANK_VALUES: Record<string, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14
};

const RANK_NAMES: Record<number, string> = {
  14: "ace",
  13: "king",
  12: "queen",
  11: "jack",
  10: "ten",
  9: "nine",
  8: "eight",
  7: "seven",
  6: "six",
  5: "five",
  4: "four",
  3: "three",
  2: "two"
};

const RANK_PLURALS: Record<number, string> = {
  14: "aces",
  13: "kings",
  12: "queens",
  11: "jacks",
  10: "tens",
  9: "nines",
  8: "eights",
  7: "sevens",
  6: "sixes",
  5: "fives",
  4: "fours",
  3: "threes",
  2: "twos"
};

export function evaluateHoldemShowdown(heroCards: string[], villainCards: string[], board: string[]): ShowdownEvaluation {
  const hero = bestHand([...heroCards, ...board]);
  const villain = bestHand([...villainCards, ...board]);
  const comparison = compareScores(hero.score, villain.score);

  if (comparison > 0) {
    return { heroHand: hero.label, villainHand: villain.label, winner: "hero", winningHand: hero.label };
  }
  if (comparison < 0) {
    return { heroHand: hero.label, villainHand: villain.label, winner: "villain", winningHand: villain.label };
  }
  return { heroHand: hero.label, villainHand: villain.label, winner: "split", winningHand: hero.label };
}

function bestHand(cardCodes: string[]): FiveCardEvaluation {
  const cards = cardCodes.map(parseCard);
  const hands = fiveCardCombinations(cards).map(evaluateFiveCards);
  return hands.reduce((best, candidate) => (compareScores(candidate.score, best.score) > 0 ? candidate : best));
}

function parseCard(card: string): Card {
  const rank = RANK_VALUES[card[0]?.toUpperCase()];
  const suit = card[1]?.toLowerCase();
  if (!rank || !suit) {
    throw new Error(`Invalid card: ${card}`);
  }
  return { rank, suit };
}

function fiveCardCombinations(cards: Card[]): Card[][] {
  const combinations: Card[][] = [];
  for (let a = 0; a < cards.length - 4; a += 1) {
    for (let b = a + 1; b < cards.length - 3; b += 1) {
      for (let c = b + 1; c < cards.length - 2; c += 1) {
        for (let d = c + 1; d < cards.length - 1; d += 1) {
          for (let e = d + 1; e < cards.length; e += 1) {
            combinations.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
          }
        }
      }
    }
  }
  return combinations;
}

function evaluateFiveCards(cards: Card[]): FiveCardEvaluation {
  const ranks = cards.map((card) => card.rank).sort((left, right) => right - left);
  const flush = cards.every((card) => card.suit === cards[0].suit);
  const straightHigh = straightHighCard(ranks);
  const groups = groupedRanks(ranks);

  if (flush && straightHigh) {
    return { label: `Straight flush, ${rankName(straightHigh)}-high`, score: [8, straightHigh] };
  }

  if (groups[0].count === 4) {
    const kicker = groups.find((group) => group.count === 1)?.rank ?? 0;
    return { label: `Four of a kind, ${rankPlural(groups[0].rank)}`, score: [7, groups[0].rank, kicker] };
  }

  if (groups[0].count === 3 && groups[1]?.count === 2) {
    return {
      label: `Full house, ${rankPlural(groups[0].rank)} over ${rankPlural(groups[1].rank)}`,
      score: [6, groups[0].rank, groups[1].rank]
    };
  }

  if (flush) {
    return { label: `Flush, ${rankName(ranks[0])}-high`, score: [5, ...ranks] };
  }

  if (straightHigh) {
    return { label: `Straight, ${rankName(straightHigh)}-high`, score: [4, straightHigh] };
  }

  if (groups[0].count === 3) {
    const kickers = groups.filter((group) => group.count === 1).map((group) => group.rank);
    return { label: `Three of a kind, ${rankPlural(groups[0].rank)}`, score: [3, groups[0].rank, ...kickers] };
  }

  if (groups[0].count === 2 && groups[1]?.count === 2) {
    const kicker = groups.find((group) => group.count === 1)?.rank ?? 0;
    return {
      label: `Two pair, ${rankPlural(groups[0].rank)} and ${rankPlural(groups[1].rank)}`,
      score: [2, groups[0].rank, groups[1].rank, kicker]
    };
  }

  if (groups[0].count === 2) {
    const kickers = groups.filter((group) => group.count === 1).map((group) => group.rank);
    return { label: `Pair of ${rankPlural(groups[0].rank)}`, score: [1, groups[0].rank, ...kickers] };
  }

  return { label: `High card, ${rankName(ranks[0])}`, score: [0, ...ranks] };
}

function groupedRanks(ranks: number[]): Array<{ count: number; rank: number }> {
  const counts = new Map<number, number>();
  for (const rank of ranks) {
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([rank, count]) => ({ count, rank }))
    .sort((left, right) => right.count - left.count || right.rank - left.rank);
}

function straightHighCard(ranks: number[]): number | null {
  const uniqueRanks = [...new Set(ranks)].sort((left, right) => right - left);
  if (uniqueRanks.includes(14)) {
    uniqueRanks.push(1);
  }

  for (let index = 0; index <= uniqueRanks.length - 5; index += 1) {
    const high = uniqueRanks[index];
    if (uniqueRanks[index + 4] === high - 4) {
      return high === 1 ? 5 : high;
    }
  }
  return null;
}

function compareScores(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

function rankName(rank: number): string {
  return RANK_NAMES[rank] ?? String(rank);
}

function rankPlural(rank: number): string {
  return RANK_PLURALS[rank] ?? `${rankName(rank)}s`;
}
