interface PlayingCardProps {
  muted?: boolean;
  value: string;
}

const SUIT_SYMBOLS: Record<string, string> = {
  c: "♣",
  d: "♦",
  h: "♥",
  s: "♠"
};

export interface CardPresentation {
  colorClass: "black" | "red";
  isPlaceholder: boolean;
  rank: string;
  suit: string;
  symbol: string;
}

export function cardPresentation(value: string): CardPresentation {
  const rankText = value.slice(0, -1);
  const suit = value.slice(-1).toLowerCase();
  const symbol = SUIT_SYMBOLS[suit];

  if (!symbol || value === "??" || value === "--") {
    return {
      colorClass: "black",
      isPlaceholder: true,
      rank: "",
      suit: "",
      symbol: "◆"
    };
  }

  return {
    colorClass: suit === "h" || suit === "d" ? "red" : "black",
    isPlaceholder: false,
    rank: rankText === "T" ? "10" : rankText,
    suit,
    symbol
  };
}

export default function PlayingCard({ value, muted = false }: PlayingCardProps) {
  const card = cardPresentation(value);
  const classes = [
    "playing-card",
    card.colorClass,
    muted || card.isPlaceholder ? "muted" : "",
    card.isPlaceholder ? "placeholder" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} aria-label={card.isPlaceholder ? "Hidden card" : `${card.rank} of ${card.suit}`}>
      <span className="card-corner top">
        <strong>{card.rank}</strong>
        <span>{card.symbol}</span>
      </span>
      <span className="card-center-suit">{card.symbol}</span>
      <span className="card-corner bottom">
        <strong>{card.rank}</strong>
        <span>{card.symbol}</span>
      </span>
    </span>
  );
}
